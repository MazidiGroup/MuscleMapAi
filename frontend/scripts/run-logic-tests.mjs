#!/usr/bin/env node
// Direction B Phase 1 — deterministic logic test runner.
//
// Deliberately uses the toolchain that already exists (TypeScript + Node's
// built-in test runner). No test framework, no runtime dependency and no
// package.json / lockfile change: the pure-logic modules under src/owner,
// src/units and src/session are transpiled to CommonJS in a temp directory and
// executed with `node --test`.
//
// Usage:  node scripts/run-logic-tests.mjs
// Optional: TSC=/path/to/tsc  (defaults to the local, then the sibling app install)

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function findTsc() {
  const candidates = [
    process.env.TSC ? { command: process.env.TSC, args: [] } : null,
    // Calling the compiler's JS entry through Node works on Windows too; a
    // shell-less spawn cannot execute Yarn's extensionless .bin shim there.
    { command: process.execPath, args: [path.join(root, "node_modules/typescript/bin/tsc")] },
    // The clean redesign worktree intentionally has no node_modules; fall back
    // to the TypeScript 5.9.3 already installed in the app checkout.
    { command: process.execPath, args: ["/app/frontend/node_modules/typescript/bin/tsc"] },
  ].filter(Boolean);
  for (const c of candidates) {
    const executable = c.args[0] || c.command;
    if (fs.existsSync(executable)) return c;
  }
  throw new Error(`TypeScript compiler not found. Tried:\n  ${candidates.map((c) => c.args[0] || c.command).join("\n  ")}`);
}

function findTypeRoots() {
  const candidates = [
    process.env.MMA_TYPE_ROOTS,
    path.join(root, "node_modules/@types"),
    "/app/frontend/node_modules/@types",
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(path.join(c, "node"))) return c;
  throw new Error(`@types/node not found. Tried:\n  ${candidates.join("\n  ")}`);
}

const tsc = findTsc();
const typeRoots = findTypeRoots();
const out = fs.mkdtempSync(path.join(os.tmpdir(), "mma-phase1-tests-"));

const entries = fs
  .readdirSync(path.join(root, "__tests__"))
  .filter((f) => f.endsWith(".test.ts"))
  .sort()
  .map((f) => path.join("__tests__", f));

// A temp tsconfig (outside the repo) supplies the `@/` path mapping that the CLI
// flags cannot express. Only the test entrypoints are listed; tsc follows imports.
const tsconfigPath = path.join(out, "tsconfig.tests.json");
fs.writeFileSync(
  tsconfigPath,
  JSON.stringify(
    {
      compilerOptions: {
        target: "es2021",
        lib: ["es2021"],
        module: "commonjs",
        moduleResolution: "node",
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        allowJs: true,
        checkJs: false,
        types: ["node"],
        typeRoots: [typeRoots],
        baseUrl: root,
        paths: { "@/*": ["./*"] },
        rootDir: root,
        outDir: out,
      },
      include: entries.map((e) => path.join(root, e)),
    },
    null,
    2,
  ),
);

execFileSync(tsc.command, [...tsc.args, "-p", tsconfigPath], { cwd: root, stdio: "inherit" });

// The app uses the `@/` path alias. tsc keeps the specifier verbatim, so rewrite
// it to a relative require in the emitted CommonJS. The emitted tree mirrors the
// source tree (rootDir "."), which makes this a deterministic transform.
function rewriteAliases(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) rewriteAliases(p);
    else if (p.endsWith(".js")) {
      const src = fs.readFileSync(p, "utf8");
      const next = src.replace(/require\("@\/([^"]+)"\)/g, (_m, rel) => {
        let target = path.relative(path.dirname(p), path.join(out, rel)).split(path.sep).join("/");
        if (!target.startsWith(".")) target = `./${target}`;
        return `require("${target}")`;
      });
      if (next !== src) fs.writeFileSync(p, next);
    }
  }
}
rewriteAliases(out);

// `src/plan/exercises.js` is a plain JS module fronted by a hand-written .d.ts,
// so tsc never emits it. Copy it verbatim so the Plan adapter can be exercised.
const JS_PASSTHROUGH = ["src/plan/exercises.js"];
for (const rel of JS_PASSTHROUGH) {
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, rel), dest);
}

// The release-source gate is an ESM script that must run with Node built-ins only
// (EAS pre-install phase), so its tests are plain .mjs run from the repo itself.
const esmTests = fs
  .readdirSync(path.join(root, "__tests__"))
  .filter((f) => f.endsWith(".test.mjs"))
  .sort()
  .map((f) => path.join(root, "__tests__", f));

const emittedTests = fs
  .readdirSync(path.join(out, "__tests__"))
  .filter((f) => f.endsWith(".test.js"))
  .sort()
  .map((f) => path.join(out, "__tests__", f));

const res = spawnSync(process.execPath, ["--test", ...emittedTests, ...esmTests], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    MMA_TEST_ROOT: root,
    // the emitted tests live in a temp dir, so point Node at the app's modules
    NODE_PATH: [path.join(root, "node_modules"), path.dirname(typeRoots)]
      .filter((p) => fs.existsSync(p))
      .join(path.delimiter),
  },
});

fs.rmSync(out, { recursive: true, force: true });
process.exit(res.status ?? 1);
