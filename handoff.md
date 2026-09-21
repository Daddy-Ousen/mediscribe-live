# Handoff — 2026-09-21 (after P0 code fixes)

## What was just done
- P0 code fixes 1-4 are done and tested. They are NOT committed yet.
- `src/app/api/soap/generate/route.ts`: rewritten. Fallback template engine deleted. The prompt forbids invented data. Defaults are "Not discussed during encounter". The route does 1 retry after 1.5 s, then returns 502. Provider is "Unsigned draft - pending clinician review". A FHIR Condition is added only when an ICD code exists, with verificationStatus provisional.
- `src/app/page.tsx`: fake "Patient" turns removed. Tool-call data is sent as a labeled structured-intake section. Hero and tile claims are fixed.
- `src/components/SoapNoteViewer.tsx`: handles empty lists. Differentials are labeled "AI-suggested (unconfirmed)". The ICD badge shows only if a code exists.
- `src/components/ToolCallBadge.tsx`: "Verified against hospital KB" changed to "Recorded to encounter audit ledger".
- `src/lib/clinical/drug-database.ts`: case-insensitive med de-duplication.
- README claims are fixed.

## Verified
- `npx tsc --noEmit` passes.
- Live API tests: a sore-throat transcript gives no allergies, exam, diagnosis or plan invented. Tool-data-only input gives one interaction alert and ESI-2. Empty input gives 400. A real 429 gives a clean 502 error.
- Playwright: new hero text shows, no RxNorm/600ms/0.00s text remains, compile with 0 turns is blocked.

## Next steps
1. User reviews the diff and commits.
2. Deploy to Vercel (user must log in; needs ASSEMBLYAI_API_KEY env var).
3. P1: stronger LLM Gateway model, source quotes, sign-off button, cockpit first.

## Gotchas
- Python via Bash tool: `\\n` inside heredocs gets collapsed. Use chr(92) or the Edit tool.
- LLM Gateway rate limits (429) quickly on repeat calls.
- Browser pane screenshots time out; use Playwright MCP (files go to `.playwright-mcp/`, gitignored).
- `npx next lint` is not configured (interactive prompt).

## Active files
- src/app/api/soap/generate/route.ts
- src/app/page.tsx
- src/components/SoapNoteViewer.tsx
