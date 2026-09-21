'use client';

import React from 'react';
import { TriageSeverity } from '@/types/clinical';
import { ShieldAlert, AlertCircle, Activity, Heart, Wind, Thermometer } from 'lucide-react';

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

  const bp = vitals['Blood Pressure'] || '--/--';
  const hr = vitals['Heart Rate'] || '-- bpm';
  const spo2 = vitals['SpO2'] || '--%';
  const rr = vitals['Respiratory Rate'] || '--/min';
  const temp = vitals['Temperature'] || '--°F';

  const isBpSet = bp !== '--/--' && bp !== '--';
  const isHrSet = hr !== '-- bpm' && hr !== '--';
  const isSpo2Set = spo2 !== '--%' && spo2 !== '--';
  const isRrSet = rr !== '--/min' && rr !== '--';
  const isTempSet = temp !== '--°F' && temp !== '--';

  return (
    <div className="bg-console-surface border border-console-border rounded-xl p-4 font-mono space-y-4">
      {/* Triage Tier Bar */}
      <div className="flex items-center justify-between border-b border-console-border pb-3">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Triage Stratification</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isEsi1
                  ? 'bg-red-500 text-white animate-pulse'
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
          <div className="text-xs text-slate-500 uppercase tracking-wider">Pain Intensity</div>
          <div className="text-base font-bold num-data text-slate-100 mt-0.5">
            <span className={painScale >= 8 ? 'text-red-400 font-black' : painScale > 0 ? 'text-amber-300' : 'text-slate-500'}>
              {painScale > 0 ? painScale : '--'}
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
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Chief Clinical Complaint</div>
        <div className="font-sans text-xs font-semibold text-slate-200 bg-obsidian-500 p-2.5 rounded-lg border border-console-border/60 leading-relaxed">
          {chiefComplaint || 'Awaiting patient clinical statement...'}
        </div>
      </div>

      {/* Vitals Telemetry Matrix */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wider mb-2">
          <span>Physiological Telemetry</span>
          {(isBpSet || isHrSet || isSpo2Set || isRrSet || isTempSet) && (
            <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              LIVE TELEMETRY
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Blood Pressure */}
          <div className={`p-2.5 rounded-lg border transition-all ${
            isBpSet ? 'bg-obsidian-500 border-rose-500/40' : 'bg-obsidian-500 border-console-border'
          }`}>
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase">Blood Pressure</span>
              <Heart className={`w-3.5 h-3.5 ${isBpSet ? 'text-rose-400' : 'text-slate-600'}`} />
            </div>
            <div className={`font-bold num-data text-sm ${isBpSet ? 'text-slate-100' : 'text-slate-500'}`}>
              {bp}
            </div>
          </div>

          {/* Heart Rate */}
          <div className={`p-2.5 rounded-lg border transition-all ${
            isHrSet ? 'bg-obsidian-500 border-red-500/40' : 'bg-obsidian-500 border-console-border'
          }`}>
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase">Heart Rate</span>
              <Activity className={`w-3.5 h-3.5 ${isHrSet ? 'text-red-400 animate-pulse' : 'text-slate-600'}`} />
            </div>
            <div className={`font-bold num-data text-sm ${isHrSet ? 'text-slate-100' : 'text-slate-500'}`}>
              {hr}
            </div>
          </div>

          {/* SpO2 Saturation */}
          <div className={`p-2.5 rounded-lg border transition-all ${
            isSpo2Set ? 'bg-obsidian-500 border-emerald-500/40' : 'bg-obsidian-500 border-console-border'
          }`}>
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase">SpO2</span>
              <Wind className={`w-3.5 h-3.5 ${isSpo2Set ? 'text-emerald-400' : 'text-slate-600'}`} />
            </div>
            <div className={`font-bold num-data text-sm ${isSpo2Set ? 'text-slate-100' : 'text-slate-500'}`}>
              {spo2}
            </div>
          </div>

          {/* Respiratory Rate */}
          <div className={`p-2.5 rounded-lg border transition-all ${
            isRrSet ? 'bg-obsidian-500 border-teal-500/40' : 'bg-obsidian-500 border-console-border'
          }`}>
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span className="font-semibold uppercase">Respiratory Rate</span>
              <Activity className={`w-3.5 h-3.5 ${isRrSet ? 'text-teal-400' : 'text-slate-600'}`} />
            </div>
            <div className={`font-bold num-data text-sm ${isRrSet ? 'text-slate-100' : 'text-slate-500'}`}>
              {rr}
            </div>
          </div>

          {/* Temperature (spans 2 columns) */}
          <div className={`col-span-2 p-2.5 rounded-lg border transition-all flex items-center justify-between ${
            isTempSet ? 'bg-obsidian-500 border-amber-500/40' : 'bg-obsidian-500 border-console-border'
          }`}>
            <div>
              <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-0.5">
                <Thermometer className={`w-3.5 h-3.5 ${isTempSet ? 'text-amber-400' : 'text-slate-600'}`} />
                <span className="font-semibold uppercase">Temperature</span>
              </div>
              <div className={`font-bold num-data text-sm ${isTempSet ? 'text-slate-100' : 'text-slate-500'}`}>
                {temp}
              </div>
            </div>
            {isTempSet && (
              <span className="text-xs text-amber-400/80 font-mono">
                {parseFloat(temp) >= 100.4 ? 'Febrile Elevation' : 'Normothermic'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
