// App Store marketing screenshot compositor for Muscle Map.
// Renders HTML slides with Playwright at exact App Store pixel sizes.
// One continuous background per platform: each slide shows a window into
// the same wide backdrop, offset by its index, so the set reads as one image.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const RAW = "/Users/mazadi/code/MuscleMapAi/frontend/appstore-shots/raw";
const WATCH = "/Users/mazadi/code/MuscleMapAi/frontend/appstore-shots";
const OUT = "/Users/mazadi/code/MuscleMapAi/frontend/appstore-shots/marketing";

// ---- palette (night theme, src/theme/tokens.ts) ----
const C = {
  bg: "#0d0b0a",
  bgGlow: "#2a211b",
  text: "#faf7f4",
  text2: "#d6cec6",
  muted: "#a2988e",
  accent: "#e39a5c",
  gradFrom: "#f5c08c",
  gradTo: "#d0783a",
  bezel: "#161210",
  bezelEdge: "rgba(240,228,215,0.16)",
};

const b64 = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;

// Flowing sinew lines across the whole strip — the "one big picture" motif.
function backdropSVG(totalW, H, seed = 0) {
  const lines = [];
  const rand = (() => { let s = 42 + seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const bands = [0.22, 0.38, 0.55, 0.70, 0.84];
  bands.forEach((band, i) => {
    const y = H * band;
    const amp = H * (0.05 + rand() * 0.10);
    const step = totalW / 6;
    let d = `M ${-200} ${y + (rand() - 0.5) * amp}`;
    for (let x = 0; x <= totalW + step; x += step) {
      const cy1 = y + (rand() - 0.5) * 2 * amp;
      const cy2 = y + (rand() - 0.5) * 2 * amp;
      const ey = y + (rand() - 0.5) * amp;
      d += ` C ${x + step * 0.33} ${cy1}, ${x + step * 0.66} ${cy2}, ${x + step} ${ey}`;
    }
    const op = (0.05 + 0.05 * rand()).toFixed(3);
    const w = (1.5 + rand() * 2.5).toFixed(1);
    lines.push(`<path d="${d}" fill="none" stroke="${C.accent}" stroke-opacity="${op}" stroke-width="${w}"/>`);
    // echo line, slightly offset — reads like muscle striation
    lines.push(`<path d="${d}" transform="translate(0 ${amp * 0.35})" fill="none" stroke="${C.accent}" stroke-opacity="${(op * 0.5).toFixed(3)}" stroke-width="1"/>`);
  });
  // big soft focus rings scattered across the strip
  const rings = [];
  for (let i = 0; i < Math.max(3, Math.round(totalW / H)); i++) {
    const cx = totalW * (0.12 + 0.8 * rand());
    const cy = H * (0.15 + 0.6 * rand());
    const r = H * (0.10 + rand() * 0.16);
    rings.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.accent}" stroke-opacity="0.055" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="none" stroke="${C.accent}" stroke-opacity="0.035" stroke-width="1.5"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${H}" viewBox="0 0 ${totalW} ${H}">${lines.join("")}${rings.join("")}</svg>`;
}

function backdropCSS(totalW, H, count) {
  // glows drift down the strip so neighbouring slides share light
  const glows = [];
  for (let i = 0; i < count; i++) {
    const gx = ((i + 0.5) / count) * 100;
    const gy = i % 2 === 0 ? 8 : 30;
    glows.push(`radial-gradient(ellipse ${Math.round(totalW * 0.35 / count)}px ${Math.round(H * 0.45)}px at ${gx}% ${gy}%, rgba(227,154,92,0.16), transparent 70%)`);
    glows.push(`radial-gradient(ellipse ${Math.round(totalW * 0.5 / count)}px ${Math.round(H * 0.6)}px at ${gx + (i % 2 ? -6 : 6)}% 96%, rgba(42,33,27,0.9), transparent 75%)`);
  }
  return glows.join(",");
}

function slideHTML({ W, H, index, count, kicker, headline, accentWord, sub, shotB64, frame, seed, brand }) {
  const totalW = W * count;
  const svg = Buffer.from(backdropSVG(totalW, H, seed)).toString("base64");
  const offset = -index * W;

  // headline with accent word wrapped
  const parts = headline.split(accentWord);
  const headHTML = parts.length === 2
    ? `${parts[0]}<span class="grad">${accentWord}</span>${parts[1]}`
    : headline;

  const isPad = frame.kind === "ipad";
  const isWatch = frame.kind === "watch";

  const pad = isWatch ? Math.round(W * 0.055) : Math.round(W * 0.085);
  const kickerSize = isWatch ? 15 : Math.round(W * 0.030);
  const headSize = isWatch ? 34 : Math.round(W * (isPad ? 0.052 : 0.096));
  const subSize = isWatch ? 0 : Math.round(W * (isPad ? 0.021 : 0.040));

  const shotW = Math.round(W * frame.shotScale);
  const bezelPx = isWatch ? 7 : Math.round(shotW * (isPad ? 0.022 : 0.035));
  const screenRadius = isWatch ? 46 : Math.round(shotW * (isPad ? 0.045 : 0.145));
  const outerRadius = screenRadius + bezelPx;
  const frameTop = Math.round(H * frame.top);

  const brandHTML = brand ? `<div class="brand"><span class="brandDot"></span>Muscle Map</div>` : "";
  const subHTML = sub ? `<div class="sub">${sub}</div>` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden; }
  body { background:${C.bg}; font-family:-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; position:relative; }
  .bg { position:absolute; left:${offset}px; top:0; width:${totalW}px; height:${H}px;
        background-image:${backdropCSS(totalW, H, count)}; background-color:${C.bg}; }
  .bg img { position:absolute; inset:0; width:100%; height:100%; }
  .vignette { position:absolute; inset:0;
        background:radial-gradient(ellipse 130% 90% at 50% 40%, transparent 55%, rgba(7,5,4,0.55) 100%); }
  .content { position:absolute; inset:0; padding:${Math.round(H * 0.045)}px ${pad}px 0; }
  .brand { display:flex; align-items:center; gap:${Math.round(kickerSize * 0.5)}px; color:${C.muted};
        font-size:${Math.round(kickerSize * 0.95)}px; font-weight:600; letter-spacing:0.14em;
        text-transform:uppercase; margin-bottom:${Math.round(H * 0.022)}px; }
  .brandDot { width:${Math.round(kickerSize * 0.55)}px; height:${Math.round(kickerSize * 0.55)}px;
        border-radius:50%; background:linear-gradient(135deg, ${C.gradFrom}, ${C.gradTo}); display:inline-block; }
  .kicker { color:${C.accent}; font-size:${kickerSize}px; font-weight:700; letter-spacing:0.32em;
        text-transform:uppercase; margin-bottom:${Math.round(H * (isWatch ? 0.012 : 0.018))}px; }
  h1 { color:${C.text}; font-size:${headSize}px; line-height:1.04; font-weight:800;
        letter-spacing:-0.02em; margin-bottom:${Math.round(H * (isWatch ? 0 : 0.02))}px; max-width:${isPad ? "72%" : "100%"}; }
  .grad { background:linear-gradient(100deg, ${C.gradFrom}, ${C.gradTo});
        -webkit-background-clip:text; background-clip:text; color:transparent; }
  .sub { color:${C.text2}; font-size:${subSize}px; line-height:1.4; font-weight:400;
        max-width:${isPad ? "56%" : "92%"}; }
  .device { position:absolute; top:${frameTop}px; left:50%; transform:translateX(-50%);
        width:${shotW + bezelPx * 2}px; border-radius:${outerRadius}px; background:${C.bezel};
        padding:${bezelPx}px; box-shadow:0 0 0 1.5px ${C.bezelEdge}, 0 ${Math.round(H * 0.02)}px ${Math.round(H * 0.08)}px rgba(0,0,0,0.75),
        0 0 ${Math.round(H * 0.10)}px rgba(227,154,92,0.10); }
  .device img { display:block; width:${shotW}px; border-radius:${screenRadius}px; }
  </style></head><body>
    <div class="bg"><img src="data:image/svg+xml;base64,${svg}"></div>
    <div class="vignette"></div>
    <div class="content">
      ${brandHTML}
      <div class="kicker">${kicker}</div>
      <h1>${headHTML}</h1>
      ${subHTML}
    </div>
    <div class="device"><img src="${shotB64}"></div>
  </body></html>`;
}

const IPHONE = { W: 1290, H: 2796, frame: { kind: "iphone", shotScale: 0.78, top: 0.385 } };
const IPAD = { W: 2064, H: 2752, frame: { kind: "ipad", shotScale: 0.72, top: 0.30 } };
const WATCHF = { W: 410, H: 502, frame: { kind: "watch", shotScale: 0.62, top: 0.335 } };

const iphoneSlides = [
  { file: "iphone-02-explore.png", kicker: "Interactive 3D anatomy", headline: "See every muscle.", accentWord: "every muscle.", sub: "Explore a full 3D body. Tap any muscle to learn how it works." },
  { file: "iphone-06-exercise-detail.png", kicker: "Exercise intelligence", headline: "Every movement, mapped.", accentWord: "mapped.", sub: "Animated form guides show exactly which muscles fire." },
  { file: "iphone-01-today.png", kicker: "Smart training plans", headline: "A plan built for you.", accentWord: "for you.", sub: "Three questions. A full week of training that fits your life.", brand: true },
  { file: "iphone-07-session.png", kicker: "Effortless logging", headline: "Log sets in seconds.", accentWord: "seconds.", sub: "One tap per set. Volume, targets and records tracked for you." },
  { file: "iphone-08-rest-timer.png", kicker: "Automatic rest", headline: "Rest. Then go again.", accentWord: "go again.", sub: "Rest timers start themselves the moment you log a set." },
  { file: "iphone-03-muscle-detail.png", kicker: "Built-in muscle guide", headline: "Know what fires.", accentWord: "fires.", sub: "Function, origin, insertion and training guidance for every muscle." },
  { file: "iphone-09-coach.png", kicker: "AI coach", headline: "Ask anything.", accentWord: "anything.", sub: "A coach that knows your plan, your muscles and your week." },
  { file: "iphone-10-insights.png", kicker: "Recovery & progress", headline: "Train what's ready.", accentWord: "ready.", sub: "A recovery map of your whole body, tracked on-device." },
];

const ipadSlides = [
  { file: "ipad-02-explore.png", kicker: "Interactive 3D anatomy", headline: "See every muscle.", accentWord: "every muscle.", sub: "Explore a full 3D body. Tap any muscle to learn how it works." },
  { file: "ipad-06-exercise-detail.png", kicker: "Exercise intelligence", headline: "Every movement, mapped.", accentWord: "mapped.", sub: "Animated form guides show exactly which muscles fire." },
  { file: "ipad-01-today.png", kicker: "Smart training plans", headline: "A plan built for you.", accentWord: "for you.", sub: "Three questions. A full week of training that fits your life.", brand: true },
  { file: "ipad-07-session.png", kicker: "Effortless logging", headline: "Log sets in seconds.", accentWord: "seconds.", sub: "One tap per set — with an animated form guide beside your log." },
  { file: "ipad-03-muscle-detail.png", kicker: "Built-in muscle guide", headline: "Know what fires.", accentWord: "fires.", sub: "Function, origin, insertion and training guidance for every muscle." },
  { file: "ipad-04-coach.png", kicker: "AI coach", headline: "Ask anything.", accentWord: "anything.", sub: "A coach that knows your plan, your muscles and your week." },
  { file: "ipad-05-library.png", kicker: "Exercise library", headline: "208 movements, organised.", accentWord: "organised.", sub: "Browse by muscle, equipment, movement pattern or difficulty." },
];

const watchSlides = [
  { file: `${WATCH}/watch-1-animation-410x502.png`, kicker: "On your wrist", headline: "Follow the form.", accentWord: "form." },
  { file: `${WATCH}/watch-2-logging-410x502.png`, kicker: "One-tap logging", headline: "Log every set.", accentWord: "every set." },
  { file: `${WATCH}/watch-3-session-410x502.png`, kicker: "Live session", headline: "Adjust. Log. Rest.", accentWord: "Rest." },
];

const browser = await chromium.launch();
const jobs = [
  { dir: "iphone", cfg: IPHONE, slides: iphoneSlides, base: RAW, seed: 0 },
  { dir: "ipad", cfg: IPAD, slides: ipadSlides, base: RAW, seed: 7 },
  { dir: "watch", cfg: WATCHF, slides: watchSlides, base: "", seed: 13 },
];

for (const job of jobs) {
  mkdirSync(`${OUT}/${job.dir}`, { recursive: true });
  const page = await browser.newPage({ viewport: { width: job.cfg.W, height: job.cfg.H }, deviceScaleFactor: 1 });
  for (let i = 0; i < job.slides.length; i++) {
    const s = job.slides[i];
    const shotPath = job.base ? `${job.base}/${s.file}` : s.file;
    const html = slideHTML({
      W: job.cfg.W, H: job.cfg.H, index: i, count: job.slides.length,
      kicker: s.kicker, headline: s.headline, accentWord: s.accentWord, sub: s.sub,
      shotB64: b64(shotPath), frame: job.cfg.frame, seed: job.seed, brand: s.brand,
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    const out = `${OUT}/${job.dir}/${String(i + 1).padStart(2, "0")}.png`;
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: job.cfg.W, height: job.cfg.H } });
    console.log("wrote", out);
  }
  await page.close();
}
await browser.close();
console.log("done");
