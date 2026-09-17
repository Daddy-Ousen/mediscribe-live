import { PcmAudioRecorder } from '../audio/audio-recorder';
import { DialogueTurn } from '@/types/clinical';
import { extractMedicalEntities } from '../clinical/drug-database';

export interface StreamingClientCallbacks {
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'transcribing') => void;
  onTurn?: (turn: DialogueTurn) => void;
  onVolumeChange?: (volume: number) => void;
  onError?: (error: string) => void;
}

export class StreamingTranscriptionClient {
  private ws: WebSocket | null = null;
  private recorder: PcmAudioRecorder | null = null;
  private callbacks: StreamingClientCallbacks;
  private isConnected: boolean = false;

  constructor(callbacks: StreamingClientCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public async connect(): Promise<void> {
    this.callbacks.onStatusChange?.('connecting');

    try {
      // 1. Fetch short-lived token from backend
      const tokenRes = await fetch('/api/token/streaming');
      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || 'Failed to mint Streaming STT token');
      }
      const { token } = await tokenRes.json();

      // 2. Open WebSocket to AssemblyAI Streaming Edge
      const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-5-pro&token=${token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.callbacks.onStatusChange?.('connected');
        this.startMicrophone();
      };

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.error('Streaming STT WebSocket error:', err);
        this.callbacks.onError?.('Streaming STT connection error.');
      };

      this.ws.onclose = (ev) => {
        console.log('Streaming STT WebSocket closed:', ev.code, ev.reason);
        this.isConnected = false;
        this.stopMicrophone();
        this.callbacks.onStatusChange?.('disconnected');
      };
    } catch (err: any) {
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

        // Determine speaker (AssemblyAI emits speaker_label e.g. "A", "B" or 1, 2)
        const rawSpeaker = msg.speaker_label || 'A';
        const speaker: 'Doctor' | 'Patient' = rawSpeaker === 'A' || rawSpeaker === '0' || rawSpeaker === 0 ? 'Doctor' : 'Patient';

        const entities = extractMedicalEntities(transcript);

        const turn: DialogueTurn = {
          id: `turn-${msg.turn_order || Date.now()}`,
          speaker,
          text: transcript,
          timestamp: new Date().toLocaleTimeString(),
          isFinal: Boolean(msg.end_of_turn),
          entities
        };

        this.callbacks.onTurn?.(turn);
      } else if (msg.type === 'Error') {
        console.error('AssemblyAI Streaming STT error message:', msg);
        this.callbacks.onError?.(msg.error || 'Streaming speech error');
      }
    } catch (e) {
      console.error('Error parsing STT message:', e);
    }
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
      this.callbacks.onError?.(`Microphone access error: ${e.message}`);
    }
  }

  public disconnect() {
    this.stopMicrophone();

    // Critical: Always send { "type": "Terminate" } to avoid session lingering
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'Terminate' }));
        this.ws.close();
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
