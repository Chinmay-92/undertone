// An in-process emulation of the YouCam S2S v2.0 REST API, used when no YOUCAM_API_KEY is set.
// It is wired in as the `fetch` implementation of the real YouCamClient, so MOCK mode exercises
// the exact same upload -> create task -> poll code path as LIVE mode.
import { avatarSvg, readAvatarMarker, SAMPLES, type AvatarState } from "../../shared/avatar";
import type { Metal } from "../../shared/catalog";

export const MOCK_BASE_URL = "https://mock.youcam.local";

interface StoredFile {
  name: string;
  contentType: string;
  bytes?: Uint8Array;
}
interface StoredTask {
  feature: string;
  body: any;
  polls: number;
}

const DEFAULT_STATE: AvatarState = SAMPLES[0].state;

// Per-sample skin-analysis fixtures so the demo shows three different skin stories.
const SCORE_FIXTURES: Record<string, Record<string, number>> = {
  [SAMPLES[0].state.skin]: { oiliness: 41, moisture: 72, redness: 78, radiance: 66 }, // oily T-zone
  [SAMPLES[1].state.skin]: { oiliness: 74, moisture: 63, redness: 47, radiance: 58 }, // redness-prone
  [SAMPLES[2].state.skin]: { oiliness: 80, moisture: 43, redness: 82, radiance: 45 }, // dry + dull
};

export function encodeState(s: AvatarState): string {
  return Buffer.from(JSON.stringify(s)).toString("base64url");
}
export function decodeState(token: string): AvatarState {
  return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
}
export function renderMockSvg(token: string): string {
  return avatarSvg({ ...decodeState(token), caption: "Mock preview - set YOUCAM_API_KEY for real YouCam try-on" });
}

const metalFromName = (name: string): Metal =>
  name.includes("rosegold") ? "rose-gold" : name.includes("silver") ? "silver" : "gold";

export function createMockFetch(opts: { renderBase?: string } = {}) {
  const renderBase = opts.renderBase ?? "/mock/render.svg";
  const files = new Map<string, StoredFile>();
  const tasks = new Map<string, StoredTask>();
  let seq = 0;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const stateFromSource = (body: any): AvatarState => {
    if (typeof body.src_file_url === "string") {
      const m = /[?&]s=([A-Za-z0-9_-]+)/.exec(body.src_file_url);
      if (m) return decodeState(m[1]);
      return DEFAULT_STATE;
    }
    const f = files.get(body.src_file_id);
    if (!f?.bytes) return DEFAULT_STATE;
    const marker = readAvatarMarker(new TextDecoder().decode(f.bytes.slice(0, 4096)));
    const sample = SAMPLES.find((s) => s.state.skin === marker.skin);
    return sample ? { ...sample.state } : marker.skin ? { ...DEFAULT_STATE, skin: marker.skin, lip: marker.lip! } : DEFAULT_STATE;
  };

  const results = (t: StoredTask): unknown => {
    const st = stateFromSource(t.body);
    switch (t.feature) {
      case "skin-tone-analysis":
        return {
          face_quality: { status: "ok" },
          color: {
            skin_color: st.skin,
            lip_color: st.lip,
            eye_color: st.eye,
            eye_color_name: "Brown",
            eyebrow_color: st.hair,
            hair_color: "#42280E",
            hair_color_name: "Brown",
          },
        };
      case "skin-analysis": {
        const fx = SCORE_FIXTURES[st.skin] ?? { oiliness: 64, moisture: 61, redness: 70, radiance: 62 };
        return {
          output: (t.body.dst_actions as string[]).map((type) => ({
            type,
            ui_score: fx[type] ?? 70,
            raw_score: (fx[type] ?? 70) - 3.5,
            mask_urls: [],
          })),
        };
      }
      case "makeup-vto": {
        const next: AvatarState = { ...st };
        for (const e of t.body.effects as any[]) {
          if (e.category === "foundation") next.foundation = e.palettes[0].color;
          if (e.category === "blush") next.blush = e.palettes[0].color;
          if (e.category === "lip_color") next.lipstick = e.palettes[0].color;
        }
        return { url: `${renderBase}?s=${encodeState(next)}` };
      }
      case "2d-vto/earring":
      case "2d-vto/necklace": {
        const ref = files.get(t.body.ref_file_ids?.[0]);
        const metal = metalFromName(ref?.name ?? "");
        const next: AvatarState = { ...st, ...(t.feature.endsWith("earring") ? { earring: metal } : { necklace: metal }) };
        return { url: `${renderBase}?s=${encodeState(next)}` };
      }
      default:
        return {};
    }
  };

  const mockFetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    const method = (init.method ?? "GET").toUpperCase();
    const auth = new Headers(init.headers).get("Authorization");

    if (url.pathname.startsWith("/upload/") && method === "PUT") {
      const f = files.get(decodeURIComponent(url.pathname.slice("/upload/".length)));
      if (!f) return new Response("not found", { status: 404 });
      const body = init.body;
      f.bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
      return new Response(null, { status: 200 });
    }
    if (!auth?.startsWith("Bearer ")) return json(401, { status: 401, error_code: "InvalidApiKey" });

    if (url.pathname === "/s2s/v2.0/file" && method === "POST") {
      const req = JSON.parse(String(init.body));
      const out = req.files.map((f: any) => {
        const id = `mockfile-${++seq}`;
        files.set(id, { name: f.file_name, contentType: f.content_type });
        return {
          content_type: f.content_type,
          file_name: f.file_name,
          file_id: id,
          requests: [{ method: "PUT", url: `${MOCK_BASE_URL}/upload/${id}`, headers: { "Content-Type": f.content_type, "Content-Length": f.file_size } }],
        };
      });
      return json(200, { status: 200, data: { files: out } });
    }

    const m = /^\/s2s\/v2\.0\/task\/(.+?)(?:\/([^/]+))?$/.exec(url.pathname);
    const known = ["skin-analysis", "skin-tone-analysis", "makeup-vto", "2d-vto/earring", "2d-vto/necklace"];
    if (m && method === "POST" && known.includes(m[1] + (m[2] ? `/${m[2]}` : ""))) {
      const feature = m[1] + (m[2] ? `/${m[2]}` : "");
      const body = JSON.parse(String(init.body));
      if (!body.src_file_id && !body.src_file_url) return json(400, { status: 400, error_code: "InvalidParameters", error_message: "src_file_id or src_file_url required" });
      if (body.src_file_id && !files.get(body.src_file_id)?.bytes) return json(404, { status: 404, error_code: "FileNotFound", error_message: "File was registered but never uploaded" });
      const id = `mocktask-${++seq}`;
      tasks.set(id, { feature, body, polls: 0 });
      return json(200, { status: 200, data: { task_id: id } });
    }
    if (m && method === "GET" && m[2]) {
      const t = tasks.get(decodeURIComponent(m[2]));
      if (!t || t.feature !== m[1]) return json(400, { status: 400, error_code: "InvalidTaskId" });
      t.polls += 1;
      if (t.polls < 2) return json(200, { status: 200, data: { task_status: "running" } });
      return json(200, { status: 200, data: { task_status: "success", results: results(t) } });
    }
    return json(404, { status: 404, error_code: "NotFound", error_message: `${method} ${url.pathname}` });
  };

  return { fetch: mockFetch, files, tasks };
}
