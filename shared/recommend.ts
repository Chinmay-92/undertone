// Skin-aware recommender: ranks catalogue products for a SkinProfile and explains why.
import { deltaE2000, hexToLab } from "./color";
import {
  BLUSHES,
  FOUNDATIONS,
  JEWELLERY,
  LIPSTICKS,
  type Blush,
  type Foundation,
  type Jewellery,
  type Lipstick,
  type Metal,
  type Undertone,
} from "./catalog";
import type { SkinProfile } from "./profile";

export interface Ranked<T> {
  product: T;
  score: number; // higher is better, 0-100
  reason: string;
  badge?: string;
}

export interface Recommendations {
  foundation: Ranked<Foundation>[];
  lipstick: Ranked<Lipstick>[];
  blush: Ranked<Blush>[];
  earrings: Ranked<Jewellery>[];
  necklace: Ranked<Jewellery>[];
  metal: { best: Metal; order: Metal[]; reason: string };
}

const undertoneFit = (skin: Undertone, product: Undertone): number => {
  if (skin === product) return 1;
  if (skin === "neutral" || product === "neutral") return 0.6;
  return 0.15;
};

const toScore = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function rankFoundations(p: SkinProfile): Ranked<Foundation>[] {
  return FOUNDATIONS.map((f) => {
    const dE = deltaE2000(p.lab, hexToLab(f.hex));
    // Penalise undertone mismatch on top of raw colour distance: a near-match in the wrong
    // undertone is the classic "looks orange / looks ashy" return.
    const penalty = (1 - undertoneFit(p.undertone, f.undertone)) * 6;
    const total = dE + penalty;
    return {
      product: f,
      score: toScore(100 - total * 6),
      reason: `Colour distance from your skin ΔE ${dE.toFixed(1)}${f.undertone === p.undertone ? `, ${f.undertone} undertone match` : ""}.`,
      _total: total,
    };
  })
    .sort((a, b) => a._total - b._total)
    .slice(0, 3)
    .map(({ _total, ...r }, i) => ({ ...r, badge: i === 0 ? "Best shade match" : undefined }));
}

export function rankLipsticks(p: SkinProfile): Ranked<Lipstick>[] {
  // Target lightness: a shade clearly deeper than skin reads as "colour"; deeper skin wants deeper lips.
  const targetL = p.lab.L - 22;
  const natural = p.lipHex ? hexToLab(p.lipHex) : undefined;
  const ranked = LIPSTICKS.map((l) => {
    const lab = hexToLab(l.hex);
    const fit = undertoneFit(p.undertone, l.undertone);
    const depthFit = 1 - Math.min(1, Math.abs(lab.L - targetL) / 35);
    let score = 55 * fit + 35 * depthFit + 10;
    let reason = `${l.undertone === p.undertone ? "Matches" : "Works with"} your ${p.undertone} undertone`;
    let badge: string | undefined;
    if (natural) {
      const dE = deltaE2000(natural, lab);
      if (dE < 12) {
        score += 12 - dE; // "my lips but better" bonus
        reason += `, close to your natural lip colour (ΔE ${dE.toFixed(1)})`;
        badge = "Your lips, but better";
      }
    }
    return { product: l, score: toScore(score), reason: `${reason}.`, badge };
  }).sort((a, b) => b.score - a.score);
  return ranked.slice(0, 4);
}

export function rankBlushes(p: SkinProfile): Ranked<Blush>[] {
  const targetL = p.lab.L - 12;
  return BLUSHES.map((b) => {
    const lab = hexToLab(b.hex);
    const fit = undertoneFit(p.undertone, b.undertone);
    const depthFit = 1 - Math.min(1, Math.abs(lab.L - targetL) / 30);
    // Oily skin: avoid shimmer; dry/dull skin: prefer satin/shimmer glow.
    let finishFit = 0.5;
    if (p.finish === "matte") finishFit = b.texture === "matte" ? 1 : b.texture === "shimmer" ? 0 : 0.5;
    if (p.finish === "dewy") finishFit = b.texture === "matte" ? 0.3 : 1;
    const score = 50 * fit + 30 * depthFit + 20 * finishFit;
    return {
      product: b,
      score: toScore(score),
      reason: `${b.texture} texture suits your ${p.finish} skin finish; ${b.undertone} pigment for a ${p.undertone} undertone.`,
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function metalOrder(u: Undertone): { best: Metal; order: Metal[]; reason: string } {
  switch (u) {
    case "warm":
      return {
        best: "gold",
        order: ["gold", "rose-gold", "silver"],
        reason: "Warm, golden undertones are echoed by yellow gold; rose gold is a softer alternative.",
      };
    case "cool":
      return {
        best: "silver",
        order: ["silver", "rose-gold", "gold"],
        reason: "Cool, pink undertones are flattered by white metals like sterling silver.",
      };
    default:
      return {
        best: "rose-gold",
        order: ["rose-gold", "gold", "silver"],
        reason: "Neutral undertones can wear any metal; rose gold bridges warm and cool.",
      };
  }
}

export function rankJewellery(p: SkinProfile, category: "earrings" | "necklace"): Ranked<Jewellery>[] {
  const m = metalOrder(p.undertone);
  return JEWELLERY.filter((j) => j.category === category)
    .map((j) => {
      const idx = m.order.indexOf(j.metal);
      return {
        product: j,
        score: toScore(100 - idx * 25),
        reason: idx === 0 ? m.reason : `${j.metal.replace("-", " ")} is option ${idx + 1} for your undertone.`,
        badge: idx === 0 ? "Best metal for you" : undefined,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function recommend(p: SkinProfile): Recommendations {
  return {
    foundation: rankFoundations(p),
    lipstick: rankLipsticks(p),
    blush: rankBlushes(p),
    earrings: rankJewellery(p, "earrings"),
    necklace: rankJewellery(p, "necklace"),
    metal: metalOrder(p.undertone),
  };
}
