import { PcmAudioRecorder } from '../audio/audio-recorder';
import { DialogueTurn } from '@/types/clinical';
import { extractMedicalEntities } from '../clinical/drug-database';

export interface StreamingClientCallbacks {
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'transcribing') => void;
  onTurn?: (turn: DialogueTurn) => void;
  // AssemblyAI corrected the speaker of an earlier turn
  onSpeakerRevision?: (turnId: string, speaker: DialogueTurn['speaker']) => void;
  onVolumeChange?: (volume: number) => void;
  onError?: (error: string) => void;
}

// Plain-language hints for AssemblyAI Streaming error codes
function describeStreamingError(code: number | undefined, serverMessage: string): string {
  if (code === 1008 && /concurrent/i.test(serverMessage)) {
    return 'Too many open transcription sessions on this API key. Wait about one minute for old sessions to close, then start again.';
  }
  if (code === 3007) {
    return `Audio chunk timing was rejected by AssemblyAI (${serverMessage}). Start the scribe again.`;
  }
  if (code === 3005 || /expired|session/i.test(serverMessage)) {
    return 'The transcription session expired. Start the scribe again.';
  }
  return serverMessage;
}

export class StreamingTranscriptionClient {
  private ws: WebSocket | null = null;
  private recorder: PcmAudioRecorder | null = null;
  private callbacks: StreamingClientCallbacks;
  private isConnected: boolean = false;
  private lastServerError: { code?: number; message: string } | null = null;
  private disposed: boolean = false;
  // Diarization labels ("A", "B") are arbitrary cluster ids. The first labeled speaker is assumed
  // to be the clinician (who usually opens the consult); the UI can swap roles if that is wrong.
  private labelRoles = new Map<string, 'Doctor' | 'Patient'>();
  private sessionKey = Date.now().toString(36);
  private handleUnload = () => this.disconnect();

  constructor(callbacks: StreamingClientCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public async connect(): Promise<void> {
    this.callbacks.onStatusChange?.('connecting');

    try {
      // 1. Initialize microphone hardware first so browser permission is obtained before WS opens
      await this.startMicrophone();

      // 2. Fetch short-lived token from backend with cache-busting query & no-store headers
      const tokenRes = await fetch(`/api/token/streaming?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to mint Streaming STT token');
      }
      const { token } = await tokenRes.json();

      // The user pressed Stop while the token was loading: do not open an orphan session
      if (this.disposed) return;

      // 3. Open WebSocket to AssemblyAI Streaming Edge with medical-v1 domain & speaker diarization
      const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-5-pro&domain=medical-v1&speaker_labels=true&token=${token}`;
      this.ws = new WebSocket(wsUrl);
      this.lastServerError = null;
      // Terminate the session if the tab closes, so it does not count against the concurrency limit
      window.addEventListener('beforeunload', this.handleUnload);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.callbacks.onStatusChange?.('connected');
      };

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.error('Streaming STT WebSocket error:', err);
        this.callbacks.onError?.('Streaming STT connection error. Unable to reach AssemblyAI edge servers.');
      };

      this.ws.onclose = (ev) => {
        console.log('Streaming STT WebSocket closed:', ev.code, ev.reason);
        this.isConnected = false;
        this.stopMicrophone();
        window.removeEventListener('beforeunload', this.handleUnload);
        this.callbacks.onStatusChange?.('disconnected');
        if (this.lastServerError) {
          // The server already explained why; show that instead of the generic close reason
          this.callbacks.onError?.(describeStreamingError(this.lastServerError.code ?? ev.code, this.lastServerError.message));
        } else if (ev.code !== 1000 && ev.code !== 1005) {
          const detail = ev.reason ? `: ${ev.reason}` : ` (WebSocket code ${ev.code})`;
          this.callbacks.onError?.(`Ambient Scribe connection closed unexpectedly${detail}. Check your microphone and network connection.`);
        } else if (ev.reason && (ev.reason.includes('expired') || ev.reason.includes('Unauthorized'))) {
          this.callbacks.onError?.('Streaming token expired. Click Start Ambient Scribe to start a fresh session.');
        }
      };
    } catch (err: any) {
      this.stopMicrophone();
      if (this.ws) {
        try { this.ws.close(); } catch (e) {}
        this.ws = null;
      }
      this.isConnected = false;
      this.callbacks.onError?.(err?.message || 'Failed to connect to streaming service');
      this.callbacks.onStatusChange?.('disconnected');
      throw err;
    }
  }

