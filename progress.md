# MediScribe Live — Progress

Hackathon: AssemblyAI Voice Agent Hackathon (lablab.ai)
Deadline: 2026-09-30, 9:00 PM BST
Judging: Application of Technology, Presentation, Business Value, Originality
Submit: title, short + long description, tags, cover image, video, slides, public GitHub repo, live app URL

## Done (verified 2026-09-21)
- Voice Agent API bedside triage with 5 tools (token route returns 200)
- Realtime STT ambient scribe, universal-3-5-pro, medical-v1, speaker labels (token route returns 200)
- SOAP via AssemblyAI LLM Gateway (qwen3.5-4b-32k-fast) — works on a live test
- Multi-patient roster, vitals extraction, ESI score, drug checker (10 hard-coded pairs)
- `npx tsc --noEmit` passes
- Full audit done (see handoff.md for findings)

## Ambient Scribe fix (2026-09-21, not committed)
- [x] Root cause 1: recorder sent 4096-sample frames; on 96 kHz mics that is 43 ms at 16 kHz, and AssemblyAI rejects <50 ms (error 3007, close reason "See Error message for details"). Recorder now emits fixed 100 ms frames. Verified: every frame 3200 bytes at a 96 kHz fake mic.
- [x] Root cause 2: the real server error was overwritten by the generic close message. The client now shows the server error in plain words (1008 too many sessions, 3007, 3005 expired).
- [x] Root cause 3: sessions could linger (no Terminate while CONNECTING, orphan sessions if Stop was pressed during token fetch, late onclose flipping the status of a newer session). Fixed in both clients, plus Terminate on tab close.
- [x] Verified in browser: scribe streams 10 frames/s with no errors, Stop sends Terminate + 1000 close, Voice Agent still connects and greets.

## Open — P0 (must fix before submit)
- [x] Deleted fallback SOAP engine. LLM failure now returns 502 with a clear error (tested with a real 429). One retry after 1.5 s.
- [x] No invented defaults: "Not discussed during encounter" everywhere; no NKDA; dx/ICD only if clinician states it; differentials labeled "AI-suggested (unconfirmed)"; provider = "Unsigned draft - pending clinician review". Tested live.
- [x] No fake "Patient" turns. Tool data goes to SOAP in a labeled "[Structured intake record ... not verbatim speech]" section. Dialogue is not mutated.
- [x] Removed false claims in UI + README (RxNorm, 0.00s LAG, <600ms, zero latency, "Verified against hospital KB", Dr. Sarah Lin).
- [x] Drug checker de-duplicates meds case-insensitively (was raising 4 copies of one alert).
- [x] Deployed. Live URL https://mediscribe.rhasan.online serves latest code (verified 2026-09-22: page 200, token routes 200, SOAP route 200 with 3/3 sourced). Mic test on live site still to do by user.
- [ ] Record demo video, make slides, cover image.

## Plan B items 1-5 (2026-09-21, not committed, all verified)
- [x] 1 Model: `SOAP_MODEL` env var (default `qwen3.5-4b-32k-fast`). The key has NO access to any other LLM Gateway model (probed 17 models: all 400 "no access"). Needs paid plan / hackathon credits.
- [x] 2 Source quotes: server numbers turns T1..Tn, model returns evidence map, server VERIFIES each citation by word overlap with the turn text (replaces or drops wrong ones), flags unsourced items. Allergy backup regex. Viewer: T-chips open quote panel; "SOURCE-LINKED x/y" summary.
- [x] 3 Sign-off: DRAFT until clinician name + (ack of NO SOURCE items). FHIR Composition preliminary -> final + attester.
- [x] 4 Layout: compact header + 4-step workflow strip; order roster > cockpit > SOAP > ledger > architecture; no stock photos; no cyan; text sizes 9-11px -> 11-12px; favicon `src/app/icon.svg`; no horizontal scroll at 375 px.
- [x] 5 Latency: Voice Agent measures end-of-speech event -> first agent audio chunk; panel shows last/median/n.
- [x] Scribe feed bugs found in e2e test and fixed: turns merged by turn_order id (no duplicates, no React key errors); partial turns = "IDENTIFYING SPEAKER"; label->role map (first speaker = Doctor) + "Swap Doctor / Patient" button; SpeakerRevision handled; chart extraction on final turns only; chief complaint from first symptom turn.
- [x] E2E test (Playwright + Windows SAPI speech WAV `scratch/e2e-test.wav` into fake mic): transcript correct, speakers correct, name "Maria Lopez", SOAP 9/9 sourced, signed, FHIR final, 0 console errors.

## Open
- [x] Code committed, merged (PR #2), deployed.
- [ ] User: commit README fix + LICENSE + SUBMISSION.md (2026-09-22).
- [ ] Submit on lablab using SUBMISSION.md.
- [ ] Old note: set SOAP_MODEL on Vercel only if a better model is unlocked. Optionally set SOAP_MODEL on Vercel once a better model is unlocked.
- [ ] User: record video, slides, cover image.
- [ ] Get stronger LLM model access (hackathon credits link on lablab page) — qwen sometimes adds mild inference in plan instructions.
- [ ] Name regex in voice path can still overwrite names ("I am tired").
- [ ] Split `page.tsx` (~1950 lines) — optional.

## Submission prep (2026-09-22)
- [x] `npm run build` + `tsc` clean.
- [x] Added MIT `LICENSE` (README claimed MIT, file was missing).
- [x] README: replaced unsourced "40%" claim with Sinsky 2016 citation; removed "Sub-second Latency".
- [x] Wrote `SUBMISSION.md` (title, descriptions, tags, checklist, video script).

## Live bug + slides (2026-09-22, branch fix/stale-stt-token, NOT committed)
- [x] BUG: live ambient scribe failed ("Signature has expired", 1008). Cause: Next.js Data Cache cached the server fetch to AssemblyAI, so /api/token/streaming returned the SAME old token to everyone. Fix: `cache: 'no-store'` + `revalidate = 0` + `fetchCache = 'force-no-store'` in both token routes. Verified on local prod build: 3 different tokens, session Begins, full e2e WAV run 0 console errors, SOAP 9/9 sourced, sign-off works.
- [x] Removed "Sub-second" claims from the architecture section of page.tsx.
- [x] Slides deck: https://claude.ai/artifact/Nwf8zLF2TntuPUYAaCzvra (12 slides, real screenshots).
- [x] Cover: submission/cover.png (1920x1080). Source: .playwright-mcp/cover.html (gitignored).
- [ ] User: commit, push, merge PR, confirm live tokens differ each call.
- [ ] Known small issue: the first partial turn ("morning.") can stay "IDENTIFYING SPEAKER".

## Decisions
- Next.js 14 app router, client-side WebSockets with server-minted tokens.
