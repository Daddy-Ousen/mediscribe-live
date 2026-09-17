import { PcmAudioPlayer } from '../audio/audio-player';
import { PcmAudioRecorder } from '../audio/audio-recorder';
import { ToolExecutionEvent } from '@/types/clinical';
import { checkDrugInteractions } from '../clinical/drug-database';

export interface VoiceAgentCallbacks {
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'interrupted') => void;
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  onAgentTranscript?: (text: string) => void;
  onToolCall?: (event: ToolExecutionEvent) => void;
  onVolumeChange?: (volume: number) => void;
  onError?: (error: string) => void;
}

export class VoiceAgentClient {
  private ws: WebSocket | null = null;
  private recorder: PcmAudioRecorder | null = null;
  private player: PcmAudioPlayer | null = null;
  private isReady: boolean = false;
  private callbacks: VoiceAgentCallbacks;
  private currentAgentReply: string = '';

  constructor(callbacks: VoiceAgentCallbacks = {}) {
    this.callbacks = callbacks;
    this.player = new PcmAudioPlayer(24000);
  }

  public async connect(): Promise<void> {
    this.callbacks.onStatusChange?.('connecting');

    try {
      // 1. Mint token from backend
      const tokenRes = await fetch('/api/token/voice-agent', { method: 'POST' });
      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || 'Failed to mint Voice Agent token');
      }
      const { token } = await tokenRes.json();

