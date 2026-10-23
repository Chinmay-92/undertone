// Illustrated (non-photographic) avatar used for demo samples and MOCK-mode renders.
// Nothing here depicts a real person. The SVG embeds a machine-readable marker so the mock
// YouCam server can "analyse" it deterministically.
import { mix } from "./color";
import type { Metal } from "./catalog";

export interface AvatarState {
  skin: string;
  lip: string;
  hair: string;
  eye: string;
  foundation?: string;
  blush?: string;
  lipstick?: string;
  earring?: Metal;
  necklace?: Metal;
  caption?: string;
}

export const METAL_HEX: Record<Metal, string> = {
  gold: "#d4af37",
  silver: "#c4c7cf",
  "rose-gold": "#cf9a86",
};

export interface Sample {
  id: string;
  label: string;
  state: AvatarState;
}

export const SAMPLES: Sample[] = [
  { id: "amber", label: "Sample A - warm, tan", state: { skin: "#c49a77", lip: "#b5675a", hair: "#3b2416", eye: "#5a3a1e" } },
  { id: "rose", label: "Sample B - cool, light", state: { skin: "#e9b8a8", lip: "#c97d82", hair: "#8a6a4a", eye: "#3f6aa0" } },
  { id: "umber", label: "Sample C - neutral, deep", state: { skin: "#8b5d44", lip: "#7a4038", hair: "#141010", eye: "#2e1a10" } },
];

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export function avatarSvg(s: AvatarState): string {
  const face = s.foundation ? mix(s.skin, s.foundation, 0.55) : s.skin;
  const shade = mix(face, "#000000", 0.18);
  const lips = s.lipstick ? mix(s.lip, s.lipstick, 0.85) : s.lip;
  const marker = `undertone-mock skin=${s.skin} lip=${s.lip}`;
  const earring = s.earring
    ? (() => {
        const c = METAL_HEX[s.earring];
        return `<g stroke="${c}" fill="none" stroke-width="5"><circle cx="118" cy="268" r="16"/><circle cx="394" cy="268" r="16"/></g>
<g fill="#ffffff" opacity=".6"><circle cx="110" cy="258" r="3"/><circle cx="386" cy="258" r="3"/></g>`;
      })()
    : "";
  const necklace = s.necklace
    ? (() => {
        const c = METAL_HEX[s.necklace];
        return `<path d="M176 420 Q256 500 336 420" stroke="${c}" stroke-width="4" fill="none"/>
<circle cx="256" cy="470" r="11" fill="${c}" stroke="${mix(c, "#000000", 0.25)}" stroke-width="2"/>`;
      })()
    : "";
  const blush = s.blush
    ? `<g fill="${s.blush}" opacity=".45"><ellipse cx="186" cy="300" rx="34" ry="20"/><ellipse cx="326" cy="300" rx="34" ry="20"/></g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 640" width="512" height="640" data-marker="${esc(marker)}">
<!-- ${esc(marker)} -->
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6efe9"/><stop offset="1" stop-color="#e9ded4"/></linearGradient></defs>
<rect width="512" height="640" fill="url(#bg)"/>
<path d="M120 640 Q120 470 256 450 Q392 470 392 640 Z" fill="#4b5a73"/>
<rect x="216" y="370" width="80" height="90" rx="30" fill="${shade}"/>
<path d="M150 410 Q256 470 362 410 L392 640 L120 640 Z" fill="#4b5a73"/>
<path d="M196 430 Q256 470 316 430 L316 450 Q256 490 196 450Z" fill="${face}"/>
<path d="M110 250 Q100 90 256 80 Q412 90 402 250 Q420 360 380 420 L132 420 Q92 360 110 250Z" fill="${s.hair}"/>
<ellipse cx="256" cy="260" rx="132" ry="160" fill="${face}"/>
<ellipse cx="124" cy="262" rx="18" ry="30" fill="${shade}"/><ellipse cx="388" cy="262" rx="18" ry="30" fill="${shade}"/>
<path d="M126 210 Q150 110 256 104 Q362 110 386 210 Q330 150 256 150 Q182 150 126 210Z" fill="${s.hair}"/>
${blush}
<g fill="#ffffff"><ellipse cx="206" cy="246" rx="22" ry="12"/><ellipse cx="306" cy="246" rx="22" ry="12"/></g>
<g fill="${s.eye}"><circle cx="206" cy="246" r="9"/><circle cx="306" cy="246" r="9"/></g>
<g fill="#1a1a1a"><circle cx="206" cy="246" r="4"/><circle cx="306" cy="246" r="4"/></g>
<g stroke="${mix(s.hair, "#000000", 0.2)}" stroke-width="6" stroke-linecap="round" fill="none"><path d="M180 218 Q206 206 232 216"/><path d="M280 216 Q306 206 332 218"/></g>
<path d="M256 262 Q248 300 240 308 Q256 316 272 308" stroke="${shade}" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M214 346 Q256 330 298 346 Q256 380 214 346Z" fill="${lips}"/>
<path d="M214 346 Q256 352 298 346" stroke="${mix(lips, "#000000", 0.3)}" stroke-width="2" fill="none"/>
${earring}
${necklace}
${s.caption ? `<rect x="16" y="596" width="480" height="30" rx="15" fill="#2b1d24" opacity=".8"/><text x="256" y="616" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#ffffff">${esc(s.caption)}</text>` : ""}
</svg>`;
}

/** Parse the mock marker back out of an uploaded SVG (mock mode only). */
export function readAvatarMarker(text: string): { skin?: string; lip?: string } {
  const m = /undertone-mock skin=(#[0-9a-fA-F]{6}) lip=(#[0-9a-fA-F]{6})/.exec(text);
  return m ? { skin: m[1], lip: m[2] } : {};
}
