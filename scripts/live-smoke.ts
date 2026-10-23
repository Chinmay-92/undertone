// One-shot check against the REAL YouCam API. Spends roughly 32 units.
// Usage: YOUCAM_API_KEY=... npm run smoke:live -- path/to/selfie.jpg
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pipeline } from "../server/pipeline";
import { YouCamClient } from "../server/youcam/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
const key = process.env.YOUCAM_API_KEY;
if (!key || !file) {
  console.error("Usage: YOUCAM_API_KEY=... npm run smoke:live -- path/to/selfie.jpg");
  process.exit(1);
}
const client = new YouCamClient({ apiKey: key, baseUrl: process.env.YOUCAM_BASE_URL });
const pipeline = new Pipeline(client, path.join(root, "public"));
const bytes = new Uint8Array(await readFile(file));
const type = /\.png$/i.test(file) ? "image/png" : "image/jpeg";

console.log("1/2 Skin Tone Analysis + Skin Analysis…");
const a = await pipeline.analyze(bytes, type, path.basename(file));
console.log(JSON.stringify({ profile: { ...a.profile, lab: undefined }, warnings: a.warnings }, null, 2));
const r = a.recommendations;
console.log("2/2 Chained try-on: makeup -> earrings -> necklace…");
const job = pipeline.startTryOn({
  sessionId: a.sessionId,
  foundationId: r.foundation[0].product.id,
  lipstickId: r.lipstick[0].product.id,
  blushId: r.blush[0].product.id,
  earringsId: r.earrings[0].product.id,
  necklaceId: r.necklace[0].product.id,
});
while (pipeline.getJob(job.id)!.status === "running") await new Promise((res) => setTimeout(res, 1000));
console.log(JSON.stringify(pipeline.getJob(job.id), null, 2));