      // 2. Open WebSocket
      const wsUrl = `wss://agents.assemblyai.com/v1/ws?token=${token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.callbacks.onStatusChange?.('connected');
        this.sendSessionUpdate();
      };

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.error('Voice Agent WebSocket Error:', err);
        this.callbacks.onError?.('Voice Agent connection error occurred.');
      };

      this.ws.onclose = (ev) => {
        console.log('Voice Agent WebSocket Closed:', ev.code, ev.reason);
        this.isReady = false;
        this.stopAudio();
        this.callbacks.onStatusChange?.('disconnected');
      };
    } catch (err: any) {
      this.callbacks.onError?.(err?.message || 'Connection failed');
      this.callbacks.onStatusChange?.('disconnected');
      throw err;
    }
  }

  private sendSessionUpdate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const sessionConfig = {
      type: 'session.update',
      session: {
        system_prompt: `You are MediScribe, an autonomous, highly professional emergency room bedside triage assistant. 
Your goal is to conduct a fast, empathetic, and structured patient intake:
1. Greet the patient warmly and ask for their chief complaint.
2. Ask about the onset of symptoms and ask them to rate their pain on a scale from 1 to 10.
3. Inquire about any known allergies and what medications they currently take.
4. If the patient mentions medications, call the 'check_drug_interaction' tool immediately to check safety.
5. If the pain scale is 8 or higher, or if symptoms suggest cardiac ischemia or acute compromise, immediately call the 'flag_critical_vital' tool.
6. Once the core information is gathered, call 'record_patient_intake' and reassure the patient that the emergency care team has received their clinical brief.
Speak in clear, concise, reassuring sentences. Keep responses brief (1-3 sentences) suitable for spoken audio.`,
        greeting: "Hello, I am MediScribe, your bedside intake copilot. I'm here to gather your initial clinical details for the emergency medical team. Could you please tell me what brings you in today?",
        input: {
          format: { encoding: 'audio/pcm' },
          keyterms: [
            'Warfarin', 'Lisinopril', 'Sildenafil', 'Nitroglycerin', 'Aspirin', 'Metformin',
            'Clopidogrel', 'Atorvastatin', 'Amiodarone', 'Digoxin', 'Troponin', 'Dyspnea', 'Angina'
          ],
          turn_detection: {
            vad_threshold: 0.5,
            min_silence: 200,
            max_silence: 1000,
            interrupt_response: true
          }
        },
        output: {
          voice: 'anna',
          format: { encoding: 'audio/pcm' }
        },
        tools: [
          {
            type: 'function',
            name: 'check_drug_interaction',
            description: 'Check for harmful drug-drug interactions or clinical contraindications between patient medications.',
            parameters: {
              type: 'object',
              properties: {
                medication_a: { type: 'string', description: 'First medication name' },
                medication_b: { type: 'string', description: 'Second medication name' }
              },
              required: ['medication_a', 'medication_b']
            }
          },
          {
            type: 'function',
            name: 'flag_critical_vital',
            description: 'Trigger an immediate clinical alert on the nursing dashboard for critical pain or high-risk emergency symptoms.',
            parameters: {
              type: 'object',
              properties: {
                symptom_or_vital: { type: 'string', description: 'The alarming symptom or vital sign' },
                severity_level: { type: 'string', enum: ['critical', 'emergent', 'urgent'] },
                notes: { type: 'string', description: 'Clinical context or recommended action' }
              },
              required: ['symptom_or_vital', 'severity_level']
            }
          },
          {
            type: 'function',
            name: 'record_patient_intake',
            description: 'Save structured patient triage information into the Electronic Health Record.',
            parameters: {
              type: 'object',
              properties: {
                chief_complaint: { type: 'string' },
                pain_scale: { type: 'number' },
                onset: { type: 'string' },
                medications: { type: 'array', items: { type: 'string' } },
                allergies: { type: 'array', items: { type: 'string' } }
              },
              required: ['chief_complaint']
            }
          }
        ]
      }
    };

    this.ws.send(JSON.stringify(sessionConfig));
  }

  private handleServerMessage(data: string) {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'session.ready':
          this.isReady = true;
          this.callbacks.onStatusChange?.('listening');
          this.startMicrophone();
          break;

        case 'input.speech.started':
          this.callbacks.onStatusChange?.('listening');
          break;

        case 'input.speech.stopped':
          break;

        case 'transcript.user.delta':
          if (msg.transcript) {
            this.callbacks.onUserTranscript?.(msg.transcript, false);
          }
          break;

        case 'transcript.user':
          if (msg.transcript) {
            this.callbacks.onUserTranscript?.(msg.transcript, true);
          }
          break;

        case 'reply.started':
          this.currentAgentReply = '';
          this.callbacks.onStatusChange?.('speaking');
          break;

        case 'reply.audio':
          // Note field-name asymmetry: reply.audio payload is inside 'data'
          if (msg.data && this.player) {
            this.player.playChunk(msg.data);
          }
          break;

        case 'transcript.agent':
          if (msg.transcript) {
            this.currentAgentReply += msg.transcript;
            this.callbacks.onAgentTranscript?.(this.currentAgentReply);
          }
          break;

        case 'reply.done':
          if (msg.status === 'interrupted') {
            // User barge-in! Flush playback audio immediately
            this.player?.stopAndFlush();
            this.callbacks.onStatusChange?.('interrupted');
          } else {
            this.callbacks.onStatusChange?.('listening');
          }
          break;

        case 'tool.call':
          this.executeToolCall(msg.call_id, msg.name, msg.arguments);
          break;

        default:
          break;
      }
    } catch (e) {
      console.error('Error parsing Voice Agent message:', e);
    }
  }

  private async executeToolCall(callId: string, name: string, argsString: string) {
    let args: any = {};
    try {
      args = typeof argsString === 'string' ? JSON.parse(argsString) : argsString;
    } catch (e) {
      args = {};
    }

    let result: any = { status: 'ok' };
    let status: 'completed' | 'flagged' = 'completed';

    if (name === 'check_drug_interaction') {
      const { medication_a, medication_b } = args;
      const interactions = checkDrugInteractions([medication_a, medication_b]);
      result = {
        has_interaction: interactions.length > 0,
        count: interactions.length,
        details: interactions
      };
      if (interactions.some(i => i.severity.includes('Contraindicated') || i.severity.includes('Critical'))) {
        status = 'flagged';
      }
    } else if (name === 'flag_critical_vital') {
      status = 'flagged';
      result = {
        alert_triggered: true,
        priority: args.severity_level,
        action: 'Nurse and emergency physician alerted stat.'
      };
    } else if (name === 'record_patient_intake') {
      result = {
        record_id: `INTAKE-${Date.now().toString().slice(-4)}`,
        saved_to_ehr: true
      };
    }

    // Notify UI of tool execution
    const toolEvent: ToolExecutionEvent = {
      id: callId || Date.now().toString(),
      toolName: name,
      parameters: args,
      result,
      timestamp: new Date().toLocaleTimeString(),
      status
    };
    this.callbacks.onToolCall?.(toolEvent);

    // Return tool result back to Voice Agent WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'tool.result',
        call_id: callId,
        result: JSON.stringify(result)
      }));
    }
  }

  private async startMicrophone() {
    try {
      this.recorder = new PcmAudioRecorder({
        targetSampleRate: 24000,
        onAudioChunk: ({ base64 }) => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isReady) {
            this.ws.send(JSON.stringify({
              type: 'input.audio',
              audio: base64
            }));
          }
        },
        onVolumeChange: (vol) => {
          this.callbacks.onVolumeChange?.(vol);
        },
        onError: (err) => {
          this.callbacks.onError?.(`Microphone error: ${err.message}`);
        }
      });

      await this.recorder.start();
    } catch (e: any) {
      console.error('Failed to start microphone:', e);
      this.callbacks.onError?.(`Could not access microphone: ${e.message}`);
    }
  }

  public disconnect() {
    this.stopAudio();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isReady = false;
    this.callbacks.onStatusChange?.('disconnected');
  }

  private stopAudio() {
    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }
    if (this.player) {
      this.player.stopAndFlush();
    }
  }
}
