import { NextResponse } from 'next/server';
import { SoapNote, SourceTurn } from '@/types/clinical';
import { checkDrugInteractions, calculateEsiScore, extractMedicalEntities } from '@/lib/clinical/drug-database';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
};

// Shown when the dialogue does not contain the information. Never replaced with a guessed value.
const NOT_DISCUSSED = 'Not discussed during encounter';
const NO_EXAM = 'No physical exam findings stated in dialogue';
const NO_RESULTS = 'No diagnostic results stated in dialogue';
const PLACEHOLDERS = new Set([NOT_DISCUSSED, NO_EXAM, NO_RESULTS]);

// Set SOAP_MODEL (e.g. claude-sonnet-5) once the account has access to it on the LLM Gateway.
// The retry always uses the economical model, which every account can call.
const DEFAULT_MODEL = 'qwen3.5-4b-32k-fast';
const SOAP_MODELS = [process.env.SOAP_MODEL || DEFAULT_MODEL, DEFAULT_MODEL];

interface AiSoapPayload {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  reviewOfSystems?: string[];
  allergies?: string[];
  currentMedications?: string[];
  physicalExam?: string[];
  diagnosticResults?: string[];
  primaryDiagnosis?: string;
  icd10Code?: string;
  differentialDiagnoses?: Array<{ diagnosis: string; icd10: string }>;
  clinicalRationale?: string;
  plan?: {
    medicationsPrescribed?: Array<{ name: string; dosage: string; instructions: string }>;
    diagnosticsOrdered?: string[];
    patientInstructions?: string;
    followUp?: string;
  };
  evidence?: Record<string, unknown>;
}

const SYSTEM_PROMPT = `You are a clinical documentation scribe. You turn a recorded encounter into a SOAP note draft for a clinician to review and sign.
The encounter is given as numbered turns: "[T3] Patient: ...". Turns with speaker "Chart" are structured intake data captured by a voice agent, not verbatim speech.

CRITICAL CLINICAL INTEGRITY RULES:
1. Document ONLY what is explicitly stated in the turns. Do not infer, extrapolate, or add typical findings.
2. If something was not discussed, use exactly "${NOT_DISCUSSED}" (for strings) or an empty array (for lists). Never write "NKDA" unless the patient said they have no allergies.
3. physicalExam and diagnosticResults: only findings a clinician stated aloud. Otherwise empty array.
4. Never invent vital sign values. They are handled outside this note.
5. primaryDiagnosis: only a diagnosis or impression the clinician stated. If none was stated, use "${NOT_DISCUSSED}" and icd10Code "".
6. differentialDiagnoses: you MAY suggest 1-3 clinically plausible possibilities for the reported symptoms, with ICD-10-CM codes. They are shown as unconfirmed AI suggestions.
7. plan: only medications, tests, instructions and follow-up the clinician stated. Otherwise empty arrays / "${NOT_DISCUSSED}".
8. clinicalRationale: one or two sentences that cite turn numbers, e.g. "Chest pain 9/10 (T2) ...".
9. evidence: for EVERY field that has real content (not "${NOT_DISCUSSED}", not empty), give the turn numbers that support it. Use these keys:
   subjective.chiefComplaint, subjective.historyOfPresentIllness, subjective.reviewOfSystems.<i>, subjective.allergies.<i>, subjective.currentMedications.<i>,
   objective.physicalExam.<i>, objective.diagnosticResults.<i>, assessment.primaryDiagnosis,
   plan.medicationsPrescribed.<i>, plan.diagnosticsOrdered.<i>, plan.patientInstructions, plan.followUp
   (<i> is the 0-based index in that list). If you cannot point to a turn, you must not write the content.

Output ONLY a valid JSON object, no markdown fences, no preamble:
{
  "chiefComplaint": "string",
  "historyOfPresentIllness": "string",
  "reviewOfSystems": ["string"],
  "physicalExam": ["string"],
  "diagnosticResults": ["string"],
  "allergies": ["string"],
  "currentMedications": ["string"],
  "primaryDiagnosis": "string",
  "icd10Code": "string",
  "differentialDiagnoses": [{ "diagnosis": "string", "icd10": "string" }],
  "clinicalRationale": "string",
  "plan": {
    "medicationsPrescribed": [{ "name": "string", "dosage": "string", "instructions": "string" }],
    "diagnosticsOrdered": ["string"],
    "patientInstructions": "string",
    "followUp": "string"
  },
  "evidence": { "subjective.chiefComplaint": [2] }
}`;

const cleanList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '' && !PLACEHOLDERS.has(v.trim())) : [];

const cleanText = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : NOT_DISCUSSED;

