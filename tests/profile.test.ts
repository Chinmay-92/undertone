import { hexToLab } from "../shared/color";
import { FOUNDATIONS } from "../shared/catalog";
import { buildProfile, classifyUndertone, depthFromIta } from "../shared/profile";

describe("skin profile", () => {
  it("classifies every catalogue foundation into its labelled undertone", () => {
    for (const f of FOUNDATIONS) expect(classifyUndertone(hexToLab(f.hex))).toBe(f.undertone);
  });

  it("maps ITA to dermatology depth bands", () => {
    expect(depthFromIta(60)).toBe("very light");
    expect(depthFromIta(45)).toBe("light");
    expect(depthFromIta(30)).toBe("intermediate");
    expect(depthFromIta(20)).toBe("tan");
    expect(depthFromIta(0)).toBe("brown");
    expect(depthFromIta(-50)).toBe("dark");
  });

  it("oily skin gets a matte, low-glow finish", () => {
    const p = buildProfile({ skin_color: "#c79e79" }, [
      { type: "oiliness", ui_score: 40 },
      { type: "moisture", ui_score: 75 },
      { type: "redness", ui_score: 80 },
      { type: "radiance", ui_score: 70 },
    ]);
    expect(p.undertone).toBe("warm");
    expect(p.finish).toBe("matte");
    expect(p.glow).toBeLessThan(15);
  });

  it("dry, dull skin gets a dewy finish with extra glow; redness raises coverage", () => {
    const p = buildProfile({ skin_color: "#8f6043" }, [
      { type: "hd_oiliness", ui_score: 80 },
      { type: "hd_moisture", ui_score: 40 },
      { type: "hd_redness", ui_score: 50 },
      { type: "hd_radiance", ui_score: 40 },
    ]);
    expect(p.finish).toBe("dewy");
    expect(p.glow).toBe(65);
    expect(p.coverage).toBe(60);
    expect(p.tips.length).toBeGreaterThanOrEqual(3);
  });

  it("falls back to a balanced satin finish without skin scores", () => {
    const p = buildProfile({ skin_color: "#e7b6a4" }, []);
    expect(p.undertone).toBe("cool");
    expect(p.finish).toBe("satin");
    expect(p.concerns).toHaveLength(4);
  });
});
