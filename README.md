# MediScribe Live
> **Autonomous Bedside Clinical Assistant, Ambient Triage Copilot & Shift EHR Manager**  
> *Built for the [AssemblyAI: Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai*

---

## Executive Summary

In acute healthcare environments (Emergency Departments and acute trauma bays), clinicians spend up to **40% of their shifts manually typing Electronic Health Record (EHR) progress notes and clicking through complex EHR forms**, diverting critical attention away from direct patient care. Furthermore, critical medication contraindications and escalating physiological vital instability often go unflagged during initial bedside intake.

**MediScribe Live** solves this with an autonomous, voice-first clinical triage copilot and ambient medical scribe powered directly by **AssemblyAI Voice Agent API** and **Realtime STT**:

1. **Bedside Conversational Voice Triage (AssemblyAI Voice Agent API)**:
   - Full-duplex conversational voice agent acting as an empathetic bedside intake assistant with natural turn-taking.
   - Real-time **JSON-Schema Tool Calling** (`check_drug_interaction`, `flag_critical_vital`, `record_patient_intake`).
   - Natural turn-taking, neural Voice Activity Detection (VAD), and instantaneous barge-in interruption handling via Web Audio API buffer flushing.
2. **Multi-Patient Triage Queue & Shift Ledger**:
   - Department-wide patient roster tracking active bays, MRNs, triage acuity (ESI-1 through ESI-5), and encounter status.
   - Clean patient isolation preventing transcript or clinical alert cross-contamination.
   - One-click "Complete Encounter & Next Patient" and "+ New Patient Intake" actions.
3. **Ambient Clinical Scribe (AssemblyAI Realtime STT)**:
   - Powered by **Universal-3.5 Pro** with **`domain: "medical-v1"`** for high-precision transcription of pharmacology, anatomical structures, and diagnostic terms.
   - Multi-speaker diarization distinguishing between `Doctor` and `Patient`.
   - Real-time clinical entity detection highlighting Symptoms, Medications, Dosages, and Diagnoses live on screen.
4. **Automated SOAP Documentation & HL7 FHIR v4 Integration**:
   - Drafts SOAP notes (Subjective, Objective, Assessment, Plan) via the AssemblyAI LLM Gateway, from the recorded dialogue only.
   - **No invented data:** anything not discussed is marked "Not discussed during encounter". Allergies are never defaulted to NKDA. There is no offline template fallback: if synthesis fails, no note is produced.
   - Diagnosis and ICD-10 code appear only when the clinician states them. AI differentials are labeled as unconfirmed suggestions.
   - Every note is an unsigned draft pending clinician review.
   - Generates and exports HL7 FHIR v4 Document Bundles (`application/fhir+json`).
5. **Real-Time Spoken Demographics & Autonomous Intake Confirmation**:
   - Detects patient name and demographics directly from spoken intake turns, updating the clinical chart and shift ledger live.
   - Automatically concludes and closes the audio session upon intake completion with verbal reassurance.

---

## Architecture & Technology Stack

```
                          +----------------------------------------------+
                          |               User Browser                   |
                          |     Next.js 14 + Tailwind CSS Console        |
                          +------^-------------------------------^-------+
                                 | 1. Mint Short-Lived Token     | 2. Direct WebSockets (Sub-second Latency)
                                 v                               v
                 +-------------------------------+  +------------------------------------------+
                 |       Next.js API Server      |  |          AssemblyAI Cloud Edge           |
                 |  - /api/token/voice-agent     |  |                                          |
                 |  - /api/token/streaming       |  |  1. Voice Agent API (24kHz Base64 PCM)   |
                 |  - /api/tools/drug-interaction|  |     wss://agents.assemblyai.com/v1/ws    |
                 |  - /api/soap/generate         |  |     - Full Duplex Spoken Turn Taking     |
                 +---------------+---------------+  |     - JSON-Schema Tool Calling           |
                                 |                  |                                          |
                                 |                  |  2. Realtime STT (16kHz Binary PCM)      |
                                 |                  |     wss://streaming.assemblyai.com/v3/ws |
                                 |                  |     - Model: universal-3-5-pro           |
                                 |                  |     - Domain: medical-v1                 |
                                 |                  |     - Speaker Diarization (Doc/Patient)  |
                                 v                  +------------------------------------------+
                   Internal Clinical KB
                   - Curated drug-interaction rules (demo)
                   - Emergency Severity Index (ESI)
                   - HL7 FHIR v4 / ICD-10 Schemas
```

### Key Technologies
- **Full-Stack Application**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons.
- **Speech Infrastructure**: AssemblyAI Voice Agent API (`agents.assemblyai.com`), AssemblyAI Streaming STT (`streaming.assemblyai.com/v3/ws`).
- **Audio Processing**: Web Audio API, AudioContext, PCM16 conversion, dynamic sample rate downsampling (24 kHz and 16 kHz), custom buffer player with instant interruption flushing.
- **Security**: Zero API key exposure in client-side code; server-side token minting proxies with time-to-live restrictions.

---

## How AssemblyAI Is Integrated

| Feature | AssemblyAI Technology | Technical Implementation |
| :--- | :--- | :--- |
| **Bedside Voice Triage** | **Voice Agent API** (`v1/ws`) | Connects via single WebSocket, handles 24 kHz base64 PCM frames, neural VAD, and `anna` voice output. |
| **Clinical Tool Calling** | **Flat JSON-Schema Tools** | Registered in `session.update`: `check_drug_interaction`, `flag_critical_vital`, `record_patient_intake`. |
| **Ambient Scribing** | **Realtime Streaming STT** (`v3/ws`) | `speech_model=universal-3-5-pro` with `domain=medical-v1` and `speaker_labels=true`. |
| **Clinical Domain Tuning** | **`domain: "medical-v1"`** | High-precision recognition of pharmaceutical names and clinical acronyms. |
| **Zero-Leakage Security** | **Temporary Token Minting** | Server routes (`/api/token/*`) mint short-lived tokens via `Authorization: Bearer` and raw headers. |

---

## Quick Start (Local Setup)

### Prerequisites
- Node.js v18+ (tested on Node v20/v22)
- npm or pnpm
- AssemblyAI API Key ([assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/api-keys))

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/daddy-Ousen/mediscribe-live.git
cd mediscribe-live
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the project root:
```env
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
npm run build
npm run start
```

---

## Deploy to Vercel

Deploy **MediScribe Live** directly to Vercel with zero configuration:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdaddy-Ousen%2Fmediscribe-live&env=ASSEMBLYAI_API_KEY&envDescription=Your%20AssemblyAI%20API%20Key%20from%20assemblyai.com%2Fdashboard&envLink=https%3A%2F%2Fwww.assemblyai.com%2Fdashboard%2Fapi-keys&project-name=mediscribe-live&repository-name=mediscribe-live)

