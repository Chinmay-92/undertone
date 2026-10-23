import { deltaE2000, hexToLab, ita, labToHex, lchToHex, hueAngle } from "../shared/color";

describe("colour science", () => {
  it("converts sRGB hex to CIELAB (white, black, mid grey)", () => {
    expect(hexToLab("#ffffff").L).toBeCloseTo(100, 1);
    expect(hexToLab("#000000").L).toBeCloseTo(0, 1);
    const g = hexToLab("#777777");
    expect(g.L).toBeCloseTo(50.03, 1);
    expect(Math.abs(g.a)).toBeLessThan(0.01);
  });

  it("round-trips hex -> Lab -> hex", () => {
    for (const hex of ["#c79e79", "#e7b6a4", "#8f6043", "#123456"]) {
      expect(labToHex(hexToLab(hex))).toBe(hex);
    }
  });

  it("matches the Sharma et al. CIEDE2000 reference pairs", () => {
    expect(deltaE2000({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 })).toBeCloseTo(2.0425, 3);
    expect(deltaE2000({ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 })).toBeCloseTo(27.1492, 3);
    expect(deltaE2000({ L: 2.0776, a: 0.0795, b: -1.135 }, { L: 0.9033, a: -0.0636, b: -0.5514 })).toBeCloseTo(0.9082, 3);
  });

  it("computes ITA and hue angle consistently with LCh construction", () => {
    const hex = lchToHex(68, 27, 57);
    const lab = hexToLab(hex);
    expect(hueAngle(lab)).toBeCloseTo(57, 0);
    expect(ita({ L: 50, a: 10, b: 20 })).toBeCloseTo(0, 5);
    expect(ita({ L: 70, a: 10, b: 20 })).toBeCloseTo(45, 5);
  });

  it("rejects invalid hex", () => {
    expect(() => hexToLab("nope")).toThrow();
  });
});
