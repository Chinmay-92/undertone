// Builds the YouCam makeup-vto `effects` payload from chosen products + skin profile.
// Schema: https://docs.perfectcorp.com/reference/makeup_vto (POST /s2s/v2.0/task/makeup-vto)
import type { Blush, Foundation, Lipstick } from "./catalog";
import type { SkinProfile } from "./profile";

export type MakeupEffect = Record<string, unknown> & { category: string };

export interface LookSelection {
  foundation?: Foundation;
  lipstick?: Lipstick;
  blush?: Blush;
}

export function buildMakeupEffects(sel: LookSelection, profile: Pick<SkinProfile, "coverage" | "glow" | "finish">): MakeupEffect[] {
  const effects: MakeupEffect[] = [];
  if (sel.foundation) {
    effects.push({
      category: "foundation",
      palettes: [
        {
          color: sel.foundation.hex,
          colorIntensity: 45,
          glowIntensity: profile.glow,
          coverageIntensity: profile.coverage,
        },
      ],
    });
  }
  if (sel.blush) {
    const palette: Record<string, unknown> = {
      color: sel.blush.hex,
      texture: sel.blush.texture,
      colorIntensity: 45,
    };
    if (sel.blush.texture === "satin") palette.glowStrength = 40;
    if (sel.blush.texture === "shimmer") {
      palette.shimmerColor = "#fff1dc";
      palette.shimmerDensity = 40;
    }
    effects.push({ category: "blush", pattern: { name: "1color1" }, palettes: [palette] });
  }
  if (sel.lipstick) {
    const palette: Record<string, unknown> = {
      color: sel.lipstick.hex,
      texture: sel.lipstick.texture,
      colorIntensity: 75,
    };
    if (sel.lipstick.texture === "gloss") {
      palette.gloss = 70;
      palette.transparencyIntensity = 30;
    }
    effects.push({
      category: "lip_color",
      shape: { name: "original" },
      style: { type: "full" },
      palettes: [palette],
    });
  }
  return effects;
}
