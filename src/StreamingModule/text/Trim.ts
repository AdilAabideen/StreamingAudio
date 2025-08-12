import { SR_OUT } from "../dsp/Dsp";
import type { Segment, TWord } from "../types/type";

export function trimBySegment(
  segments: Segment[],
  state: { audioBuf: Float32Array; bufferOffsetSec: number; committed: TWord[]; bufferTrimSec: number }
) {
  const { bufferTrimSec } = state;
  if ((state.audioBuf.length / SR_OUT) <= bufferTrimSec) return;
  const lastEnd = state.committed.length ? state.committed[state.committed.length - 1][1] : state.bufferOffsetSec;
  const ends = segments.map(s => s.end ?? 0);
  let cutAt: number | null = null;
  for (let i = ends.length - 1; i >= 0; i--) {
    const eAbs = ends[i] + state.bufferOffsetSec;
    if (eAbs <= lastEnd) { cutAt = eAbs; break; }
  }
  if (cutAt == null) return;

  const cutSamples = Math.max(0, Math.floor((cutAt - state.bufferOffsetSec) * SR_OUT));
  if (cutSamples <= 0 || cutSamples >= state.audioBuf.length) return;

  state.audioBuf = state.audioBuf.slice(cutSamples);
  state.bufferOffsetSec = cutAt;
  state.committed = state.committed.filter(w => w[1] > state.bufferOffsetSec - 0.2);
}

export function hardTrimToLastCommitted(state: { audioBuf: Float32Array; bufferOffsetSec: number; committed: TWord[] }) {
  const lastEnd = state.committed.length ? state.committed[state.committed.length - 1][1] : state.bufferOffsetSec;
  const cutSamples = Math.max(0, Math.floor((lastEnd - state.bufferOffsetSec) * SR_OUT));
  if (cutSamples > 0 && cutSamples < state.audioBuf.length) {
    state.audioBuf = state.audioBuf.slice(cutSamples);
    state.bufferOffsetSec = lastEnd;
    state.committed = state.committed.filter(w => w[1] > state.bufferOffsetSec - 0.2);
  }
}