// Split the transcript into numbered turns. Lines after the structured-intake header are chart data.
function parseTurns(transcript: string): SourceTurn[] {
  const turns: SourceTurn[] = [];
  let inIntake = false;
  for (const raw of transcript.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('[Structured intake')) {
      inIntake = true;
      continue;
    }
    if (inIntake) {
      turns.push({ n: turns.length + 1, speaker: 'Chart', text: line });
    } else {
      const m = line.match(/^([^:]{1,30}):\s*(.*)$/);
      turns.push({ n: turns.length + 1, speaker: m ? m[1] : 'Unknown', text: m ? m[2] : line });
    }
  }
  return turns;
}

const STOPWORDS = new Set(['with', 'that', 'this', 'from', 'have', 'been', 'your', 'will', 'were', 'they', 'them', 'what', 'when', 'into', 'about', 'patient', 'reports', 'reported', 'states', 'stated', 'doctor', 'daily', 'every']);

// Significant words of an item, used to check that a cited turn really contains it
function keywords(text: string): string[] {
  return Array.from(new Set(
    text.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').split(/\s+/)
      .filter((w) => (w.length >= 4 || /\d/.test(w)) && !STOPWORDS.has(w))
  ));
}

function overlap(itemWords: string[], turnText: string): number {
  const t = turnText.toLowerCase();
  // Prefix match so "hives"/"hive" and "allergies"/"allergic" count
  return itemWords.filter((w) => t.includes(w.length > 5 ? w.slice(0, w.length - 2) : w)).length;
}

