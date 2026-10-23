// Minimal typed client for the YouCam (Perfect Corp) S2S v2.0 REST API.
// Docs: https://docs.perfectcorp.com/develop/quick_start_guide
//   1. POST /s2s/v2.0/file            -> file_id + pre-signed PUT url
//   2. PUT  <pre-signed url>          -> upload the bytes
//   3. POST /s2s/v2.0/task/<feature>  -> task_id
//   4. GET  /s2s/v2.0/task/<feature>/<task_id> until task_status is "success" | "error"

export const DEFAULT_BASE_URL = "https://yce-api-01.makeupar.com";

export type TaskFeature =
  | "skin-analysis"
  | "skin-tone-analysis"
  | "makeup-vto"
  | "2d-vto/earring"
  | "2d-vto/necklace";

export interface TaskStatus<R = unknown> {
  task_status: "running" | "success" | "error";
  results?: R;
  error?: string;
  error_message?: string;
}

export class YouCamError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "YouCamError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface YouCamClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  pollIntervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface FileInitResponse {
  status: number;
  data: {
    files: {
      file_id: string;
      requests: { method: string; url: string; headers?: Record<string, string | number> }[];
    }[];
  };
}

export class YouCamClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: YouCamClientOptions) {
    if (!opts.apiKey) throw new YouCamError("YOUCAM_API_KEY is required");
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? ((i, init) => fetch(i, init));
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" };
  }

  private async json<T>(path: string, init: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers: this.headers() });
    const text = await res.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new YouCamError(`Non-JSON response from YouCam (${res.status})`, res.status);
    }
    if (!res.ok || (typeof body.status === "number" && body.status >= 400)) {
      const code = body.error_code ?? body.error ?? body.code;
      throw new YouCamError(body.error_message ?? body.message ?? `YouCam request failed: ${path}`, res.status, code);
    }
    return body as T;
  }

  /** Register + upload a file. Returns the file_id to use as src_file_id / ref_file_ids. */
  async uploadFile(bytes: Uint8Array, contentType: string, fileName: string): Promise<string> {
    const init = await this.json<FileInitResponse>("/s2s/v2.0/file", {
      method: "POST",
      body: JSON.stringify({ files: [{ content_type: contentType, file_name: fileName, file_size: bytes.byteLength }] }),
    });
    const file = init.data?.files?.[0];
    const req = file?.requests?.[0];
    if (!file?.file_id || !req?.url) throw new YouCamError("File API returned no upload URL");
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers ?? {})) headers[k] = String(v);
    if (!headers["Content-Type"]) headers["Content-Type"] = contentType;
    const put = await this.fetchImpl(req.url, { method: req.method || "PUT", headers, body: bytes as unknown as BodyInit });
    if (!put.ok) throw new YouCamError(`Upload to pre-signed URL failed (${put.status})`, put.status);
    return file.file_id;
  }

  async createTask(feature: TaskFeature, body: Record<string, unknown>): Promise<string> {
    const res = await this.json<{ data: { task_id: string } }>(`/s2s/v2.0/task/${feature}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.data?.task_id) throw new YouCamError(`No task_id returned for ${feature}`);
    return res.data.task_id;
  }

  async getTask<R>(feature: TaskFeature, taskId: string): Promise<TaskStatus<R>> {
    const res = await this.json<{ data: TaskStatus<R> }>(
      `/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`,
      { method: "GET" },
    );
    return res.data;
  }

  /** Create a task and poll until it finishes. Units are only charged on success. */
  async runTask<R>(feature: TaskFeature, body: Record<string, unknown>): Promise<R> {
    const taskId = await this.createTask(feature, body);
    const started = Date.now();
    for (;;) {
      const st = await this.getTask<R>(feature, taskId);
      if (st.task_status === "success") return st.results as R;
      if (st.task_status === "error") {
        throw new YouCamError(st.error_message ?? `YouCam ${feature} task failed`, undefined, st.error);
      }
      if (Date.now() - started > this.timeoutMs) throw new YouCamError(`Timed out waiting for ${feature}`);
      await this.sleep(this.pollIntervalMs);
    }
  }
}

/** Build the 2D jewellery VTO body. The spec requires both the flat ids and source_info/object_infos. */
export function jewelleryTaskBody(
  kind: "earring" | "necklace",
  src: { fileId?: string; url?: string },
  refFileId: string,
): Record<string, unknown> {
  const srcName = src.fileId ?? src.url;
  if (!srcName) throw new YouCamError("Jewellery VTO needs a source file id or url");
  const parameter =
    kind === "earring"
      ? { earring_need_remove_background: true, earring_occluded_type: 0 }
      : { necklace_need_remove_background: true };
  return {
    ...(src.fileId ? { src_file_id: src.fileId } : { src_file_url: src.url }),
    ref_file_ids: [refFileId],
    source_info: { name: srcName },
    object_infos: [{ name: refFileId, parameter }],
  };
}
