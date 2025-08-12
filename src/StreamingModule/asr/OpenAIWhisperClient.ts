import { SR_OUT, floatToInt16, pcm16ToWav } from "../dsp/Dsp";
import { buildPrompt, toWordsFromSegments } from "../text/Align";
import type { Options, Segment, TWord, TranscribeResult } from "../types/type";

interface LemonfoxWord {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
  speaker?: string;
}

interface LemonfoxSegment {
  id?: number;
  text?: string;
  start?: number;
  end?: number;
  language?: string;
  speaker?: string;
  words?: LemonfoxWord[];
}

interface LemonfoxResponse {
  task?: string;
  language?: string;
  duration?: number;
  text?: string;
  segments?: LemonfoxSegment[];
}

export class OpenAIWhisperClient {
  private model: Options["model"];
  private language?: string;
  private apiKey: string;

  constructor(
    apiKey: string,
    model: Options["model"] = "whisper-1",
    language?: string
  ) {
    this.model = model;
    this.language = language;
    this.apiKey = apiKey;
  }

  async transcribeFullBuffer(
    audioBuf: Float32Array,
    committed: TWord[],
    bufferOffsetSec: number
  ): Promise<TranscribeResult> {
    if (audioBuf.length === 0) return { words: [], segments: [] };

    const pcm16 = floatToInt16(audioBuf);
    const wav = pcm16ToWav(pcm16, SR_OUT);
    const file = new File([wav], "buffer.wav", { type: "audio/wav" });
    const prompt = buildPrompt(committed, bufferOffsetSec);

    const formData = new FormData();
    formData.append("file", file);
    if (this.language) formData.append("language", this.language);
    formData.append("temperature", "0");
    formData.append("response_format", "verbose_json");
    formData.append("prompt", prompt);
    formData.append("timestamp_granularities[]", "word");
    formData.append("timestamp_granularities[]", "segment");

    let resp: LemonfoxResponse;
    try {
      const response = await fetch(
        "https://api.lemonfox.ai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + this.apiKey,
          },
          body: formData,
        }
      );
      resp = (await response.json()) as LemonfoxResponse;
    } catch {
      return { words: [], segments: [] };
    }

    const segments: Segment[] = (resp.segments ?? []).map((s) => ({
      start: s.start ?? 0,
      end: s.end ?? 0,
      text: s.text ?? "",
      words: (s.words ?? []).map((w) => ({
        start: w.start ?? s.start ?? 0,
        end: w.end ?? s.end ?? 0,
        word: w.word ?? w.text ?? "",
      })),
    }));

    let words = toWordsFromSegments(segments, bufferOffsetSec);

    if ((!words || !words.length) && resp.text) {
      const toks = String(resp.text).trim().split(/\s+/).filter(Boolean);
      const b0 = bufferOffsetSec;
      const b1 = bufferOffsetSec + audioBuf.length / SR_OUT;
      const dur = Math.max(1e-3, b1 - b0);
      words = toks.map((t, i) => {
        const b = b0 + dur * (i / toks.length);
        const e = b0 + dur * ((i + 1) / toks.length);
        return [b, e, t] as TWord;
      });
    }

    return { words: words ?? [], segments };
  }
}