### Deployment Steps
1. Click the **Deploy with Vercel** button above or import `https://github.com/daddy-Ousen/mediscribe-live` in the [Vercel Dashboard](https://vercel.com/new).
2. Set the **Framework Preset** to `Next.js` (auto-detected).
3. In **Environment Variables**, configure:
   - **`ASSEMBLYAI_API_KEY`**: Your AssemblyAI production API key ([assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/api-keys)).
4. Click **Deploy**. Vercel will build and launch your live production instance with edge streaming and full Web Audio support.

---

## Testing & Clinical Evaluation Guide

1. **Department Triage Roster & Queue**:
   - The queue initializes with a clean live intake: **`Patient Intake #1` (BAY 1)**.
   - Click **"+ New Patient Intake"** to spawn additional patient bays (`BAY 2`, `BAY 3`, etc.).
   - Click **"Discharge"** to discharge any patient or reset the queue cleanly.
2. **Bedside Voice Triage**:
   - In the Cockpit, select **Bedside Voice Agent**.
   - Click **"Initialize Voice Triage"** (grant microphone permissions).
   - Speak to MediScribe: *"Hello, my name is John Miller. I'm here because of crushing chest pain rated 9 out of 10 that started 45 minutes ago. I regularly take Warfarin, and I took Aspirin before coming in."*
   - Observe:
     - The patient name dynamically updates to **John Miller** across the active encounter bar, dossier, and shift ledger.
     - The ESI score escalates to **ESI-2 Emergent**.
     - Real-time tool calls execute for `check_drug_interaction` (flagging hemorrhage contraindication) and `flag_critical_vital`.
     - Upon intake conclusion, the agent speaks its closing confirmation and automatically terminates the session.
3. **Ambient Consultation Scribe**:
   - Switch to **Ambient Scribe** mode.
   - Click **"Start Ambient Scribe"** for continuous doctor-patient consultation transcription with medical nomenclature recognition.
4. **Automated SOAP & FHIR Documentation**:
   - Click **"Compile SOAP Documentation"** to draft a SOAP note and HL7 FHIR v4 bundle from the recorded dialogue. Voice-agent tool data is passed in a labeled section, never as patient speech.

---

## License
This project is licensed under the **MIT License** in compliance with the hackathon rules.
