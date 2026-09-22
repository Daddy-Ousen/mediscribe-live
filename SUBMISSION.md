# lablab.ai Submission — MediScribe Live

Deadline: 2026-09-30, 9:00 PM BST

## Links
- Live app: https://mediscribe.rhasan.online (also https://mediscribe-live.vercel.app, which redirects)
- GitHub (public): https://github.com/Daddy-Ousen/mediscribe-live

## Title
MediScribe Live — Voice Triage and Source-Linked Clinical Scribe

## Short description (1-2 sentences)
A voice-first ER assistant built on AssemblyAI. A Voice Agent does bedside intake with live tool calls, and a medical-tuned Realtime STT scribe turns the doctor-patient talk into a SOAP note where every line links back to the exact words that were said.

## Long description
Emergency clinicians lose a large part of every shift to typing EHR notes. AI scribes can help, but a clinician cannot trust a note if they cannot see where each line came from.

MediScribe Live has two voice modes that share one patient chart:

1. Bedside Voice Triage (AssemblyAI Voice Agent API). A full-duplex voice agent talks with the patient, handles barge-in, and calls tools while it talks: `record_patient_intake`, `check_drug_interaction` and `flag_critical_vital`. The chart, the ESI acuity score and the alerts update live. The panel shows the real response latency, measured in the browser from the end-of-speech event to the first agent audio.

2. Ambient Scribe (AssemblyAI Realtime STT). Universal-3.5 Pro with `domain: medical-v1` and speaker labels transcribes the consultation and separates Doctor and Patient.

3. Source-linked SOAP note (AssemblyAI LLM Gateway). The server numbers every transcript turn. Each SOAP item cites the turns it came from, and the server checks each citation against the real turn text. Wrong citations are fixed or dropped. Items with no source are flagged "NO SOURCE - VERIFY". Nothing is invented: topics not discussed say "Not discussed during encounter", allergies never default to NKDA, and a diagnosis appears only if the clinician said it.

4. Clinician sign-off and FHIR. The note stays a DRAFT until a named clinician signs and acknowledges any unsourced items. Export is an HL7 FHIR R4 Bundle whose Composition moves from `preliminary` to `final` with an attester.

Security: the API key stays on the server. The browser gets short-lived tokens and connects straight to AssemblyAI over WebSockets.

Stack: Next.js 14, React, TypeScript, Tailwind, Web Audio API, AssemblyAI Voice Agent API, Streaming STT v3, LLM Gateway. Deployed on Vercel.

Note: this is a hackathon prototype, not a medical device. The drug-interaction list is a small demo set.

## Tags
AssemblyAI, Voice Agent, Speech-to-Text, Healthcare, Medical Scribe, Next.js, FHIR, LLM

## Checklist
- [x] Public GitHub repo with README and MIT LICENSE
- [x] Live app deployed; token routes and SOAP route return 200
- [ ] Deploy the stale-token fix (branch fix/stale-stt-token). Before it, the live ambient scribe fails.
- [ ] Mic test on the live site in Chrome (voice agent + scribe)
- [x] Cover image: `submission/cover.png` (1920x1080)
- [ ] Demo video (3-5 min)
- [x] Slides: https://claude.ai/artifact/Nwf8zLF2TntuPUYAaCzvra (12 slides). Download as PDF from the deck page.

## Demo video script (about 3 min)
1. 0:00 Problem: note-typing burden, and why trust needs sources.
2. 0:25 Voice Triage: say the John Miller line from the README. Show name, ESI-2, warfarin + aspirin alert, latency number.
3. 1:15 Ambient Scribe: two people talk. Show Doctor/Patient labels and medical terms.
4. 1:55 Compile SOAP: click T-chips to show quotes. Show a NO SOURCE flag.
5. 2:30 Sign-off: enter name, sign, show FHIR `final`.
6. 2:50 Architecture slide + close.
