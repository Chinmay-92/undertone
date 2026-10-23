import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Tiny .env loader (avoids a dependency). Real env vars win.
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const dist = path.join(root, "dist");
const { app, mode } = createApp({
  apiKey: process.env.YOUCAM_API_KEY || undefined,
  baseUrl: process.env.YOUCAM_BASE_URL || undefined,
  forceMock: /^(1|true|yes)$/i.test(process.env.YOUCAM_MOCK ?? ""),
  publicDir: path.join(root, "public"),
  staticDir: process.env.NODE_ENV === "production" && existsSync(dist) ? dist : undefined,
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Undertone API on http://localhost:${port} (${mode.toUpperCase()} mode)`);
  if (mode === "mock") console.log("No YOUCAM_API_KEY set - using the built-in YouCam API emulator.");
});
