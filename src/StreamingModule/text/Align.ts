import type { Segment, TWord } from "../types/type";

export const buildPrompt = (confirmed: TWord[], offset: number) => {
  const before = confirmed.filter(w => w[1] <= offset);
  let acc = "";
  for (let i = before.length - 1; i >= 0 && acc.length < 200; i--) {
    acc = before[i][2] + (acc ? " " + acc : "");
  }
  return acc;
};

export const toWordsFromSegments = (segments: Segment[], offset: number): TWord[] => {
  const out: TWord[] = [];
  for (const seg of segments) {
    const s0 = (seg.start ?? 0) + offset;
    const s1 = (seg.end ?? s0) + offset;
    const dur = Math.max(1e-3, s1 - s0);

    if (seg.words && seg.words.length) {
      for (const w of seg.words) {
        const text = (w.text ?? w.word ?? "").trim();
        if (!text) continue;
        const b = ((w.start ?? seg.start ?? 0) + offset);
        const e = ((w.end   ?? seg.end   ?? 0) + offset);
        out.push([Math.max(0, b), Math.max(b, e), text]);
      }
      continue;
    }

    const toks = (seg.text || "").trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      const b = s0 + dur * (i / toks.length);
      const e = s0 + dur * ((i + 1) / toks.length);
      out.push([b, e, toks[i]]);
    }
  }
  return out;
};

const norm = (s: string) => s.toLowerCase();
export const localAgreement2 = (prev: TWord[], curr: TWord[], lastEnd: number): TWord[] => {
  const ws = lastEnd - 1.0;
  const p = prev.filter(w => w[0] >= ws).map(w => w[2]);
  const c = curr.filter(w => w[0] >= ws);
  let lcp = 0;
  while (lcp < c.length && lcp < p.length && norm(c[lcp][2]) === norm(p[lcp])) lcp++;
  return c.slice(0, lcp);
};
