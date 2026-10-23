import type { Product } from "../shared/catalog";
import type { SkinProfile } from "../shared/profile";
import type { Recommendations } from "../shared/recommend";
import type { TryOnJob, TryOnRequest } from "../server/pipeline";

export type { TryOnJob };

export interface Health {
  ok: boolean;
  mode: "mock" | "live";
  unitCost: Record<string, number>;
}
export interface Sample {
  id: string;
  label: string;
  url: string;
}
export interface Analysis {
  mode: "mock" | "live";
  sessionId: string;
  profile: SkinProfile;
  recommendations: Recommendations;
  warnings: string[];
  unitsEstimate: number;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  health: () => call<Health>("/api/health"),
  samples: () => call<{ samples: Sample[] }>("/api/samples").then((r) => r.samples),
  catalog: () => call<{ products: Product[] }>("/api/catalog").then((r) => r.products),
  analyzeFile: (file: File) => {
    const fd = new FormData();
    fd.append("photo", file);
    return call<Analysis>("/api/analyze", { method: "POST", body: fd });
  },
  analyzeSample: (sampleId: string) =>
    call<Analysis>("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sampleId }),
    }),
  tryOn: (req: TryOnRequest) =>
    call<{ jobId: string; job: TryOnJob }>("/api/tryon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }),
  job: (id: string) => call<{ job: TryOnJob }>(`/api/jobs/${id}`).then((r) => r.job),
};
