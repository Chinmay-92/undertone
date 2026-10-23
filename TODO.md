# Human TODO: Undertone (YouCam hackathon)

**Deadline:** Mon 2 Nov 2026, 16:45 UTC (11:45 ET), as listed in Devpost's key dates. Aim to submit by **Sun 1 Nov**.

## Check first
- [ ] **The Devpost "Rules" page currently shows GitLab's hackathon T&Cs** ("GitLab Transcend Life After Code", submission end 27 Oct, GitLab Duo, GitLab repo). This looks like a mistake by the host. Ask the organisers for written clarification of the official rules and deadline (through the Devpost discussion board or contact_event@PerfectCorp.com) **before 27 Oct** in case the earlier date applies. The overview and requirements pages say: YouCam API, any public repo or a private one shared with contact_event@PerfectCorp.com, and a 1–3 minute video.
- [ ] Eligibility: the UK is not on the excluded-country list, and you must be above the age of majority. OK.

## API access (about 15 min)
- [ ] Register for the hackathon on Devpost yourself, then get the redeem code that arrives by email.
- [ ] Sign up at https://yce.perfectcorp.com/ai-api, then go to Account > Redeem Code to get 1,000 units.
- [ ] Create an API key (API Console > API Keys). Put it in `.env` as `YOUCAM_API_KEY=...`. Never commit it (`.env` is in .gitignore).
- [ ] Run `npm run smoke:live -- ./your-selfie.jpg` (about 32 units). Check that:
  - [ ] Skin Tone Analysis returns `color.skin_color`.
  - [ ] Skin Analysis `format: json` returns `output[]` with `ui_score`.
  - [ ] makeup-vto works with `shape.name: "original"` and blush `pattern.name: "1color1"`. If either name is rejected, try `"plump"` for the lip shape (in `shared/makeup.ts`).
  - [ ] Earring and necklace VTO accept the generated product PNGs and `src_file_url` chaining. If background removal or placement looks wrong, adjust `earring_scale` or `necklace_*` parameters in `jewelleryTaskBody`.
- [ ] Run `npm run dev` in live mode and go through the UI with your own selfie. Fix anything that differs from the docs.
- [ ] Budget: about 32 units per full run and about 3 per extra look. 1,000 units is roughly 25 full demo runs. Optional: share the project to earn bonus units at https://forms.gle/BJd5gPzF6YqPQR4R8.

## Repo
- [ ] Create a GitHub repo (public with the MIT LICENSE, or private and shared with contact_event@PerfectCorp.com) and push. *(Not done by the agent: no remotes were created.)*
- [ ] Optionally set the LICENSE copyright holder to your name.
- [ ] Replace the screenshots in `docs/screenshots/` with **live-mode** screenshots using your own face, or a consenting person's. Devpost requires screenshots.

## Deploy (optional but helps judges)
- [ ] Deploy as a single Node service (`npm run build && npm start`, `PORT` env) on Render, Fly or Railway, with `YOUCAM_API_KEY` set as a secret. Consider setting `YOUCAM_MOCK=1` on the public demo so judges don't use up your units, and show live mode in the video.

## Video (1–3 min, public on YouTube)
- [ ] Record by following the script in `SUBMISSION.md`, using live mode and your own selfie.
- [ ] Say out loud which YouCam APIs are used: Skin Tone Analysis, Skin Analysis, Makeup VTO, Earrings VTO, Necklace VTO.
- [ ] No third-party trademarks or copyrighted music.
- [ ] Upload to YouTube as Public or Unlisted, and check it plays while logged out.

## Devpost submission (do it yourself; the agent did not touch Devpost)
- [ ] Fill in the [FILL] parts of `SUBMISSION.md` with real live-API experiences.
- [ ] Fields: Submitter type = Individual · Country = United Kingdom · App Status = New · description · repo URL · the three required questions · optional social link.
- [ ] Upload screenshots and add the video link.
- [ ] Agree to the exit interview and blog article if you win (these are submission requirements).
