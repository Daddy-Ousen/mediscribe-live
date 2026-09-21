'use client';

import React from 'react';

interface AudioWaveformProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'transcribing' | 'interrupted';
  volume?: number; // 0.0 to 1.0
  sampleRate?: number;
  // Measured response latencies in ms (Voice Agent only)
  latencies?: number[];
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  status,
  volume = 0,
  sampleRate = 24000,
  latencies
}) => {
  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening' || status === 'transcribing';
  const isInterrupted = status === 'interrupted';

  // Compute effective level
  const baseLevel = isSpeaking ? 0.65 + Math.sin(Date.now() / 120) * 0.2 : isListening ? Math.min(1.0, volume * 1.8) : 0;
  const segments = 24;
  const activeSegments = Math.round(baseLevel * segments);

  const sorted = latencies && latencies.length > 0 ? [...latencies].sort((a, b) => a - b) : [];
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;
  const last = latencies && latencies.length > 0 ? latencies[latencies.length - 1] : null;

  return (
    <div className="bg-obsidian-300 border border-console-border rounded-xl p-4 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-console-border pb-2.5 mb-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
          <span className="text-slate-300 uppercase tracking-wider font-semibold">Audio DSP Telemetry</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span>{sampleRate.toLocaleString()} HZ</span>
          <span>PCM16 MONO</span>
          <span className="text-slate-400">{status.toUpperCase()}</span>
        </div>
      </div>

      {/* Segmented VU Meter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-0.5">
          <span>-48 dB</span>
          <span>-36 dB</span>
          <span>-24 dB</span>
          <span>-12 dB</span>
          <span>-6 dB</span>
          <span>0 dB CLIP</span>
        </div>

        <div className="grid grid-cols-24 gap-1 h-5 bg-obsidian-500 p-1 rounded-md border border-console-border/70 items-center">
          {Array.from({ length: segments }).map((_, idx) => {
            const isActive = idx < activeSegments;
            const isRedZone = idx >= segments - 3;
            const isAmberZone = idx >= segments - 7 && idx < segments - 3;

            let color = 'bg-slate-800/60';
            if (isActive) {
              if (isRedZone) {
                color = 'bg-red-500';
              } else if (isAmberZone) {
                color = 'bg-amber-400';
              } else {
                color = isSpeaking ? 'bg-slate-200' : 'bg-emerald-400';
              }
            }

            return (
              <div
                key={idx}
                className={`h-full rounded-xs transition-all duration-75 ${color}`}
              />
            );
          })}
        </div>
      </div>

      {/* Hardware Status Tickers */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-console-border/50 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${
            status !== 'disconnected' ? 'bg-emerald-400' : 'bg-slate-600'
          }`} />
          <span className="text-slate-400">CARRIER:</span>
          <span className="text-slate-200 font-semibold">{status !== 'disconnected' ? 'LOCKED' : 'OFFLINE'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${
            isListening ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
          }`} />
          <span className="text-slate-400">MIC:</span>
          <span className="text-slate-200 font-semibold">{isListening ? 'LISTENING' : isSpeaking ? 'AGENT SPEAKING' : 'IDLE'}</span>
        </div>

        <div className="flex items-center gap-1.5 justify-end">
          <span className={`w-1.5 h-1.5 rounded-full ${
            isInterrupted ? 'bg-amber-400' : isSpeaking ? 'bg-slate-200' : 'bg-slate-600'
          }`} />
          <span className="text-slate-400">BARGE-IN:</span>
          <span className="text-slate-200 font-semibold">{isInterrupted ? 'FLUSHED' : 'ARMED'}</span>
        </div>
      </div>

      {latencies !== undefined && (
        <div className="mt-2.5 pt-2.5 border-t border-console-border/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-slate-400" title="Time from the server's end-of-speech event to the first agent audio chunk, measured in this browser">
            RESPONSE LATENCY:
          </span>
          {last === null ? (
            <span className="text-slate-500">Speak to measure</span>
          ) : (
            <>
              <span className="text-slate-200">last <span className="num-data font-bold text-emerald-300">{last} ms</span></span>
              <span className="text-slate-200">median <span className="num-data font-bold text-emerald-300">{median} ms</span></span>
              <span className="text-slate-500 num-data">n={sorted.length}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
