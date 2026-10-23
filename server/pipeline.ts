// Orchestrates YouCam calls: (1) Skin Tone + Skin Analysis -> profile & recommendations,
// (2) chained try-on: makeup-vto -> earring VTO -> necklace VTO on the same photo.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findProduct, type Blush, type Foundation, type Jewellery, type Lipstick } from "../shared/catalog";
import { buildMakeupEffects } from "../shared/makeup";
import { buildProfile, SKIN_CONCERNS, type SkinProfile, type SkinScore, type ToneColors } from "../shared/profile";
import { recommend, type Recommendations } from "../shared/recommend";
import { jewelleryTaskBody, YouCamClient, YouCamError } from "./youcam/client";

export interface AnalysisResult {
  sessionId: string;
  profile: SkinProfile;
  recommendations: Recommendations;
  warnings: string[];
  unitsEstimate: number;
}

export interface TryOnRequest {
  sessionId: string;
  foundationId?: string;
  lipstickId?: string;
  blushId?: string;
  earringsId?: string;
  necklaceId?: string;
}

export type StepKey = "makeup" | "earrings" | "necklace";
export interface JobStep {
  key: StepKey;
  label: string;
  status: "pending" | "running" | "done" | "error";
  url?: string;
  error?: string;
}
export interface TryOnJob {
  id: string;
  status: "running" | "done" | "error";
  steps: JobStep[];
  resultUrl?: string;
  error?: string;
  createdAt: number;
}

interface Session {
  srcFileId: string;
  profile: SkinProfile;
  createdAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000;

// Published unit costs (docs.perfectcorp.com, Oct 2026): skin tone 20, skin analysis SD 1-4 concerns 9,
// makeup VTO 1, earring/necklace single item 1 each.
export const UNIT_COST = { tone: 20, skin: 9, makeup: 1, earrings: 1, necklace: 1 } as const;

export class Pipeline {
  private sessions = new Map<string, Session>();
  private jobs = new Map<string, TryOnJob>();
  private refCache = new Map<string, { fileId: string; at: number }>();

  constructor(
    private readonly client: YouCamClient,
    private readonly publicDir: string,
  ) {}

  async analyze(bytes: Uint8Array, contentType: string, fileName: string): Promise<AnalysisResult> {
    const srcFileId = await this.client.uploadFile(bytes, contentType, fileName);
    const warnings: string[] = [];

    const [tone, skin] = await Promise.allSettled([
      this.client.runTask<{ color: ToneColors }>("skin-tone-analysis", { src_file_id: srcFileId }),
      this.client.runTask<{ output: SkinScore[] }>("skin-analysis", {
        src_file_id: srcFileId,
        dst_actions: [...SKIN_CONCERNS],
        format: "json",
      }),
    ]);
    if (tone.status === "rejected") throw tone.reason;
    let scores: SkinScore[] = [];
    if (skin.status === "fulfilled") scores = skin.value.output ?? [];
    else
      warnings.push(
        `Skin Analysis unavailable (${(skin.reason as Error).message}); using a neutral finish. Tip: use a well-lit photo at least 480px on the short side.`,
      );

    const profile = buildProfile(tone.value.color, scores);
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { srcFileId, profile, createdAt: Date.now() });
    this.gc();
    return {
      sessionId,
      profile,
      recommendations: recommend(profile),
      warnings,
      unitsEstimate: UNIT_COST.tone + (scores.length ? UNIT_COST.skin : 0),
    };
  }

  startTryOn(req: TryOnRequest): TryOnJob {
    const session = this.sessions.get(req.sessionId);
    if (!session) throw new YouCamError("Session expired - please analyse your photo again.", 404);
    const foundation = findProduct(req.foundationId) as Foundation | undefined;
    const lipstick = findProduct(req.lipstickId) as Lipstick | undefined;
    const blush = findProduct(req.blushId) as Blush | undefined;
    const earrings = findProduct(req.earringsId) as Jewellery | undefined;
    const necklace = findProduct(req.necklaceId) as Jewellery | undefined;
    if (earrings && earrings.category !== "earrings") throw new YouCamError("earringsId is not an earring", 400);
    if (necklace && necklace.category !== "necklace") throw new YouCamError("necklaceId is not a necklace", 400);

    const steps: JobStep[] = [];
    if (foundation || lipstick || blush) steps.push({ key: "makeup", label: "Applying your makeup", status: "pending" });
    if (earrings) steps.push({ key: "earrings", label: `Fitting ${earrings.name.split(" - ")[0]}`, status: "pending" });
    if (necklace) steps.push({ key: "necklace", label: `Fitting ${necklace.name.split(" - ")[0]}`, status: "pending" });
    if (!steps.length) throw new YouCamError("Pick at least one product to try on.", 400);

    const job: TryOnJob = { id: randomUUID(), status: "running", steps, createdAt: Date.now() };
    this.jobs.set(job.id, job);

    const run = async () => {
      // Each step consumes the previous step's output URL, so the final image wears the whole look.
      let src: { fileId?: string; url?: string } = { fileId: session.srcFileId };
      for (const step of steps) {
        step.status = "running";
        try {
          let out: { url: string };
          if (step.key === "makeup") {
            const effects = buildMakeupEffects({ foundation, lipstick, blush }, session.profile);
            out = await this.client.runTask<{ url: string }>("makeup-vto", {
              ...(src.fileId ? { src_file_id: src.fileId } : { src_file_url: src.url }),
              effects,
              version: "1.0",
            });
          } else {
            const product = step.key === "earrings" ? earrings! : necklace!;
            const refId = await this.refFileId(product);
            out = await this.client.runTask<{ url: string }>(
              step.key === "earrings" ? "2d-vto/earring" : "2d-vto/necklace",
              jewelleryTaskBody(step.key === "earrings" ? "earring" : "necklace", src, refId),
            );
          }
          if (!out?.url) throw new YouCamError("Task succeeded but returned no result URL");
          step.status = "done";
          step.url = out.url;
          src = { url: out.url };
          job.resultUrl = out.url;
        } catch (e) {
          step.status = "error";
          step.error = (e as Error).message;
          job.status = "error";
          job.error = `${step.label} failed: ${step.error}`;
          return;
        }
      }
      job.status = "done";
    };
    void run();
    return job;
  }

  getJob(id: string): TryOnJob | undefined {
    return this.jobs.get(id);
  }

  /** Upload the product reference image once and reuse its file_id for an hour. */
  private async refFileId(p: Jewellery): Promise<string> {
    const hit = this.refCache.get(p.id);
    if (hit && Date.now() - hit.at < SESSION_TTL_MS) return hit.fileId;
    const file = path.join(this.publicDir, p.image);
    const bytes = new Uint8Array(await readFile(file));
    const fileId = await this.client.uploadFile(bytes, "image/png", path.basename(file));
    this.refCache.set(p.id, { fileId, at: Date.now() });
    return fileId;
  }

  private gc() {
    const now = Date.now();
    for (const [k, s] of this.sessions) if (now - s.createdAt > SESSION_TTL_MS) this.sessions.delete(k);
    for (const [k, j] of this.jobs) if (now - j.createdAt > SESSION_TTL_MS) this.jobs.delete(k);
  }
}
