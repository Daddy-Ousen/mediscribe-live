'use client';

import React, { useState } from 'react';
import { SoapNote } from '@/types/clinical';
import { FileText, Copy, Check, Code2, Clipboard, ArrowUpRight, AlertCircle } from 'lucide-react';

interface SoapNoteViewerProps {
  soapNote: SoapNote | null;
  onGenerateNew?: () => void;
  isLoading?: boolean;
  warning?: string | null;
}

export const SoapNoteViewer: React.FC<SoapNoteViewerProps> = ({
  soapNote,
  onGenerateNew,
  isLoading = false,
  warning = null
}) => {
  const [copied, setCopied] = useState(false);
  const [showFhir, setShowFhir] = useState(false);

  if (!soapNote) {
    return (
      <div className="bg-console-surface border border-console-border rounded-xl p-8 sm:p-12 text-center font-mono">
        <div className="w-12 h-12 mx-auto rounded-lg bg-obsidian-500 border border-console-border flex items-center justify-center text-slate-400 mb-4">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">No Clinical Note Compiled</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-6 font-sans leading-relaxed">
          Record a bedside intake or ambient consultation session. MediScribe compiles standardized SOAP documentation with verified ICD-10 diagnostic coding and HL7 FHIR v4 serialization.
        </p>

        {warning && (
          <div className="mb-6 max-w-lg mx-auto p-3.5 bg-amber-950/40 border border-amber-500/50 rounded-lg text-xs text-amber-200 flex items-start gap-2.5 text-left">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="font-sans leading-relaxed">
              <span className="font-bold font-mono uppercase text-amber-300 block mb-0.5">
                Documentation Prerequisite Missing
              </span>
              {warning}
            </div>
          </div>
        )}

        {onGenerateNew && (
          <button
            onClick={onGenerateNew}
            disabled={isLoading}
            className="btn-hardware px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg uppercase tracking-wider disabled:opacity-50"
          >
            {isLoading ? 'Compiling Documentation...' : 'Compile SOAP Note'}
          </button>
        )}
      </div>
    );
  }

  const handleCopy = () => {
    const text = `
HOSPITAL CLINICAL PROGRESS NOTE: SOAP FORMAT
ENCOUNTER: ${soapNote.id} | DATE: ${soapNote.encounterDate}
PROVIDER: ${soapNote.provider}
PATIENT: ${soapNote.patientName}

I. SUBJECTIVE
- Chief Complaint: ${soapNote.subjective.chiefComplaint}
- History of Present Illness: ${soapNote.subjective.historyOfPresentIllness}
- Reported Allergies: ${soapNote.subjective.allergies.join(', ')}
- Reconciled Medications: ${soapNote.subjective.currentMedications.join(', ')}

II. OBJECTIVE
- Physiological Telemetry:
${Object.entries(soapNote.objective.vitalSigns).map(([k, v]) => `  * ${k}: ${v}`).join('\n')}
- Physical Examination:
${soapNote.objective.physicalExam.map(p => `  * ${p}`).join('\n')}

III. ASSESSMENT
- Primary Diagnosis: ${soapNote.assessment.primaryDiagnosis} [ICD-10: ${soapNote.assessment.icd10Code}]
- Differential Diagnoses: ${soapNote.assessment.differentialDiagnoses.map(d => `${d.diagnosis} (${d.icd10})`).join(', ')}
- Clinical Rationale: ${soapNote.assessment.clinicalRationale}

IV. PLAN & DISPOSITION
- Prescribed Therapeutics:
${soapNote.plan.medicationsPrescribed.map(m => `  * ${m.name} ${m.dosage}: ${m.instructions}`).join('\n')}
- Diagnostic Orders: ${soapNote.plan.diagnosticsOrdered.join('; ')}
- Nursing Directives: ${soapNote.plan.patientInstructions}
- Re-evaluation: ${soapNote.plan.followUp}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-console-surface border border-console-border rounded-xl font-mono text-xs overflow-hidden">
      {/* Document Header Bar */}
      <div className="p-4 bg-obsidian-400 border-b border-console-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-console-surface border border-console-border text-emerald-400">
            <Clipboard className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 text-sm tracking-tight">{soapNote.patientName}</span>
              <span className="px-2 py-0.5 bg-obsidian-500 border border-console-border text-slate-400 text-[10px] rounded num-data">
                {soapNote.id}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              <span>{soapNote.encounterDate}</span> • <span>{soapNote.provider}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFhir(!showFhir)}
            className="btn-hardware px-3 py-1.5 bg-console-surface hover:bg-console-elevated border border-console-border text-slate-300 text-xs rounded flex items-center gap-1.5"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>{showFhir ? 'Close FHIR' : 'HL7 FHIR v4'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="btn-hardware px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Documentation'}</span>
          </button>
        </div>
      </div>

      {/* FHIR v4 Code Inspector */}
      {showFhir && (
        <div className="p-4 bg-obsidian-500 border-b border-console-border">
          <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 mb-2 border-b border-console-border">
            <span className="text-emerald-400 font-semibold">FHIR BUNDLE RESOURCE (application/fhir+json)</span>
            <span>SPECIFICATION: HL7 R4 4.0.1</span>
          </div>
          <pre className="p-3 bg-obsidian- DEFAULT rounded border border-console-border text-[11px] text-emerald-300/90 overflow-x-auto max-h-64 num-data">
            {JSON.stringify(soapNote.fhirJson, null, 2)}
          </pre>
        </div>
      )}

      {/* Clinical Sections */}
      <div className="p-6 space-y-6 font-sans">
        {/* S - Subjective */}
        <div className="border-l-2 border-emerald-500 pl-4 space-y-2">
          <div className="font-mono text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
            I. Subjective
          </div>
          <div className="text-xs text-slate-300 space-y-1.5 leading-relaxed">
            <div>
              <strong className="text-slate-100 font-semibold">Chief Complaint: </strong>
              {soapNote.subjective.chiefComplaint}
            </div>
            <div>
              <strong className="text-slate-100 font-semibold">History of Present Illness (HPI): </strong>
              {soapNote.subjective.historyOfPresentIllness}
            </div>
            <div className="pt-2 font-mono text-[11px] grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-400">
              <div>
                <span className="text-slate-500 block mb-1">ALLERGIES RECORDED:</span>
                <span className="text-red-300 bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded">
                  {soapNote.subjective.allergies.join(', ')}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">RECONCILED MEDICATIONS:</span>
                <span className="text-slate-200">
                  {soapNote.subjective.currentMedications.join(' • ')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* O - Objective */}
        <div className="border-l-2 border-cyan-500 pl-4 space-y-2">
          <div className="font-mono text-[11px] font-bold tracking-wider text-cyan-400 uppercase">
            II. Objective Findings
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
            {Object.entries(soapNote.objective.vitalSigns).map(([k, v], idx) => (
              <div key={idx} className="p-2 bg-obsidian-500 border border-console-border rounded">
                <span className="text-[10px] text-slate-500 block">{k}</span>
                <span className="font-bold text-slate-200 num-data">{v}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-300 pt-2 space-y-1">
            <span className="text-slate-400 font-mono text-[11px] block">PHYSICAL EXAMINATION:</span>
            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
              {soapNote.objective.physicalExam.map((pe, idx) => (
                <li key={idx}>{pe}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* A - Assessment */}
        <div className="border-l-2 border-amber-500 pl-4 space-y-2">
          <div className="font-mono text-[11px] font-bold tracking-wider text-amber-400 uppercase">
            III. Assessment & Diagnostic Reasoning
          </div>
          <div className="p-3 bg-obsidian-500 border border-console-border rounded-lg text-xs space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-slate-100">{soapNote.assessment.primaryDiagnosis}</span>
              <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[11px] font-bold rounded">
                ICD-10-CM: {soapNote.assessment.icd10Code}
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              {soapNote.assessment.clinicalRationale}
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono flex flex-wrap gap-2 pt-1">
            <span className="text-slate-500">DIFFERENTIAL:</span>
            {soapNote.assessment.differentialDiagnoses.map((diff, i) => (
              <span key={i} className="text-slate-300">
                {diff.diagnosis} [{diff.icd10}]
              </span>
            ))}
          </div>
        </div>

        {/* P - Plan */}
        <div className="border-l-2 border-emerald-500 pl-4 space-y-2">
          <div className="font-mono text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
            IV. Plan & Order Directives
          </div>
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {soapNote.plan.medicationsPrescribed.map((med, idx) => (
                <div key={idx} className="p-2.5 bg-obsidian-500 border border-console-border rounded">
                  <div className="font-bold text-slate-100">{med.name} ({med.dosage})</div>
                  <div className="text-slate-400 text-[11px]">{med.instructions}</div>
                </div>
              ))}
            </div>
            <div className="text-slate-400 pt-1">
              <span className="font-mono text-[11px] text-slate-500 block">DIAGNOSTIC ORDERS:</span>
              <span className="text-slate-200">{soapNote.plan.diagnosticsOrdered.join(' • ')}</span>
            </div>
            <div className="p-2.5 bg-obsidian-500 border border-console-border rounded text-[11px] text-slate-300">
              <span className="font-mono text-slate-400 font-semibold block mb-0.5">PATIENT & NURSING DIRECTIVES:</span>
              {soapNote.plan.patientInstructions}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
