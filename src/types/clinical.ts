export type TriageSeverity = 'ESI-1 Resuscitation' | 'ESI-2 Emergent' | 'ESI-3 Urgent' | 'ESI-4 Less Urgent' | 'ESI-5 Non-Urgent';

export interface VitalSign {
  name: string;
  value: string;
  unit: string;
  status: 'normal' | 'elevated' | 'critical';
  threshold?: string;
}

export interface DrugInteraction {
  drugA: string;
  drugB: string;
  severity: 'Contraindicated / Critical' | 'Major Warning' | 'Moderate Precaution' | 'Minor';
  mechanism: string;
  clinicalRecommendation: string;
}

export interface PatientIntake {
  patientId: string;
  patientName: string;
  age: number;
  gender: string;
  chiefComplaint: string;
  onset: string;
  painScale: number; // 0-10
  allergies: string[];
  medications: string[];
  symptoms: string[];
  vitals: VitalSign[];
  interactions: DrugInteraction[];
  esiScore: TriageSeverity;
  triageNotes: string;
  timestamp: string;
}

export interface ClinicalEntity {
  text: string;
  category: 'symptom' | 'medication' | 'dosage' | 'diagnosis' | 'vital' | 'procedure';
  confidence?: number;
}

export interface DialogueTurn {
  id: string;
  speaker: 'Doctor' | 'Patient' | 'MediScribe AI';
  text: string;
  timestamp: string;
  isFinal: boolean;
  entities?: ClinicalEntity[];
}

export interface SoapNote {
  id: string;
  patientName: string;
  encounterDate: string;
  provider: string;
  subjective: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
    reviewOfSystems: string[];
    allergies: string[];
    currentMedications: string[];
  };
  objective: {
    vitalSigns: Record<string, string>;
    physicalExam: string[];
    diagnosticResults?: string[];
  };
  assessment: {
    primaryDiagnosis: string;
    icd10Code: string;
    differentialDiagnoses: Array<{ diagnosis: string; icd10: string }>;
    clinicalRationale: string;
  };
  plan: {
    medicationsPrescribed: Array<{ name: string; dosage: string; instructions: string }>;
    diagnosticsOrdered: string[];
    patientInstructions: string;
    followUp: string;
  };
  fhirJson: Record<string, any>;
}

export interface ToolExecutionEvent {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  result: any;
  timestamp: string;
  status: 'calling' | 'completed' | 'flagged';
}

export interface PatientEncounter {
  id: string;
  mrn: string;
  bed: string;
  patientName: string;
  age: number;
  gender: string;
  status: 'In Triage' | 'Completed' | 'Admitted' | 'Awaiting Provider';
  chiefComplaint: string;
  painScale: number;
  esiScore: TriageSeverity;
  patientMeds: string[];
  patientVitals: Record<string, string>;
  voiceDialogue: DialogueTurn[];
  scribeDialogue: DialogueTurn[];
  toolEvents: ToolExecutionEvent[];
  criticalAlert: string | null;
  soapNote: SoapNote | null;
  createdAt: string;
  completedAt?: string;
}
