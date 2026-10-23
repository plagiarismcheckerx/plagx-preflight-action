// Text structure helpers: words, lines, paragraphs, headings, sentences, syllables.
// All offsets are UTF-16 code-unit offsets into the original text.

const WORD_RE = /[\p{L}\p{M}0-9]+(?:['’-][\p{L}\p{M}0-9]+)*/gu;

const ABBREVIATIONS = new Set([
  'al', 'approx', 'cf', 'co', 'dept', 'dr', 'ed', 'eds', 'eg', 'et', 'etc', 'fig', 'figs', 'ie',
  'inc', 'jr', 'ltd', 'mr', 'mrs', 'ms', 'no', 'nos', 'p', 'pp', 'prof', 'sr', 'st', 'vol', 'vols', 'vs',
]);

const REFERENCE_HEADINGS = new Set([
  'references', 'reference list', 'bibliography', 'works cited', 'work cited', 'sources', 'literature cited',
]);

/** Every word token as { text, start, end }. Numbers count as words. */
export function words(text) {
  const out = [];
  for (const m of text.matchAll(WORD_RE)) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/** Number of words in the text. */
export function countWords(text) {
  return words(String(text)).length;
}

/** Start offset of every line. */
export function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

/** 1-based line and column (UTF-16 units) for an offset. */
export function position(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 };
}

const isSpace = (c) => c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v'
  || c === ' ';

/** Normalised heading text: lowercase, without markdown #, numbering or a trailing colon. */
export function normalizeHeading(s) {
  return s.trim()
    .replace(/^#+\s*/, '')
    .replace(/^(?:\d+(?:\.\d+)*\.?|[ivxlc]+\.)\s+/i, '')
    .replace(/\s*:$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isHeading(p) {
  if (p.text.includes('\n')) return false;
  if (p.text.startsWith('#')) return true;
  if (REFERENCE_HEADINGS.has(normalizeHeading(p.text))) return true;
  const n = countWords(p.text);
  if (n < 1 || n > 10) return false;
  if (/[.!?,;"'”’)\]]$/.test(p.text)) return false;
  return /^[\p{Lu}0-9]/u.test(p.text);
}

/**
 * Paragraphs: runs of non-blank lines. Each is { text, start, end, heading }.
 * text is the trimmed original slice (it may contain line breaks).
 */
export function paragraphs(text) {
  const out = [];
  const starts = lineStarts(text);
  let blockStart = -1;
  let blockEnd = -1;
  const flush = () => {
    if (blockStart < 0) return;
    let s = blockStart;
    let e = blockEnd;
    while (s < e && isSpace(text[s])) s += 1;
    while (e > s && isSpace(text[e - 1])) e -= 1;
    const p = { text: text.slice(s, e), start: s, end: e };
    p.heading = isHeading(p);
    out.push(p);
    blockStart = -1;
  };
  for (let i = 0; i < starts.length; i += 1) {
    const ls = starts[i];
    const le = i + 1 < starts.length ? starts[i + 1] - 1 : text.length;
    const line = text.slice(ls, le);
    if (/^[ \t\r\f\v ]*$/.test(line)) {
      flush();
    } else {
      if (blockStart < 0) blockStart = ls;
      blockEnd = le;
    }
  }
  flush();
  return out;
}

/**
 * Splits a document into body and reference list. The reference list starts at
 * the first heading named References, Bibliography, Works Cited, etc.
 */
export function structure(text) {
  const paras = paragraphs(text);
  const idx = paras.findIndex((p) => p.heading && REFERENCE_HEADINGS.has(normalizeHeading(p.text)));
  const body = idx < 0 ? paras : paras.slice(0, idx);
  const referenceHeading = idx < 0 ? null : paras[idx];
  const entries = [];
  if (idx >= 0) {
    const starts = lineStarts(text);
    for (let i = 0; i < starts.length; i += 1) {
      const ls = starts[i];
      if (ls <= referenceHeading.end) continue;
      const le = i + 1 < starts.length ? starts[i + 1] - 1 : text.length;
      let s = ls;
      let e = le;
      while (s < e && isSpace(text[s])) s += 1;
      while (e > s && isSpace(text[e - 1])) e -= 1;
      if (e > s) entries.push({ text: text.slice(s, e), start: s, end: e });
    }
  }
  const bodyEnd = idx < 0 ? text.length : referenceHeading.start;
  return { paragraphs: paras, body, bodyEnd, referenceHeading, entries };
}

/** Splits one block of text into sentences, offsets relative to `base`. */
function sentencesIn(s, base) {
  const out = [];
  let start = 0;
  const push = (end) => {
    let a = start;
    let b = end;
    while (a < b && isSpace(s[a])) a += 1;
    while (b > a && isSpace(s[b - 1])) b -= 1;
    if (b > a) out.push({ text: s.slice(a, b), start: base + a, end: base + b });
    start = end;
  };
  for (const m of s.matchAll(/[.!?]+["'”’)\]]*(?=\s|$)/g)) {
    const marks = m[0].replace(/["'”’)\]]+$/, '');
    if (marks.startsWith('..')) continue; // an ellipsis
    if (marks === '.') {
      // A lone period after an abbreviation, an initial or a dotted form (U.S.) does not end a sentence.
      const before = s.slice(0, m.index).match(/(?:^|[\s(])([\p{L}.]+)$/u);
      if (before) {
        const w = before[1].toLowerCase();
        if (ABBREVIATIONS.has(w) || /^\p{L}$/u.test(w) || w.includes('.')) continue;
      }
    }
    push(m.index + m[0].length);
  }
  push(s.length);
  return out;
}

/** Sentences as { text, start, end }. Headings and blank lines end a sentence. */
export function splitSentences(text) {
  const out = [];
  for (const p of paragraphs(String(text))) {
    if (p.heading) out.push({ text: p.text, start: p.start, end: p.end });
    else out.push(...sentencesIn(p.text, p.start));
  }
  return out;
}

/** Sentences of one paragraph object. */
export function paragraphSentences(p) {
  return sentencesIn(p.text, p.start);
}

/** Estimated syllables in an English word. */
export function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = w.match(/[aeiouy]+/g);
  return groups ? groups.length : 1;
}
