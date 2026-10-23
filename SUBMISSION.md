# Devpost submission draft: Undertone

> Draft text to paste into the Devpost form. Replace every **[FILL]** with what actually happened once you have run the live API. Judges read this alongside the video.

**Project name:** Undertone
**Tagline:** One selfie gives you your shade, your metal and your whole look, before you buy.
**Topic:** Skin AI + eCommerce VTO (Beauty + Jewellery)
**App status:** New

---

## Story (the "About the project" field)

### Inspiration
Shade matching is the hardest part of buying complexion makeup online, and a wrong shade is a guaranteed return. Undertone, the thing that makes a shade look "orange" or "ashy", also decides whether gold or silver jewellery flatters you. Yet beauty and jewellery are sold in separate aisles with separate try-on tools, and nothing connects them to the shopper's actual skin. We wanted one moment, in front of the mirror and before checkout, where your skin data drives the whole basket.

### What it does
Undertone is a storefront experience for a beauty and jewellery retailer:

1. **Scan.** The shopper uploads or takes a selfie. Two YouCam APIs run at the same time:
   - **AI Skin Tone Analysis** returns skin, lip, eye and hair colours.
   - **AI Skin Analysis** returns oiliness, hydration, redness and radiance scores.
2. **Understand.** We convert the skin colour to CIELAB.
   - The **hue angle** gives the undertone (cool, neutral or warm).
   - The **ITA°** (the Individual Typology Angle, a dermatology scale) gives the depth.
   - The skin scores set the foundation **finish**: matte for oily skin, dewy for dry, plus more coverage when there is redness and more glow when radiance is low.
   - Each decision is explained in plain English.
3. **Recommend across categories.** Foundation shades are ranked by CIEDE2000 colour distance with an undertone-mismatch penalty. Lipsticks get a "your lips, but better" badge when they are close to the shopper's natural lip colour as YouCam measured it. Blush is matched to undertone and finish. Earrings and necklaces are ranked by the metal that suits the undertone. Every product shows a match score and a reason.
4. **Try on the whole look.** One tap chains **Makeup VTO → Earrings VTO → Necklace VTO**. Each step uses the previous result as its input, so the final image shows the shopper wearing the foundation, blush, lipstick, earrings and necklace together. The skin scan's finish and coverage go straight into the makeup-vto foundation effect. A before/after slider shows the change, and **"Add the look to bag"** adds the whole basket in one go.

**Consumer value:** confidence in shade and metal before buying, and a full look instead of five separate guesses.
**Retail value:** the shopper adds a whole look in one tap rather than single items, there should be fewer shade-mismatch returns, and the "why this suits you" copy can be reused for clienteling.

### How we built it
- **Frontend:** React + Vite, mobile-first, with camera capture through `<input capture>`.
- **Backend:** a Node/Express proxy keeps `YOUCAM_API_KEY` on the server. A typed YouCam client implements the v2.0 flow:
  1. File API
  2. PUT to the pre-signed URL
  3. create task
  4. poll `task_status`, with timeouts and error mapping

  Request bodies follow Perfect Corp's published OpenAPI specs, including the `source_info`/`object_infos` shape for 2D jewellery VTO.
- **Async try-on job:** each VTO step reports its progress to the UI. Product reference images are uploaded once and their file IDs are cached.
- **Colour science (in-house):** sRGB→CIELAB, CIEDE2000 (unit-tested against the Sharma et al. reference data), ITA°, and an LCh-defined foundation range so that "warm/neutral/cool" means the same thing in the catalogue and in the classifier.
- **Mock mode:** an in-process emulator of the YouCam REST API is wired in as the client's `fetch`. Without a key, the whole pipeline still runs end to end through the same code, which is how judges can run the repo with zero setup.
- **Tests:** 29 Vitest tests covering the colour maths, the profile rules, the recommender, the makeup-vto payload schema, the YouCam client (upload, poll, error, timeout) and the HTTP API end to end.

### Challenges we ran into
- **Undertone calibration.** At first our hand-picked shade hex codes disagreed with our own classifier, so a "cool" shade measured as neutral. We fixed this by defining every shade in CIE LCh, which makes undertone a hue angle and depth a lightness value, and added a test that checks every catalogue shade classifies correctly.
- **Chaining VTO calls.** Makeup VTO, earrings and necklace are separate tasks, so we pass each result URL in as the next task's `src_file_url` to build one composite image.
- [FILL: anything from the live API, e.g. photo requirements (Skin Tone Analysis wants the face to fill more than 60% of the width, while jewellery VTO needs the ears and neck visible), latency, or error codes.]

