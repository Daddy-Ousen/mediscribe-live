# Handoff — 2026-09-21 (scribe fix + plan B items 1-5)

## What was just done (NOT committed)
1. Ambient Scribe fix
   - `src/lib/audio/audio-recorder.ts`: fixed 100 ms frames. AssemblyAI needs frames of 50-1000 ms (error 3007).
   - `src/lib/assemblyai/streaming-client.ts`: shows the real server error; clean Terminate; no orphan or duplicate sessions; Terminate on tab close; turn ids keyed by session + turn_order; speaker label -> role map; swapRoles(); SpeakerRevision.
   - `voice-agent-client.ts`: the same disconnect hardening; latency measurement (onLatency).
2. SOAP route (`src/app/api/soap/generate/route.ts`): SOAP_MODEL env; numbered turns; evidence map; server-side citation check (verifyEvidence); allergy backup; grounding counts; FHIR Composition.
3. `SoapNoteViewer.tsx`: T-chips, quote panel, NO SOURCE flags, DRAFT/SIGNED, sign-off form.
4. `page.tsx`: compact hero + workflow strip; new section order; handleSignSoapNote; handleSwapSpeakers; turn merge by id; final-only chart extraction; latency state; no cyan; bigger text.
5. `AudioWaveform.tsx`: latency row. `src/app/icon.svg` favicon. `next.config.mjs`: Unsplash removed.
6. README + `.env.example` are updated.

## Verified
- `npx tsc --noEmit` clean.
- E2E in Playwright: fake mic plays `scratch/e2e-test.wav` (Windows SAPI, 2 voices, 41 s). To rerun: copy it to `public/`, override getUserMedia with an AudioBufferSource, then delete `public/` again.
- The LLM Gateway key can only use `qwen3.5-4b-32k-fast`.

## Next steps
1. The user reviews, commits and pushes. Vercel redeploys.
2. Video, slides, cover.
3. Unlock a stronger model (hackathon credits), then set SOAP_MODEL on Vercel.

## Gotchas
- Python heredocs through the Bash tool collapse `\\`. Use chr(92) or the Edit tool.
- Changing next.config restarts dev and makes tsc show TS6053 errors for `.next/types` (not real errors).
- The LLM Gateway returns 429 quickly on rapid calls.
- The `scratch/` folder is gitignored. It contains an old test script with a hard-coded API key: `scratch/test_streaming_ws.js`. It was never committed.

## Active files
- src/app/api/soap/generate/route.ts
- src/components/SoapNoteViewer.tsx
- src/app/page.tsx
- src/lib/assemblyai/streaming-client.ts
