'use client';

import React from 'react';
import { TriageSeverity } from '@/types/clinical';
import { ShieldAlert, AlertCircle, Activity, Heart, Wind, Thermometer, Radio } from 'lucide-react';

interface TriageCardProps {
  esi: TriageSeverity;
  chiefComplaint: string;
  painScale: number;
  vitals?: Record<string, string>;
  criticalAlert?: string | null;
}

export const TriageCard: React.FC<TriageCardProps> = ({
  esi,
  chiefComplaint,
  painScale,
  vitals = {},
  criticalAlert = null,
}) => {
  const isEsi1 = esi.includes('ESI-1');
  const isEsi2 = esi.includes('ESI-2');
  const isUrgent = isEsi1 || isEsi2;

  return (
    <div className="bg-console-surface border border-console-border rounded-xl p-4 font-mono space-y-4">
      {/* Triage Tier Bar */}
      <div className="flex items-center justify-between border-b border-console-border pb-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Triage Stratification</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isEsi1
                  ? 'bg-red-500 text-white'
                  : isEsi2
                  ? 'bg-amber-500 text-slate-950 font-black'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {isUrgent && <AlertCircle className="w-3.5 h-3.5" />}
              {esi}
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Pain Intensity</div>
          <div className="text-base font-bold num-data text-slate-100 mt-0.5">
            <span className={painScale >= 8 ? 'text-red-400 font-black' : 'text-slate-200'}>
              {painScale}
            </span>
            <span className="text-xs text-slate-500"> / 10</span>
          </div>
        </div>
      </div>

      {/* Critical Alert Banner */}
      {criticalAlert && (
        <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-lg text-xs text-red-200 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="font-sans leading-relaxed">
            <span className="font-bold font-mono uppercase text-red-300 block mb-0.5">Priority Clinical Hazard</span>
            {criticalAlert}
          </div>
        </div>
      )}

      {/* Chief Complaint Protocol */}
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Chief Clinical Complaint</div>
        <div className="font-sans text-xs font-semibold text-slate-200 bg-obsidian-500 p-2.5 rounded-lg border border-console-border/60 leading-relaxed">
          {chiefComplaint || 'Awaiting patient clinical statement...'}
        </div>
      </div>

      {/* Vitals Telemetry Matrix */}
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Physiological Telemetry</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 bg-obsidian-500 border border-console-border rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
              <span>BP / HEART RATE</span>
              <Heart className="w-3 h-3 text-red-400" />
            </div>
            <div className="text-slate-100 font-bold num-data">
              {vitals['Blood Pressure'] || '162/96'} <span className="text-slate-500 text-[10px]">MMHG</span> • {vitals['Heart Rate'] || '94'} <span className="text-slate-500 text-[10px]">BPM</span>
            </div>
          </div>

          <div className="p-2.5 bg-obsidian-500 border border-console-border rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
              <span>SPO2 SATURATION</span>
              <Wind className="w-3 h-3 text-cyan-400" />
            </div>
            <div className="text-slate-100 font-bold num-data">
              {vitals['SpO2'] || '96%'} <span className="text-slate-500 text-[10px]">ROOM AIR</span>
            </div>
          </div>

          <div className="p-2.5 bg-obsidian-500 border border-console-border rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
              <span>TEMPERATURE</span>
              <Thermometer className="w-3 h-3 text-amber-400" />
            </div>
            <div className="text-slate-100 font-bold num-data">
              {vitals['Temperature'] || '98.6°F'}
            </div>
          </div>

          <div className="p-2.5 bg-obsidian-500 border border-console-border rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
              <span>RESPIRATORY RATE</span>
              <Activity className="w-3 h-3 text-teal-400" />
            </div>
            <div className="text-slate-100 font-bold num-data">
              {vitals['Respiratory Rate'] || '20/MIN'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
