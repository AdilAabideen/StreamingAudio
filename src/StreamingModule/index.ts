import type { Options } from "./types/type";
import { PseudoWhisperStream } from "./asr/pseudoWhisperStreams";

export type { Options } from "./types/type";

export async function startPseudoWhisperStream(opts: Options) {
  const stream = new PseudoWhisperStream(opts);
  const handle = await stream.start();
  return handle;
}