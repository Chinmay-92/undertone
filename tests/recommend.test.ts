import { buildProfile } from "../shared/profile";
import { recommend } from "../shared/recommend";
import { buildMakeupEffects } from "../shared/makeup";
import { SAMPLES } from "../shared/avatar";

const profileFor = (skin: string, lip?: string) => buildProfile({ skin_color: skin, lip_color: lip }, []);

describe("recommender", () => {
  it("finds the exact catalogue shade when skin matches one", () => {
    const r = recommend(profileFor("#c79e79"));
    expect(r.foundation[0].product.id).toBe("F3W");
    expect(r.foundation[0].badge).toBe("Best shade match");
    expect(r.foundation).toHaveLength(3);
  });

  it("recommends metals by undertone", () => {
    expect(recommend(profileFor(SAMPLES[0].state.skin)).metal.best).toBe("gold");
    expect(recommend(profileFor(SAMPLES[1].state.skin)).metal.best).toBe("silver");
    expect(recommend(profileFor(SAMPLES[2].state.skin)).metal.best).toBe("rose-gold");
    const r = recommend(profileFor(SAMPLES[1].state.skin));
    expect(r.earrings[0].product.metal).toBe("silver");
    expect(r.necklace[0].product.metal).toBe("silver");
  });

  it("prefers lipsticks in the user's undertone and flags a natural-lip match", () => {
    const r = recommend(profileFor("#c79e79", "#b97a5a"));
    expect(r.lipstick[0].product.undertone).toBe("warm");
    expect(r.lipstick.some((x) => x.badge === "Your lips, but better")).toBe(true);
  });

  it("never returns more than the top picks and scores are 0-100", () => {
    const r = recommend(profileFor("#8f6043"));
    for (const list of [r.foundation, r.lipstick, r.blush, r.earrings, r.necklace]) {
      for (const x of list) {
        expect(x.score).toBeGreaterThanOrEqual(0);
        expect(x.score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("makeup-vto payload", () => {
  it("builds effects that follow the documented schema", () => {
    const p = buildProfile({ skin_color: "#c79e79" }, [{ type: "oiliness", ui_score: 30 }]);
    const r = recommend(p);
    const effects = buildMakeupEffects(
      { foundation: r.foundation[0].product, lipstick: r.lipstick[0].product, blush: r.blush[0].product },
      p,
    );
    const byCat = Object.fromEntries(effects.map((e) => [e.category, e as any]));
    expect(Object.keys(byCat).sort()).toEqual(["blush", "foundation", "lip_color"]);
    expect(byCat.foundation.palettes[0]).toMatchObject({ color: r.foundation[0].product.hex, glowIntensity: p.glow, coverageIntensity: p.coverage });
    expect(byCat.blush.pattern.name).toBe("1color1");
    expect(byCat.blush.palettes).toHaveLength(1);
    expect(byCat.lip_color.shape.name).toBeTruthy();
    expect(byCat.lip_color.style.type).toBe("full");
    for (const e of effects) for (const pal of (e as any).palettes) expect(pal.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("adds required gloss fields for gloss lipsticks", () => {
    const effects = buildMakeupEffects(
      { lipstick: { id: "x", name: "x", price: 1, blurb: "", category: "lipstick", hex: "#c0243b", undertone: "neutral", texture: "gloss" } },
      { coverage: 40, glow: 20, finish: "satin" },
    );
    expect((effects[0] as any).palettes[0]).toMatchObject({ gloss: 70, transparencyIntensity: 30 });
  });
});
