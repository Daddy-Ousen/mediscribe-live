'use client';

import React, { useState, useRef, useEffect } from 'react';
import { VoiceAgentClient } from '@/lib/assemblyai/voice-agent-client';
import { StreamingTranscriptionClient } from '@/lib/assemblyai/streaming-client';
import { AudioWaveform } from '@/components/AudioWaveform';
import { ToolCallBadge } from '@/components/ToolCallBadge';
import { SoapNoteViewer } from '@/components/SoapNoteViewer';
import { TriageCard } from '@/components/TriageCard';
import { DialogueTurn, ToolExecutionEvent, SoapNote, TriageSeverity, PatientEncounter } from '@/types/clinical';
import { checkDrugInteractions, calculateEsiScore } from '@/lib/clinical/drug-database';
import { extractVitalsFromText } from '@/lib/clinical/vitals-extractor';
import {
  Mic,
  MicOff,
  Radio,
  FileText,
  Pill,
  Terminal,
  Play,
  CheckCircle,
  ShieldAlert,
  User,
  UserPlus,
  UserMinus,
  ArrowRight,
  CheckCheck,
  Clock,
  Archive,
  BedDouble,
  RotateCcw,
  Sparkles,
  Layers
} from 'lucide-react';

const INITIAL_ENCOUNTERS: PatientEncounter[] = [
  {
    id: 'enc-101',
    mrn: 'MRN-48201',
    bed: 'BAY 1',
    patientName: 'Patient Intake #1',
    age: 0,
    gender: 'Pending',
    status: 'In Triage',
    chiefComplaint: 'Awaiting bedside voice triage intake',
    painScale: 0,
    esiScore: 'ESI-4 Less Urgent',
    patientMeds: [],
    patientVitals: {
      'Blood Pressure': '--/--',
      'Heart Rate': '-- bpm',
      'SpO2': '--%',
      'Temperature': '--°F',
      'Respiratory Rate': '--/min'
    },
    voiceDialogue: [],
    scribeDialogue: [],
    toolEvents: [],
    criticalAlert: null,
    soapNote: null,
    createdAt: '12:00:00'
  }
];

