# Handoff — 2026-09-22 (live token bug + slides + cover)

## What was just done (branch fix/stale-stt-token, NOT committed)
- FIXED live bug: Next.js cached the AssemblyAI token fetch, so the live streaming token route gave every user the same expired token. The ambient scribe failed at once with "Signature has expired". Both token routes now use `cache: 'no-store'`, `revalidate = 0` and `fetchCache = 'force-no-store'`. Verified on a local `next start` build.
- page.tsx: removed two "Sub-second" claims.
- README fix, MIT LICENSE, SUBMISSION.md (from earlier today).
- Slides: https://claude.ai/artifact/Nwf8zLF2TntuPUYAaCzvra (12 slides). Private until the user shares it.
- Cover: submission/cover.png.

## Next steps
1. User commits, pushes, opens a PR, merges. Vercel redeploys.
2. After deploy, check that tokens differ: call /api/token/streaming 3 times and compare.
3. Mic test on the live site. Record the video. Submit before 2026-09-30 21:00 BST.

## Gotchas
- Check token freshness: `for i in 1 2 3; do curl -s https://mediscribe.rhasan.online/api/token/streaming | md5sum; done` (all 3 must differ).
- E2E with fake mic: Playwright page.route serves scratch/e2e-test.wav at /__e2e.wav, addInitScript overrides getUserMedia. Works on any URL.
- Playwright MCP can only write inside the repo (use .playwright-mcp/).
- mediscribe-live.vercel.app 308-redirects to mediscribe.rhasan.online.
- `scratch/` holds an old script with a hard-coded API key. Never commit it.

## Active files
- src/app/api/token/streaming/route.ts, src/app/api/token/voice-agent/route.ts, src/app/page.tsx
- SUBMISSION.md, submission/cover.png
