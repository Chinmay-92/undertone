// Turns raw YouCam results (Skin Tone Analysis + Skin Analysis) into a shopping profile.
import { hexToLab, hueAngle, ita, type Lab } from "./color";
import type { Undertone } from "./catalog";

export interface ToneColors {
  skin_color: string;
  lip_color?: string;
  eye_color?: string;
  eye_color_name?: string;
  hair_color?: string;
  hair_color_name?: string;
  eyebrow_color?: string;
}

export interface SkinScore {
  type: string; // YouCam concern key, e.g. "oiliness"
  ui_score: number; // 1-100, higher = healthier
  raw_score?: number;
}

export type DepthBand = "very light" | "light" | "intermediate" | "tan" | "brown" | "dark";
export type Finish = "matte" | "satin" | "dewy";

export interface SkinProfile {
  skinHex: string;
  lipHex?: string;
  lab: Lab;
  ita: number;
  hue: number;
  undertone: Undertone;
  depth: DepthBand;
  eyeColorName?: string;
  hairColorName?: string;
  concerns: { type: string; label: string; score: number }[];
  finish: Finish;
  coverage: number; // 0-100, passed to makeup-vto foundation.coverageIntensity
  glow: number; // 0-100, passed to makeup-vto foundation.glowIntensity
  tips: string[];
}

// The SD concerns we request from Skin Analysis (4 concerns = lowest unit tier).
export const SKIN_CONCERNS = ["oiliness", "moisture", "redness", "radiance"] as const;

const LABELS: Record<string, string> = {
  oiliness: "Oil balance",
  moisture: "Hydration",
  redness: "Calmness (redness)",
  radiance: "Radiance",
  texture: "Texture",
  acne: "Clarity (acne)",
  pore: "Pores",
};

/** Hue thresholds calibrated on CIELAB skin hue: pinker (lower hue) = cool, yellower = warm. */
export function classifyUndertone(lab: Lab): Undertone {
  const h = hueAngle(lab);
  if (h >= 62) return "warm";
  if (h < 52) return "cool";
  return "neutral";
}

/** ITA bands per Chardon et al. (1991), widely used in dermatology. */
export function depthFromIta(angle: number): DepthBand {
  if (angle > 55) return "very light";
  if (angle > 41) return "light";
  if (angle > 28) return "intermediate";
  if (angle > 10) return "tan";
  if (angle > -30) return "brown";
  return "dark";
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

export function buildProfile(colors: ToneColors, scores: SkinScore[]): SkinProfile {
  const lab = hexToLab(colors.skin_color);
  const angle = ita(lab);
  const undertone = classifyUndertone(lab);
  const byType = new Map(scores.map((s) => [s.type.replace(/^hd_/, ""), s.ui_score]));
  const get = (k: string) => byType.get(k) ?? 70;

  const oil = get("oiliness");
  const moist = get("moisture");
  const red = get("redness");
  const rad = get("radiance");

  const tips: string[] = [];
  let finish: Finish = "satin";
  let glow = 25;
  let coverage = 40;

  if (oil < 50 && oil <= moist) {
    finish = "matte";
    glow = 8;
    tips.push("Your scan shows extra shine, so we set a matte finish in try-on and suggest blotting through the day.");
  } else if (moist < 50) {
    finish = "dewy";
    glow = 50;
    tips.push("Hydration reads low, so we switched to a dewy finish. A hydrating primer will help foundation sit smoothly.");
  }
  if (red < 55) {
    coverage += 20;
    tips.push("Some redness detected: coverage is raised and a green colour-correcting primer is worth a look.");
  }
  if (rad < 50 && finish !== "matte") {
    glow += 15;
    tips.push("Radiance is on the low side, so we added extra glow to the foundation.");
  }
  if (tips.length === 0) tips.push("Your skin scan looks balanced, so a natural satin finish with light coverage will do.");

  const concerns = SKIN_CONCERNS.map((k) => ({ type: k, label: LABELS[k] ?? k, score: get(k) }));

  return {
    skinHex: colors.skin_color,
    lipHex: colors.lip_color,
    lab,
    ita: angle,
    hue: hueAngle(lab),
    undertone,
    depth: depthFromIta(angle),
    eyeColorName: colors.eye_color_name,
    hairColorName: colors.hair_color_name,
    concerns,
    finish,
    coverage: clamp(coverage),
    glow: clamp(glow),
    tips,
  };
}
