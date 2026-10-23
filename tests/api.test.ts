import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app";
import { avatarSvg, SAMPLES } from "../shared/avatar";
import { decodeState } from "../server/youcam/mockFetch";

const publicDir = path.resolve(__dirname, "..", "public");

async function waitForJob(app: any, id: string) {
  for (let i = 0; i < 100; i++) {
    const r = await request(app).get(`/api/jobs/${id}`);
    if (r.body.job.status !== "running") return r.body.job;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error("job did not finish");
}

describe("HTTP API (mock mode, end-to-end through the YouCam client)", () => {
  const { app, mode } = createApp({ publicDir, pollIntervalMs: 1 });

  it("runs in mock mode without a key", async () => {
    expect(mode).toBe("mock");
    const r = await request(app).get("/api/health");
    expect(r.body).toMatchObject({ ok: true, mode: "mock" });
  });

  it("serves the catalogue, samples and product images", async () => {
    expect((await request(app).get("/api/catalog")).body.products.length).toBeGreaterThan(30);
    const s = await request(app).get("/api/samples");
    expect(s.body.samples).toHaveLength(3);
    const svg = await request(app).get(s.body.samples[0].url);
    expect(svg.headers["content-type"]).toMatch(/svg/);
    const png = await request(app).get("/products/earring-gold-hoop.png");
    expect(png.status).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");
  });

  it("analyses a sample, recommends, and runs the chained makeup + jewellery try-on", async () => {
    const a = await request(app).post("/api/analyze").send({ sampleId: "amber" });
    expect(a.status).toBe(200);
    expect(a.body.profile).toMatchObject({ skinHex: SAMPLES[0].state.skin, undertone: "warm", finish: "matte" });
    expect(a.body.recommendations.metal.best).toBe("gold");
    expect(a.body.unitsEstimate).toBe(29);

    const rec = a.body.recommendations;
    const t = await request(app).post("/api/tryon").send({
      sessionId: a.body.sessionId,
      foundationId: rec.foundation[0].product.id,
      lipstickId: rec.lipstick[0].product.id,
      blushId: rec.blush[0].product.id,
      earringsId: rec.earrings[0].product.id,
      necklaceId: rec.necklace[0].product.id,
    });
    expect(t.status).toBe(202);
    const job = await waitForJob(app, t.body.jobId);
    expect(job.status).toBe("done");
    expect(job.steps.map((s: any) => s.key)).toEqual(["makeup", "earrings", "necklace"]);
    expect(job.steps.every((s: any) => s.status === "done")).toBe(true);

    const final = await request(app).get(job.resultUrl);
    expect(final.status).toBe(200);
    const svg = final.body.toString();
    expect(svg).toContain("#d4af37"); // gold earrings + necklace were chained onto the makeup result
    const state = decodeState(new URL(job.resultUrl, "http://x").searchParams.get("s")!);
    expect(state).toMatchObject({
      lipstick: rec.lipstick[0].product.hex,
      blush: rec.blush[0].product.hex,
      foundation: rec.foundation[0].product.hex,
      earring: "gold",
      necklace: "gold",
    });
  });

  it("accepts an uploaded image file (multipart)", async () => {
    const r = await request(app)
      .post("/api/analyze")
      .attach("photo", Buffer.from(avatarSvg(SAMPLES[1].state)), { filename: "rose.svg", contentType: "image/svg+xml" });
    expect(r.status).toBe(200);
    expect(r.body.profile.undertone).toBe("cool");
    expect(r.body.profile.tips.join(" ")).toMatch(/redness/i);
  });

  it("validates input", async () => {
    expect((await request(app).post("/api/analyze").send({})).status).toBe(400);
    expect((await request(app).post("/api/analyze").attach("photo", Buffer.from("x"), { filename: "a.gif", contentType: "image/gif" })).status).toBe(415);
    expect((await request(app).post("/api/tryon").send({ sessionId: "nope", lipstickId: "L01" })).status).toBe(404);
    const a = await request(app).post("/api/analyze").send({ sampleId: "rose" });
    expect((await request(app).post("/api/tryon").send({ sessionId: a.body.sessionId })).status).toBe(400);
    expect((await request(app).post("/api/tryon").send({ sessionId: a.body.sessionId, earringsId: "N01" })).status).toBe(400);
    expect((await request(app).get("/api/jobs/missing")).status).toBe(404);
  });
});

describe("live mode guards", () => {
  it("switches to live with a key and refuses illustrated samples (no network call)", async () => {
    const { app, mode } = createApp({ publicDir, apiKey: "test-key-not-real" });
    expect(mode).toBe("live");
    const r = await request(app).post("/api/analyze").send({ sampleId: "amber" });
    expect(r.status).toBe(400);
    expect((await request(app).get("/mock/render.svg?s=x")).status).toBe(404);
  });

  it("YOUCAM_MOCK forces mock even with a key", () => {
    expect(createApp({ publicDir, apiKey: "k", forceMock: true }).mode).toBe("mock");
  });
});