### Accomplishments that we're proud of
- A single flow that joins Skin AI and VTO for **both** beauty and jewellery, where the skin scan visibly changes the try-on.
- Every recommendation is explainable: a ΔE number, the undertone and the finish rule behind it.
- The repo runs end to end without a key, and the same code path calls the real API when a key is set.

### What we learned
- How the YouCam v2.0 async task model, units and file retention work.
- Why undertone is better treated as a hue angle in a perceptual colour space than as RGB.

### What's next
- A "your shade over time" view that re-scans after skincare use.
- Retailer catalogue import (shade hex from PIM data), so recommendations match a real product range.
- Hair colour and eyewear VTO that use the same profile.
- An agent that builds looks for occasions ("wedding guest, gold jewellery, budget £150") on top of the same ranking functions.

## Built with
`youcam-api` · `perfect-corp` · `typescript` · `react` · `vite` · `node.js` · `express` · `vitest` · `cielab` · `ciede2000`

## Custom questions (required fields)

**Text description (features, functionality, consumer/retail value):** Use the "What it does" section above.

**Code repository URL:** [FILL: public GitHub URL with the MIT licence, or a private repo shared with contact_event@PerfectCorp.com]

**Was there a moment during the hackathon where the API surprised you, in a good or frustrating way?**
[FILL after live testing. Starting point: "Good: the v2.0 task model is the same across very different features (skin analysis, makeup, 2D jewellery VTO), so one small client covered five APIs, and a result URL from one task can feed the next. Frustrating: …"]

**Are there industries or use cases you think Perfect Corp's API could serve that nobody is talking about yet?**
Personal-shopper and clienteling tools for jewellery retailers: in-store staff could use the skin tone result to recommend metals and stones. Also theatre, film and wedding make-up planning, where a whole look (makeup + jewellery) has to be signed off from a photo before the day. And post-procedure dermatology aftercare retail, recommending gentle, non-irritating complexion products from the redness score.

**Where did you hit a wall technically? How did you work around it?**
Calibrating undertone: see Challenges. We moved the catalogue into CIE LCh and added a classifier consistency test. [FILL: any live-API issue, e.g. photo framing that satisfies both Skin Tone Analysis and jewellery VTO.]

**Social posts:** [FILL: optional. Sharing earns bonus API units: https://forms.gle/BJd5gPzF6YqPQR4R8]

---

## 3-minute demo video script (target 2:45)

Record the **live** mode with your own selfie, at about 1280×800 browser width plus one phone-width shot. Don't use music unless it is royalty-free and you are allowed to use it. Don't show third-party brands.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Home page | "Buying foundation or jewellery online means guessing your shade and whether gold or silver suits you, and wrong shades get sent back. Undertone fixes that with one selfie, using Perfect Corp's YouCam API." |
| 0:15–0:30 | Click "Upload or take a selfie", choose a photo; spinner | "I upload a selfie. The server calls two YouCam Skin AI APIs at the same time: Skin Tone Analysis for my skin, lip, eye and hair colours, and Skin Analysis for oiliness, hydration, redness and radiance." |
| 0:30–1:00 | Profile card: swatch, undertone, ITA, bars, tips | "We convert YouCam's skin colour to CIELAB. The hue angle gives my undertone, and the ITA angle, a dermatology scale, gives my depth. My skin scores choose the finish: here [matte, because the scan shows shine]. Every decision is explained." |
| 1:00–1:35 | Scroll the shelves; point at the ΔE reason, the "your lips, but better" badge and the metal badge; swap a lipstick | "Foundation is ranked by CIEDE2000 colour distance with an undertone penalty. Lipsticks close to my natural lip colour, which YouCam measured, get flagged. And because my undertone is [warm], gold jewellery comes first. Everything is pre-picked, but I can change anything." |
| 1:35–2:15 | Click "Try on the full look"; progress steps; before/after slider | "One tap chains three YouCam VTO calls: Makeup VTO applies the foundation, blush and lipstick using the finish and coverage from my scan; then Earrings VTO and Necklace VTO each take the previous result as input. So I see the whole look on me, not one product at a time." |
| 2:15–2:35 | "Add the look to bag", bag drawer | "Then the whole look goes into the bag in one tap. For the shopper that means confidence; for the retailer, a bigger basket and fewer shade returns." |
| 2:35–2:50 | Quick phone-width view; terminal running `npm test` | "It's responsive, the API key stays on the server, and the repo runs end to end without a key in mock mode, with 29 tests. That's Undertone, built on the YouCam API." |
