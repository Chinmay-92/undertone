import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import { avatarSvg, SAMPLES } from "../shared/avatar";
import { ALL_PRODUCTS } from "../shared/catalog";
import { Pipeline, UNIT_COST } from "./pipeline";
import { DEFAULT_BASE_URL, YouCamClient, YouCamError } from "./youcam/client";
import { createMockFetch, MOCK_BASE_URL, renderMockSvg } from "./youcam/mockFetch";

export type Mode = "mock" | "live";

export interface AppConfig {
  apiKey?: string;
  baseUrl?: string;
  forceMock?: boolean;
  publicDir: string;
  staticDir?: string; // built client (production)
  pollIntervalMs?: number;
}

export function resolveMode(cfg: Pick<AppConfig, "apiKey" | "forceMock">): Mode {
  return cfg.apiKey && !cfg.forceMock ? "live" : "mock";
}

export function createApp(cfg: AppConfig) {
  const mode = resolveMode(cfg);
  const client =
    mode === "live"
      ? new YouCamClient({ apiKey: cfg.apiKey!, baseUrl: cfg.baseUrl ?? DEFAULT_BASE_URL, pollIntervalMs: cfg.pollIntervalMs })
      : new YouCamClient({
          apiKey: "mock-key",
          baseUrl: MOCK_BASE_URL,
          fetchImpl: createMockFetch().fetch,
          pollIntervalMs: cfg.pollIntervalMs ?? 400,
        });
  const pipeline = new Pipeline(client, cfg.publicDir);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode, unitCost: UNIT_COST });
  });

  app.get("/api/catalog", (_req, res) => {
    res.json({ products: ALL_PRODUCTS });
  });

  app.get("/api/samples", (_req, res) => {
    res.json({ samples: SAMPLES.map((s) => ({ id: s.id, label: s.label, url: `/samples/${s.id}.svg` })), usableInLive: false });
  });

  app.get("/samples/:id.svg", (req, res) => {
    const s = SAMPLES.find((x) => x.id === req.params.id);
    if (!s) return res.status(404).end();
    res.type("image/svg+xml").send(avatarSvg(s.state));
  });

  app.get("/mock/render.svg", (req, res) => {
    if (mode !== "mock") return res.status(404).end();
    try {
      res.type("image/svg+xml").send(renderMockSvg(String(req.query.s ?? "")));
    } catch {
      res.status(400).end();
    }
  });

  app.post("/api/analyze", upload.single("photo"), async (req, res, next) => {
    try {
      let bytes: Uint8Array;
      let contentType: string;
      let fileName: string;
      if (req.file) {
        contentType = req.file.mimetype;
        const allowed = mode === "mock" ? ["image/jpeg", "image/png", "image/svg+xml"] : ["image/jpeg", "image/png"];
        if (!allowed.includes(contentType)) {
          return res.status(415).json({ error: "Please upload a JPG or PNG photo." });
        }
        bytes = new Uint8Array(req.file.buffer);
        fileName = req.file.originalname || "selfie.jpg";
      } else if (req.body?.sampleId) {
        const s = SAMPLES.find((x) => x.id === req.body.sampleId);
        if (!s) return res.status(400).json({ error: "Unknown sample" });
        if (mode === "live") {
          return res.status(400).json({
            error: "Samples are illustrations and only work in mock mode. Upload a real selfie to use the live YouCam API.",
          });
        }
        bytes = new TextEncoder().encode(avatarSvg(s.state));
        contentType = "image/svg+xml";
        fileName = `${s.id}.svg`;
      } else {
        return res.status(400).json({ error: "Send a photo (multipart field 'photo') or a sampleId." });
      }
      res.json({ mode, ...(await pipeline.analyze(bytes, contentType, fileName)) });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/tryon", (req, res, next) => {
    try {
      const job = pipeline.startTryOn(req.body ?? {});
      res.status(202).json({ jobId: job.id, job });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = pipeline.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ job });
  });

  app.use("/products", express.static(path.join(cfg.publicDir, "products"), { maxAge: "1h" }));
  if (cfg.staticDir) {
    app.use(express.static(cfg.staticDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(cfg.staticDir!, "index.html")));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) return res.status(413).json({ error: err.message });
    if (err instanceof YouCamError) {
      const status = err.httpStatus && err.httpStatus >= 400 && err.httpStatus < 500 ? err.httpStatus : 502;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    console.error(err);
    res.status(500).json({ error: "Unexpected server error" });
  });

  return { app, mode, pipeline };
}
