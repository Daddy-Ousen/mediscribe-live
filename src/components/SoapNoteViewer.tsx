'use client';

import React, { useState } from 'react';
import { SoapNote } from '@/types/clinical';
import { FileText, Copy, Check, Code2, Clipboard, AlertCircle, ShieldCheck, PenLine, Quote, X } from 'lucide-react';

interface SoapNoteViewerProps {
  soapNote: SoapNote | null;
  onGenerateNew?: () => void;
  onSign?: (clinicianName: string) => void;
  isLoading?: boolean;
  warning?: string | null;
}

const NOT_DISCUSSED = 'Not discussed during encounter';

export const SoapNoteViewer: React.FC<SoapNoteViewerProps> = ({
  soapNote,
  onGenerateNew,
  onSign,
  isLoading = false,
  warning = null
}) => {
  const [copied, setCopied] = useState(false);
  const [showFhir, setShowFhir] = useState(false);
  const [activeRefs, setActiveRefs] = useState<number[] | null>(null);
  const [signerName, setSignerName] = useState('');
  const [reviewedUnsourced, setReviewedUnsourced] = useState(false);

  if (!soapNote) {
    return (
      <div className="bg-console-surface border border-console-border rounded-xl p-8 sm:p-12 text-center font-mono">
        <div className="w-12 h-12 mx-auto rounded-lg bg-obsidian-500 border border-console-border flex items-center justify-center text-slate-400 mb-4">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">No Clinical Note Compiled</h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mt-2 mb-6 font-sans leading-relaxed">
          Record a bedside intake or ambient consultation. MediScribe drafts a SOAP note from what was actually said, links every line to its source turn, and waits for clinician sign-off.
        </p>

        {warning && (
          <div className="mb-6 max-w-lg mx-auto p-3.5 bg-amber-950/40 border border-amber-500/50 rounded-lg text-sm text-amber-200 flex items-start gap-2.5 text-left">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="font-sans leading-relaxed">
              <span className="font-bold font-mono uppercase text-amber-300 block mb-0.5 text-xs">
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

  const evidence = soapNote.evidence || {};
  const unsupported = new Set(soapNote.unsupported || []);
  const turns = soapNote.sourceTurns || [];
  const isSigned = Boolean(soapNote.signature);
  const grounding = soapNote.grounding || { total: 0, sourced: 0 };

  // Source chips shown after each documented item
  const Src = ({ path }: { path: string }) => {
    const refs = evidence[path];
    if (refs && refs.length > 0) {
      return (
        <span className="inline-flex flex-wrap gap-1 ml-1.5 align-middle">
          {refs.map((n) => (
            <button
              key={n}
              onClick={() => setActiveRefs(refs)}
              className="px-1.5 py-0 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-mono text-[11px] hover:bg-emerald-500/25"
              title="Show source quote"
            >
              T{n}
            </button>
          ))}
        </span>
      );
    }
    if (unsupported.has(path)) {
      return (
        <span className="ml-1.5 align-middle px-1.5 rounded border border-amber-500/50 bg-amber-500/10 text-amber-300 font-mono text-[11px]">
          NO SOURCE - VERIFY
        </span>
      );
    }
    return null;
  };

  const Empty = ({ text = NOT_DISCUSSED }: { text?: string }) => <span className="text-slate-500 italic">{text}</span>;

  const handleCopy = () => {
    const text = `
CLINICAL PROGRESS NOTE: SOAP FORMAT (${isSigned ? 'SIGNED' : 'UNSIGNED DRAFT'})
ENCOUNTER: ${soapNote.id} | DATE: ${soapNote.encounterDate}
PROVIDER: ${soapNote.signature ? `${soapNote.signature.signedBy} (signed ${soapNote.signature.signedAt})` : soapNote.provider}
PATIENT: ${soapNote.patientName}

I. SUBJECTIVE
- Chief Complaint: ${soapNote.subjective.chiefComplaint}
- History of Present Illness: ${soapNote.subjective.historyOfPresentIllness}
- Reported Allergies: ${soapNote.subjective.allergies.join(', ') || NOT_DISCUSSED}
- Medications: ${soapNote.subjective.currentMedications.join(', ') || NOT_DISCUSSED}

II. OBJECTIVE
- Vital Signs:
${Object.entries(soapNote.objective.vitalSigns).map(([k, v]) => `  * ${k}: ${v}`).join('\n')}
- Physical Examination: ${soapNote.objective.physicalExam.join('; ') || 'None stated'}
- Diagnostic Results: ${(soapNote.objective.diagnosticResults || []).join('; ') || 'None stated'}

III. ASSESSMENT
- Primary Diagnosis: ${soapNote.assessment.primaryDiagnosis}${soapNote.assessment.icd10Code ? ` [ICD-10: ${soapNote.assessment.icd10Code}]` : ''}
- AI-Suggested Differentials (unconfirmed): ${soapNote.assessment.differentialDiagnoses.map(d => `${d.diagnosis} (${d.icd10})`).join(', ') || 'None'}
- Rationale: ${soapNote.assessment.clinicalRationale}

IV. PLAN
- Medications: ${soapNote.plan.medicationsPrescribed.map(m => `${m.name} ${m.dosage} ${m.instructions}`.trim()).join('; ') || 'None stated'}
- Diagnostic Orders: ${soapNote.plan.diagnosticsOrdered.join('; ') || 'None stated'}
- Instructions: ${soapNote.plan.patientInstructions}
- Follow-up: ${soapNote.plan.followUp}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canSign = !isSigned && signerName.trim().length > 1 && (unsupported.size === 0 || reviewedUnsourced);

  return (
    <div className="bg-console-surface border border-console-border rounded-xl font-mono text-xs overflow-hidden">
      {/* Document Header Bar */}
      <div className="p-4 bg-obsidian-400 border-b border-console-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-console-surface border border-console-border text-emerald-400">
            <Clipboard className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-100 text-base tracking-tight">{soapNote.patientName}</span>
              <span className="px-2 py-0.5 bg-obsidian-500 border border-console-border text-slate-400 text-[11px] rounded num-data">
                {soapNote.id}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${isSigned ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}`}>
                {isSigned ? 'SIGNED' : 'DRAFT'}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              <span>{soapNote.encounterDate}</span> •{' '}
              <span>{soapNote.signature ? `Signed by ${soapNote.signature.signedBy} at ${soapNote.signature.signedAt}` : soapNote.provider}</span>
              {soapNote.model && <span className="text-slate-500"> • {soapNote.model}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFhir(!showFhir)}
            className="btn-hardware px-3 py-1.5 bg-console-surface hover:bg-console-elevated border border-console-border text-slate-300 text-xs rounded flex items-center gap-1.5"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>{showFhir ? 'Close FHIR' : 'HL7 FHIR R4'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="btn-hardware px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Note'}</span>
          </button>
        </div>
      </div>

      {/* Grounding summary */}
      <div className="px-4 py-2.5 border-b border-console-border bg-obsidian-500/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 text-emerald-300">
          <ShieldCheck className="w-4 h-4" />
          SOURCE-LINKED: <span className="num-data font-bold">{grounding.sourced}/{grounding.total}</span> items
        </span>
        {unsupported.size > 0 && (
          <span className="text-amber-300">{unsupported.size} item{unsupported.size > 1 ? 's' : ''} without a source turn</span>
        )}
        <span className="text-slate-500 font-sans">Click a T-number to see what was said.</span>
      </div>

      {/* Source quote panel */}
      {activeRefs && (
        <div className="px-4 py-3 border-b border-console-border bg-emerald-950/30">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-emerald-300 font-bold text-xs">
              <Quote className="w-3.5 h-3.5" /> SOURCE TURNS
            </span>
            <button onClick={() => setActiveRefs(null)} className="text-slate-400 hover:text-slate-200" aria-label="Close source panel">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1.5 font-sans text-sm">
            {activeRefs.map((n) => {
              const t = turns.find((x) => x.n === n);
              if (!t) return null;
              return (
                <div key={n} className="flex gap-2">
                  <span className="font-mono text-xs text-emerald-400 shrink-0 pt-0.5">T{n}</span>
                  <span className="font-mono text-xs text-slate-400 shrink-0 pt-0.5 w-24 truncate">{t.speaker === 'Chart' ? 'Chart data' : t.speaker}</span>
                  <span className="text-slate-200">&ldquo;{t.text}&rdquo;</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FHIR R4 Code Inspector */}
      {showFhir && (
        <div className="p-4 bg-obsidian-500 border-b border-console-border">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-2 mb-2 border-b border-console-border">
            <span className="text-emerald-400 font-semibold">FHIR BUNDLE (application/fhir+json)</span>
            <span>HL7 FHIR R4</span>
          </div>
          <pre className="p-3 rounded border border-console-border text-xs text-emerald-300/90 overflow-x-auto max-h-64 num-data">
            {JSON.stringify(soapNote.fhirJson, null, 2)}
          </pre>
        </div>
      )}

      {/* Clinical Sections */}
      <div className="p-6 space-y-6 font-sans text-sm">
        {/* S - Subjective */}
        <div className="border-l-2 border-emerald-500 pl-4 space-y-2">
          <div className="font-mono text-xs font-bold tracking-wider text-emerald-400 uppercase">I. Subjective</div>
          <div className="text-slate-300 space-y-2 leading-relaxed">
            <div>
              <strong className="text-slate-100 font-semibold">Chief Complaint: </strong>
              {soapNote.subjective.chiefComplaint === NOT_DISCUSSED ? <Empty /> : soapNote.subjective.chiefComplaint}
              <Src path="subjective.chiefComplaint" />
            </div>
            <div>
              <strong className="text-slate-100 font-semibold">History of Present Illness: </strong>
              {soapNote.subjective.historyOfPresentIllness === NOT_DISCUSSED ? <Empty /> : soapNote.subjective.historyOfPresentIllness}
              <Src path="subjective.historyOfPresentIllness" />
            </div>
            {soapNote.subjective.reviewOfSystems.length > 0 && (
              <div>
                <strong className="text-slate-100 font-semibold">Review of Systems: </strong>
                {soapNote.subjective.reviewOfSystems.map((r, i) => (
                  <span key={i} className="mr-2">{r}<Src path={`subjective.reviewOfSystems.${i}`} />{i < soapNote.subjective.reviewOfSystems.length - 1 ? ';' : ''}</span>
                ))}
              </div>
            )}
            <div className="pt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="font-mono text-xs text-slate-500 block mb-1">ALLERGIES</span>
                {soapNote.subjective.allergies.length === 0 ? <Empty /> : soapNote.subjective.allergies.map((a, i) => (
                  <span key={i} className="inline-block mr-2 mb-1 text-red-300 bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded">
                    {a}<Src path={`subjective.allergies.${i}`} />
                  </span>
                ))}
              </div>
              <div>
                <span className="font-mono text-xs text-slate-500 block mb-1">CURRENT MEDICATIONS</span>
                {soapNote.subjective.currentMedications.length === 0 ? <Empty /> : soapNote.subjective.currentMedications.map((m, i) => (
                  <span key={i} className="inline-block mr-3 mb-1 text-slate-200">{m}<Src path={`subjective.currentMedications.${i}`} /></span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* O - Objective */}
        <div className="border-l-2 border-slate-500 pl-4 space-y-2">
          <div className="font-mono text-xs font-bold tracking-wider text-slate-300 uppercase">II. Objective</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono">
            {Object.entries(soapNote.objective.vitalSigns).map(([k, v], idx) => (
              <div key={idx} className="p-2 bg-obsidian-500 border border-console-border rounded">
                <span className="text-[11px] text-slate-500 block">{k}</span>
                <span className={`font-bold num-data text-xs ${v.startsWith('Not recorded') ? 'text-slate-500' : 'text-slate-200'}`}>{v}</span>
              </div>
            ))}
          </div>
          <div className="text-slate-300 pt-2 space-y-1">
            <span className="text-slate-500 font-mono text-xs block">PHYSICAL EXAMINATION</span>
            {soapNote.objective.physicalExam.length === 0 ? <Empty text="No exam findings stated in dialogue" /> : (
              <ul className="list-disc list-inside space-y-0.5">
                {soapNote.objective.physicalExam.map((pe, idx) => (
                  <li key={idx}>{pe}<Src path={`objective.physicalExam.${idx}`} /></li>
                ))}
              </ul>
            )}
          </div>
          {(soapNote.objective.diagnosticResults || []).length > 0 && (
            <div className="text-slate-300 space-y-1">
              <span className="text-slate-500 font-mono text-xs block">DIAGNOSTIC RESULTS</span>
              <ul className="list-disc list-inside space-y-0.5">
                {(soapNote.objective.diagnosticResults || []).map((d, idx) => (
                  <li key={idx}>{d}<Src path={`objective.diagnosticResults.${idx}`} /></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* A - Assessment */}
        <div className="border-l-2 border-amber-500 pl-4 space-y-2">
          <div className="font-mono text-xs font-bold tracking-wider text-amber-400 uppercase">III. Assessment</div>
          <div className="p-3 bg-obsidian-500 border border-console-border rounded-lg space-y-1.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-slate-100">
                {soapNote.assessment.primaryDiagnosis === NOT_DISCUSSED ? <Empty text="No diagnosis stated by clinician" /> : soapNote.assessment.primaryDiagnosis}
                <Src path="assessment.primaryDiagnosis" />
              </span>
              {soapNote.assessment.icd10Code && (
                <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold rounded">
                  ICD-10-CM: {soapNote.assessment.icd10Code}
                </span>
              )}
            </div>
            <p className="text-slate-400 leading-relaxed">{soapNote.assessment.clinicalRationale}</p>
          </div>
          <div className="text-slate-400 font-mono text-xs flex flex-wrap gap-2 pt-1">
            <span className="text-slate-500">AI-SUGGESTED DIFFERENTIAL (UNCONFIRMED):</span>
            {soapNote.assessment.differentialDiagnoses.length === 0 && <span className="text-slate-500">None</span>}
            {soapNote.assessment.differentialDiagnoses.map((diff, i) => (
              <span key={i} className="text-slate-300">
                {diff.diagnosis}{diff.icd10 ? ` [${diff.icd10}]` : ''}
              </span>
            ))}
          </div>
        </div>

        {/* P - Plan */}
        <div className="border-l-2 border-emerald-500 pl-4 space-y-2">
          <div className="font-mono text-xs font-bold tracking-wider text-emerald-400 uppercase">IV. Plan</div>
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {soapNote.plan.medicationsPrescribed.map((med, idx) => (
                <div key={idx} className="p-2.5 bg-obsidian-500 border border-console-border rounded">
                  <div className="font-bold text-slate-100">
                    {med.name}{med.dosage ? ` (${med.dosage})` : ''}<Src path={`plan.medicationsPrescribed.${idx}`} />
                  </div>
                  {med.instructions && <div className="text-slate-400 text-xs">{med.instructions}</div>}
                </div>
              ))}
              {soapNote.plan.medicationsPrescribed.length === 0 && (
                <div className="p-2.5 bg-obsidian-500 border border-console-border rounded"><Empty text="No medications stated in dialogue" /></div>
              )}
            </div>
            <div className="text-slate-400 pt-1">
              <span className="font-mono text-xs text-slate-500 block">DIAGNOSTIC ORDERS</span>
              {soapNote.plan.diagnosticsOrdered.length === 0 ? <Empty text="None stated in dialogue" /> : soapNote.plan.diagnosticsOrdered.map((d, i) => (
                <span key={i} className="inline-block mr-3 text-slate-200">{d}<Src path={`plan.diagnosticsOrdered.${i}`} /></span>
              ))}
            </div>
            <div className="p-2.5 bg-obsidian-500 border border-console-border rounded text-slate-300">
              <span className="font-mono text-xs text-slate-500 block mb-0.5">INSTRUCTIONS</span>
              {soapNote.plan.patientInstructions === NOT_DISCUSSED ? <Empty /> : soapNote.plan.patientInstructions}
              <Src path="plan.patientInstructions" />
            </div>
            <div className="p-2.5 bg-obsidian-500 border border-console-border rounded text-slate-300">
              <span className="font-mono text-xs text-slate-500 block mb-0.5">FOLLOW-UP</span>
              {soapNote.plan.followUp === NOT_DISCUSSED ? <Empty /> : soapNote.plan.followUp}
              <Src path="plan.followUp" />
            </div>
          </div>
        </div>
      </div>

      {/* Clinician sign-off */}
      <div className="p-4 border-t border-console-border bg-obsidian-400">
        {isSigned ? (
          <div className="flex items-center gap-2 text-emerald-300 text-sm">
            <ShieldCheck className="w-4 h-4" />
            Signed by <strong>{soapNote.signature!.signedBy}</strong> at {soapNote.signature!.signedAt}. FHIR Composition status is final.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-200 text-xs font-bold uppercase tracking-wider">
              <PenLine className="w-4 h-4 text-amber-400" /> Clinician review and sign-off
            </div>
            {unsupported.size > 0 && (
              <label className="flex items-start gap-2 text-amber-200 text-sm font-sans cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewedUnsourced}
                  onChange={(e) => setReviewedUnsourced(e.target.checked)}
                  className="mt-1 accent-amber-500"
                />
                I have reviewed the {unsupported.size} item{unsupported.size > 1 ? 's' : ''} marked NO SOURCE.
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Clinician name and credentials"
                aria-label="Clinician name"
                className="flex-1 min-w-[220px] px-3 py-2 bg-obsidian-500 border border-console-border rounded text-sm text-slate-100 font-sans placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => onSign?.(signerName.trim())}
                disabled={!canSign || !onSign}
                className="btn-hardware px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sign and finalize
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
