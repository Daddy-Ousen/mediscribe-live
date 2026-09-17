# MediScribe Live
> **Autonomous Bedside Clinical Assistant, Ambient Triage Copilot & Shift EHR Manager**  
> *Built for the [AssemblyAI: Voice Agent Hackathon](https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon) on lablab.ai*

---

## Executive Summary

In acute healthcare environments (Emergency Departments and acute trauma bays), clinicians spend up to **40% of their shifts manually typing Electronic Health Record (EHR) progress notes and clicking through complex EHR forms**, diverting critical attention away from direct patient care. Furthermore, critical medication contraindications and escalating physiological vital instability often go unflagged during initial bedside intake.

**MediScribe Live** solves this with an autonomous, voice-first clinical triage copilot and ambient medical scribe powered directly by **AssemblyAI Voice Agent API** and **Realtime STT**:

1. **Bedside Conversational Voice Triage (AssemblyAI Voice Agent API)**:
   - Full-duplex conversational voice agent acting as an empathetic bedside intake assistant with sub-600ms latency.
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
   - Synthesizes verbal dialogue into standardized clinical SOAP notes (Subjective, Objective, Assessment, Plan).
   - Automated ICD-10 diagnostic coding classifications (e.g. `I20.0`, `I21.0`).
   - Generates and exports HL7 FHIR v4 Document Bundles (`application/fhir+json`).
5. **Judge Simulation Dossiers**:
   - Includes 3 pre-configured high-acuity clinical scenarios (Acute Coronary Syndrome, Sildenafil/Nitrate lethal contraindication, Lisinopril/Potassium hyperkalemia) so hackathon judges can evaluate the full voice, tool calling, and SOAP pipeline with zero setup.

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
                   - RxNorm Drug Contraindications
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

## Testing & Evaluation Guide

1. **Department Triage Roster**:
   - Browse the top roster bar to switch between active patients (`Robert Vance`, `David Miller`, `Eleanor Vance`).
   - Click **"+ New Patient Intake"** to initialize a clean-slate patient intake.
   - Click **"Complete Encounter & Next Patient"** to archive the current encounter and advance to the next queued patient.
2. **Bedside Voice Triage**:
   - Select **Bedside Voice Agent** in the Cockpit.
   - Click **"Initialize Voice Triage"** (grant microphone permissions).
   - Speak to MediScribe: *"Doctor, I have severe chest pain rated 9 out of 10 that started an hour ago. I regularly take Warfarin, and I just took Aspirin."*
   - Observe the agent respond with spoken audio, update the ESI score, and execute the `check_drug_interaction` and `flag_critical_vital` tools in real time.
3. **Ambient Consultation Scribe**:
   - Switch to **Ambient Scribe** mode.
   - Click **"Start Ambient Scribe"** to transcribe multi-speaker medical dialogue with `domain: "medical-v1"`.
   - Click **"Compile SOAP Documentation"** to generate standardized progress notes.
4. **Judge Simulation Dossiers**:
   - Scroll to **Chapter 03** and click **"Execute Dossier"** on any pre-configured case for instant evaluation without microphone setup.

---

## License
This project is licensed under the **MIT License** in compliance with the hackathon rules.
