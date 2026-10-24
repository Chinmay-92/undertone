// Assembles video/undertone_demo.mp4 from a recorded take + narration.
// Usage:
//   PW_DIR=/path/with/node_modules/playwright-core  TAKE=video/take_live2  node video/build.mjs
// Needs ffmpeg/ffprobe (FFMPEG/FFPROBE env or /opt/homebrew/bin) and macOS `say`.
// To use your own voice for a segment, put it at video/build/<key>.voice.wav and re-run.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(path.join(process.env.PW_DIR ?? process.cwd(), "noop.js"));
const { chromium } = require("playwright-core");

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(DIR, "build");
const TAKE = path.resolve(process.env.TAKE ?? path.join(DIR, "take_live2"));
const OUT = path.join(DIR, "undertone_demo.mp4");
const FFMPEG = process.env.FFMPEG ?? "/opt/homebrew/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE ?? "/opt/homebrew/bin/ffprobe";
const VOICE = process.env.VOICE ?? "Daniel";
const RATE = process.env.RATE ?? "172";
mkdirSync(BUILD, { recursive: true });

const marks = JSON.parse(readFileSync(path.join(TAKE, "marks.json"), "utf8"));
const raw = path.join(TAKE, "raw.webm");

// Segment plan: cards are stills; footage segments use [from, to] marks of the take.
const plan = [
  { key: "title", card: "title", lead: 0.8, tail: 1.0 },
  { key: "problem", card: "problem", lead: 0.5, tail: 0.9 },
  { key: "upload", from: "home", to: "profile", lead: 0.6, tail: 0.6 },
  { key: "profile", from: "profile", to: "profile_end", lead: 0.4, tail: 0.6 },
  { key: "recs", from: "profile_end", to: "tryon_click", lead: 0.4, tail: 0.5 },
  { key: "tryon", from: "tryon_click", to: "bag_click", lead: 0.4, tail: 0.6, startOffset: -0.3 },
  { key: "bag", from: "bag_click", to: "end", lead: 0.3, tail: 0.9 },
  { key: "built", card: "built", lead: 0.5, tail: 1.0 },
  { key: "closing", card: "closing", lead: 0.5, tail: 2.0 },
];

// --- narration text from narration.md ---
const md = readFileSync(path.join(DIR, "narration.md"), "utf8");
const text = {};
for (const block of md.split(/^## /m).slice(1)) {
  const key = /^\[(\w+)\]/.exec(block)?.[1];
  if (!key) continue;
  text[key] = block.split("\n").filter((l) => l.startsWith("> ")).map((l) => l.slice(2)).join(" ").trim();
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const dur = (f) => Number(run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());

// --- render cards + caption overlays ---
const cardsUrl = pathToFileURL(path.join(DIR, "cards.html")).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const id of ["title", "problem", "built", "closing"]) {
  await page.goto(`${cardsUrl}?show=${id}`);
  await page.screenshot({ path: path.join(BUILD, `card_${id}.png`) });
}
for (const id of ["upload", "profile", "recs", "tryon", "bag"]) {
  await page.goto(`${cardsUrl}?show=cap-${id}`);
  await page.screenshot({ path: path.join(BUILD, `cap_${id}.png`), omitBackground: true });
}
await browser.close();

// --- voice + segments ---
const parts = [];
let total = 0;
for (const seg of plan) {
  const own = path.join(BUILD, `${seg.key}.voice.wav`);
  const wav = path.join(BUILD, `${seg.key}.wav`);
  if (existsSync(own)) {
    run(FFMPEG, ["-y", "-i", own, "-ar", "48000", "-ac", "1", wav]);
  } else {
    if (!text[seg.key]) throw new Error(`No narration for ${seg.key}`);
    const aiff = path.join(BUILD, `${seg.key}.aiff`);
    run("say", ["-v", VOICE, "-r", RATE, "-o", aiff, text[seg.key]]);
    run(FFMPEG, ["-y", "-i", aiff, "-ar", "48000", "-ac", "1", wav]);
  }
  const a = dur(wav);
  const T = +(seg.lead + a + seg.tail).toFixed(2);
  const out = path.join(BUILD, `seg_${String(parts.length).padStart(2, "0")}_${seg.key}.mp4`);
  const fade = `fade=t=in:st=0:d=0.3,fade=t=out:st=${(T - 0.3).toFixed(2)}:d=0.3`;
  const audio = `[A:a]adelay=${Math.round(seg.lead * 1000)}:all=1,apad,atrim=0:${T}[a]`;
  const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-t", String(T), out];
  let info;
  if (seg.card) {
    run(FFMPEG, ["-y", "-loop", "1", "-framerate", "30", "-t", String(T), "-i", path.join(BUILD, `card_${seg.card}.png`),
      "-i", wav, "-filter_complex", `[0:v]scale=1280:720,format=yuv420p,${fade}[v];${audio.replace("A:a", "1:a")}`,
      "-map", "[v]", "-map", "[a]", ...enc]);
    info = "card";
  } else {
    const from = Math.max(0, marks[seg.from] + (seg.startOffset ?? 0));
    const L = marks[seg.to] - from;
    const speed = Math.max(1, L / T);
    const pad = Math.max(0, T - L / speed + 0.2);
    run(FFMPEG, ["-y", "-ss", from.toFixed(2), "-t", L.toFixed(2), "-i", raw, "-i", path.join(BUILD, `cap_${seg.key}.png`), "-i", wav,
      "-filter_complex",
      `[0:v]setpts=(PTS-STARTPTS)/${speed.toFixed(4)},fps=30,scale=1280:720,tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)}[v0];` +
        `[v0][1:v]overlay=0:0,format=yuv420p,${fade}[v];${audio.replace("A:a", "2:a")}`,
      "-map", "[v]", "-map", "[a]", ...enc]);
    info = `footage ${from.toFixed(1)}-${marks[seg.to].toFixed(1)}s (${L.toFixed(1)}s) speed x${speed.toFixed(2)} freeze ${pad.toFixed(1)}s`;
  }
  console.log(`${seg.key.padEnd(8)} voice ${a.toFixed(1)}s  segment ${T.toFixed(1)}s  starts ${total.toFixed(1)}s  ${info}`);
  total += T;
  parts.push(out);
}

const list = path.join(BUILD, "concat.txt");
writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n") + "\n");
run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", OUT]);
console.log(`\n${OUT}  ${dur(OUT).toFixed(1)}s`);
