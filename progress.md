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

## Open — P0 (must fix before submit)
- [x] Deleted fallback SOAP engine. LLM failure now returns 502 with a clear error (tested with a real 429). One retry after 1.5 s.
- [x] No invented defaults: "Not discussed during encounter" everywhere; no NKDA; dx/ICD only if clinician states it; differentials labeled "AI-suggested (unconfirmed)"; provider = "Unsigned draft - pending clinician review". Tested live.
- [x] No fake "Patient" turns. Tool data goes to SOAP in a labeled "[Structured intake record ... not verbatim speech]" section. Dialogue is not mutated.
- [x] Removed false claims in UI + README (RxNorm, 0.00s LAG, <600ms, zero latency, "Verified against hospital KB", Dr. Sarah Lin).
- [x] Drug checker de-duplicates meds case-insensitively (was raising 4 copies of one alert).
- [ ] Deploy to Vercel and confirm live URL works with mic.
- [ ] Record demo video, make slides, cover image.

## Open — P1 (should do)
- [ ] Commit the P0 changes (not committed yet).
- [ ] Small model suggested "Dermatitis herpetiformis" for a sore throat. Model upgrade is now more urgent.
- [ ] LLM Gateway rate limit (429) seen during testing. Avoid rapid repeat compiles in the demo.
- [ ] Upgrade SOAP model on LLM Gateway to a stronger model; add JSON retry.
- [ ] Add "source quote" per SOAP line (click line → shows transcript turn). Strong grounding story.
- [ ] Clinician review step: SOAP is "Draft" until a human signs.
- [ ] Measure real latency (speech end → first agent audio) and show it live.
- [ ] Put the cockpit first; move marketing sections below or to a separate page.
- [ ] Fix name regex overwriting names ("I am tired" → "Tired").
- [ ] Add favicon; replace Unsplash photo pill; remove cyan buttons (break DESIGN.md).
- [ ] Split `page.tsx` (1960 lines) — optional.

## Decisions
- Next.js 14 app router, client-side WebSockets with server-minted tokens.
