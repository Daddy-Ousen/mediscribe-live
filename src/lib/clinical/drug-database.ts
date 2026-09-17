import { DrugInteraction, TriageSeverity, VitalSign } from '@/types/clinical';

export interface KnownInteractionRule {
  pair: [string, string];
  severity: 'Contraindicated / Critical' | 'Major Warning' | 'Moderate Precaution' | 'Minor';
  mechanism: string;
  recommendation: string;
}

export const KNOWN_DRUG_INTERACTIONS: KnownInteractionRule[] = [
  {
    pair: ['warfarin', 'aspirin'],
    severity: 'Contraindicated / Critical',
    mechanism: 'Additive antithrombotic and antiplatelet effects exponentially amplify catastrophic gastrointestinal and intracranial hemorrhage risk.',
    recommendation: 'Avoid concurrent use unless strictly supervised for prosthetic heart valve; monitor INR closely and initiate proton-pump inhibitor (PPI) gastroprotection.'
  },
  {
    pair: ['sildenafil', 'nitroglycerin'],
    severity: 'Contraindicated / Critical',
    mechanism: 'Profound potentiation of cGMP-mediated vasodilation causing severe, potentially fatal refractory systemic hypotension.',
    recommendation: 'ABSOLUTE CONTRAINDICATION. Do not administer nitrates within 24-48 hours of PDE-5 inhibitor use.'
  },
  {
    pair: ['lisinopril', 'potassium'],
    severity: 'Major Warning',
    mechanism: 'Inhibition of aldosterone by ACE inhibitor decreases renal potassium excretion; supplemental potassium leads to life-threatening hyperkalemia and cardiac arrhythmia.',
    recommendation: 'Discontinue oral potassium supplements, obtain urgent serum chemistry panel and 12-lead ECG.'
  },
  {
    pair: ['clopidogrel', 'omeprazole'],
    severity: 'Major Warning',
    mechanism: 'Omeprazole competitively inhibits CYP2C19, significantly reducing biotransformation of clopidogrel to its active antiplatelet metabolite.',
    recommendation: 'Switch gastroprotection to pantoprazole or famotidine to preserve antiplatelet efficacy.'
  },
  {
    pair: ['metformin', 'contrast'],
    severity: 'Major Warning',
    mechanism: 'Intravenous iodinated radiocontrast may cause acute renal impairment leading to severe toxic accumulation of metformin and lactic acidosis.',
    recommendation: 'Withhold metformin at time of imaging and for 48 hours post-procedure; recheck eGFR prior to restarting.'
  },
  {
    pair: ['atorvastatin', 'clarithromycin'],
    severity: 'Major Warning',
    mechanism: 'Strong CYP3A4 inhibition by clarithromycin increases statin plasma concentrations by over 400%, precipitating rhabdomyolysis and acute renal failure.',
    recommendation: 'Temporarily pause atorvastatin therapy during macrolide antibiotic course.'
  },
  {
    pair: ['tramadol', 'sertraline'],
    severity: 'Major Warning',
    mechanism: 'Synergistic central serotonergic augmentation precipitating life-threatening Serotonin Syndrome (hyperthermia, clonus, autonomic instability).',
    recommendation: 'Avoid co-prescription. Consider alternative non-serotonergic analgesic or monitor for autonomic symptoms.'
  },
  {
    pair: ['ciprofloxacin', 'theophylline'],
    severity: 'Moderate Precaution',
    mechanism: 'CYP1A2 inhibition decreases theophylline hepatic clearance by up to 50%, risking theophylline neurotoxicity and seizures.',
    recommendation: 'Reduce theophylline dose by 50% and track serum levels.'
  },
  {
    pair: ['ibuprofen', 'methotrexate'],
    severity: 'Major Warning',
    mechanism: 'NSAIDs diminish renal blood flow and inhibit tubular secretion of methotrexate, producing bone marrow suppression and pancytopenia.',
    recommendation: 'Avoid high-dose NSAIDs; use acetaminophen or monitor hematologic counts closely.'
  },
  {
    pair: ['digoxin', 'amiodarone'],
    severity: 'Major Warning',
    mechanism: 'Amiodarone inhibits P-glycoprotein transport, doubling serum digoxin levels and precipitating digitalis toxicity (AV block, ventricular tachycardia).',
    recommendation: 'Reduce digoxin maintenance dose by 50% immediately upon initiating amiodarone.'
  }
];

