'use client';

import React from 'react';
import { ToolExecutionEvent } from '@/types/clinical';
import { Terminal, AlertCircle, CheckCircle, ShieldAlert } from 'lucide-react';

interface ToolCallBadgeProps {
  toolEvent: ToolExecutionEvent;
}

export const ToolCallBadge: React.FC<ToolCallBadgeProps> = ({ toolEvent }) => {
  const isFlagged = toolEvent.status === 'flagged';

  return (
    <div
      className={`border rounded-lg p-3 text-xs font-mono transition-all ${
        isFlagged
          ? 'bg-red-950/20 border-red-500/40 text-slate-200'
          : 'bg-console-surface border-console-border text-slate-300'
      }`}
    >
      {/* Header Ledger Line */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-console-border/60">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-bold text-slate-200">{toolEvent.toolName}</span>
          <span
            className={`px-1.5 py-0.2 text-[9px] rounded uppercase font-semibold tracking-wider ${
              isFlagged ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {isFlagged ? 'CRITICAL ALERT' : 'EXECUTED'}
          </span>
        </div>
        <span className="text-[10px] text-slate-500 num-data">{toolEvent.timestamp}</span>
      </div>

      {/* Parameter Payload */}
      <div className="bg-obsidian-500 rounded p-2 text-[11px] space-y-1 mb-2 border border-console-border/40">
        <div className="text-slate-400">
          <span className="text-slate-500">PAYLOAD: </span>
          {JSON.stringify(toolEvent.parameters)}
        </div>
      </div>

      {/* Detail disclosure if contraindication */}
      {toolEvent.result && toolEvent.result.details && toolEvent.result.details.length > 0 && (
        <div className="bg-red-950/40 border border-red-500/30 rounded p-2.5 space-y-1.5 text-red-200 text-[11px]">
          <div className="flex items-center gap-1.5 font-bold text-red-400">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{toolEvent.result.details[0].severity}</span>
          </div>
          <p className="text-[10.5px] leading-relaxed text-red-300/90 font-sans">
            {toolEvent.result.details[0].mechanism}
          </p>
          <div className="text-[10px] text-red-400 pt-1.5 border-t border-red-500/20">
            CLINICAL DIRECTIVE: {toolEvent.result.details[0].clinicalRecommendation}
          </div>
        </div>
      )}

      {toolEvent.result && !toolEvent.result.details && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-1">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Recorded to encounter audit ledger</span>
        </div>
      )}
    </div>
  );
};
