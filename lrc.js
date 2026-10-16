// LRC parsing + per-word timing.
// Supports plain LRC ([mm:ss.xx] line) and "enhanced" LRC (<mm:ss.xx> word tags).
// When a line has no word tags, word timing is interpolated across the line.

const toSec = (m, s, f) => +m * 60 + +s + (f ? +('0.' + f) : 0);

export function parseLRC(text) {
  const out = [];
  let offset = 0;
  for (const raw of (text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const off = line.match(/^\[offset:\s*(-?\d+)\]/i);
    if (off) { offset = +off[1] / 1000; continue; }
    const lead = /^(\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/.exec(line);
    if (!lead) continue;
    const times = [...lead[0].matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)].map((m) => toSec(m[1], m[2], m[3]));
    const rest = line.slice(lead[0].length);
    let words = null;
    let txt = rest.trim();
    if (/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/.test(rest)) {
      words = [];
      const re = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>([^<]*)/g;
      let m;
      while ((m = re.exec(rest))) words.push({ t: toSec(m[1], m[2], m[3]), text: m[4] });
      txt = words.map((w) => w.text).join('').replace(/\s+/g, ' ').trim();
      if (!words.length) words = null;
    }
    for (const t of times) out.push({ t: t - offset, text: txt, words });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

// Turn parsed lines into render-ready lines with start/end and per-word timing.
export function prepareLines(parsed, duration) {
  const lines = [];
  if (parsed.length && parsed[0].t > 4 && parsed[0].text) lines.push({ t: 0, text: '', words: null });
  for (const l of parsed) {
    const prev = lines[lines.length - 1];
    if (!l.text && prev && !prev.text) continue; // collapse consecutive gaps
    lines.push({ ...l });
  }
  lines.forEach((l, i) => {
    const nxt = lines[i + 1];
    l.gap = !l.text;
    l.end = nxt ? nxt.t : duration && duration > l.t ? duration : l.t + 6;
    if (l.gap) { l.showDots = l.end - l.t >= 3; return; }
    const dur = Math.max(0.2, l.end - l.t);
    if (l.words) {
      l.words = l.words
        .map((w, k) => {
          const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(w.text);
          return { pre: m[1], text: m[2], post: m[3], s: w.t, e: l.words[k + 1] ? l.words[k + 1].t : Math.min(l.end, w.t + 1.2) };
        })
        .filter((w) => w.text);
      l.real = true;
    } else {
      const parts = l.text.split(/\s+/).filter(Boolean);
      // Singers rarely fill the whole gap before the next line: estimate a sung duration from length,
      // but never more than the gap and never less than 75% of it for sparse lines.
      const est = l.text.length * 0.12 + 0.6;
      const fill = Math.max(0.3, Math.min(dur - 0.08, Math.max(est, dur * 0.75)));
      const wts = parts.map((p) => Math.max(1, p.replace(/[^\p{L}\p{N}]/gu, '').length) + 0.6);
      const total = wts.reduce((a, b) => a + b, 0);
      let c = 0;
      l.words = parts.map((p, i) => {
        const s = l.t + (fill * c) / total;
        c += wts[i];
        return { pre: '', text: p, post: i < parts.length - 1 ? ' ' : '', s, e: l.t + (fill * c) / total };
      });
    }
  });
  return lines;
}
