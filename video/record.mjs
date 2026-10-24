// Records a scripted walkthrough of the Undertone UI with Playwright's recordVideo.
// Usage:
//   PW_DIR=/path/with/node_modules/playwright-core  APP_URL=http://localhost:8787 \
//   SELFIE=/path/selfie.jpg  OUT=video/take1  node video/record.mjs
// Writes OUT/raw.webm, OUT/marks.json (seconds from video start) and OUT/*.png checkpoints.
// Pin playwright-core to a version whose chromium revision is in ~/Library/Caches/ms-playwright.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(path.join(process.env.PW_DIR ?? process.cwd(), "noop.js"));
const { chromium } = require("playwright-core");

const APP_URL = process.env.APP_URL ?? "http://localhost:8787";
const SELFIE = process.env.SELFIE;
const OUT = process.env.OUT ?? "video/take";
if (!SELFIE) throw new Error("Set SELFIE=/path/to/selfie.jpg");
mkdirSync(OUT, { recursive: true });

const W = 1280, H = 720;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: W, height: H } },
});

// Visible cursor (headless video has none).
await context.addInitScript(() => {
  window.addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.id = "__cursor";
    c.style.cssText =
      "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
      "background:rgba(80,42,58,.35);border:2px solid rgba(80,42,58,.9);z-index:2147483647;pointer-events:none;" +
      "transition:transform .12s ease;transform:translate(640px,360px)";
    document.body.appendChild(c);
    let x = 640, y = 360;
    document.addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; c.style.transform = `translate(${x}px,${y}px)`; }, true);
    document.addEventListener("mousedown", () => { c.style.transform = `translate(${x}px,${y}px) scale(.7)`; }, true);
    document.addEventListener("mouseup", () => { c.style.transform = `translate(${x}px,${y}px)`; }, true);
  });
});

const page = await context.newPage();
const t0 = Date.now();
const marks = {};
const mark = async (name, shot = true) => {
  marks[name] = (Date.now() - t0) / 1000;
  console.log(`[${marks[name].toFixed(2)}s] ${name}`);
  if (shot) await page.screenshot({ path: path.join(OUT, `${name}.png`) });
};
const sleep = (ms) => page.waitForTimeout(ms);
let mx = 640, my = 360;
async function moveTo(locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  const tx = b.x + b.width / 2, ty = b.y + b.height / 2;
  await page.mouse.move(tx, ty, { steps: 25 });
  mx = tx; my = ty;
}
async function clickOn(locator) {
  await moveTo(locator);
  await sleep(250);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
}
// Smooth scroll to bring an element's top to `offset` px from viewport top.
async function smoothScrollTo(locator, offset = 80, ms = 1600) {
  const target = await locator.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
  await page.evaluate(async ({ target, ms }) => {
    const start = window.scrollY, d = target - start, t1 = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        const p = Math.min(1, (now - t1) / ms);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        window.scrollTo(0, start + d * e);
        p < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  }, { target, ms });
}