export function checkDrugInteractions(medications: string[]): DrugInteraction[] {
  const normalizedMeds = medications.map(m => m.toLowerCase().trim());
  const found: DrugInteraction[] = [];

  for (let i = 0; i < normalizedMeds.length; i++) {
    for (let j = i + 1; j < normalizedMeds.length; j++) {
      const medA = normalizedMeds[i];
      const medB = normalizedMeds[j];

      for (const rule of KNOWN_DRUG_INTERACTIONS) {
        const matchesForward = medA.includes(rule.pair[0]) && medB.includes(rule.pair[1]);
        const matchesReverse = medA.includes(rule.pair[1]) && medB.includes(rule.pair[0]);

        if (matchesForward || matchesReverse) {
          found.push({
            drugA: medications[i],
            drugB: medications[j],
            severity: rule.severity,
            mechanism: rule.mechanism,
            clinicalRecommendation: rule.recommendation
          });
        }
      }
    }
  }

  return found;
}

export function calculateEsiScore(complaint: string, painScale: number, vitals: Record<string, string>): { score: TriageSeverity; rationale: string } {
  const lower = complaint.toLowerCase();

  // ESI-1: Immediate life-saving intervention needed
  if (lower.includes('unresponsive') || lower.includes('arrest') || lower.includes('anaphylaxis') || lower.includes('severe distress')) {
    return {
      score: 'ESI-1 Resuscitation',
      rationale: 'Immediate physician evaluation and resuscitation required.'
    };
  }

  // ESI-2: High risk situation, confused/lethargic/disoriented, severe pain
  if (
    lower.includes('chest pain') ||
    lower.includes('stroke') ||
    lower.includes('shortness of breath') ||
    lower.includes('hemorrhage') ||
    painScale >= 8
  ) {
    return {
      score: 'ESI-2 Emergent',
      rationale: painScale >= 8
        ? 'Severe acute pain scale rating (≥8/10) with systemic symptoms.'
        : 'High-risk clinical presentation concerning for acute coronary syndrome, pulmonary embolism, or vascular compromise.'
    };
  }

  // ESI-3: Needs 2 or more resources (labs, imaging, IV fluids)
  if (painScale >= 5 || lower.includes('fracture') || lower.includes('fever') || lower.includes('abdominal pain')) {
    return {
      score: 'ESI-3 Urgent',
      rationale: 'Patient requires multiple diagnostic resources (lab panels, imaging, IV medications).'
    };
  }

  // ESI-4: Single resource needed
  if (painScale >= 2 || lower.includes('laceration') || lower.includes('sore throat')) {
    return {
      score: 'ESI-4 Less Urgent',
      rationale: 'Patient anticipated to require one diagnostic resource or outpatient procedure.'
    };
  }

  return {
    score: 'ESI-5 Non-Urgent',
    rationale: 'Patient requires no acute hospital resources; appropriate for routine evaluation.'
  };
}

export function extractMedicalEntities(text: string): Array<{ text: string; category: 'symptom' | 'medication' | 'dosage' | 'diagnosis' | 'vital' }> {
  const entities: Array<{ text: string; category: 'symptom' | 'medication' | 'dosage' | 'diagnosis' | 'vital' }> = [];

  const symptoms = ['chest pain', 'shortness of breath', 'dyspnea', 'dizziness', 'palpitations', 'nausea', 'vomiting', 'fever', 'chills', 'swelling', 'edema', 'headache', 'fatigue', 'cough', 'syncope'];
  const medications = ['warfarin', 'aspirin', 'lisinopril', 'metformin', 'sildenafil', 'nitroglycerin', 'clopidogrel', 'omeprazole', 'atorvastatin', 'amiodarone', 'digoxin', 'tramadol', 'sertraline', 'ibuprofen', 'heparin', 'furosemide'];
  const dosages = ['81mg', '100mg', '10mg', '5mg', '20mg', '500mg', '850mg', '1000mg', '2.5mg', 'daily', 'bid', 'tid', 'prn', 'sublingual'];
  const diagnoses = ['myocardial infarction', 'angina', 'hypertension', 'atrial fibrillation', 'type 2 diabetes', 'hyperlipidemia', 'chf', 'asthma', 'copd', 'pneumonia'];

  const lower = text.toLowerCase();

  for (const s of symptoms) {
    if (lower.includes(s)) entities.push({ text: s, category: 'symptom' });
  }
  for (const m of medications) {
    if (lower.includes(m)) entities.push({ text: m, category: 'medication' });
  }
  for (const d of dosages) {
    if (lower.includes(d)) entities.push({ text: d, category: 'dosage' });
  }
  for (const dx of diagnoses) {
    if (lower.includes(dx)) entities.push({ text: dx, category: 'diagnosis' });
  }

  return entities;
}
