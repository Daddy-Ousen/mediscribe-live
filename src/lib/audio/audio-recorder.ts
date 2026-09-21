import { convertFloat32ToInt16, downsampleBuffer, int16ToBase64 } from './pcm-utils';

export interface AudioRecorderOptions {
  targetSampleRate: number; // 24000 for Voice Agent, 16000 for STT
  chunkDurationMs?: number; // default ~100ms
  onAudioChunk: (data: { int16: Int16Array; base64: string; rawBytes: Uint8Array }) => void;
  onVolumeChange?: (volume: number) => void;
  onError?: (err: Error) => void;
}

export class PcmAudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private options: AudioRecorderOptions;
  private isRecording: boolean = false;
  // Samples waiting to be sent. Frames are emitted at a fixed duration so the
  // server always receives 50-1000 ms chunks, whatever the device sample rate.
  private pending: Int16Array = new Int16Array(0);

  constructor(options: AudioRecorderOptions) {
    this.options = {
      chunkDurationMs: 100,
      ...options,
    };
  }

  public async start(): Promise<void> {
    if (this.isRecording) return;

    try {
      if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported or blocked in this browser environment.');
      }

      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (constraintErr) {
        console.warn('getUserMedia with constraints failed, falling back to basic audio capture:', constraintErr);
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        throw new Error('Web Audio API (AudioContext) is not supported in this browser.');
      }
      this.audioCtx = new AudioCtxClass();

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const inputSampleRate = this.audioCtx.sampleRate;
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

      // Buffer size: 4096 gives ~85-92ms chunks at 44.1k/48k
      const bufferSize = 4096;
      this.processorNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

      this.processorNode.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputChannelData = event.inputBuffer.getChannelData(0);

        // Calculate RMS Volume for Visualizer [0.0 - 1.0]
        if (this.options.onVolumeChange) {
          let sumSquares = 0;
          for (let i = 0; i < inputChannelData.length; i++) {
            sumSquares += inputChannelData[i] * inputChannelData[i];
          }
          const rms = Math.sqrt(sumSquares / inputChannelData.length);
          const normalizedVol = Math.min(1.0, rms * 5.0); // Boost for UI visualizer
          this.options.onVolumeChange(normalizedVol);
        }

        // Downsample to target sample rate (24kHz or 16kHz)
        let processedFloat32: Float32Array<any> = inputChannelData;
        if (inputSampleRate !== this.options.targetSampleRate) {
          try {
            processedFloat32 = downsampleBuffer(
              inputChannelData,
              inputSampleRate,
              this.options.targetSampleRate
            );
          } catch (e) {
            console.error('Downsampling error:', e);
            return;
          }
        }

        // Convert to Int16 PCM and append to the pending buffer
        const converted = convertFloat32ToInt16(processedFloat32);
        const merged = new Int16Array(this.pending.length + converted.length);
        merged.set(this.pending, 0);
        merged.set(converted, this.pending.length);

        const frameSamples = Math.round((this.options.targetSampleRate * (this.options.chunkDurationMs || 100)) / 1000);
        let offset = 0;
        while (merged.length - offset >= frameSamples) {
          const int16 = merged.slice(offset, offset + frameSamples);
          offset += frameSamples;
          const base64 = int16ToBase64(int16);
          const rawBytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
          this.options.onAudioChunk({ int16, base64, rawBytes });
        }
        this.pending = merged.slice(offset);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioCtx.destination);
      this.isRecording = true;
    } catch (err: any) {
      this.isRecording = false;
      this.cleanup();
      if (this.options.onError) {
        this.options.onError(err);
      }
      throw err;
    }
  }

  public stop(): void {
    this.isRecording = false;
    this.pending = new Int16Array(0);
    this.cleanup();
    if (this.options.onVolumeChange) {
      this.options.onVolumeChange(0);
    }
  }

  private cleanup(): void {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  public get recording(): boolean {
    return this.isRecording;
  }
}
