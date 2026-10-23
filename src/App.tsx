import { useEffect, useMemo, useRef, useState } from "react";
import type { Jewellery, Product } from "../shared/catalog";
import type { Ranked } from "../shared/recommend";
import { api, type Analysis, type Health, type Sample, type TryOnJob } from "./api";

type Category = "foundation" | "lipstick" | "blush" | "earrings" | "necklace";
type Selection = Partial<Record<Category, string | null>>;

const CATEGORY_LABEL: Record<Category, string> = {
  foundation: "Foundation",
  lipstick: "Lipstick",
  blush: "Blush",
  earrings: "Earrings",
  necklace: "Necklace",
};

const gbp = (n: number) => `£${n.toFixed(2)}`;

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [job, setJob] = useState<TryOnJob | null>(null);
  const [busy, setBusy] = useState<"analyze" | "tryon" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bag, setBag] = useState<Product[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [compare, setCompare] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setError("Cannot reach the Undertone API. Is `npm run dev` running?"));
    api.samples().then(setSamples).catch(() => {});
  }, []);

  const recs = analysis?.recommendations;
  const allRanked = useMemo(() => {
    if (!recs) return new Map<string, Product>();
    const m = new Map<string, Product>();
    for (const list of [recs.foundation, recs.lipstick, recs.blush, recs.earrings, recs.necklace])
      for (const r of list as Ranked<Product>[]) m.set(r.product.id, r.product);
    return m;
  }, [recs]);

  const chosen = (Object.values(selection).filter(Boolean) as string[])
    .map((id) => allRanked.get(id))
    .filter((p): p is Product => !!p);
  const total = chosen.reduce((s, p) => s + p.price, 0);

  async function runAnalysis(fn: () => Promise<Analysis>, previewUrl: string) {
    setError(null);
    setJob(null);
    setAnalysis(null);
    setPreview(previewUrl);
    setBusy("analyze");
    try {
      const a = await fn();
      setAnalysis(a);
      const r = a.recommendations;
      setSelection({
        foundation: r.foundation[0]?.product.id,
        lipstick: r.lipstick[0]?.product.id,
        blush: r.blush[0]?.product.id,
        earrings: r.earrings[0]?.product.id,
        necklace: r.necklace[0]?.product.id,
      });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(jpeg|png)$/.test(f.type) && !(health?.mode === "mock" && f.type === "image/svg+xml")) {
      setError("Please choose a JPG or PNG selfie.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("That photo is over 10 MB - please pick a smaller one.");
      return;
    }
    runAnalysis(() => api.analyzeFile(f), URL.createObjectURL(f));
  }

  async function tryOn() {
    if (!analysis) return;
    setError(null);
    setBusy("tryon");
    try {
      const { job: first } = await api.tryOn({
        sessionId: analysis.sessionId,
        foundationId: selection.foundation ?? undefined,
        lipstickId: selection.lipstick ?? undefined,
        blushId: selection.blush ?? undefined,
        earringsId: selection.earrings ?? undefined,
        necklaceId: selection.necklace ?? undefined,
      });
      setJob(first);
      let j = first;
      while (j.status === "running") {
        await new Promise((r) => setTimeout(r, 1000));
        j = await api.job(first.id);
        setJob(j);
      }
      if (j.status === "error") setError(j.error ?? "Try-on failed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function addLookToBag() {
    setBag((b) => [...b, ...chosen.filter((p) => !b.some((x) => x.id === p.id))]);
    setBagOpen(true);
  }

  const units =
    (selection.foundation || selection.lipstick || selection.blush ? 1 : 0) +
    (selection.earrings ? 1 : 0) +
    (selection.necklace ? 1 : 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◐</span> Undertone
          <span className="by">a Demo Boutique try-on</span>
        </div>
        <div className="top-actions">
          {health && (
            <span className={`mode mode-${health.mode}`} title={health.mode === "mock" ? "No YOUCAM_API_KEY set: using the built-in API emulator" : "Calling the live YouCam API"}>
              {health.mode === "mock" ? "Mock mode" : "Live YouCam API"}
            </span>
          )}
          <button className="bag-btn" onClick={() => setBagOpen((o) => !o)} aria-label="Open bag">
            Bag <span className="count">{bag.length}</span>
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Skin AI + virtual try-on, in one selfie</p>
          <h1>
            Your shade. Your metal.
            <br />
            <em>Your whole look</em>, before you buy.
          </h1>
          <p className="lede">
            Undertone reads your skin tone and condition with YouCam AI, matches foundation, lip and blush shades to your
            undertone, picks the jewellery metal that flatters you, then shows you wearing the full look.
          </p>
          <div className="cta-row">
            <button className="primary" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              Upload or take a selfie
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={health?.mode === "mock" ? "image/jpeg,image/png,image/svg+xml" : "image/jpeg,image/png"}
              capture="user"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <span className="hint">Front-facing, hair off the face, good daylight. JPG/PNG under 10 MB.</span>
          </div>
          <p className="privacy">
            Your photo is sent to Perfect Corp's YouCam API for analysis and is not stored by this app.
          </p>
        </div>
        <div className="samples">
          <p className="samples-title">
            {health?.mode === "live" ? "Illustrated samples (mock mode only)" : "No selfie handy? Try an illustrated sample"}
          </p>
          <div className="sample-grid">
            {samples.map((s) => (
              <button
                key={s.id}
                className="sample"
                disabled={busy !== null || health?.mode === "live"}
                onClick={() => runAnalysis(() => api.analyzeSample(s.id), s.url)}
              >
                <img src={s.url} alt={s.label} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {busy === "analyze" && (
        <div className="loading">
          <div className="spinner" /> Reading your skin tone and skin condition with YouCam AI…
        </div>
      )}

      {analysis && recs && (
        <div ref={resultsRef}>
          <section className="profile card">
            <div className="profile-photo">{preview && <img src={preview} alt="Your photo" />}</div>
            <div className="profile-body">
              <p className="eyebrow">Step 1 · Your skin profile</p>
              <div className="tone-row">
                <span className="swatch big" style={{ background: analysis.profile.skinHex }} />
                <div>
                  <h2>
                    {cap(analysis.profile.undertone)} undertone · {cap(analysis.profile.depth)}
                  </h2>
                  <p className="muted">
                    Skin {analysis.profile.skinHex.toUpperCase()} · ITA {analysis.profile.ita.toFixed(0)}° · hue{" "}
                    {analysis.profile.hue.toFixed(0)}° · recommended finish <strong>{analysis.profile.finish}</strong>
                  </p>
                </div>
              </div>
              <div className="concerns">
                {analysis.profile.concerns.map((c) => (
                  <div key={c.type} className="concern">
                    <span>{c.label}</span>
                    <div className="bar">
                      <div className={`fill ${c.score < 55 ? "low" : ""}`} style={{ width: `${c.score}%` }} />
                    </div>
                    <span className="score">{c.score}</span>
                  </div>
                ))}
              </div>
              <ul className="tips">
                {analysis.profile.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
                <li>{recs.metal.reason}</li>
              </ul>
              {analysis.warnings.map((w) => (
                <p key={w} className="warn">
                  {w}
                </p>
              ))}
            </div>
          </section>

          <section className="builder">
            <p className="eyebrow">Step 2 · Build your look (picked for you, change anything)</p>
            {(["foundation", "lipstick", "blush", "earrings", "necklace"] as Category[]).map((cat) => (
              <div key={cat} className="shelf">
                <div className="shelf-head">
                  <h3>{CATEGORY_LABEL[cat]}</h3>
                  {(cat === "earrings" || cat === "necklace" || cat === "blush") && (
                    <button
                      className={`skip ${selection[cat] === null ? "on" : ""}`}
                      onClick={() => setSelection((s) => ({ ...s, [cat]: s[cat] === null ? (recs[cat][0]?.product.id ?? null) : null }))}
                    >
                      {selection[cat] === null ? "Add back" : "Skip"}
                    </button>
                  )}
                </div>
                <div className="products">
                  {(recs[cat] as Ranked<Product>[]).map((r) => (
                    <ProductCard
                      key={r.product.id}
                      r={r}
                      selected={selection[cat] === r.product.id}
                      onSelect={() => setSelection((s) => ({ ...s, [cat]: r.product.id }))}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="tryon-bar">
              <div>
                <strong>{chosen.length} items</strong> · {gbp(total)}
                <span className="muted"> · this try-on uses ~{units} YouCam unit{units === 1 ? "" : "s"}</span>
              </div>
              <button className="primary" disabled={busy !== null || units === 0} onClick={tryOn}>
                {busy === "tryon" ? "Trying on…" : "Try on the full look"}
              </button>
            </div>
          </section>

          {job && (
            <section className="result card">
              <p className="eyebrow">Step 3 · See it on you</p>
              <ol className="steps">
                {job.steps.map((s) => (
                  <li key={s.key} className={`step ${s.status}`}>
                    <span className="dot" /> {s.label}
                    {s.status === "running" && "…"}
                    {s.error && <span className="step-err"> - {s.error}</span>}
                  </li>
                ))}
              </ol>
              {job.resultUrl && preview && (
                <>
                  <div className="compare" style={{ ["--pos" as string]: `${compare}%` }}>
                    <img src={preview} alt="Before" className="before" />
                    <img src={job.resultUrl} alt="After: wearing the full look" className="after" />
                    <span className="tag tag-before">Before</span>
                    <span className="tag tag-after">After</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={compare}
                      aria-label="Before/after slider"
                      onChange={(e) => setCompare(Number(e.target.value))}
                    />
                  </div>
                  <div className="step-thumbs">
                    {job.steps
                      .filter((s) => s.url)
                      .map((s) => (
                        <a key={s.key} href={s.url} target="_blank" rel="noreferrer">
                          <img src={s.url} alt={s.label} />
                          <span>{s.key}</span>
                        </a>
                      ))}
                  </div>
                </>
              )}
              {job.status === "done" && (
                <div className="tryon-bar">
                  <div>
                    Love it? <strong>{gbp(total)}</strong> for the full look.
                  </div>
                  <button className="primary" onClick={addLookToBag}>
                    Add the look to bag
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {bagOpen && (
        <aside className="bag" aria-label="Bag">
          <div className="bag-head">
            <h3>Your bag</h3>
            <button onClick={() => setBagOpen(false)} aria-label="Close bag">
              ×
            </button>
          </div>
          {bag.length === 0 && <p className="muted">Nothing here yet. Try on a look first.</p>}
          <ul>
            {bag.map((p) => (
              <li key={p.id}>
                <Thumb p={p} />
                <span className="bag-name">{p.name}</span>
                <span>{gbp(p.price)}</span>
                <button className="link" onClick={() => setBag((b) => b.filter((x) => x.id !== p.id))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {bag.length > 0 && (
            <div className="bag-foot">
              <strong>Total {gbp(bag.reduce((s, p) => s + p.price, 0))}</strong>
              <button className="primary" onClick={() => alert("Demo storefront: checkout is not implemented.")}>
                Checkout
              </button>
            </div>
          )}
        </aside>
      )}

      <footer className="foot">
        Demo storefront with a fictional catalogue. Powered by the Perfect Corp YouCam API: Skin Tone Analysis, Skin
        Analysis, Makeup VTO, Earrings VTO and Necklace VTO.
      </footer>
    </div>
  );
}

function Thumb({ p }: { p: Product }) {
  if ("image" in p) return <img className="thumb" src={(p as Jewellery).image} alt="" />;
  return <span className="thumb swatch" style={{ background: (p as { hex: string }).hex }} />;
}

function ProductCard({ r, selected, onSelect }: { r: Ranked<Product>; selected: boolean; onSelect: () => void }) {
  const p = r.product;
  const [line, shade] = p.name.split(" - ");
  return (
    <button className={`product ${selected ? "selected" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <Thumb p={p} />
      <div className="product-body">
        {r.badge && <span className="badge">{r.badge}</span>}
        <span className="shade">{shade ?? line}</span>
        <span className="line">{shade ? line : ""}</span>
        <span className="why">{r.reason}</span>
        <span className="price-row">
          <span>{gbp(p.price)}</span>
          <span className="match">{r.score}% match</span>
        </span>
      </div>
    </button>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
