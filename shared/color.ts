// Colour science helpers used to turn YouCam's skin_color hex into a shoppable profile.
// sRGB (D65) -> CIE XYZ -> CIELAB, CIEDE2000 distance, ITA (Individual Typology Angle).

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  // sRGB -> XYZ (D65)
  const X = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const Y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const Z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIEDE2000 colour difference. ~1 = just noticeable, >5 = clearly different. */
export function deltaE2000(x: Lab, y: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(x.a, x.b);
  const C2 = Math.hypot(y.a, y.b);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))));
  const a1 = (1 + G) * x.a;
  const a2 = (1 + G) * y.a;
  const C1p = Math.hypot(a1, x.b);
  const C2p = Math.hypot(a2, y.b);
  const h = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const d = Math.atan2(b, a) / rad;
    return d < 0 ? d + 360 : d;
  };
  const h1 = h(x.b, a1);
  const h2 = h(y.b, a2);
  const dL = y.L - x.L;
  const dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2);
  const Lm = (x.L + y.L) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hm = h1 + h2;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) > 180) hm = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
    else hm = (h1 + h2) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hm - 30) * rad) +
    0.24 * Math.cos(2 * hm * rad) +
    0.32 * Math.cos((3 * hm + 6) * rad) -
    0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hm - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cpm, 7) / (Math.pow(Cpm, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lm - 50, 2)) / Math.sqrt(20 + Math.pow(Lm - 50, 2));
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(
    Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * (dC / Sc) * (dH / Sh),
  );
}

/** Individual Typology Angle (dermatology skin-lightness classification). */
export function ita(lab: Lab): number {
  return (Math.atan2(lab.L - 50, lab.b) * 180) / Math.PI;
}

/** CIELAB hue angle in degrees (0-360). Skin typically sits around 40-70 degrees. */
export function hueAngle(lab: Lab): number {
  const d = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}

export function mix(hexA: string, hexB: string, t: number): string {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

export function labToHex({ L, a, b }: Lab): string {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));
  const X = inv(fx) * 0.95047;
  const Y = inv(fy);
  const Z = inv(fz) * 1.08883;
  const lin = [
    X * 3.2404542 - Y * 1.5371385 - Z * 0.4985314,
    -X * 0.969266 + Y * 1.8760108 + Z * 0.041556,
    X * 0.0556434 - Y * 0.2040259 + Z * 1.0572252,
  ];
  const rgb = lin.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return v * 255;
  }) as [number, number, number];
  return toHex(rgb);
}

/** Build a colour from lightness, chroma and hue angle (CIE LCh). */
export function lchToHex(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  return labToHex({ L, a: C * Math.cos(h), b: C * Math.sin(h) });
}
