# Undertone demo video: narration

First-person voice-over for `video/undertone_demo.mp4` (about 2:40). The synthetic track uses macOS `say -v Daniel`; you can re-record each segment in your own voice and drop it in as `video/build/<key>.wav` (see `video/build.mjs`).

The lines quoted with `>` are what `video/build.mjs` reads, one segment per `## [key]` heading. The results quoted here (neutral undertone, brown depth, satin finish, rose gold) come from the live YouCam run recorded on 24 Oct 2026 with my own selfie. Re-check them if you record a new take.

## [title] Title card

Screen: "Undertone" title card.

> Hi. This is Undertone, a skin-aware beauty and jewellery try-on, built on Perfect Corp's YouCam API.

## [problem] The problem

Screen: problem card.

> When I buy foundation online, I'm guessing my shade and undertone from a product photo. Get it wrong, and it goes straight back as a return. Whether gold or silver jewellery suits me depends on that same undertone, but stores sell it in a separate aisle, with nothing joining it to my skin.

## [upload] Upload a selfie

Screen: home page, live mode badge, upload, "Reading your skin tone" spinner. Footage: live take.

> This is the app running against the live YouCam API. I upload one selfie. On the server, two Skin AI calls run in parallel: Skin Tone Analysis, for my skin, lip, eye and hair colours, and Skin Analysis, for oiliness, hydration, redness and radiance.

## [profile] Skin profile

Screen: profile card with swatch, undertone, ITA, finish, skin score bars and tips.

> Undertone converts YouCam's skin colour to CIELAB. The hue angle says my undertone is neutral, and the ITA angle, a dermatology scale, puts my depth at brown. My skin scores look balanced, so it picks a natural satin finish with light coverage, and every decision is explained in plain English.

## [recs] Ranked recommendations

Screen: foundation, lipstick, blush, earrings and necklace shelves; swap a lipstick and back.

> Then it ranks the whole catalogue for me. Foundation is sorted by CIEDE2000 colour distance, with a penalty for the wrong undertone. Lipstick and blush match my undertone and finish. And because neutral undertones can wear any metal, rose gold comes first for the earrings and necklace. Every pick has a match score and a reason, and I can swap anything.

## [tryon] Complete-look try-on

Screen: "Try on the full look", step progress (makeup, earrings, necklace), before/after slider, per-step thumbnails.

> Now one tap tries on the complete look. Three YouCam calls run as a chain. Makeup VTO applies the foundation, blush and lipstick, using the finish and coverage from my scan. Then Earrings VTO, and Necklace VTO, each take the previous result as their input. So I end up with one image of me wearing everything together, not one product at a time.

## [bag] Add to bag

Screen: "Add the look to bag", bag drawer with five items.

> And the whole look goes into the bag in one tap. I buy with confidence, and the retailer gets a bigger basket and fewer shade returns.

## [built] How it's built

Screen: architecture card.

> Under the hood, it's a React and Vite storefront, with a Node and Express proxy that keeps the YouCam API key on the server. It uses five YouCam APIs: Skin Tone Analysis, Skin Analysis, Makeup VTO, Earrings VTO and Necklace VTO. A full scan and try-on costs about thirty-two units, and without a key, the whole pipeline runs in mock mode.

## [closing] Closing card

Screen: closing card.

> That's Undertone. One selfie: my shade, my metal, and my whole look, before I buy.
