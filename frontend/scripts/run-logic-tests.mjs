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
    process.env.TSC,
    path.join(root, "node_modules/.bin/tsc"),
    // The clean redesign worktree intentionally has no node_modules; fall back
    // to the TypeScript 5.9.3 already installed in the app checkout.
    "/app/frontend/node_modules/.bin/tsc",
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`TypeScript compiler not found. Tried:\n  ${candidates.join("\n  ")}`);
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

const entries = [
  "__tests__/owner.test.ts",
  "__tests__/migration.test.ts",
  "__tests__/units.test.ts",
  "__tests__/session.test.ts",
  "__tests__/safety.test.ts",
];

execFileSync(
  tsc,
  [
    ...entries,
    "--outDir",
    out,
    "--rootDir",
    ".",
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--target",
    "es2021",
    "--lib",
    "es2021",
    "--typeRoots",
    typeRoots,
    "--types",
    "node",
    "--strict",
    "true",
    "--skipLibCheck",
    "--esModuleInterop",
  ],
  { cwd: root, stdio: "inherit" },
);

const res = spawnSync(process.execPath, ["--test", path.join(out, "__tests__")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, MMA_TEST_ROOT: root },
});

fs.rmSync(out, { recursive: true, force: true });
process.exit(res.status ?? 1);
