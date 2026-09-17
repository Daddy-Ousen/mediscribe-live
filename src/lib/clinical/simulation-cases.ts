import { DialogueTurn } from '@/types/clinical';

export interface SimulationCase {
  id: string;
  title: string;
  category: string;
  severityBadge: string;
  description: string;
  patientName: string;
  age: number;
  gender: string;
  vitals: Record<string, string>;
  medications: string[];
  dialogue: DialogueTurn[];
}

export const SIMULATION_CASES: SimulationCase[] = [
  {
    id: 'case-chest-pain',
    title: 'Acute Coronary Syndrome & Anticoagulant Conflict',
    category: 'Emergency Triage',
    severityBadge: 'ESI-2 Emergent',
    description: 'Patient presents with acute substernal chest pressure (9/10 pain) and reports taking both Warfarin and Aspirin.',
    patientName: 'Robert Vance',
    age: 64,
    gender: 'Male',
    vitals: {
      'Blood Pressure': '164/98 mmHg',
      'Heart Rate': '94 bpm',
      'SpO2': '96% on room air',
      'Pain Scale': '9 / 10 (Crushing)'
    },
    medications: ['Warfarin 5mg daily', 'Aspirin 81mg chewable', 'Atorvastatin 40mg'],
    dialogue: [
      {
        id: 'sim-1',
        speaker: 'Doctor',
        text: 'Hello Robert, I understand you came in with chest discomfort. When did this start and how does it feel?',
        timestamp: '14:02:10',
        isFinal: true,
        entities: [{ text: 'chest discomfort', category: 'symptom' }]
      },
      {
        id: 'sim-2',
        speaker: 'Patient',
        text: 'It started about an hour ago while walking up the stairs. It feels like a heavy weight pressing right in the center of my chest, radiating down my left arm. The pain is easily a 9 out of 10.',
        timestamp: '14:02:28',
        isFinal: true,
        entities: [
          { text: 'chest pain', category: 'symptom' },
          { text: 'radiating', category: 'symptom' }
        ]
      },
      {
        id: 'sim-3',
        speaker: 'Doctor',
        text: 'Any shortness of breath, diaphoresis, or nausea? And what medications are you taking at home?',
        timestamp: '14:02:45',
        isFinal: true,
        entities: [{ text: 'shortness of breath', category: 'symptom' }, { text: 'nausea', category: 'symptom' }]
      },
      {
        id: 'sim-4',
        speaker: 'Patient',
        text: 'A little breathless, yes. I take Warfarin for my atrial fibrillation, but when the pain hit I took an extra Aspirin 81mg because my brother said it stops heart attacks.',
        timestamp: '14:03:12',
        isFinal: true,
        entities: [
          { text: 'atrial fibrillation', category: 'diagnosis' },
          { text: 'warfarin', category: 'medication' },
          { text: 'aspirin', category: 'medication' },
          { text: '81mg', category: 'dosage' }
        ]
      },
      {
        id: 'sim-5',
        speaker: 'Doctor',
        text: 'Understood. We need to be very careful with combining Warfarin and Aspirin due to hemorrhage risk. We are ordering a stat 12-lead ECG, troponin panel, and starting telemetry.',
        timestamp: '14:03:35',
        isFinal: true,
        entities: [{ text: 'warfarin', category: 'medication' }, { text: 'aspirin', category: 'medication' }]
      }
    ]
  },
  {
    id: 'case-hypotension-risk',
    title: 'Severe Angina with Lethal Nitrate/PDE-5 Contraindication',
    category: 'Critical Pharmacology',
    severityBadge: 'Contraindicated Alert',
    description: 'Patient with ischemic heart disease requesting sublingual nitroglycerin who disclosed taking Sildenafil.',
    patientName: 'David Miller',
    age: 58,
    gender: 'Male',
    vitals: {
      'Blood Pressure': '138/84 mmHg',
      'Heart Rate': '82 bpm',
      'SpO2': '98%',
      'Pain Scale': '7 / 10'
    },
    medications: ['Sildenafil 50mg PRN', 'Nitroglycerin 0.4mg SL PRN', 'Metformin 500mg'],
    dialogue: [
      {
        id: 'sim-201',
        speaker: 'Doctor',
        text: 'David, before we administer sublingual nitroglycerin for your chest tightness, have you taken any medications for erectile dysfunction like Sildenafil or Tadalafil in the last 48 hours?',
        timestamp: '10:15:00',
        isFinal: true,
        entities: [{ text: 'nitroglycerin', category: 'medication' }, { text: 'sildenafil', category: 'medication' }]
      },
      {
        id: 'sim-202',
        speaker: 'Patient',
        text: 'Yes doctor, I took a 50 milligram Sildenafil tablet yesterday evening, about 16 hours ago.',
        timestamp: '10:15:18',
        isFinal: true,
        entities: [{ text: 'sildenafil', category: 'medication' }, { text: '50mg', category: 'dosage' }]
      },
      {
        id: 'sim-203',
        speaker: 'Doctor',
        text: 'I am glad you told me. Nitroglycerin is absolutely contraindicated within 24 to 48 hours of Sildenafil. Giving nitrates now could cause a catastrophic, fatal drop in your blood pressure. We will use non-nitrate anti-ischemics instead.',
        timestamp: '10:15:42',
        isFinal: true,
        entities: [{ text: 'nitroglycerin', category: 'medication' }, { text: 'sildenafil', category: 'medication' }]
      }
    ]
  },
  {
    id: 'case-hyperkalemia',
    title: 'Hypertensive Nephropathy & Hyperkalemia Alert',
    category: 'Cardio-Renal Precaution',
    severityBadge: 'Major Warning',
    description: 'Patient on Lisinopril presenting with palpitations after taking OTC potassium supplements.',
    patientName: 'Eleanor Vance',
    age: 71,
    gender: 'Female',
    vitals: {
      'Blood Pressure': '152/90 mmHg',
      'Heart Rate': '54 bpm (Bradycardic)',
      'SpO2': '97%',
      'Pain Scale': '3 / 10'
    },
    medications: ['Lisinopril 20mg daily', 'Potassium Chloride 20mEq', 'Hydrochlorothiazide 25mg'],
    dialogue: [
      {
        id: 'sim-301',
        speaker: 'Doctor',
        text: 'Eleanor, your heart rate is notably slow today at 54 beats per minute. What new supplements or changes have occurred?',
        timestamp: '11:20:00',
        isFinal: true,
        entities: [{ text: 'palpitations', category: 'symptom' }]
      },
      {
        id: 'sim-302',
        speaker: 'Patient',
        text: 'I started taking potassium supplements because of leg cramps, on top of my Lisinopril 20 milligrams.',
        timestamp: '11:20:19',
        isFinal: true,
        entities: [{ text: 'potassium', category: 'medication' }, { text: 'lisinopril', category: 'medication' }, { text: '20mg', category: 'dosage' }]
      },
      {
        id: 'sim-303',
        speaker: 'Doctor',
        text: 'Lisinopril already preserves potassium in your kidneys. Adding potassium pills can cause severe hyperkalemia and dangerous heart rhythms. We must stop the potassium right now and run a stat metabolic panel.',
        timestamp: '11:20:41',
        isFinal: true,
        entities: [{ text: 'lisinopril', category: 'medication' }, { text: 'potassium', category: 'medication' }]
      }
    ]
  }
];