// Keep model citations that share words with the item; otherwise find the best matching turns ourselves
function verifyEvidence(itemText: string, claimed: number[] | undefined, turns: SourceTurn[]): number[] | undefined {
  const words = keywords(itemText);
  if (words.length === 0) return undefined;
  const byN = new Map(turns.map((t) => [t.n, t]));
  const kept = (claimed || []).filter((n) => byN.has(n) && overlap(words, byN.get(n)!.text) > 0);
  if (kept.length > 0) return kept;
  const scored = turns
    .map((t) => ({ n: t.n, score: overlap(words, t.text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.n - b.n);
  if (scored.length === 0) return undefined;
  const best = scored[0].score;
  return scored.filter((x) => x.score === best).slice(0, 2).map((x) => x.n).sort((a, b) => a - b);
}

// Backup for allergies the model misses: "allergic to X", "allergy to X", or chart line "Allergies: X, Y"
function findStatedAllergies(turns: SourceTurn[]): Array<{ text: string; n: number }> {
  const found: Array<{ text: string; n: number }> = [];
  for (const t of turns) {
    if (t.speaker === 'Doctor' || t.speaker === 'MediScribe AI') continue;
    const lower = t.text.toLowerCase();
    if (/\b(no|not|none|denies|without)\b[^.]*allerg/.test(lower)) continue;
    if (t.speaker === 'Chart' && lower.startsWith('allergies:')) {
      t.text.slice(10).split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => found.push({ text: x, n: t.n }));
      continue;
    }
    const m = t.text.match(/allerg(?:ic|y|ies)\s+(?:is\s+|are\s+)?(?:to\s+)?([a-zA-Z][a-zA-Z\s-]{2,40}?)(?:[.,;!]|\s+and\s+I|$)/i);
    if (m && m[1]) found.push({ text: m[1].trim(), n: t.n });
  }
  return found;
}

async function callLlmGateway(apiKey: string, model: string, userContent: string): Promise<AiSoapPayload> {
  const res = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      max_tokens: 2500
    })
  });

  if (!res.ok) {
    throw new Error(`LLM Gateway returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const raw: string = (data?.choices?.[0]?.message?.content || '').trim();
  // Tolerate fences or a sentence around the JSON object
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('LLM Gateway returned no JSON object');
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      transcript = '',
      patientName = 'Patient Intake',
      age = 0,
      gender = 'Unspecified',
      chiefComplaint = '',
      painScale = 0,
      medications = [],
      vitals = {}
    } = body;

    // Reject if no consultation dialogue was provided to prevent inventing clinical data
    if (!transcript || transcript.trim().length < 15) {
      return NextResponse.json(
        { error: 'No dialogue data provided. Cannot generate SOAP documentation without recorded consultation dialogue.' },
        { status: 400, headers: NO_STORE }
      );
    }

    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ASSEMBLYAI_API_KEY is not configured in server environment.' },
        { status: 500, headers: NO_STORE }
      );
    }

    const sanitizeVital = (val: string | undefined): string => {
      if (!val || val.includes('--')) {
        return 'Not recorded during encounter';
      }
      return val;
    };

    const recordedVitals = {
      'Blood Pressure': sanitizeVital(vitals['Blood Pressure']),
      'Heart Rate': sanitizeVital(vitals['Heart Rate']),
      'SpO2': sanitizeVital(vitals['SpO2']),
      'Respiratory Rate': sanitizeVital(vitals['Respiratory Rate']),
      'Temperature': sanitizeVital(vitals['Temperature'])
    };

    const turns = parseTurns(transcript);
    const numbered = turns.map((t) => `[T${t.n}] ${t.speaker}: ${t.text}`).join('\n');

    // Medications mentioned in the transcript, merged with the chart (case-insensitive)
    const extractedMeds = extractMedicalEntities(transcript)
      .filter((e) => e.category === 'medication')
      .map((e) => e.text);
    const seenMeds = new Set<string>();
    const combinedMeds: string[] = [...medications, ...extractedMeds].filter((m: string) => {
      const k = String(m).toLowerCase().trim();
      if (!k || seenMeds.has(k)) return false;
      seenMeds.add(k);
      return true;
    });

    const userContent = `Patient: ${patientName}, ${age > 0 ? `${age} years old` : 'age not stated'}, gender ${gender}.\n\nEncounter turns:\n${numbered}`;

    // One retry on the fallback model. No offline template: we never fabricate a note.
    let ai: AiSoapPayload | null = null;
    let usedModel = '';
    let lastError: unknown = null;
    for (let attempt = 0; attempt < SOAP_MODELS.length && !ai; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      try {
        ai = await callLlmGateway(apiKey, SOAP_MODELS[attempt], userContent);
        usedModel = SOAP_MODELS[attempt];
      } catch (err) {
        lastError = err;
        console.warn(`SOAP generation with ${SOAP_MODELS[attempt]} failed:`, err);
      }
    }

    if (!ai) {
      return NextResponse.json(
        {
          error: `SOAP synthesis unavailable (${lastError instanceof Error ? lastError.message : 'unknown error'}). No note was generated, to avoid documenting unverified data. Please retry.`
        },
        { status: 502, headers: NO_STORE }
      );
    }

    // Keep only evidence that points at real turns
    const evidence: Record<string, number[]> = {};
    for (const [path, refs] of Object.entries(ai.evidence || {})) {
      const valid = (Array.isArray(refs) ? refs : [refs])
        .map((r) => Number(String(r).replace(/^T/i, '')))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= turns.length);
      if (valid.length > 0) evidence[path] = Array.from(new Set(valid));
    }

    let allergies = cleanList(ai.allergies);
    if (allergies.length === 0) {
      findStatedAllergies(turns).forEach((al, i) => {
        allergies.push(al.text);
        evidence[`subjective.allergies.${i}`] = [al.n];
      });
    }

    // Chart medications used as a fallback are cited by searching the turns for the name
    let currentMedications = cleanList(ai.currentMedications);
    if (currentMedications.length === 0 && combinedMeds.length > 0) {
      currentMedications = combinedMeds;
      combinedMeds.forEach((med, i) => {
        const hits = turns.filter((t) => t.text.toLowerCase().includes(med.toLowerCase())).map((t) => t.n);
        if (hits.length > 0) evidence[`subjective.currentMedications.${i}`] = hits;
      });
    }

    const interactions = checkDrugInteractions(combinedMeds);
    const esi = calculateEsiScore(chiefComplaint || transcript, painScale, vitals);
    const noteId = `SOAP-${Date.now().toString().slice(-6)}`;
    const primaryDiagnosis = cleanText(ai.primaryDiagnosis);
    const icd10Code = primaryDiagnosis === NOT_DISCUSSED ? '' : (ai.icd10Code?.trim() || '');
    const nameParts = String(patientName).trim().split(/\s+/);
    const medsPrescribed = (Array.isArray(ai.plan?.medicationsPrescribed) ? ai.plan!.medicationsPrescribed! : [])
      .filter((m) => m && typeof m.name === 'string' && m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        dosage: PLACEHOLDERS.has(String(m.dosage || '').trim()) ? '' : String(m.dosage || '').trim(),
        instructions: PLACEHOLDERS.has(String(m.instructions || '').trim()) ? '' : String(m.instructions || '').trim()
      }));

    const safetyNote = interactions.length > 0
      ? ` Medication interaction alert: ${interactions.map((i) => `${i.drugA} + ${i.drugB} (${i.severity})`).join('; ')}.`
      : '';

    const soapNote: SoapNote = {
      id: noteId,
      patientName,
      encounterDate: new Date().toISOString().split('T')[0],
      provider: 'Unsigned draft - pending clinician review',
      model: usedModel,
      sourceTurns: turns,
      evidence,
      unsupported: [],
      signature: null,
      subjective: {
        chiefComplaint: cleanText(ai.chiefComplaint),
        historyOfPresentIllness: cleanText(ai.historyOfPresentIllness),
        reviewOfSystems: cleanList(ai.reviewOfSystems),
        allergies,
        currentMedications
      },
      objective: {
        vitalSigns: recordedVitals,
        physicalExam: cleanList(ai.physicalExam),
        diagnosticResults: cleanList(ai.diagnosticResults)
      },
      assessment: {
        primaryDiagnosis,
        icd10Code,
        differentialDiagnoses: Array.isArray(ai.differentialDiagnoses) ? ai.differentialDiagnoses : [],
        clinicalRationale: `${ai.clinicalRationale?.trim() || ''} Triage tier: ${esi.score}.${safetyNote}`.trim()
      },
      plan: {
        medicationsPrescribed: medsPrescribed,
        diagnosticsOrdered: cleanList(ai.plan?.diagnosticsOrdered),
        patientInstructions: cleanText(ai.plan?.patientInstructions),
        followUp: cleanText(ai.plan?.followUp)
      },
      fhirJson: {}
    };

    // Grounding check: every field with content must cite at least one turn
    const contentPaths: string[] = [];
    const addText = (path: string, v: string) => { if (!PLACEHOLDERS.has(v)) contentPaths.push(path); };
    const addList = (path: string, list: unknown[]) => list.forEach((_, i) => contentPaths.push(`${path}.${i}`));
    addText('subjective.chiefComplaint', soapNote.subjective.chiefComplaint);
    addText('subjective.historyOfPresentIllness', soapNote.subjective.historyOfPresentIllness);
    addList('subjective.reviewOfSystems', soapNote.subjective.reviewOfSystems);
    addList('subjective.allergies', soapNote.subjective.allergies);
    addList('subjective.currentMedications', soapNote.subjective.currentMedications);
    addList('objective.physicalExam', soapNote.objective.physicalExam);
    addList('objective.diagnosticResults', soapNote.objective.diagnosticResults || []);
    addText('assessment.primaryDiagnosis', soapNote.assessment.primaryDiagnosis);
    addList('plan.medicationsPrescribed', soapNote.plan.medicationsPrescribed);
    addList('plan.diagnosticsOrdered', soapNote.plan.diagnosticsOrdered);
    addText('plan.patientInstructions', soapNote.plan.patientInstructions);
    addText('plan.followUp', soapNote.plan.followUp);
    // Models often cite a whole list ("subjective.allergies") instead of each item: apply it to every item
    for (const p of contentPaths) {
      const listPath = p.replace(/\.\d+$/, '');
      if (!evidence[p] && listPath !== p && evidence[listPath]) evidence[p] = evidence[listPath];
    }

    // Verify every citation against the turn text, so a chip never points at an unrelated turn
    const textAt = (path: string): string => {
      const value = path.split('.').reduce<any>((obj, key) => (obj == null ? obj : obj[key]), soapNote);
      if (value && typeof value === 'object') return Object.values(value).join(' ');
      return String(value ?? '');
    };
    const verified: Record<string, number[]> = {};
    for (const p of contentPaths) {
      const refs = verifyEvidence(textAt(p), evidence[p], turns);
      if (refs) verified[p] = refs;
    }
    soapNote.evidence = verified;
    soapNote.unsupported = contentPaths.filter((p) => !verified[p]);
    soapNote.grounding = { total: contentPaths.length, sourced: contentPaths.length - soapNote.unsupported.length };

    soapNote.fhirJson = {
      resourceType: 'Bundle',
      type: 'document',
      timestamp: new Date().toISOString(),
      entry: [
        {
          resource: {
            resourceType: 'Composition',
            status: 'preliminary',
            type: { coding: [{ system: 'http://loinc.org', code: '11506-3', display: 'Progress note' }] },
            title: `SOAP note ${noteId}`,
            date: new Date().toISOString()
          }
        },
        {
          resource: {
            resourceType: 'Patient',
            id: `mediscribe-pat-${noteId.toLowerCase()}`,
            name: [{ family: nameParts.length > 1 ? nameParts.slice(1).join(' ') : '', given: [nameParts[0] || ''] }],
            gender: String(gender).toLowerCase()
          }
        },
        {
          resource: {
            resourceType: 'Encounter',
            status: 'in-progress',
            class: { code: 'EMER', display: 'Emergency Department' },
            priority: { text: esi.score }
          }
        },
        ...(icd10Code
          ? [{
              resource: {
                resourceType: 'Condition',
                verificationStatus: { coding: [{ code: 'provisional' }] },
                code: {
                  coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: icd10Code, display: primaryDiagnosis }]
                }
              }
            }]
          : [])
      ]
    };

    return NextResponse.json(soapNote, { headers: NO_STORE });
  } catch (error: any) {
    console.error('SOAP Note generation error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate SOAP note' },
      { status: 500, headers: NO_STORE }
    );
  }
}