  private handleServerMessage(data: string) {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'Begin') {
        this.callbacks.onStatusChange?.('transcribing');
      } else if (msg.type === 'Turn') {
        const transcript = msg.transcript || '';
        if (!transcript.trim()) return;

        // Partial turns carry no speaker label yet; final turns do
        const speaker = this.roleFor(msg.speaker_label);
        const entities = extractMedicalEntities(transcript);

        const turn: DialogueTurn = {
          // Same id for the partial and final versions of a turn, unique per session
          id: this.turnId(msg.turn_order),
          speaker,
          text: transcript,
          timestamp: new Date().toLocaleTimeString(),
          isFinal: Boolean(msg.end_of_turn),
          entities
        };

        this.callbacks.onTurn?.(turn);
      } else if (msg.type === 'SpeakerRevision' && Array.isArray(msg.revisions)) {
        for (const rev of msg.revisions) {
          const speaker = this.roleFor(rev.speaker_label);
          if (speaker !== 'Unknown') this.callbacks.onSpeakerRevision?.(this.turnId(rev.turn_order), speaker);
        }
      } else if (msg.type === 'Error' || (msg.error && !msg.type)) {
        // Reported once, from onclose, which always follows a server error
        console.error('AssemblyAI Streaming STT error message:', msg);
        this.lastServerError = { code: msg.error_code, message: msg.error || 'Streaming speech error' };
      }
    } catch (e) {
      console.error('Error parsing STT message:', e);
    }
  }

  private turnId(turnOrder: unknown): string {
    return `turn-${this.sessionKey}-${turnOrder ?? Date.now()}`;
  }

  private roleFor(label: unknown): DialogueTurn['speaker'] {
    if (label === undefined || label === null || label === 'PENDING' || label === 'UNKNOWN') return 'Unknown';
    const key = String(label);
    if (!this.labelRoles.has(key)) {
      this.labelRoles.set(key, this.labelRoles.size === 0 ? 'Doctor' : 'Patient');
    }
    return this.labelRoles.get(key)!;
  }

  // Flip the Doctor/Patient assignment for the rest of the session
  public swapRoles() {
    this.labelRoles.forEach((role, key) => this.labelRoles.set(key, role === 'Doctor' ? 'Patient' : 'Doctor'));
  }

  private async startMicrophone() {
    try {
      this.recorder = new PcmAudioRecorder({
        targetSampleRate: 16000,
        onAudioChunk: ({ rawBytes }) => {
          // Realtime STT expects binary PCM frames
          if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isConnected) {
            const bufferToSend = rawBytes.buffer.slice(
              rawBytes.byteOffset,
              rawBytes.byteOffset + rawBytes.byteLength
            );
            this.ws.send(bufferToSend);
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
      throw new Error(`Microphone initialization error: ${e.message || 'Microphone unavailable'}. Please verify browser microphone permissions.`);
    }
  }

  public disconnect() {
    this.stopMicrophone();
    window.removeEventListener('beforeunload', this.handleUnload);

    this.disposed = true;

    if (this.ws) {
      const ws = this.ws;
      // Detach handlers so a late close event cannot change the status of a newer session
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        // Critical: always send { "type": "Terminate" } to avoid session lingering
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'Terminate' }));
          ws.close(1000);
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'Terminate' }));
            ws.close(1000);
          };
        }
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.callbacks.onStatusChange?.('disconnected');
  }

  private stopMicrophone() {
    if (this.recorder) {
      this.recorder.stop();
      this.recorder = null;
    }
  }
}
