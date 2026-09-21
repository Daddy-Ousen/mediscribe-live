import { NextResponse } from 'next/server';
import { SoapNote } from '@/types/clinical';
import { checkDrugInteractions, calculateEsiScore, extractMedicalEntities } from '@/lib/clinical/drug-database';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
};

// Shown when the dialogue does not contain the information. Never replaced with a guessed value.
const NOT_DISCUSSED = 'Not discussed during encounter';

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
}

const SYSTEM_PROMPT = `You are a clinical documentation scribe. You turn a recorded encounter into a SOAP note draft for a clinician to review and sign.
CRITICAL CLINICAL INTEGRITY RULES:
1. Document ONLY what is explicitly stated in the transcript or structured intake data. Do not infer, extrapolate, or add typical findings.
2. If something was not discussed, use exactly "${NOT_DISCUSSED}" (for strings) or an empty array (for lists). This applies to allergies: never write "NKDA" unless the patient said they have no allergies.
3. Physical exam and diagnostic results: only findings a clinician stated aloud. Otherwise empty array.
4. Vitals: never invent values. They are handled outside this note.
5. primaryDiagnosis: only a diagnosis or impression the clinician stated. If none was stated, use "${NOT_DISCUSSED}" and icd10Code "".
6. differentialDiagnoses: you MAY suggest 1-3 possibilities that fit the reported symptoms. These are shown to the clinician as unconfirmed AI suggestions.
7. plan: only medications, tests, instructions and follow-up the clinician stated. Otherwise empty arrays / "${NOT_DISCUSSED}".
8. clinicalRationale: one or two sentences citing which reported statements support the suggestions.
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
  }
}`;

const listOr = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) && value.length > 0 ? value.filter((v) => typeof v === 'string' && v.trim()) : fallback;

async function callLlmGateway(apiKey: string, userContent: string): Promise<AiSoapPayload> {
  const res = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5-4b-32k-fast',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      max_tokens: 1200
    })
  });

  if (!res.ok) {
    throw new Error(`LLM Gateway returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  let raw: string = (data?.choices?.[0]?.message?.content || '').trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM Gateway returned a non-object response');
  }
  return parsed;
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

    // Medications mentioned in the transcript, merged with the chart
    const extractedMeds = extractMedicalEntities(transcript)
      .filter((e) => e.category === 'medication')
      .map((e) => e.text);
    const combinedMeds: string[] = Array.from(new Set([...medications, ...extractedMeds]));

    const userContent = `Patient: ${patientName}, ${age > 0 ? `${age} years old` : 'age not stated'}, gender ${gender}. Chart chief complaint: ${chiefComplaint || NOT_DISCUSSED}. Chart medications: ${combinedMeds.join(', ') || 'none recorded'}.\n\nTranscript:\n${transcript}`;

    // One retry: small models sometimes return malformed JSON. No offline fallback: we never fabricate a note.
    let ai: AiSoapPayload | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2 && !ai; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      try {
        ai = await callLlmGateway(apiKey, userContent);
      } catch (err) {
        lastError = err;
        console.warn(`SOAP generation attempt ${attempt + 1} failed:`, err);
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

    const interactions = checkDrugInteractions(combinedMeds);
    const esi = calculateEsiScore(chiefComplaint || transcript, painScale, vitals);
    const noteId = `SOAP-${Date.now().toString().slice(-6)}`;
    const primaryDiagnosis = ai.primaryDiagnosis?.trim() || NOT_DISCUSSED;
    const icd10Code = primaryDiagnosis === NOT_DISCUSSED ? '' : (ai.icd10Code?.trim() || '');
    const nameParts = String(patientName).trim().split(/\s+/);

    const safetyNote = interactions.length > 0
      ? ` Medication interaction alert: ${interactions.map((i) => `${i.drugA} + ${i.drugB} (${i.severity})`).join('; ')}.`
      : '';

    const soapNote: SoapNote = {
      id: noteId,
      patientName,
      encounterDate: new Date().toISOString().split('T')[0],
      provider: 'Unsigned draft - pending clinician review',
      subjective: {
        chiefComplaint: ai.chiefComplaint?.trim() || chiefComplaint || NOT_DISCUSSED,
        historyOfPresentIllness: ai.historyOfPresentIllness?.trim() || NOT_DISCUSSED,
        reviewOfSystems: listOr(ai.reviewOfSystems, [NOT_DISCUSSED]),
        allergies: listOr(ai.allergies, [NOT_DISCUSSED]),
        currentMedications: listOr(ai.currentMedications, combinedMeds.length > 0 ? combinedMeds : [NOT_DISCUSSED])
      },
      objective: {
        vitalSigns: recordedVitals,
        physicalExam: listOr(ai.physicalExam, ['No physical exam findings stated in dialogue']),
        diagnosticResults: listOr(ai.diagnosticResults, ['No diagnostic results stated in dialogue'])
      },
      assessment: {
        primaryDiagnosis,
        icd10Code,
        differentialDiagnoses: Array.isArray(ai.differentialDiagnoses) ? ai.differentialDiagnoses : [],
        clinicalRationale: `${ai.clinicalRationale?.trim() || ''} Triage tier: ${esi.score}.${safetyNote}`.trim()
      },
      plan: {
        medicationsPrescribed: Array.isArray(ai.plan?.medicationsPrescribed) ? ai.plan!.medicationsPrescribed! : [],
        diagnosticsOrdered: Array.isArray(ai.plan?.diagnosticsOrdered) ? ai.plan!.diagnosticsOrdered! : [],
        patientInstructions: ai.plan?.patientInstructions?.trim() || NOT_DISCUSSED,
        followUp: ai.plan?.followUp?.trim() || NOT_DISCUSSED
      },
      fhirJson: {
        resourceType: 'Bundle',
        type: 'document',
        timestamp: new Date().toISOString(),
        entry: [
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
      }
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
