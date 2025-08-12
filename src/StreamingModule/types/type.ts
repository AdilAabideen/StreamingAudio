// ==============================
// File: src/types.ts
// ==============================
export type TWord = [number, number, string]; // [absBegSec, absEndSec, token]

export type Word = { start: number; end: number; text?: string; word?: string };
export type Segment = { start: number; end: number; text: string; words?: Word[] };

export type Options = {
  apiKey: string;
  model?: "whisper-1";
  language?: string;
  minChunkSizeSec?: number;
  bufferTrimSec?: number;
  useVad?: boolean;
  vadThreshold?: number; // legacy simple VAD, unused by EnergyVAD
  vadHangMs?: number;    // legacy simple VAD, unused by EnergyVAD
  // Energy‑VAD tunables
  vadMinSilenceMs?: number;
  vadPadMs?: number;
  vadAttackMs?: number;
  vadReleaseMs?: number;
  vadMinSpeechMs?: number;
  vadFloorAdapt?: number;
  vadHigh?: number;
  vadLow?: number;
  onWord?: (w: { text: string; start: number; end: number }) => void;
  onTranscript?: (full: string) => void;
};

export type TranscribeResult = { words: TWord[]; segments: Segment[] };