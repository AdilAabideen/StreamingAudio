import type { Options, TWord } from "../types/type";
import { SR_OUT, concatF32, resampleTo16k } from "../dsp/Dsp";
import { AudioGraph } from "../audio/audioGraph";
import { EnergyVAD } from "../audio/EnergyVAD";
import { localAgreement2 } from "../text/Align";
import { trimBySegment, hardTrimToLastCommitted } from "../text/Trim";
import { OpenAIWhisperClient } from "./OpenAIWhisperClient";

export class PseudoWhisperStream {
    private opts: Required<Options>;
    private graph!: AudioGraph;
    private stream!: MediaStream;
    private whisper!: OpenAIWhisperClient;

    // Loop driven Speech vars
    private inSpeech = false;
    private speechStartSec: number | null = null;

    // Metrics
    private apiRequestCount = 0;
    private cumulativeSpeechSec = 0;

    // rolling state
    private audioBuf = new Float32Array(0);
    private bufferOffsetSec = 0;
    private committed: TWord[] = [];
    private prevHyp: TWord[] = [];
    private lastUpdate = performance.now();
    private stopped = false;
    private vad: EnergyVAD | null = null;
    private silenceCooldownMs = 600;
    private lastSilenceFlushMs = 0;

    constructor(opts: Options) {
        this.opts = {
            model: "whisper-1",
            language: "en",
            minChunkSizeSec: 1.0,
            bufferTrimSec: 8,
            useVad: true,
            vadThreshold: 0.015,
            vadHangMs: 450,
            vadMinSilenceMs: 500,
            vadPadMs: 120,
            vadAttackMs: 30,
            vadReleaseMs: 200,
            vadMinSpeechMs: 120,
            vadFloorAdapt: 0.995,
            vadHigh: 3.0,
            vadLow: 2.0,
            onWord: undefined,
            onTranscript: undefined,
            ...opts,
        } as Required<Options>;
        this.whisper = new OpenAIWhisperClient(this.opts.apiKey, this.opts.model, this.opts.language);
    }

    private now = () => performance.now();

    private initVADIfNeeded() {
        if (!this.opts.useVad) { this.vad = null; return; }
        if (!this.vad) {
            this.vad = new EnergyVAD({
                vadHigh: this.opts.vadHigh,
                vadLow: this.opts.vadLow,
                minSilenceMs: this.opts.vadMinSilenceMs,
                minSpeechMs: this.opts.vadMinSpeechMs,
                padMs: this.opts.vadPadMs,
                attackMs: this.opts.vadAttackMs,
                releaseMs: this.opts.vadReleaseMs,
                floorAlpha: this.opts.vadFloorAdapt,
                sr: SR_OUT,
            });
        }
    }



    private emitCommit = (freshIn: TWord[]) => {
        if (!freshIn.length) return;
        this.committed = this.committed.concat(freshIn);
        if (this.opts.onWord) for (const [b, e, t] of freshIn) this.opts.onWord({ text: t, start: b, end: e });
        if (this.opts.onTranscript) this.opts.onTranscript(this.committed.map(w => w[2]).join(" ").trim());
    };

    private async flushAndProcess() {
        this.lastUpdate = performance.now();

        this.apiRequestCount++;
        const { words: curr, segments } = await this.whisper.transcribeFullBuffer(
            this.audioBuf, this.committed, this.bufferOffsetSec
        );

        const lastEnd = this.committed.length ? this.committed[this.committed.length - 1][1] : this.bufferOffsetSec;
        const lcp = localAgreement2(this.prevHyp, curr, lastEnd);
        

        if (lcp.length) {
            const fresh = lcp.filter(w => w[0] >= lastEnd);
            if (fresh.length) this.emitCommit(fresh);
        }
        this.prevHyp = curr;

        trimBySegment(segments, {
            audioBuf: this.audioBuf,
            bufferOffsetSec: this.bufferOffsetSec,
            committed: this.committed,
            bufferTrimSec: this.opts.bufferTrimSec,
        });
       
    }



    async start(): Promise<{ stop: () => Promise<void> }> {
        // mic
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: { ideal: true },
                noiseSuppression: { ideal: true },
                autoGainControl: { ideal: true },
                sampleRate: 48000,
                sampleSize: 16,
            } as MediaTrackConstraints,
        });

        // graph
        this.graph = new AudioGraph(this.stream);
        this.initVADIfNeeded();

        // old
        this.graph.node.onaudioprocess = async (e) => {
            if (this.stopped) return;
            const src = e.inputBuffer.getChannelData(0);
            const mono16k = resampleTo16k(src, this.graph.ctx.sampleRate);
            this.audioBuf = concatF32(this.audioBuf, mono16k);

            //VAD disabled → cadence by time
            if (!this.opts.useVad || !this.vad) {
                const elapsed = (performance.now() - this.lastUpdate) / 1000;
                if (elapsed >= this.opts.minChunkSizeSec) await this.flushAndProcess();
                return;
            }

            // VAD enabled
            const ev = this.vad ? this.vad.feed(mono16k, this.bufferOffsetSec) : null;
            
            if (ev && ev.start !== undefined) {
                // speech started
                this.inSpeech = true;
                this.speechStartSec = ev.start;
                console.log("Speech started at", ev.start);
            }
            if (ev && ev.end !== undefined) {
                console.log("Speech ended at", ev.end);

                if (this.speechStartSec != null) {
                    this.cumulativeSpeechSec += Math.max(0, ev.end - this.speechStartSec);
                    this.speechStartSec = null;
                }

                if (((this.now() - this.lastSilenceFlushMs) > this.silenceCooldownMs)) {
                    console.log("LAST FLUSHING AND PROCESSING");

                    await this.flushAndProcess();
                    hardTrimToLastCommitted({
                        audioBuf: this.audioBuf,
                        bufferOffsetSec: this.bufferOffsetSec,
                        committed: this.committed,
                    });
                    this.lastSilenceFlushMs = this.now();
                    this.inSpeech = false;
                    await this.flushAndProcess();
                }
                return; // during silence tail, avoid extra cadence flushes
            }

            const elapsed = (performance.now() - this.lastUpdate) / 1000;
            if (elapsed >= this.opts.minChunkSizeSec && this.inSpeech) {
                await this.flushAndProcess();

            }
        };

        return { stop: this.stop };
    }

    private stop = async () => {
        this.stopped = true;
        try { this.graph.node.disconnect(); } catch (e) {console.error("Error disconnecting node", e)}
        try { this.graph.lp.disconnect(); } catch (e) {console.error("Error disconnecting lp", e)}
        try { this.graph.hp.disconnect(); } catch (e) {console.error("Error disconnecting hp", e)}
        try { this.graph.source.disconnect(); } catch (e) {console.error("Error disconnecting source", e)}
        this.stream.getTracks().forEach(t => t.stop());
        try { await this.graph.ctx.close(); } catch (e) {console.error("Error closing graph", e)}

        // final flush
        try {
            if (this.audioBuf.length > 200) {
                const { words: finalWords } = await this.whisper.transcribeFullBuffer(
                    this.audioBuf, this.committed, this.bufferOffsetSec
                );
                const lastEnd = this.committed.length ? this.committed[this.committed.length - 1][1] : this.bufferOffsetSec;
                const tail = finalWords.filter(w => w[0] > lastEnd + 1e-3);
                if (tail.length) this.emitCommit(tail);
            }
        } catch (e) {console.error("Error final flush", e)}
        // metrics log
        console.log(`[ASR] total requests=${this.apiRequestCount}, speech time=${this.cumulativeSpeechSec?.toFixed(2) ?? "0.00"}s`);
    };
}