export default function MediScribeConsole() {
  // Patient Queue / Roster State
  const [encounters, setEncounters] = useState<PatientEncounter[]>(INITIAL_ENCOUNTERS);
  const [activePatientId, setActivePatientId] = useState<string>(INITIAL_ENCOUNTERS[0].id);
  const [shiftAlertMessage, setShiftAlertMessage] = useState<string | null>(null);

  // Active Encounter Helper
  const activeEncounter = encounters.find(e => e.id === activePatientId) || encounters[0];

  // Mode selection inside the live cockpit
  const [cockpitMode, setCockpitMode] = useState<'voice-agent' | 'ambient-scribe'>('voice-agent');

  // Voice Agent State
  const [voiceStatus, setVoiceStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'interrupted'>('disconnected');
  const [volume, setVolume] = useState<number>(0);

  // Ambient Scribe State
  const [scribeStatus, setScribeStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'transcribing'>('disconnected');

  // Clinical Summary State
  const [isGeneratingSoap, setIsGeneratingSoap] = useState(false);

  // Drug Checker standalone tool state
  const [drugA, setDrugA] = useState('Warfarin');
  const [drugB, setDrugB] = useState('Aspirin');
  const [drugResult, setDrugResult] = useState<any>(null);

  // Client references
  const voiceClientRef = useRef<VoiceAgentClient | null>(null);
  const scribeClientRef = useRef<StreamingTranscriptionClient | null>(null);
  const voiceFeedRef = useRef<HTMLDivElement | null>(null);
  const scribeFeedRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll ONLY internal feed boxes to the latest speech turn (prevents browser window from scrolling)
  useEffect(() => {
    if (cockpitMode === 'voice-agent' && voiceFeedRef.current) {
      voiceFeedRef.current.scrollTop = voiceFeedRef.current.scrollHeight;
    }
  }, [activeEncounter?.voiceDialogue, cockpitMode]);

  useEffect(() => {
    if (cockpitMode === 'ambient-scribe' && scribeFeedRef.current) {
      scribeFeedRef.current.scrollTop = scribeFeedRef.current.scrollHeight;
    }
  }, [activeEncounter?.scribeDialogue, cockpitMode]);

  useEffect(() => {
    return () => {
      voiceClientRef.current?.disconnect();
      scribeClientRef.current?.disconnect();
    };
  }, []);

  // Helper to update active encounter fields immutably
  const updateActiveEncounter = (updater: (prev: PatientEncounter) => PatientEncounter) => {
    setEncounters(prev => prev.map(enc => enc.id === activePatientId ? updater(enc) : enc));
  };

  // Switch Active Patient
  const handleSelectPatient = (patientId: string) => {
    if (patientId === activePatientId) return;
    if (voiceStatus !== 'disconnected') {
      voiceClientRef.current?.disconnect();
      setVoiceStatus('disconnected');
    }
    if (scribeStatus !== 'disconnected') {
      scribeClientRef.current?.disconnect();
      setScribeStatus('disconnected');
    }
    setActivePatientId(patientId);
  };

  // Complete Current Encounter and Advance to Next Patient
  const handleCompleteAndNextPatient = () => {
    if (voiceStatus !== 'disconnected') {
      voiceClientRef.current?.disconnect();
      setVoiceStatus('disconnected');
    }
    if (scribeStatus !== 'disconnected') {
      scribeClientRef.current?.disconnect();
      setScribeStatus('disconnected');
    }

    const currentName = activeEncounter.patientName;
    const completedTime = new Date().toLocaleTimeString();

    // Mark current completed
    setEncounters(prev => prev.map(enc => {
      if (enc.id === activePatientId) {
        return {
          ...enc,
          status: 'Completed',
          completedAt: completedTime
        };
      }
      return enc;
    }));

    // Find next non-completed patient
    const nextPatient = encounters.find(e => e.id !== activePatientId && e.status !== 'Completed');
    if (nextPatient) {
      setActivePatientId(nextPatient.id);
      setShiftAlertMessage(`Encounter for ${currentName} completed and archived. Advanced to next patient: ${nextPatient.patientName} (${nextPatient.bed}).`);
    } else {
      // Create new intake automatically if all are completed
      const newId = `enc-${Date.now().toString().slice(-6)}`;
      const newMrn = `MRN-${Math.floor(100000 + Math.random() * 900000)}`;
      const nextBedNum = encounters.length + 1;
      const newEncounter: PatientEncounter = {
        id: newId,
        mrn: newMrn,
        bed: `BAY ${nextBedNum}`,
        patientName: `Patient Intake #${nextBedNum}`,
        age: 0,
        gender: 'Pending',
        status: 'In Triage',
        chiefComplaint: 'Awaiting bedside voice triage intake',
        painScale: 0,
        esiScore: 'ESI-4 Less Urgent',
        patientMeds: [],
        patientVitals: {
          'Blood Pressure': '--/--',
          'Heart Rate': '-- bpm',
          'SpO2': '--%',
          'Temperature': '--°F',
          'Respiratory Rate': '--/min'
        },
        voiceDialogue: [],
        scribeDialogue: [],
        toolEvents: [],
        criticalAlert: null,
        soapNote: null,
        createdAt: new Date().toLocaleTimeString()
      };
      setEncounters(prev => [...prev, newEncounter]);
      setActivePatientId(newId);
      setShiftAlertMessage(`Created new triage intake for ${newEncounter.patientName} (${newEncounter.bed}).`);
    }

    setTimeout(() => setShiftAlertMessage(null), 6000);
  };

  // Add a Brand New Patient Intake (Fresh Slate)
  const handleNewPatientIntake = () => {
    if (voiceStatus !== 'disconnected') {
      voiceClientRef.current?.disconnect();
      setVoiceStatus('disconnected');
    }
    if (scribeStatus !== 'disconnected') {
      scribeClientRef.current?.disconnect();
      setScribeStatus('disconnected');
    }

    const newId = `enc-${Date.now().toString().slice(-6)}`;
    const newMrn = `MRN-${Math.floor(100000 + Math.random() * 900000)}`;
    const nextBedNum = encounters.length + 1;
    const newEncounter: PatientEncounter = {
      id: newId,
      mrn: newMrn,
      bed: `BAY ${nextBedNum}`,
      patientName: `Patient Intake #${nextBedNum}`,
      age: 0,
      gender: 'Pending',
      status: 'In Triage',
      chiefComplaint: 'Awaiting bedside voice triage intake',
      painScale: 0,
      esiScore: 'ESI-4 Less Urgent',
      patientMeds: [],
      patientVitals: {
        'Blood Pressure': '--/--',
        'Heart Rate': '-- bpm',
        'SpO2': '--%',
        'Temperature': '--°F',
        'Respiratory Rate': '--/min'
      },
      voiceDialogue: [],
      scribeDialogue: [],
      toolEvents: [],
      criticalAlert: null,
      soapNote: null,
      createdAt: new Date().toLocaleTimeString()
    };

    setEncounters(prev => [...prev, newEncounter]);
    setActivePatientId(newId);
    setShiftAlertMessage(`New patient encounter initialized (${newEncounter.bed}). All channels cleared for intake.`);
    setTimeout(() => setShiftAlertMessage(null), 5000);
  };

  // Discharge / Dismiss Encounter from Roster & Ledger
  const handleDismissPatient = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (encounters.length <= 1) {
      const resetId = `enc-${Date.now().toString().slice(-6)}`;
      const cleanEncounter: PatientEncounter = {
        id: resetId,
        mrn: `MRN-${Math.floor(100000 + Math.random() * 900000)}`,
        bed: 'BAY 1',
        patientName: 'Patient Intake #1',
        age: 0,
        gender: 'Pending',
        status: 'In Triage',
        chiefComplaint: 'Awaiting bedside voice triage intake',
        painScale: 0,
        esiScore: 'ESI-4 Less Urgent',
        patientMeds: [],
        patientVitals: {
          'Blood Pressure': '--/--',
          'Heart Rate': '-- bpm',
          'SpO2': '--%',
          'Temperature': '--°F',
          'Respiratory Rate': '--/min'
        },
        voiceDialogue: [],
        scribeDialogue: [],
        toolEvents: [],
        criticalAlert: null,
        soapNote: null,
        createdAt: new Date().toLocaleTimeString()
      };
      setEncounters([cleanEncounter]);
      setActivePatientId(resetId);
      setShiftAlertMessage('Patient queue reset to clean intake.');
      setTimeout(() => setShiftAlertMessage(null), 4000);
      return;
    }

    const remaining = encounters.filter(enc => enc.id !== id);
    setEncounters(remaining);
    if (activePatientId === id) {
      setActivePatientId(remaining[0].id);
    }
    setShiftAlertMessage('Patient encounter discharged from active queue.');
    setTimeout(() => setShiftAlertMessage(null), 4000);
  };

  // Helper to extract spoken patient names from voice transcription
  const extractSpokenPatientName = (text: string): string | null => {
    const patterns = [
      /(?:my name is|i am|i'm|name is|call me|this is)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
      /(?:patient name is|patient is)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i
    ];
    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const lower = candidate.toLowerCase();
        const forbidden = [
          'having', 'feeling', 'in', 'here', 'hurting', 'sick', 'not', 'fine', 'good',
          'experiencing', 'suffering', 'a', 'an', 'the', 'sorry', 'okay', 'ready', 'just',
          'waiting', 'severe', 'all', 'new', 'no', 'yes', 'going', 'doing', 'dying', 'chest', 'back', 'pain'
        ];
        const firstWord = lower.split(/\s+/)[0];
        if (!forbidden.includes(firstWord) && candidate.length >= 2) {
          return candidate
            .split(/\s+/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
        }
      }
    }
    return null;
  };

  // 1. Toggle Voice Agent (Bedside Triage)
  const handleToggleVoiceAgent = async () => {
    if (voiceStatus !== 'disconnected') {
      voiceClientRef.current?.disconnect();
      setVoiceStatus('disconnected');
      return;
    }

    try {
      voiceClientRef.current = new VoiceAgentClient({
        onStatusChange: (status) => setVoiceStatus(status as any),
        onVolumeChange: (vol) => setVolume(vol),
        onAutoClose: (reason) => {
          setVoiceStatus('disconnected');
          setShiftAlertMessage(reason || 'Patient intake concluded. Voice session confirmed and closed automatically.');
          setTimeout(() => setShiftAlertMessage(null), 6000);
        },
        onUserTranscript: (text, isFinal) => {
          updateActiveEncounter(prev => {
            const currentDialogue = [...prev.voiceDialogue];
            const last = currentDialogue[currentDialogue.length - 1];

            if (last && last.speaker === 'Patient' && !last.isFinal) {
              currentDialogue[currentDialogue.length - 1] = {
                ...last,
                text,
                isFinal,
                timestamp: new Date().toLocaleTimeString()
              };
            } else {
              currentDialogue.push({
                id: `patient-${Date.now()}`,
                speaker: 'Patient',
                text,
                timestamp: new Date().toLocaleTimeString(),
                isFinal
              });
            }

            let newPatientName = prev.patientName;
            let newAge = prev.age;
            let newChiefComplaint = prev.chiefComplaint;
            let newPainScale = prev.painScale;
            let newEsiScore = prev.esiScore;
            let newVitals = { ...prev.patientVitals };

            if (isFinal) {
              const lower = text.toLowerCase();
              if (lower.includes('chest pain') || lower.includes('pressure') || lower.includes('headache') || lower.includes('shortness of breath')) {
                newChiefComplaint = text;
              }
              const painMatch = text.match(/\b([1-9]|10)\b/);
              if (painMatch && (lower.includes('pain') || lower.includes('scale') || lower.includes('out of 10'))) {
                newPainScale = parseInt(painMatch[1]);
              }

              // Extract spoken patient name
              const extractedName = extractSpokenPatientName(text);
              if (extractedName && (prev.patientName.startsWith('Patient') || prev.patientName.startsWith('Walk-in') || prev.patientName !== extractedName)) {
                newPatientName = extractedName;
                setShiftAlertMessage(`Active demographics updated: Patient identified as ${extractedName}`);
              }

              // Extract spoken age if stated
              const ageMatch = text.match(/\b(?:i'm|i am|age is|aged?)\s*(\d{1,2})\b/i);
              if (ageMatch) {
                const parsedAge = parseInt(ageMatch[1], 10);
                if (parsedAge > 0 && parsedAge < 125) {
                  newAge = parsedAge;
                }
              }

              // Extract spoken vitals
              const vitalsResult = extractVitalsFromText(text, prev.patientVitals);
              if (vitalsResult.hasUpdates) {
                newVitals = vitalsResult.vitals;
                if (vitalsResult.painScale !== undefined) {
                  newPainScale = vitalsResult.painScale;
                }
                if (vitalsResult.detectedSummary) {
                  setShiftAlertMessage(`Voice telemetry captured: ${vitalsResult.detectedSummary}`);
                }
              }

              const calculated = calculateEsiScore(newChiefComplaint, newPainScale, newVitals);
              newEsiScore = calculated.score;
            }

            return {
              ...prev,
              patientName: newPatientName,
              age: newAge,
              voiceDialogue: currentDialogue,
              chiefComplaint: newChiefComplaint,
              painScale: newPainScale,
              patientVitals: newVitals,
              esiScore: newEsiScore
            };
          });
        },
        onAgentTranscript: (text) => {
          updateActiveEncounter(prev => {
            const currentDialogue = [...prev.voiceDialogue];
            const last = currentDialogue[currentDialogue.length - 1];

            if (last && last.speaker === 'MediScribe AI') {
              currentDialogue[currentDialogue.length - 1] = {
                ...last,
                text,
                timestamp: new Date().toLocaleTimeString()
              };
            } else {
              currentDialogue.push({
                id: `ai-${Date.now()}`,
                speaker: 'MediScribe AI',
                text,
                timestamp: new Date().toLocaleTimeString(),
                isFinal: true
              });
            }

            return {
              ...prev,
              voiceDialogue: currentDialogue
            };
          });
        },
        onToolCall: (event) => {
          updateActiveEncounter(prev => {
            const updatedEvents = [event, ...prev.toolEvents];
            let newAlert = prev.criticalAlert;
            let newPatientName = prev.patientName;
            let newAge = prev.age;
            let newChiefComplaint = prev.chiefComplaint;
            let newPainScale = prev.painScale;
            let newMeds = [...prev.patientMeds];
            let newStatus = prev.status;
            let newCompletedAt = prev.completedAt;

            if (event.toolName === 'set_patient_identity') {
              const confirmedName = event.parameters?.patient_name || event.result?.patient_name;
              if (confirmedName && typeof confirmedName === 'string') {
                newPatientName = confirmedName;
                setShiftAlertMessage(`Patient demographics verified by voice agent: ${confirmedName}`);
              }
              if (event.parameters?.age) {
                newAge = Number(event.parameters.age);
              }
            } else if (event.toolName === 'record_patient_intake') {
              if (event.parameters?.patient_name) {
                newPatientName = event.parameters.patient_name;
              }
              if (event.parameters?.chief_complaint) {
                newChiefComplaint = event.parameters.chief_complaint;
              }
              if (event.parameters?.pain_scale) {
                newPainScale = Number(event.parameters.pain_scale);
              }
              if (Array.isArray(event.parameters?.medications) && event.parameters.medications.length > 0) {
                newMeds = Array.from(new Set([...prev.patientMeds, ...event.parameters.medications]));
              }
            } else if (event.toolName === 'confirm_and_close_session') {
              setShiftAlertMessage(`Intake confirmed by clinical agent. Closing voice session automatically.`);
              newStatus = 'Completed';
              newCompletedAt = new Date().toLocaleTimeString();
            } else if (event.toolName === 'flag_critical_vital' || event.status === 'flagged') {
              newAlert = event.toolName === 'check_drug_interaction'
                ? 'Severe Medication Contraindication Detected: Immediate Clinical Action Required'
                : 'Priority Triage Flag: Acute Symptom Severity Escalation';
            }

            return {
              ...prev,
              patientName: newPatientName,
              age: newAge,
              chiefComplaint: newChiefComplaint,
              painScale: newPainScale,
              patientMeds: newMeds,
              status: newStatus,
              completedAt: newCompletedAt,
              toolEvents: updatedEvents,
              criticalAlert: newAlert
            };
          });
        },
        onError: (err) => {
          alert(`Voice Agent Session Error: ${err}`);
        }
      });

      await voiceClientRef.current.connect();
    } catch (e: any) {
      console.error('Failed to initialize voice agent:', e);
      alert(`Voice Agent Failure: ${e.message}`);
    }
  };

  // 2. Toggle Ambient Scribe
  const handleToggleScribe = async () => {
    if (scribeStatus !== 'disconnected') {
      scribeClientRef.current?.disconnect();
      setScribeStatus('disconnected');
      return;
    }

    try {
      scribeClientRef.current = new StreamingTranscriptionClient({
        onStatusChange: (status) => setScribeStatus(status as any),
        onVolumeChange: (vol) => setVolume(vol),
        onTurn: (turn) => {
          updateActiveEncounter(prev => {
            const currentDialogue = [...prev.scribeDialogue];
            const last = currentDialogue[currentDialogue.length - 1];

            if (last && last.speaker === turn.speaker && !last.isFinal) {
              currentDialogue[currentDialogue.length - 1] = turn;
            } else {
              currentDialogue.push(turn);
            }

            let newPatientName = prev.patientName;
            let newChiefComplaint = prev.chiefComplaint;
            let newMeds = [...prev.patientMeds];
            let newVitals = { ...prev.patientVitals };
            let newPainScale = prev.painScale;
            let newCriticalAlert = prev.criticalAlert;

            // Extract patient name if currently default intake label
            if (prev.patientName.startsWith('Patient Intake') || prev.patientName === 'Patient') {
              const nameMatch = turn.text.match(/(?:my name is|i am|i'm|name's|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
              if (nameMatch && nameMatch[1]) {
                newPatientName = nameMatch[1].trim();
                setShiftAlertMessage(`Patient demographics detected from dialogue: ${newPatientName}`);
              }
            }

            // Extract medication entities
            if (turn.entities && turn.entities.length > 0) {
              const detectedMeds = turn.entities
                .filter(e => e.category === 'medication')
                .map(e => e.text);
              if (detectedMeds.length > 0) {
                newMeds = Array.from(new Set([...newMeds, ...detectedMeds]));
              }
            }

            // Extract spoken vitals and telemetry (BP, HR, SpO2, RR, Temp, Pain)
            const vitalsResult = extractVitalsFromText(turn.text, prev.patientVitals);
            if (vitalsResult.hasUpdates) {
              newVitals = vitalsResult.vitals;
              if (vitalsResult.painScale !== undefined) {
                newPainScale = vitalsResult.painScale;
              }
              if (vitalsResult.detectedSummary) {
                setShiftAlertMessage(`Ambient telemetry captured: ${vitalsResult.detectedSummary}`);
              }
            }

            // Extract chief complaint from early patient utterances if empty
            if (!newChiefComplaint || newChiefComplaint === 'General Bedside Triage' || newChiefComplaint === 'Awaiting intake') {
              if (turn.speaker === 'Patient' && turn.text.trim().length > 15) {
                newChiefComplaint = turn.text.slice(0, 70);
              }
            }

            // Check if any critical vitals threshold exceeded (e.g. SBP >= 180, SpO2 < 90, HR > 130)
            const sysMatch = newVitals['Blood Pressure']?.match(/^(\d{2,3})\//);
            const spo2Num = parseInt(newVitals['SpO2']);
            const hrNum = parseInt(newVitals['Heart Rate']);

            if (sysMatch && parseInt(sysMatch[1]) >= 180) {
              newCriticalAlert = `Hypertensive Crisis Alert: Systolic Blood Pressure ${sysMatch[1]} mmHg`;
            } else if (!isNaN(spo2Num) && spo2Num < 90) {
              newCriticalAlert = `Critical Hypoxemia Alert: SpO2 ${spo2Num}%`;
            } else if (!isNaN(hrNum) && hrNum > 130) {
              newCriticalAlert = `Severe Tachycardia Alert: Heart Rate ${hrNum} bpm`;
            }

            // Recalculate ESI Triage Score dynamically with updated vitals and pain
            const newEsi = calculateEsiScore(newChiefComplaint, newPainScale, newVitals);

            return {
              ...prev,
              patientName: newPatientName,
              chiefComplaint: newChiefComplaint,
              painScale: newPainScale,
              patientMeds: newMeds,
              patientVitals: newVitals,
              esiScore: newEsi.score,
              criticalAlert: newCriticalAlert,
              scribeDialogue: currentDialogue
            };
          });
        },
        onError: (err) => {
          console.error('Streaming STT error:', err);
          setShiftAlertMessage(`Ambient Scribe: ${err}`);
        }
      });

      await scribeClientRef.current.connect();
    } catch (e: any) {
      console.error('Failed to initialize ambient scribe:', e);
      alert(`Streaming Failure: ${e.message}`);
    }
  };

  // 3. Generate SOAP Note for Active Patient
  const handleGenerateSoapNote = async () => {
    setIsGeneratingSoap(true);

    const sourceDialogue = cockpitMode === 'ambient-scribe'
      ? activeEncounter.scribeDialogue
      : activeEncounter.voiceDialogue;

    const combinedTranscript = sourceDialogue.map((d) => `${d.speaker}: ${d.text}`).join('\n');

    const clinicalFallback = `Patient: ${activeEncounter.patientName} (${activeEncounter.age}YO ${activeEncounter.gender})
Bed/Location: ${activeEncounter.bed} • MRN: ${activeEncounter.mrn}
Chief Complaint: ${activeEncounter.chiefComplaint}
Acuity Level: ${activeEncounter.esiScore}
Pain Score: ${activeEncounter.painScale}/10
Reconciled Medications: ${activeEncounter.patientMeds.join(', ') || 'None reported'}
Vitals:
${Object.entries(activeEncounter.patientVitals).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`;

    const effectiveTranscript = combinedTranscript.trim().length > 0
      ? combinedTranscript
      : clinicalFallback;

    try {
      const res = await fetch('/api/soap/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: effectiveTranscript,
          patientName: activeEncounter.patientName,
          age: activeEncounter.age,
          gender: activeEncounter.gender,
          chiefComplaint: activeEncounter.chiefComplaint,
          painScale: activeEncounter.painScale,
          medications: activeEncounter.patientMeds,
          vitals: activeEncounter.patientVitals
        })
      });

      if (!res.ok) throw new Error('Clinical synthesis request failed');
      const data = await res.json();

      updateActiveEncounter(prev => ({
        ...prev,
        soapNote: data
      }));

      // Smooth scroll to SOAP documentation section
      const soapElem = document.getElementById('soap');
      if (soapElem) {
        soapElem.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err: any) {
      console.error('SOAP Synthesis Error:', err);
      alert(`SOAP Compilation Failure: ${err.message}`);
    } finally {
      setIsGeneratingSoap(false);
    }
  };

  const handleCheckDrugs = () => {
    const res = checkDrugInteractions([drugA, drugB]);
    setDrugResult({
      checked: true,
      found: res.length > 0,
      interactions: res
    });
  };

  const isAnyLive = voiceStatus !== 'disconnected' || scribeStatus !== 'disconnected';
  const completedCount = encounters.filter(e => e.status === 'Completed').length;

  return (
    <div className="min-h-screen bg-obsidian text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* FLOATING GLASS NAVIGATION CAPSULE */}
      <nav className="sticky top-4 z-50 mx-auto max-w-fit px-4 sm:px-6 py-2.5 rounded-full bg-obsidian-400/90 backdrop-blur-md border border-console-border shadow-2xl flex items-center gap-3 sm:gap-6 text-xs font-mono transition-all">
        <a href="#hero" className="flex items-center gap-2 group">
          <div className="w-6 h-6 rounded-md bg-obsidian-500 border border-console-border flex items-center justify-center text-emerald-400 font-bold text-[10px] group-hover:border-emerald-500 transition-colors">
            MS
          </div>
          <span className="font-bold tracking-tight text-slate-100 text-xs sm:text-sm">
            MEDISCRIBE<span className="text-emerald-400">.LIVE</span>
          </span>
        </a>

        <div className="hidden md:flex items-center gap-5 text-[11px] text-slate-400">
          <a href="#roster" className="hover:text-emerald-400 transition-colors">Patient Queue ({encounters.length})</a>
          <a href="#cockpit" className="hover:text-emerald-400 transition-colors">Cockpit</a>
          <a href="#records" className="hover:text-emerald-400 transition-colors">Shift Ledger</a>
          <a href="#soap" className="hover:text-emerald-400 transition-colors">SOAP &amp; FHIR</a>
          <a href="#rxnorm" className="hover:text-emerald-400 transition-colors">Pharmacology</a>
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-console-border">
          <span className={`w-2 h-2 rounded-full ${isAnyLive ? 'bg-emerald-400 animate-ping' : 'bg-emerald-500/70'}`} />
          <span className="hidden sm:inline text-[10px] text-slate-400">
            {isAnyLive ? 'DSP ACTIVE' : `${encounters.length - completedCount} QUEUED`}
          </span>
          <a
            href="#cockpit"
            className="btn-hardware ml-1 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] rounded-full uppercase tracking-wider"
          >
            Console
          </a>
        </div>
      </nav>

      {/* ATTENTION: EDITORIAL HERO SECTION */}
      <section id="hero" className="pt-16 pb-16 sm:pt-24 sm:pb-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        {/* Editorial Sub-Kicker */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-obsidian-400 border border-console-border text-emerald-400 font-mono text-[11px] font-bold uppercase tracking-kicker mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>AssemblyAI Voice Agent API • Bedside Triage &amp; Shift EHR Management</span>
        </div>

        {/* H1 Headline with Inline Photographic Pill */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.08] max-w-5xl">
          Clinical bedside voice{' '}
          <span className="inline-flex items-center align-middle mx-1 sm:mx-2 w-16 sm:w-24 h-7 sm:h-10 rounded-full overflow-hidden border border-emerald-500/50 shadow-inner bg-slate-900">
            <img
              src="https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=300&q=80"
              alt="Clinical Telemetry Monitor"
              className="w-full h-full object-cover grayscale contrast-125 hover:grayscale-0 transition-all duration-700"
            />
          </span>{' '}
          triage engineered for zero latency.
        </h1>

        {/* Subtext under 20 words */}
        <p className="mt-6 text-sm sm:text-base text-slate-400 max-w-2xl leading-relaxed font-sans">
          Autonomous bedside triage copilot and ambient medical scribe with sub-600ms latency and real-time pharmacology safeguards.
        </p>

        {/* Tactile Action Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 font-mono text-xs">
          <a
            href="#cockpit"
            className="btn-hardware px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase tracking-wider rounded-lg shadow-lg shadow-emerald-500/20 flex items-center gap-2"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Launch Bedside Copilot</span>
          </a>
          <button
            onClick={handleNewPatientIntake}
            className="btn-hardware px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold uppercase tracking-wider rounded-lg flex items-center gap-2"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ New Patient Intake</span>
          </button>
          <a
            href="#records"
            className="btn-hardware px-6 py-3 bg-console-elevated hover:bg-console-highlight border border-console-border text-slate-200 uppercase tracking-wider rounded-lg flex items-center gap-2"
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span>Shift Records Ledger</span>
          </a>
        </div>

        {/* Monospace Hardware Telemetry Ticker Strip */}
        <div className="mt-12 w-full grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs text-left">
          <div className="p-3 bg-obsidian-400/80 border border-console-border rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase">WEBSOCKET TRANSPORT</div>
            <div className="text-slate-200 font-bold mt-0.5">wss://agents.assemblyai.com</div>
            <div className="text-[10px] text-emerald-400 mt-1">Single Full-Duplex Socket</div>
          </div>

          <div className="p-3 bg-obsidian-400/80 border border-console-border rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase">ROUNDTRIP LATENCY</div>
            <div className="text-slate-200 font-bold mt-0.5 num-data">&lt; 600ms Time-to-Speech</div>
            <div className="text-[10px] text-cyan-400 mt-1">Instant Barge-In Flush</div>
          </div>

          <div className="p-3 bg-obsidian-400/80 border border-console-border rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase">ACTIVE ENCOUNTERS</div>
            <div className="text-slate-200 font-bold mt-0.5 num-data">{encounters.length} Patients in Shift</div>
            <div className="text-[10px] text-amber-400 mt-1">{completedCount} Completed / Admitted</div>
          </div>

          <div className="p-3 bg-obsidian-400/80 border border-console-border rounded-lg">
            <div className="text-[10px] text-slate-500 uppercase">CLINICAL OUTPUT</div>
            <div className="text-slate-200 font-bold mt-0.5">HL7 FHIR v4 + ICD-10</div>
            <div className="text-[10px] text-slate-400 mt-1">Automated SOAP Synthesis</div>
          </div>
        </div>
      </section>

      {/* PATIENT ROSTER & TRIAGE QUEUE STRIP */}
      <section id="roster" className="border-y border-console-border bg-obsidian-400 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <BedDouble className="w-4 h-4 text-emerald-400" />
              <span className="font-mono text-xs uppercase font-bold tracking-wider text-slate-200">
                Department Triage Roster &amp; Queue Management
              </span>
              <span className="px-2 py-0.5 bg-obsidian-500 border border-console-border text-slate-400 font-mono text-[10px] rounded">
                SHIFT ROSTER
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleNewPatientIntake}
                className="btn-hardware px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-mono text-xs font-bold rounded flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ New Patient Intake</span>
              </button>
            </div>
          </div>

          {/* Patient Cards Carousel / Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {encounters.map((enc) => {
              const isActive = enc.id === activePatientId;
              const isCompleted = enc.status === 'Completed';

              return (
                <div
                  key={enc.id}
                  onClick={() => handleSelectPatient(enc.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer font-mono text-xs flex flex-col justify-between space-y-2.5 ${
                    isActive
                      ? 'bg-obsidian-500 border-emerald-500 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/50'
                      : 'bg-console-surface border-console-border hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : isCompleted ? 'bg-slate-500' : 'bg-amber-400'}`} />
                      <span className="font-bold text-slate-200">{enc.bed}</span>
                      <span className="text-[10px] text-slate-500">[{enc.mrn}]</span>
                    </div>
                    <span
                      className={`px-1.5 py-0.2 text-[9px] rounded font-bold uppercase ${
                        isCompleted
                          ? 'bg-slate-800 text-slate-400 border border-slate-700'
                          : enc.esiScore.includes('ESI-1')
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : enc.esiScore.includes('ESI-2')
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {enc.status === 'Completed' ? 'COMPLETED' : enc.esiScore.split(' ')[0]}
                    </span>
                  </div>

                  <div>
                    <div className="font-sans font-bold text-slate-100 text-sm">{enc.patientName}</div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5 font-sans">
                      {enc.chiefComplaint}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-console-border/60">
                    <span>
                      {enc.voiceDialogue.length + enc.scribeDialogue.length} TURNS
                    </span>
                    {enc.soapNote ? (
                      <span className="text-emerald-400 font-bold">[SOAP COMPILED]</span>
                    ) : (
                      <span className="text-slate-500">Pending Note</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {shiftAlertMessage && (
            <div className="mt-3 p-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded-lg text-xs text-emerald-300 font-mono flex items-center gap-2">
              <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{shiftAlertMessage}</span>
            </div>
          )}
        </div>
      </section>

      {/* DESIRE: INTERACTIVE BEDSIDE & AMBIENT COCKPIT */}
      <section id="cockpit" className="py-12 sm:py-20 border-t border-console-border bg-obsidian-300/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Active Patient Encounter Header Bar */}
          <div className="bg-obsidian-400 border border-console-border rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-obsidian-500 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-emerald-400 uppercase font-bold tracking-wider">
                    ACTIVE ENCOUNTER
                  </span>
                  <span className="px-1.5 py-0.2 bg-obsidian-500 border border-console-border text-slate-400 font-mono text-[10px] rounded">
                    {activeEncounter.bed} • {activeEncounter.mrn}
                  </span>
                  <span className="px-1.5 py-0.2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono text-[10px] rounded">
                    {activeEncounter.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span>{activeEncounter.patientName}</span>
                  <span className="text-xs text-slate-400 font-normal font-mono">
                    {activeEncounter.age > 0 ? `(${activeEncounter.age}YO ${activeEncounter.gender})` : '(Demographics Pending)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Encounter Flow Action Buttons */}
            <div className="flex items-center gap-2 font-mono text-xs">
              <button
                onClick={handleCompleteAndNextPatient}
                className="btn-hardware px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Complete Encounter &amp; Next Patient</span>
              </button>

              <button
                onClick={handleNewPatientIntake}
                className="btn-hardware px-3.5 py-2 bg-console-elevated hover:bg-console-highlight border border-console-border text-slate-300 font-semibold uppercase tracking-wider rounded-lg flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>New Intake</span>
              </button>

              <button
                onClick={() => handleDismissPatient(activeEncounter.id)}
                className="btn-hardware px-3 py-2 bg-obsidian-500 hover:bg-rose-950/60 hover:text-rose-400 border border-console-border text-slate-400 font-semibold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors"
                title="Discharge current encounter"
              >
                <UserMinus className="w-3.5 h-3.5" />
                <span>Discharge</span>
              </button>
            </div>
          </div>

          {/* Console Subheader with Mode Switcher */}
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
            <div>
              <div className="font-mono text-[11px] text-emerald-400 uppercase font-bold tracking-wider">
                CHAPTER 01 / OPERATIONAL COCKPIT
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-0.5">
                Bedside Clinical Console: {activeEncounter.patientName}
              </h2>
            </div>

            {/* Mode Switcher Pill */}
            <div className="bg-obsidian-500 p-1 rounded-lg border border-console-border flex items-center font-mono text-xs shrink-0 self-start md:self-auto">
              <button
                onClick={() => setCockpitMode('voice-agent')}
                className={`px-3.5 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  cockpitMode === 'voice-agent'
                    ? 'bg-emerald-500 text-slate-950 font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Mic className="w-3 h-3" />
                Bedside Voice Agent
              </button>
              <button
                onClick={() => setCockpitMode('ambient-scribe')}
                className={`px-3.5 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  cockpitMode === 'ambient-scribe'
                    ? 'bg-cyan-500 text-slate-950 font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3 h-3" />
                Ambient Scribe
              </button>
            </div>
          </div>

          {/* Cockpit Workspace: Asymmetric 65 / 35 Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Primary Operations Column (Cols 1-8) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Voice Agent Mode Panel */}
              {cockpitMode === 'voice-agent' && (
                <div className="bg-console-surface border border-console-border rounded-xl p-5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-console-border">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                          Autonomous Spoken Intake Protocol
                        </span>
                        <span className="px-1.5 py-0.2 bg-obsidian-500 border border-console-border text-emerald-400 font-mono text-[10px] rounded">
                          PCM 24,000 HZ
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-sans mt-0.5">
                        Interactive conversational intake for {activeEncounter.patientName}. Transcripts, vitals, and tool logs remain isolated to this patient.
                      </p>
                    </div>

                    <button
                      onClick={handleToggleVoiceAgent}
                      className={`btn-hardware px-4 py-2 rounded text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 ${
                        voiceStatus !== 'disconnected'
                          ? 'bg-red-500 hover:bg-red-600 text-white'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black'
                      }`}
                    >
                      {voiceStatus !== 'disconnected' ? (
                        <>
                          <MicOff className="w-3.5 h-3.5" /> Disconnect Session
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" /> Initialize Voice Triage
                        </>
                      )}
                    </button>
                  </div>

                  {/* Hardware VU Meter */}
                  <AudioWaveform status={voiceStatus} volume={volume} sampleRate={24000} />

                  {/* Live Dialogue Stream Feed */}
                  <div ref={voiceFeedRef} className="bg-obsidian-500 border border-console-border rounded-lg p-4 h-80 overflow-y-auto space-y-3 font-mono text-xs">
                    {activeEncounter.voiceDialogue.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                        <Terminal className="w-6 h-6 mb-2 text-slate-600" />
                        <p className="text-xs font-bold text-slate-400">Dialogue channel ready for {activeEncounter.patientName}.</p>
                        <p className="text-[11px] text-slate-600 mt-1 max-w-sm font-sans">
                          Click &quot;Initialize Voice Triage&quot; to begin live bedside microphone intake. Transcripts, clinical flags, and SOAP documentation attach cleanly to {activeEncounter.mrn}.
                        </p>
                      </div>
                    ) : (
                      activeEncounter.voiceDialogue.map((turn, i) => (
                        <div
                          key={turn.id || i}
                          className={`p-3 rounded border text-xs leading-relaxed ${
                            turn.speaker === 'MediScribe AI'
                              ? 'bg-obsidian-300 border-emerald-500/30 text-emerald-100 mr-4'
                              : 'bg-console-surface border-console-border text-slate-200 ml-4'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                            <span className={turn.speaker === 'MediScribe AI' ? 'text-emerald-400 font-bold' : 'text-slate-300 font-semibold'}>
                              {turn.speaker.toUpperCase()}
                            </span>
                            <span className="num-data">{turn.timestamp}</span>
                          </div>
                          <p className="font-sans text-xs text-slate-200">{turn.text}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Compile Action Bar */}
                  <div className="flex flex-wrap items-center justify-between pt-2 border-t border-console-border gap-2 text-xs">
                    <span className="text-slate-500 font-mono text-[11px]">
                      {activeEncounter.patientName} &bull; {activeEncounter.voiceDialogue.length} speech turns recorded
                    </span>
                    <button
                      onClick={handleGenerateSoapNote}
                      disabled={isGeneratingSoap}
                      className="btn-hardware px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-xs font-bold rounded uppercase tracking-wider disabled:opacity-40"
                    >
                      {isGeneratingSoap ? 'Compiling SOAP...' : 'Compile SOAP Documentation'}
                    </button>
                  </div>
                </div>
              )}

              {/* Ambient Scribe Mode Panel */}
              {cockpitMode === 'ambient-scribe' && (
                <div className="bg-console-surface border border-console-border rounded-xl p-5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-console-border">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                          Realtime Ambient Consultation Scribe
                        </span>
                        <span className="px-1.5 py-0.2 bg-obsidian-500 border border-console-border text-cyan-400 font-mono text-[10px] rounded">
                          PCM 16,000 HZ • medical-v1
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-sans mt-0.5">
                        Continuous doctor-patient transcription with medical domain acoustic tuning for {activeEncounter.patientName}.
                      </p>
                    </div>

                    <button
                      onClick={handleToggleScribe}
                      className={`btn-hardware px-4 py-2 rounded text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 ${
                        scribeStatus !== 'disconnected'
                          ? 'bg-red-500 hover:bg-red-600 text-white'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black'
                      }`}
                    >
                      {scribeStatus !== 'disconnected' ? (
                        <>
                          <MicOff className="w-3.5 h-3.5" /> Stop Ambient Scribe
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" /> Start Ambient Scribe
                        </>
                      )}
                    </button>
                  </div>

                  <AudioWaveform status={scribeStatus} volume={volume} sampleRate={16000} />

                  {/* Scribing Feed */}
                  <div ref={scribeFeedRef} className="bg-obsidian-500 border border-console-border rounded-lg p-4 h-80 overflow-y-auto space-y-3 font-mono text-xs">
                    {activeEncounter.scribeDialogue.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                        <Radio className="w-6 h-6 mb-2 text-slate-600" />
                        <p className="text-xs font-bold text-slate-400">Ambient audio feed ready for {activeEncounter.patientName}.</p>
                        <p className="text-[11px] text-slate-600 mt-1 max-w-sm font-sans">
                          Click &quot;Start Ambient Scribe&quot; to capture consultation speech with doctor/patient diarization.
                        </p>
                      </div>
                    ) : (
                      activeEncounter.scribeDialogue.map((turn, i) => (
                        <div
                          key={turn.id || i}
                          className={`p-3 rounded border text-xs leading-relaxed ${
                            turn.speaker === 'Doctor'
                              ? 'bg-obsidian-300 border-console-border text-slate-200 mr-6'
                              : 'bg-cyan-950/30 border-cyan-700/40 text-cyan-100 ml-6'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                            <span className={turn.speaker === 'Doctor' ? 'text-teal-400 font-bold' : 'text-cyan-300 font-bold'}>
                              {turn.speaker.toUpperCase()}
                            </span>
                            <span className="num-data">{turn.timestamp}</span>
                          </div>
                          <p className="font-sans text-xs text-slate-300">{turn.text}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Compile Action Bar */}
                  <div className="flex flex-wrap items-center justify-between pt-2 border-t border-console-border gap-2 text-xs">
                    <span className="text-slate-500 font-mono text-[11px]">
                      {activeEncounter.patientName} &bull; {activeEncounter.scribeDialogue.length} consultation turns recorded
                    </span>
                    <button
                      onClick={handleGenerateSoapNote}
                      disabled={isGeneratingSoap}
                      className="btn-hardware px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-xs font-bold rounded uppercase tracking-wider disabled:opacity-40"
                    >
                      {isGeneratingSoap ? 'Compiling SOAP...' : 'Compile SOAP Documentation'}
                    </button>
                  </div>
                </div>
              )}

              {/* Clinical Event Audit Ledger for Active Patient */}
              <div className="bg-console-surface border border-console-border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-console-border pb-3">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-bold text-slate-100 uppercase tracking-wider">
                      Clinical Event Audit Ledger &bull; {activeEncounter.patientName}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 num-data">
                    {activeEncounter.toolEvents.length} DISPATCHED
                  </span>
                </div>

                {activeEncounter.toolEvents.length === 0 ? (
                  <div className="p-4 rounded bg-obsidian-500 border border-console-border/60 text-xs font-mono text-slate-500 text-center">
                    Audited tool invocations for {activeEncounter.patientName} (<code className="text-slate-300">check_drug_interaction</code>, <code className="text-slate-300">flag_critical_vital</code>) will render here in real time.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeEncounter.toolEvents.map((evt) => (
                      <ToolCallBadge key={evt.id} toolEvent={evt} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Decision Support Column (Cols 9-12) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Triage Stratification Card */}
              <TriageCard
                esi={activeEncounter.esiScore}
                chiefComplaint={activeEncounter.chiefComplaint}
                painScale={activeEncounter.painScale}
                vitals={activeEncounter.patientVitals}
                criticalAlert={activeEncounter.criticalAlert}
              />

              {/* Active Patient Chart Card */}
              <div className="bg-console-surface border border-console-border rounded-xl p-5 font-mono text-xs space-y-3">
                <div className="flex items-center justify-between border-b border-console-border pb-3">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Active Chart Dossier</span>
                  <span className="text-slate-100 font-bold">{activeEncounter.patientName}</span>
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                    Reconciled Home Medications
                  </div>
                  {activeEncounter.patientMeds.length === 0 ? (
                    <div className="p-2 bg-obsidian-500 border border-console-border rounded text-[11px] text-slate-500 italic">
                      No home medications recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {activeEncounter.patientMeds.map((med, idx) => (
                        <div key={idx} className="p-2 bg-obsidian-500 border border-console-border rounded flex items-center justify-between text-[11px]">
                          <span className="text-slate-300">{med}</span>
                          <span className="text-[9px] text-emerald-400 font-semibold">RX-ACTIVE</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-console-border text-[10px] text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>RECORD IDENTIFIER:</span>
                    <span className="text-slate-300">{activeEncounter.mrn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>UNIT / LOCATION:</span>
                    <span className="text-slate-300">{activeEncounter.bed} &bull; TRAUMA TELEMETRY</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ENCOUNTER TIME:</span>
                    <span className="text-slate-300">{activeEncounter.createdAt}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ENCOUNTER RECORDS & SHIFT AUDIT LEDGER */}
      <section id="records" className="py-16 sm:py-24 border-t border-console-border bg-obsidian-400/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] text-emerald-400 uppercase font-bold tracking-wider">
                SHIFT RECORDS &bull; AUDIT ARCHIVE
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
                Patient Encounter Archive &amp; Shift Ledger
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl font-sans">
                Comprehensive patient record ledger tracking triage acuity, clinical flags, dialogue history, and FHIR progress documentation across the clinical shift.
              </p>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-slate-400">Total Encounters: <strong className="text-slate-100">{encounters.length}</strong></span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400">Completed: <strong>{completedCount}</strong></span>
            </div>
          </div>

          <div className="bg-console-surface border border-console-border rounded-xl overflow-hidden font-mono text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-console-border bg-obsidian-500/80 text-[10px] text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">MRN / ID</th>
                    <th className="p-3.5">PATIENT &amp; DEMOGRAPHICS</th>
                    <th className="p-3.5">BED</th>
                    <th className="p-3.5">TRIAGE SEVERITY</th>
                    <th className="p-3.5">STATUS</th>
                    <th className="p-3.5">FLAGS &amp; CONFLICTS</th>
                    <th className="p-3.5">DOCUMENTATION</th>
                    <th className="p-3.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-console-border">
                  {encounters.map((enc) => {
                    const isSelected = enc.id === activePatientId;
                    const hasAlert = enc.criticalAlert !== null;

                    return (
                      <tr
                        key={enc.id}
                        className={`hover:bg-obsidian-500/60 transition-colors ${
                          isSelected ? 'bg-emerald-500/5' : ''
                        }`}
                      >
                        <td className="p-3.5 font-bold text-slate-200">
                          <div>{enc.mrn}</div>
                          <div className="text-[10px] text-slate-500">{enc.id}</div>
                        </td>
                        <td className="p-3.5 font-sans">
                          <div className="font-bold text-slate-100">{enc.patientName}</div>
                          <div className="text-[11px] text-slate-400 truncate max-w-xs">{enc.chiefComplaint}</div>
                        </td>
                        <td className="p-3.5 font-bold text-slate-200">{enc.bed}</td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              enc.esiScore.includes('ESI-1')
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : enc.esiScore.includes('ESI-2')
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {enc.esiScore}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              enc.status === 'Completed'
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {enc.status}
                          </span>
                        </td>
                        <td className="p-3.5">
                          {hasAlert ? (
                            <span className="text-red-400 flex items-center gap-1 text-[11px]">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Hazard Logged</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">None</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {enc.soapNote ? (
                            <span className="text-emerald-400 font-bold text-[11px]">SOAP READY</span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Pending</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                handleSelectPatient(enc.id);
                                const cp = document.getElementById('cockpit');
                                if (cp) cp.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className={`btn-hardware px-3 py-1 rounded text-[11px] font-bold uppercase tracking-wider ${
                                isSelected
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'bg-obsidian-500 hover:bg-console-highlight border border-console-border text-slate-300'
                              }`}
                            >
                              {isSelected ? 'Active' : 'Open'}
                            </button>
                            <button
                              onClick={(e) => handleDismissPatient(enc.id, e)}
                              title="Discharge encounter from queue"
                              className="btn-hardware p-1.5 bg-obsidian-500 hover:bg-rose-950/60 hover:text-rose-400 border border-console-border text-slate-500 rounded transition-colors"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* INTEREST: GAPLESS BENTO GRID (ARCHITECTURE & PHARMACOLOGY) */}
      <section id="bento" className="py-20 sm:py-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <div className="font-mono text-[11px] text-emerald-400 uppercase font-bold tracking-wider">
            CHAPTER 02 / SYSTEM ARCHITECTURE
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
            Engineered for High-Acuity Triage
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl font-sans">
            Sub-second conversational intelligence anchored by clinical pharmacology rules and medical domain models.
          </p>
        </div>

        {/* Dense Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Tile 1: Surgical Photography / Zero-Latency Barge-in (Span 2 cols on lg) */}
          <div className="lg:col-span-2 relative rounded-2xl overflow-hidden border border-console-border bg-obsidian-400 min-h-[340px] flex flex-col justify-between p-6 sm:p-8">
            <img
              src="https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80"
              alt="Clinical Operating Environment"
              className="absolute inset-0 w-full h-full object-cover grayscale contrast-125 opacity-20 mix-blend-luminosity pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian-500 via-obsidian-500/80 to-transparent pointer-events-none" />

            <div className="relative z-10 space-y-2">
              <span className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono text-[10px] uppercase font-bold tracking-wider">
                Full Duplex Barge-In Engine
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Instant Audio Interruption Handling
              </h3>
            </div>

            <div className="relative z-10 pt-6 space-y-4">
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed font-sans">
                When a clinician or patient speaks mid-sentence, MediScribe detects the barge-in signal via WebSocket <code className="text-emerald-400 font-mono">reply.done.status === &quot;interrupted&quot;</code> and instantly flushes the Web Audio API buffer at 24kHz.
              </p>

              <div className="grid grid-cols-3 gap-3 font-mono text-xs pt-2">
                <div className="p-2.5 bg-obsidian-500/90 border border-console-border rounded">
                  <div className="text-[10px] text-slate-500">BUFFER FLUSH</div>
                  <div className="text-slate-100 font-bold num-data">0.00s LAG</div>
                </div>
                <div className="p-2.5 bg-obsidian-500/90 border border-console-border rounded">
                  <div className="text-[10px] text-slate-500">SAMPLE FORMAT</div>
                  <div className="text-slate-100 font-bold">24kHz PCM16</div>
                </div>
                <div className="p-2.5 bg-obsidian-500/90 border border-console-border rounded">
                  <div className="text-[10px] text-slate-500">VAD SENSITIVITY</div>
                  <div className="text-emerald-400 font-bold">DYNAMIC</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tile 2: ESI Triage Stratification Protocol */}
          <div className="rounded-2xl border border-console-border bg-console-surface p-6 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Clinical Stratification
                </span>
                <ShieldAlert className="w-4 h-4 text-amber-400" />
              </div>
              <h3 className="text-base font-bold text-white">5-Tier ESI Stratification</h3>
              <p className="text-xs text-slate-400 mt-1 font-sans leading-relaxed">
                Autonomous algorithm calculates Emergency Severity Index (ESI 1 through 5) evaluating vital stability and projected resource utilization.
              </p>
            </div>

            <div className="space-y-2 font-mono text-[11px]">
              <div className="p-2 rounded bg-red-950/30 border border-red-500/40 flex justify-between items-center text-red-300">
                <span className="font-bold">ESI-1 RESUSCITATION</span>
                <span>Immediate</span>
              </div>
              <div className="p-2 rounded bg-amber-950/30 border border-amber-500/40 flex justify-between items-center text-amber-300">
                <span className="font-bold">ESI-2 EMERGENT</span>
                <span>High Risk / Pain &gt;= 8</span>
              </div>
              <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/40 flex justify-between items-center text-emerald-300">
                <span className="font-bold">ESI-3 URGENT</span>
                <span>2+ Resources</span>
              </div>
            </div>
          </div>

          {/* Tile 3: Live Interactive RxNorm Sandbox (Span 2 cols on lg) */}
          <div id="rxnorm" className="lg:col-span-2 rounded-2xl border border-console-border bg-console-surface p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between border-b border-console-border pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                  Clinical Pharmacology Engine
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">RxNorm Drug Contraindication Inspector</h3>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  The identical rule engine dispatched autonomously by the Voice Agent during conversational intake.
                </p>
              </div>
              <Pill className="w-5 h-5 text-emerald-400" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Medication Alpha</label>
                <input
                  type="text"
                  value={drugA}
                  onChange={(e) => setDrugA(e.target.value)}
                  className="w-full px-3 py-2 bg-obsidian-500 border border-console-border rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Medication Beta</label>
                <input
                  type="text"
                  value={drugB}
                  onChange={(e) => setDrugB(e.target.value)}
                  className="w-full px-3 py-2 bg-obsidian-500 border border-console-border rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 font-mono">
              <span className="text-[10px] text-slate-500 py-1">PRESET PAIRS:</span>
              {[
                ['Warfarin', 'Aspirin'],
                ['Sildenafil', 'Nitroglycerin'],
                ['Lisinopril', 'Potassium'],
                ['Clopidogrel', 'Omeprazole']
              ].map(([a, b], idx) => (
                <button
                  key={idx}
                  onClick={() => { setDrugA(a); setDrugB(b); }}
                  className="btn-hardware px-2 py-1 bg-obsidian-500 hover:bg-console-highlight border border-console-border text-slate-300 text-[10px] rounded"
                >
                  {a} + {b}
                </button>
              ))}
            </div>

            <button
              onClick={handleCheckDrugs}
              className="btn-hardware w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg font-mono"
            >
              Inspect Interaction Hazard
            </button>

            {drugResult && drugResult.checked && (
              <div className="pt-2 border-t border-console-border">
                {drugResult.found ? (
                  <div className="space-y-2 font-mono text-xs">
                    {drugResult.interactions.map((it: any, i: number) => (
                      <div key={i} className="p-3 bg-red-950/30 border border-red-500/40 rounded-lg space-y-1.5 text-red-200">
                        <div className="flex items-center justify-between font-bold text-red-400">
                          <span>{it.severity}</span>
                          <span>{it.drugA} + {it.drugB}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed font-sans text-red-300/90">{it.mechanism}</p>
                        <div className="text-[10px] text-red-400 pt-1 border-t border-red-500/20">
                          DIRECTIVE: {it.clinicalRecommendation}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-obsidian-500 border border-emerald-500/40 rounded-lg flex items-center gap-2 text-emerald-400 font-mono text-xs">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>No major contraindications identified between {drugA} and {drugB}.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tile 4: Medical-v1 Diarization & Nomenclature */}
          <div className="rounded-2xl border border-console-border bg-console-surface p-6 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
                  Acoustic Architecture
                </span>
                <Radio className="w-4 h-4 text-cyan-400" />
              </div>
              <h3 className="text-base font-bold text-white">medical-v1 Domain Diarization</h3>
              <p className="text-xs text-slate-400 mt-1 font-sans leading-relaxed">
                Universal-3.5 Pro handles complex pharmaceutical nomenclature, anatomical terminology, and clinician vs patient speaker attribution natively.
              </p>
            </div>

            <div className="p-3 bg-obsidian-500 border border-console-border rounded-lg font-mono text-[11px] space-y-2 text-slate-400">
              <div className="flex items-center justify-between text-slate-300">
                <span>SPEAKER LABELS:</span>
                <span className="text-cyan-400">Doctor • Patient</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>TERMINOLOGY:</span>
                <span className="text-emerald-400">RxNorm Verified</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>LATENCY PROFILE:</span>
                <span className="text-slate-200">Sub-Second Stream</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ACTION: CLINICAL SOAP DOCUMENTATION & FHIR V4 */}
      <section id="soap" className="py-20 sm:py-28 border-t border-console-border max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] text-emerald-400 uppercase font-bold tracking-wider">
              CHAPTER 03 / CLINICAL OUTPUT
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
              Automated SOAP Synthesis &amp; HL7 FHIR v4: {activeEncounter.patientName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl font-sans">
              Transforming unstructured spoken dialogue into structured clinical progress notes with ICD-10 codification and HL7 FHIR Bundle interoperability. Each note is tied directly to {activeEncounter.mrn}.
            </p>
          </div>

          <button
            onClick={handleGenerateSoapNote}
            disabled={isGeneratingSoap}
            className="btn-hardware px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider rounded-lg flex items-center gap-2 self-start md:self-auto disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isGeneratingSoap ? 'Synthesizing...' : `Compile SOAP for ${activeEncounter.patientName}`}</span>
          </button>
        </div>

        <SoapNoteViewer
          soapNote={activeEncounter.soapNote}
          onGenerateNew={handleGenerateSoapNote}
          isLoading={isGeneratingSoap}
        />
      </section>

      {/* HARDWARE TELEMETRY FOOTER */}
      <footer className="border-t border-console-border bg-obsidian-400 py-6 text-xs font-mono text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300 font-bold">MEDISCRIBE LIVE</span>
            <span className="text-slate-600">|</span>
            <span>ASSEMBLYAI VOICE AGENT HACKATHON</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            <span>Universal-3.5 Pro</span>
            <span>•</span>
            <span>domain: medical-v1</span>
            <span>•</span>
            <span>HL7 FHIR v4</span>
            <span>•</span>
            <span>Multi-Patient Triage Queue</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
