# Handoff — 2026-09-22 (submission prep)

## What was just done (NOT committed)
- Verified live site https://mediscribe.rhasan.online: page, token routes, SOAP route all 200. Build + tsc clean.
- Added `LICENSE` (MIT). README: sourced the EHR-time claim (Sinsky 2016), removed "Sub-second Latency".
- Wrote `SUBMISSION.md`: all lablab form text, checklist, 3-min video script.

## Next steps
1. User commits + pushes the 3 files.
2. User tests mic on the live site (voice agent + scribe) in Chrome.
3. Cover image, slides, video. Then submit on lablab before 2026-09-30 21:00 BST.

## Gotchas
- mediscribe-live.vercel.app 308-redirects to mediscribe.rhasan.online.
- Git Bash curl mangles paths starting with "/" (use MSYS_NO_PATHCONV=1).
- LLM Gateway key only has qwen3.5-4b-32k-fast; 429 on rapid calls.
- `scratch/` is gitignored and holds an old script with a hard-coded API key. Never commit it.

## Active files
- SUBMISSION.md, README.md, LICENSE
