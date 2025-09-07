import { useState } from "react";
import { startPseudoWhisperStream } from "../../StreamingModule/index";

export default function MicStreamToggle() {



    const [isRecording, setRecording] = useState(false);
    const [handle, setHandle] = useState<{ stop: () => Promise<void> } | null>(null);
    const [text, setText] = useState("");

    const toggle = async () => {
        if (handle) {
            await handle.stop(); setHandle(null); setRecording(false); return;
        }
        const h = await startPseudoWhisperStream({
            apiKey: apiKey, // ⚠️ for local prototyping only; do not ship keys in FE
            model: "whisper-1",
            language: "en",
            minChunkSizeSec: 2.0,
            bufferTrimSec: 8,
            useVad: true,
            onTranscript: setText,
            onWord: (w) => console.log("word", w),
        });
        setHandle(h); setRecording(true);
    };

    return (
        <div className="flex flex-col items-center justify-center gap-12">
            <button className={`w-56 h-56 rounded-full bg-blue-500 hover:scale-110 transition-all duration-300 cursor-pointer ${isRecording ? 'bg-red-500 scale-110' : 'bg-blue-500'}`} onClick={toggle} onKeyDown={(e) => e.key === 'Enter' && toggle()}  tabIndex={0} aria-label={isRecording ? 'Stop recording' : 'Start recording'}></button>
            <div className="text-gray-500 text-lg font-sans max-w-[80%] text-center">{text}</div>
        </div>

    );
}