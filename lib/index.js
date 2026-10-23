// Plagx Preflight: a draft checker with basic grammar suggestions.
// A free academic writing utility by Plagiarism Checker X. Runs fully offline.
import {
  words, countWords, splitSentences, structure, lineStarts, position, normalizeHeading, paragraphSentences, syllables,
} from './text.js';
import { findCitations, STYLES } from './citations.js';
import * as checks from './checks.js';

export { countWords, splitSentences, findCitations, STYLES };

export const VERSION = '0.1.2';

/** Check groups. 'passive-voice' is off by default. */
export const CHECKS = ['length', 'references', 'punctuation', 'grammar', 'passive-voice'];
export const DEFAULT_CHECKS = ['length', 'references', 'punctuation', 'grammar'];

const RUNNERS = {
  length: checks.length,
  references: checks.references,
  punctuation: checks.punctuation,
  grammar: checks.grammar,
  'passive-voice': checks.passiveVoice,
};
// Codes inside URLs, email addresses and `code` are skipped.
const MASKED = /^(?:unmatched-|double-space|space-before|missing-space|repeated-|mixed-quote|a-an|sentence-capital|lowercase-i|common-confusion|passive-voice)/;
const MASK_RE = /\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+|`[^`\n]*`/g;

function limit(value, name) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new TypeError(`${name} must be a whole number`);
  return n;
}

function normalizeOptions(options = {}) {
  const style = options.style ?? 'apa';
  if (!STYLES.includes(style)) throw new TypeError(`Unknown style "${style}". Use: ${STYLES.join(', ')}`);
  const list = options.checks ?? DEFAULT_CHECKS;
  for (const c of list) if (!CHECKS.includes(c)) throw new TypeError(`Unknown check "${c}". Use: ${CHECKS.join(', ')}`);
  return {
    minWords: limit(options.minWords, 'minWords'),
    maxWords: limit(options.maxWords, 'maxWords'),
    style,
    checks: CHECKS.filter((c) => list.includes(c)),
    requiredHeadings: [...(options.requiredHeadings ?? [])].map(String),
  };
}

function computeStats(text, doc) {
  const bodyWords = countWords(text.slice(0, doc.bodyEnd));
  let sentences = 0;
  let sentenceWords = 0;
  let syl = 0;
  let paras = 0;
  for (const p of doc.body) {
    if (p.heading) continue;
    paras += 1;
    sentences += paragraphSentences(p).length;
    for (const w of words(p.text)) {
      sentenceWords += 1;
      syl += syllables(w.text);
    }
  }
  const flesch = sentences && sentenceWords
    ? Math.round((206.835 - 1.015 * (sentenceWords / sentences) - 84.6 * (syl / sentenceWords)) * 10) / 10
    : 0;
  return {
    words: bodyWords,
    sentences,
    paragraphs: paras,
    characters: [...text].length,
    readingTimeMinutes: Math.ceil(bodyWords / 200),
    fleschReadingEase: flesch === 0 ? 0 : flesch,
  };
}

/**
 * Checks a draft and returns stats plus a sorted list of suggestions.
 * @param {string} text
 * @param {object} [options] minWords, maxWords, style, checks, requiredHeadings
 */
export function checkDraft(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const opts = normalizeOptions(options);
  const doc = structure(text);
  const starts = lineStarts(text);
  const stats = computeStats(text, doc);

  const masks = [...text.matchAll(MASK_RE)].map((m) => [m.index, m.index + m[0].length]);
  const seen = new Set();
  const issues = [];
  const add = (level, code, start, end, message, suggestion = null) => {
    if (MASKED.test(code) && masks.some(([a, b]) => start < b && end > a)) return;
    const key = `${code}:${start}:${end}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    const { line, column } = position(starts, start);
    issues.push({ level, code, message, start, end, line, column, text: text.slice(start, end), suggestion });
  };

  const ctx = {
    text,
    opts,
    doc,
    stats,
    body: doc.body,
    bodyText: text.slice(0, doc.bodyEnd),
    headings: doc.paragraphs.filter((p) => p.heading).map((p) => ({ ...p, normalized: normalizeHeading(p.text) })),
    normalizeHeading,
    add,
    addDoc: (level, code, message) => add(level, code, 0, 0, message),
  };
  for (const c of opts.checks) RUNNERS[c](ctx);

  issues.sort((a, b) => a.start - b.start || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || a.end - b.end);
  const count = (level) => issues.filter((i) => i.level === level).length;
  return { stats, errors: count('error'), warnings: count('warning'), infos: count('info'), issues };
}
