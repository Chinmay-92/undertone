import { jewelleryTaskBody, YouCamClient, YouCamError, type FetchLike } from "../server/youcam/client";

type Call = { url: string; method: string; headers: Headers; body?: unknown };

function scripted(responses: ((c: Call) => Response)[]) {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init = {}) => {
    const c = { url, method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body };
    calls.push(c);
    const next = responses.shift();
    if (!next) throw new Error(`unexpected call ${c.method} ${url}`);
    return next(c);
  };
  return { f, calls };
}
const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200 });

describe("YouCamClient", () => {
  const base = "https://api.test";
  const noSleep = async () => {};

  it("uploads via File API then PUTs bytes to the pre-signed URL with returned headers", async () => {
    const { f, calls } = scripted([
      ok({ status: 200, data: { files: [{ file_id: "fid-1", requests: [{ method: "PUT", url: "https://s3.test/put", headers: { "Content-Type": "image/jpeg", "Content-Length": 3 } }] }] } }),
      () => new Response(null, { status: 200 }),
    ]);
    const c = new YouCamClient({ apiKey: "k", baseUrl: base, fetchImpl: f, sleep: noSleep });
    const id = await c.uploadFile(new Uint8Array([1, 2, 3]), "image/jpeg", "me.jpg");
    expect(id).toBe("fid-1");
    expect(calls[0].url).toBe(`${base}/s2s/v2.0/file`);
    expect(calls[0].headers.get("Authorization")).toBe("Bearer k");
    expect(JSON.parse(String(calls[0].body))).toEqual({ files: [{ content_type: "image/jpeg", file_name: "me.jpg", file_size: 3 }] });
    expect(calls[1]).toMatchObject({ url: "https://s3.test/put", method: "PUT" });
    expect(calls[1].headers.get("Content-Length")).toBe("3");
    expect(calls[1].headers.get("Authorization")).toBeNull(); // never leak the key to storage
  });

  it("creates a task and polls until success", async () => {
    const { f, calls } = scripted([
      ok({ status: 200, data: { task_id: "t1" } }),
      ok({ status: 200, data: { task_status: "running" } }),
      ok({ status: 200, data: { task_status: "running" } }),
      ok({ status: 200, data: { task_status: "success", results: { url: "https://r/1.jpg" } } }),
    ]);
    const c = new YouCamClient({ apiKey: "k", baseUrl: base, fetchImpl: f, sleep: noSleep });
    const r = await c.runTask<{ url: string }>("makeup-vto", { src_file_id: "x", effects: [] });
    expect(r.url).toBe("https://r/1.jpg");
    expect(calls[0]).toMatchObject({ url: `${base}/s2s/v2.0/task/makeup-vto`, method: "POST" });
    expect(calls[3]).toMatchObject({ url: `${base}/s2s/v2.0/task/makeup-vto/t1`, method: "GET" });
  });

  it("surfaces engine errors and HTTP errors as YouCamError", async () => {
    const { f } = scripted([
      ok({ status: 200, data: { task_id: "t2" } }),
      ok({ status: 200, data: { task_status: "error", error: "error_no_face", error_message: "No face detected" } }),
      () => new Response(JSON.stringify({ status: 401, error_code: "InvalidApiKey", error_message: "bad key" }), { status: 401 }),
    ]);
    const c = new YouCamClient({ apiKey: "k", baseUrl: base, fetchImpl: f, sleep: noSleep });
    await expect(c.runTask("skin-tone-analysis", { src_file_id: "x" })).rejects.toMatchObject({ name: "YouCamError", code: "error_no_face", message: "No face detected" });
    await expect(c.createTask("skin-analysis", {})).rejects.toMatchObject({ httpStatus: 401, code: "InvalidApiKey" });
  });

  it("times out instead of polling forever", async () => {
    let now = 0;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      const running = () => new Response(JSON.stringify({ status: 200, data: { task_status: "running" } }), { status: 200 });
      const { f } = scripted([ok({ status: 200, data: { task_id: "t3" } }), ...Array(10).fill(running)]);
      const c = new YouCamClient({ apiKey: "k", baseUrl: base, fetchImpl: f, timeoutMs: 5000, sleep: async (ms) => { now += ms; } , pollIntervalMs: 2000 });
      await expect(c.runTask("makeup-vto", {})).rejects.toThrow(/Timed out/);
    } finally {
      Date.now = realNow;
    }
  });

  it("requires an API key", () => {
    expect(() => new YouCamClient({ apiKey: "" })).toThrow(YouCamError);
  });
});

describe("jewelleryTaskBody", () => {
  it("fills flat ids plus source_info/object_infos as the 2D VTO spec requires", () => {
    expect(jewelleryTaskBody("earring", { fileId: "src" }, "ref")).toEqual({
      src_file_id: "src",
      ref_file_ids: ["ref"],
      source_info: { name: "src" },
      object_infos: [{ name: "ref", parameter: { earring_need_remove_background: true, earring_occluded_type: 0 } }],
    });
    const chained = jewelleryTaskBody("necklace", { url: "https://r/makeup.jpg" }, "ref2");
    expect(chained).toMatchObject({ src_file_url: "https://r/makeup.jpg", source_info: { name: "https://r/makeup.jpg" } });
    expect(chained).not.toHaveProperty("src_file_id");
  });
});