try {
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.mouse.move(900, 500);
  await sleep(1500);
  await mark("home");
  await sleep(5000);

  // --- Upload ---
  const uploadBtn = page.getByRole("button", { name: "Upload or take a selfie" });
  await moveTo(uploadBtn);
  await sleep(600);
  await mark("upload_click", false);
  await page.locator('input[type="file"]').setInputFiles(SELFIE);
  await page.locator(".loading").waitFor({ timeout: 10000 });
  await mark("analyzing");
  await page.locator(".profile").waitFor({ timeout: 180000 });
  await mark("analysis_done");
  await sleep(1200); // app's own smooth scroll
  await smoothScrollTo(page.locator(".profile"), 70, 900);
  await mark("profile");
  await page.mouse.move(700, 300, { steps: 30 });
  await sleep(3000);
  await page.locator(".concerns").hover();
  await sleep(4000);
  await page.locator(".tips").hover();
  await sleep(4000);
  await mark("profile_end", false);

  // --- Recommendations ---
  const shelves = page.locator(".shelf");
  await smoothScrollTo(page.locator(".builder"), 70, 1600);
  await mark("recs_foundation");
  await moveTo(shelves.nth(0).locator(".product").first());
  await sleep(4000);
  await smoothScrollTo(shelves.nth(1), 70, 1400);
  await mark("recs_lipstick");
  const lip = shelves.nth(1).locator(".product");
  await moveTo(lip.first());
  await sleep(2500);
  await clickOn(lip.nth(1)); // swap a lipstick
  await sleep(1800);
  await clickOn(lip.first()); // back to the top pick
  await sleep(1500);
  await smoothScrollTo(shelves.nth(2), 70, 1400);
  await mark("recs_blush");
  await moveTo(shelves.nth(2).locator(".product").first());
  await sleep(2500);
  await smoothScrollTo(shelves.nth(3), 70, 1400);
  await mark("recs_jewellery");
  await moveTo(shelves.nth(3).locator(".product").first());
  await sleep(3000);
  await moveTo(shelves.nth(4).locator(".product").first());
  await sleep(3000);
  await mark("recs_end", false);

  // --- Try-on ---
  const tryBtn = page.getByRole("button", { name: "Try on the full look" });
  await smoothScrollTo(page.locator(".builder .tryon-bar"), 360, 1200);
  await moveTo(tryBtn);
  await sleep(1500);
  await mark("tryon_click");
  await clickOn(tryBtn);
  await page.locator(".result").waitFor({ timeout: 20000 });
  await sleep(300);
  await smoothScrollTo(page.locator(".result"), 70, 1000);
  await mark("tryon_running");
  // Wait for the whole chain (makeup -> earrings -> necklace). The app shows each
  // intermediate result as it lands, so keep the step list and image in view.
  const seen = new Set();
  const deadline = Date.now() + 300000;
  const addBtn = page.getByRole("button", { name: "Add the look to bag" });
  while (Date.now() < deadline) {
    const doneCount = await page.locator(".step.done").count();
    for (let i = 1; i <= doneCount; i++)
      if (!seen.has(i)) {
        seen.add(i);
        await smoothScrollTo(page.locator(".result"), 70, 600);
        await mark(`step_${i}_done`);
      }
    if (await page.locator(".step.error").count()) { await mark("tryon_error"); break; }
    if (await addBtn.count()) break;
    await sleep(300);
  }
  await addBtn.waitFor({ timeout: 10000 });
  await page.waitForFunction(() => {
    const i = document.querySelector(".compare img.after");
    return i && i.complete && i.naturalWidth > 0;
  }, null, { timeout: 60000 });
  await mark("tryon_done");
  await sleep(500);
  await smoothScrollTo(page.locator(".compare"), 60, 1000);
  await mark("tryon_result");
  // animate the before/after slider
  const slider = page.locator('.compare input[type="range"]');
  await moveTo(page.locator(".compare"));
  for (const [from, to] of [[50, 100], [100, 0], [0, 55]]) {
    const n = 40;
    for (let k = 0; k <= n; k++) {
      const v = Math.round(from + ((to - from) * k) / n);
      await slider.evaluate((el, v) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(el, String(v));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, v);
      await sleep(35);
    }
    await sleep(700);
  }
  await sleep(1500);
  await smoothScrollTo(page.locator(".step-thumbs"), 260, 1000);
  await mark("tryon_steps");
  await sleep(3500);

  // --- Bag ---
  const bagBtn = page.getByRole("button", { name: "Add the look to bag" });
  await smoothScrollTo(page.locator(".result .tryon-bar"), 420, 900);
  await moveTo(bagBtn);
  await sleep(800);
  await mark("bag_click", false);
  await clickOn(bagBtn);
  await page.locator(".bag").waitFor();
  await sleep(600);
  await mark("bag_open");
  await moveTo(page.locator(".bag-foot"));
  await sleep(6000);
  await mark("end");
} catch (e) {
  console.error("RECORD ERROR:", e.message);
  await mark("failed").catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 2));
  await context.close();
  await browser.close();
  const webm = readdirSync(OUT).find((f) => f.endsWith(".webm") && f !== "raw.webm");
  if (webm) renameSync(path.join(OUT, webm), path.join(OUT, "raw.webm"));
}
