import { SR_OUT } from "../dsp/Dsp";

export type EnergyVadOpts = {
  vadHigh: number; vadLow: number;
  minSilenceMs: number; minSpeechMs: number; padMs: number;
  attackMs: number; releaseMs: number; floorAlpha: number;
  sr?: number; frame?: number;
};

export class EnergyVAD {
  private readonly sr: number;
  private readonly frame: number;
  private readonly high: number;
  private readonly low: number;
  private readonly minSilence: number;
  private readonly minSpeech: number;
  private readonly pad: number;
  private readonly attack: number;
  private readonly release: number;
  private readonly floorAlpha: number;

  private triggered = false;
  private tempEnd = 0;
  private sampleCursor = 0;
  private buf = new Float32Array(0);
  private floorMean = 0.0;
  private floorVar = 1e-6;
  private warmed = false;

  constructor(opts: EnergyVadOpts) {
    this.sr = opts.sr ?? SR_OUT;
    this.frame = opts.frame ?? 512;
    this.high = opts.vadHigh;
    this.low = opts.vadLow;
    this.minSilence = opts.minSilenceMs;
    this.minSpeech = opts.minSpeechMs;
    this.pad = opts.padMs;
    this.attack = opts.attackMs;
    this.release = opts.releaseMs;
    this.floorAlpha = opts.floorAlpha;
  }

  reset() {
    this.triggered = false; this.tempEnd = 0; this.sampleCursor = 0;
    this.buf = new Float32Array(0); this.floorMean = 0.0; this.floorVar = 1e-6; this.warmed = false;
  }

  private _append(a: Float32Array) {
    const out = new Float32Array(this.buf.length + a.length);
    out.set(this.buf, 0); out.set(a, this.buf.length); this.buf = out;
  }


  private updateFloor(rms: number, noisy: boolean) {
    const a = noisy ? this.floorAlpha : Math.min(0.98, this.floorAlpha);
    const mean = this.floorMean * a + rms * (1 - a);
    const diff = rms - mean;
    const varNew = this.floorVar * a + diff * diff * (1 - a);
    this.floorMean = mean; this.floorVar = Math.max(varNew, 1e-6); this.warmed = true;
  }

  private zscore(rms: number) {
    const std = Math.sqrt(this.floorVar); if (std < 1e-6) return 0; return (rms - this.floorMean) / std;
  }

  feed(chunk: Float32Array, absOffsetSec: number): { start?: number; end?: number } | null {
    this._append(chunk);
    const out: { start?: number; end?: number } = {};
  
    while (this.buf.length >= this.frame) {
      const frame = this.buf.subarray(0, this.frame);
      this.buf = this.buf.subarray(this.frame);
  
      // RMS
      let s = 0.0; for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
      const frameRms = Math.sqrt(s / frame.length);
  
      this.sampleCursor += this.frame;
      const z = this.zscore(frameRms);
  
      // *** Only adapt floor when NOT in speech, or when clearly below low ***
      if (!this.triggered || z < this.low) {
        const noisy = z > this.low; // keep your noisy hint for EMA rate choice
        this.updateFloor(frameRms, noisy);
      }
      // else: freeze floor while speaking to avoid drift
  
      if (!this.triggered) {
        // START: require z > high
        if (z > this.high) {
          const startSamples = this.sampleCursor - Math.floor((this.attack / 1000) * this.sr);
          out.start = startSamples / this.sr + absOffsetSec;
          this.triggered = true;
          this.tempEnd = 0;
        }
      } else {
        // END logic: z must stay < low for minSilence + release (hang)
        if (z < this.low) {
          if (!this.tempEnd) this.tempEnd = this.sampleCursor;
          const silentMs = (this.sampleCursor - this.tempEnd) * 1000 / this.sr;
  
          if (silentMs >= (this.minSilence + this.release)) {
            const padSamples = Math.floor((this.pad / 1000) * this.sr);
            const endSamples = Math.max(0, this.tempEnd - padSamples);
            out.end = endSamples / this.sr + absOffsetSec;
            this.triggered = false;
            this.tempEnd = 0;
          }
        } else {
          // speaking continues
          this.tempEnd = 0;
        }
      }
    }
  
    // Short blip guard
    if (out.start !== undefined && out.end !== undefined) {
      if ((out.end - out.start) * 1000 < this.minSpeech) return null;
    }
    return (out.start !== undefined || out.end !== undefined) ? out : null;
  }
}