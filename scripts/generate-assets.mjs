// Generates the jewellery product images in public/products/*.png.
// Pure Node (zlib only): procedurally drawn shapes, so there are no third-party image rights.
// Run: npm run assets
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "products");
const W = 512;
const H = 512;
const SS = 3; // supersampling for anti-aliasing

const METALS = {
  gold: [212, 175, 55],
  silver: [196, 199, 207],
  rose: [207, 154, 134],
};

// ---- PNG encoder ----------------------------------------------------------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Rasteriser -----------------------------------------------------------
// `shape(x, y)` returns null (background) or a shading value 0..1 for metal at that point.
function render(shape, metal) {
  const base = METALS[metal];
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const s = shape(px, py);
          if (s === null) {
            r += 255; g += 255; b += 255;
          } else {
            const k = 0.55 + 0.75 * s; // metallic light/dark banding
            const spec = Math.max(0, s - 0.82) * 4; // specular highlight
            r += Math.min(255, base[0] * k + 255 * spec);
            g += Math.min(255, base[1] * k + 255 * spec);
            b += Math.min(255, base[2] * k + 255 * spec);
          }
        }
      }
      const n = SS * SS;
      const i = (y * W + x) * 3;
      out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n;
    }
  }
  return out;
}

const band = (t) => 0.5 + 0.5 * Math.sin(t);

function hoop(x, y) {
  const cx = 256, cy = 280, d = Math.hypot(x - cx, y - cy);
  if (d > 150 && d < 178) return band(Math.atan2(y - cy, x - cx) * 2 + 1) * 0.8 + ((178 - d) / 28) * 0.2;
  if (Math.abs(x - 256) < 6 && y > 80 && y < 135) return 0.7; // post
  return null;
}

function drop(x, y) {
  const cx = 256, cy = 320, r = 95;
  const inCircle = Math.hypot(x - cx, y - cy) < r;
  const t = (y - 140) / (cy - 140); // triangle from tip (y=140) widening to circle
  const inTri = y >= 140 && y <= cy && Math.abs(x - cx) < t * r * 0.92;
  if (inCircle || inTri) return band((x - cx) / 40 + (y - cy) / 70);
  if (Math.hypot(x - 256, y - 118) < 22 && Math.hypot(x - 256, y - 118) > 13) return 0.75; // jump ring
  if (Math.abs(x - 256) < 5 && y > 60 && y < 100) return 0.7;
  return null;
}

function stud(x, y) {
  const cx = 256, cy = 256;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * 70, py = cy + Math.sin(a) * 70;
    if (Math.hypot(x - px, y - py) < 62) return band(Math.hypot(x - px, y - py) / 12 + k);
  }
  if (Math.hypot(x - cx, y - cy) < 40) return 0.95;
  return null;
}

// Chain: a parabola from (50, 70) to (462, 70) dipping to `bottom`, drawn as small links.
function chainAt(x, y, bottom) {
  const a = (bottom - 70) / (206 * 206);
  const yc = 70 + a * (206 * 206 - (x - 256) ** 2);
  if (x < 50 || x > 462) return null;
  const slope = -2 * a * (x - 256);
  if (Math.abs(y - yc) / Math.sqrt(1 + slope * slope) < 4.5) return band((x + y) / 4);
  return null;
}

function necklaceGold(x, y) {
  const d = Math.hypot(x - 256, y - 345);
  if (d < 46) return band(d / 9 + 1);
  if (Math.hypot(x - 256, y - 290) < 12 && Math.hypot(x - 256, y - 290) > 6) return 0.8;
  return chainAt(x, y, 280);
}

function necklaceSilver(x, y) {
  if (Math.abs(x - 256) < 9 && y > 295 && y < 400) return band(y / 12);
  return chainAt(x, y, 290);
}

function heart(x, y) {
  const u = (x - 256) / 62, v = -(y - 360) / 62 + 0.25;
  const f = (u * u + v * v - 1) ** 3 - u * u * v * v * v;
  if (f < 0) return band(u * 3 + v * 2);
  return chainAt(x, y, 300);
}

const ITEMS = [
  ["earring-gold-hoop.png", hoop, "gold"],
  ["earring-silver-drop.png", drop, "silver"],
  ["earring-rosegold-stud.png", stud, "rose"],
  ["necklace-gold-pendant.png", necklaceGold, "gold"],
  ["necklace-silver-chain.png", necklaceSilver, "silver"],
  ["necklace-rosegold-heart.png", heart, "rose"],
];

mkdirSync(OUT, { recursive: true });
for (const [name, shape, metal] of ITEMS) {
  const png = encodePng(render(shape, metal));
  writeFileSync(path.join(OUT, name), png);
  console.log(`wrote public/products/${name} (${png.length} bytes)`);
}
