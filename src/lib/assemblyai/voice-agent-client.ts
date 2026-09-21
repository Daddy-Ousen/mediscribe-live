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
  onAutoClose?: (reason: string) => void;
  // Milliseconds from the server's end-of-speech event to the first agent audio chunk, measured in the browser
  onLatency?: (ms: number) => void;
  onError?: (error: string) => void;
}

export class VoiceAgentClient {
  private ws: WebSocket | null = null;
  private recorder: PcmAudioRecorder | null = null;
  private player: PcmAudioPlayer | null = null;
  private isReady: boolean = false;
  private callbacks: VoiceAgentCallbacks;
  private currentAgentReply: string = '';
  private shouldAutoClose: boolean = false;
  private speechStoppedAt: number | null = null;

  constructor(callbacks: VoiceAgentCallbacks = {}) {
    this.callbacks = callbacks;
    this.player = new PcmAudioPlayer(24000);
  }

  public async connect(): Promise<void> {
    this.callbacks.onStatusChange?.('connecting');

    try {
      // 1. Mint token from backend with cache-busting query
      const tokenRes = await fetch(`/api/token/voice-agent?t=${Date.now()}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to mint Voice Agent token');
      }
      const { token } = await tokenRes.json();

      // The user pressed Stop while the token was loading: do not open an orphan session
      if (this.disposed) return;

      // 2. Open WebSocket
      const wsUrl = `wss://agents.assemblyai.com/v1/ws?token=${token}`;
      this.ws = new WebSocket(wsUrl);
      window.addEventListener('beforeunload', this.handleUnload);

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
        if (ev.code !== 1000 && ev.code !== 1005) {
          const detail = ev.reason ? `: ${ev.reason}` : ` (WebSocket code ${ev.code})`;
          this.callbacks.onError?.(`Bedside Voice Agent session closed unexpectedly${detail}. Check your network and microphone connection.`);
        }
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
1. Greet the patient warmly and ask for their name and what brings them to the emergency department today.
2. When the patient states their name, immediately call the 'set_patient_identity' tool to update their medical chart.
3. Inquire about the onset of symptoms and ask them to rate their pain on a scale from 1 to 10.
4. Inquire about known allergies and what medications they currently take at home.
5. If the patient mentions medications, call 'check_drug_interaction' immediately to check safety.
6. If the pain scale is 8 or higher, or if symptoms suggest cardiac ischemia or acute compromise, immediately call 'flag_critical_vital'.
7. Once the core intake information is gathered, or when the patient indicates they are done (e.g. saying 'that is all', 'thank you', 'no more medications'), immediately call 'confirm_and_close_session' with your final verbal reassurance to automatically conclude and close the session.
Speak in clear, concise, reassuring sentences (1-2 sentences) suitable for spoken audio.`,
        greeting: "Hello, I am MediScribe, your bedside intake copilot. Could you please tell me your name and what brings you to the emergency department today?",
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
            name: 'set_patient_identity',
            description: 'Update the active patient chart with their full name and demographics.',
            parameters: {
              type: 'object',
              properties: {
                patient_name: { type: 'string', description: 'Confirmed legal or preferred patient name' },
                age: { type: 'number', description: 'Patient age if provided' }
              },
              required: ['patient_name']
            }
          },
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
                patient_name: { type: 'string', description: 'Patient name' },
                chief_complaint: { type: 'string' },
                pain_scale: { type: 'number' },
                onset: { type: 'string' },
                medications: { type: 'array', items: { type: 'string' } },
                allergies: { type: 'array', items: { type: 'string' } }
              },
              required: ['chief_complaint']
            }
          },
          {
            type: 'function',
            name: 'confirm_and_close_session',
            description: 'Call this tool to deliver final closing confirmation to the patient and automatically terminate the audio session.',
            parameters: {
              type: 'object',
              properties: {
                closing_summary: { type: 'string', description: 'Closing verbal reassurance statement spoken to patient' }
              },
              required: ['closing_summary']
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
          this.speechStoppedAt = performance.now();
          break;

        case 'transcript.user.delta': {
          const userDelta = msg.text || msg.transcript;
          if (userDelta) {
            this.callbacks.onUserTranscript?.(userDelta, false);
          }
          break;
        }

        case 'transcript.user': {
          const userFinal = msg.text || msg.transcript;
          if (userFinal) {
            this.callbacks.onUserTranscript?.(userFinal, true);
          }
          break;
        }

        case 'reply.started':
          this.currentAgentReply = '';
          this.callbacks.onStatusChange?.('speaking');
          break;

        case 'reply.audio':
          // Note field-name asymmetry: reply.audio payload is inside 'data'
          if (msg.data && this.player) {
            if (this.speechStoppedAt !== null) {
              this.callbacks.onLatency?.(Math.round(performance.now() - this.speechStoppedAt));
              this.speechStoppedAt = null;
            }
            this.player.playChunk(msg.data);
          }
          break;

        case 'transcript.agent.delta': {
          const agentDelta = msg.text || msg.transcript;
          if (agentDelta) {
            this.currentAgentReply += agentDelta;
            this.callbacks.onAgentTranscript?.(this.currentAgentReply);
          }
          break;
        }

        case 'transcript.agent': {
          const agentFinal = msg.text || msg.transcript;
          if (agentFinal) {
            this.currentAgentReply = agentFinal;
            this.callbacks.onAgentTranscript?.(this.currentAgentReply);
          }
          break;
        }

        case 'reply.done':
          if (this.shouldAutoClose) {
            this.callbacks.onAutoClose?.('Patient intake completed and confirmed.');
            // Allow audio player to finish playing the closing confirmation audio
            setTimeout(() => {
              this.disconnect();
            }, 2200);
            return;
          }
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

        case 'error':
        case 'session.error':
          console.error('AssemblyAI Voice Agent session error:', msg);
          this.callbacks.onError?.(msg.message || msg.error || 'Voice Agent session error');
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

    if (name === 'set_patient_identity') {
      result = {
        status: 'ok',
        patient_name: args.patient_name,
        message: `Patient chart updated to ${args.patient_name}`
      };
    } else if (name === 'check_drug_interaction') {
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
    } else if (name === 'confirm_and_close_session') {
      this.shouldAutoClose = true;
      result = {
        status: 'intake_confirmed',
        session_closing: true,
        summary: args.closing_summary
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
      this.callbacks.onError?.(`Could not access microphone: ${e.message}. Please check browser microphone permissions.`);
      this.disconnect();
    }
  }

  private handleUnload = () => this.disconnect();
  private disposed: boolean = false;

  public disconnect() {
    this.disposed = true;
    this.stopAudio();
    window.removeEventListener('beforeunload', this.handleUnload);
    if (this.ws) {
      const ws = this.ws;
      // Detach handlers so a late close event cannot change the status of a newer session
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close(1000);
        } else {
          ws.close(1000);
        }
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
