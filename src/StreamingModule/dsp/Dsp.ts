export const SR_OUT = 16000;

export const concatF32 = (a: Float32Array, b: Float32Array) => {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length);
  return out;
};

export const resampleTo16k = (input: Float32Array, srcRate: number) => {
  if (srcRate === SR_OUT) return input;
  const ratio = srcRate / SR_OUT;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = x - i0;
    out[i] = input[i0] + (input[i1] - input[i0]) * t;
  }
  return out;
};

export const floatToInt16 = (f32: Float32Array) => {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

export const pcm16ToWav = (pcm: Int16Array, sampleRate: number) => {
  const bytesPerSample = 2, numCh = 1;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  let o = 0;
  const ws = (s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i)); };
  const w16 = (x: number) => { v.setUint16(o, x, true); o += 2; };
  const w32 = (x: number) => { v.setUint32(o, x, true); o += 4; };
  ws("RIFF"); w32(36 + dataSize); ws("WAVE");
  ws("fmt "); w32(16); w16(1); w16(numCh); w32(sampleRate); w32(byteRate); w16(blockAlign); w16(16);
  ws("data"); w32(dataSize);
  for (let i = 0; i < pcm.length; i++, o += 2) v.setInt16(o, pcm[i], true);
  return new Blob([buf], { type: "audio/wav" });
};

export const rms = (f32: Float32Array) => {
  let s = 0; for (let i = 0; i < f32.length; i++) s += f32[i] * f32[i];
  return Math.sqrt(s / f32.length);
};
