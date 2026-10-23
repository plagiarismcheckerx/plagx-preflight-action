// The individual check groups. Each pushes issues through ctx.add().
import { words, countWords, paragraphSentences } from './text.js';
import { findCitations, parseEntry, citationMatches } from './citations.js';

export const LONG_SENTENCE_WORDS = 40;
export const LONG_PARAGRAPH_WORDS = 250;

const LIST_ITEM = /^(?:[-*+•]|\d+[.)])\s/;

const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const matchCase = (fix, original) => (/^\p{Lu}/u.test(original) ? upperFirst(fix) : fix);

// ---------------------------------------------------------------- length

export function length(ctx) {
  const { stats, opts } = ctx;
  if (opts.minWords != null && stats.words < opts.minWords) {
    ctx.addDoc('warning', 'word-count-low', `Suggestion: the draft has ${stats.words} words; the minimum is ${opts.minWords}.`);
  }
  if (opts.maxWords != null && stats.words > opts.maxWords) {
    ctx.addDoc('warning', 'word-count-high', `Suggestion: the draft has ${stats.words} words; the maximum is ${opts.maxWords}.`);
  }
  for (const p of ctx.body) {
    if (p.heading) continue;
    const sentences = paragraphSentences(p);
    for (const s of sentences) {
      const n = countWords(s.text);
      if (n > LONG_SENTENCE_WORDS) {
        ctx.add('warning', 'long-sentence', s.start, s.end,
          `Suggestion: this sentence has ${n} words; consider splitting it (over ${LONG_SENTENCE_WORDS}).`);
      }
    }
    const n = countWords(p.text);
    if (n > LONG_PARAGRAPH_WORDS) {
      ctx.add('info', 'long-paragraph', p.start, p.end,
        `Suggestion: this paragraph has ${n} words; consider splitting it (over ${LONG_PARAGRAPH_WORDS}).`);
    }
    if (sentences.length === 1 && !LIST_ITEM.test(p.text)) {
      ctx.add('info', 'single-sentence-paragraph', p.start, p.end, 'Suggestion: this paragraph has only one sentence.');
    }
  }
  const headings = new Set(ctx.headings.map((h) => h.normalized));
  for (const h of opts.requiredHeadings) {
    if (!headings.has(ctx.normalizeHeading(h))) ctx.addDoc('warning', 'missing-heading', `Suggestion: add a "${h}" heading.`);
  }
}

// ---------------------------------------------------------------- references

export function references(ctx) {
  const { opts, doc } = ctx;
  const citations = findCitations(ctx.bodyText, opts.style);
  if (citations.length && !doc.referenceHeading) {
    ctx.addDoc('error', 'missing-reference-section',
      'Suggestion: the draft has citations but no reference list heading (References or Works Cited).');
  }
  const entries = doc.entries.map((e) => ({ ...e, ...parseEntry(e.text) }));
  if (doc.referenceHeading) {
    for (const c of citations) {
      if (!entries.some((e) => citationMatches(c, e))) {
        ctx.add('error', 'citation-no-reference', c.start, c.end,
          `Suggestion: "${c.text}" has no matching entry in the reference list.`);
      }
    }
    for (const e of entries) {
      if (!citations.some((c) => citationMatches(c, e))) {
        ctx.add('warning', 'reference-not-cited', e.start, e.end, 'Suggestion: this reference is never cited in the text.');
      }
    }
  }
  for (const m of ctx.bodyText.matchAll(/\bet\.?\s*al\b\.*/gi)) {
    if (m[0].toLowerCase() !== 'et al.') {
      ctx.add('warning', 'et-al-format', m.index, m.index + m[0].length, 'Suggestion: write "et al." with one period.', 'et al.');
    }
  }
}

// ---------------------------------------------------------------- punctuation

const PAIRS = { ')': '(', ']': '[', '}': '{' };

export function punctuation(ctx) {
  let straight = -1;
  let curly = -1;
  for (const p of ctx.body) {
    const t = p.text;
    const at = (i) => p.start + i;

    // Quotation marks
    const quotes = [];
    for (let i = 0; i < t.length; i += 1) if (t[i] === '"') quotes.push(i);
    if (quotes.length) straight = straight < 0 ? at(quotes[0]) : straight;
    if (quotes.length % 2 === 1) {
      const i = quotes[quotes.length - 1];
      ctx.add('warning', 'unmatched-quote', at(i), at(i) + 1, 'Suggestion: this quotation mark has no matching pair.');
    }
    const open = [];
    for (let i = 0; i < t.length; i += 1) {
      if (t[i] === '“' || t[i] === '”') curly = curly < 0 ? at(i) : curly;
      if (t[i] === '“') open.push(i);
      else if (t[i] === '”') {
        if (open.length) open.pop();
        else ctx.add('warning', 'unmatched-quote', at(i), at(i) + 1, 'Suggestion: this quotation mark has no matching pair.');
      }
    }
    for (const i of open) ctx.add('warning', 'unmatched-quote', at(i), at(i) + 1, 'Suggestion: this quotation mark has no matching pair.');

    // Brackets
    const stack = [];
    for (let i = 0; i < t.length; i += 1) {
      const c = t[i];
      if (c === '(' || c === '[' || c === '{') stack.push(i);
      else if (PAIRS[c]) {
        if (stack.length && t[stack[stack.length - 1]] === PAIRS[c]) {
          stack.pop();
        } else {
          // List markers such as "a)", "ii)" or "1)".
          if (c === ')' && /(?:^|\s)[A-Za-z0-9]{1,3}$/.test(t.slice(0, i))) continue;
          ctx.add('warning', 'unmatched-bracket', at(i), at(i) + 1, `Suggestion: "${c}" has no matching bracket.`);
        }
      }
    }
    for (const i of stack) ctx.add('warning', 'unmatched-bracket', at(i), at(i) + 1, `Suggestion: "${t[i]}" has no matching bracket.`);

    for (const m of t.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
      ctx.add('info', 'double-space', at(m.index), at(m.index + m[0].length), 'Suggestion: use a single space.', ' ');
    }
    for (const m of t.matchAll(/(?<=[\p{L}0-9)\]"”]) +([,;:!?.])(?=\s|$)/gu)) {
      ctx.add('warning', 'space-before-punctuation', at(m.index), at(m.index + m[0].length),
        `Suggestion: remove the space before "${m[1]}".`, m[1]);
    }
    for (const m of t.matchAll(/[,;:!?](?=[A-Za-z])|(?<=[a-z]{2})\.(?=[A-Z][a-z])/g)) {
      ctx.add('warning', 'missing-space-after-punctuation', at(m.index), at(m.index + 1),
        `Suggestion: add a space after "${m[0]}".`, `${m[0]} `);
    }
    for (const m of t.matchAll(/([!?,;:])\1+|(?<!\.)\.\.(?!\.)/g)) {
      ctx.add('warning', 'repeated-punctuation', at(m.index), at(m.index + m[0].length),
        `Suggestion: "${m[0]}" repeats punctuation.`, m[0][0]);
    }
  }
  if (straight >= 0 && curly >= 0) {
    const i = Math.max(straight, curly);
    ctx.add('info', 'mixed-quote-styles', i, i + 1, 'Suggestion: the draft mixes straight and curly quotation marks.');
  }
}

// ---------------------------------------------------------------- grammar

const SILENT_H = ['hour', 'honest', 'honor', 'honour', 'heir'];
const CONSONANT_SOUND = ['uni', 'use', 'usa', 'usu', 'uti', 'ure', 'uro', 'urani', 'eu', 'ewe', 'one', 'once', 'ubiq', 'unanim'];
const UNCERTAIN = ['herb', 'histor', 'hotel', 'unin', 'unim', 'unid', 'oner'];
const startsWithAny = (w, list) => list.some((p) => w.startsWith(p));

const CONFUSIONS = [
  [/\b(could|would|should|must|might) of\b/gi, (m) => `${m[1]} have`],
  [/\bits (a|an|been|not|going)\b/gi, (m) => `it's ${m[1]}`],
  [/\bit['’]s own\b/gi, () => 'its own'],
  [/\b(more|less|better|worse|rather|greater|fewer|larger|smaller|higher|lower|faster|slower|easier|harder) then\b/gi,
    (m) => `${m[1]} than`],
  [/\btheir (is|are|was|were)\b/gi, (m) => `there ${m[1]}`],
  [/\bthere own\b/gi, () => 'their own'],
  [/\b(the|an) affect\b/gi, (m) => `${m[1]} effect`],
  [/\b(may|might|will|can|could|would|should|negatively|positively|greatly|significantly) effect\b/gi,
    (m) => `${m[1]} affect`],
  [/\bloose (weight|track|control)\b/gi, (m) => `lose ${m[1]}`],
  [/\balot\b/gi, () => 'a lot'],
];

const PASSIVE = /\b(?:am|is|are|was|were|be|been|being)\s+(?:[a-z]+ly\s+)?(?:[a-z]{3,}ed|written|done|made|given|taken|shown|seen|known|found|held|chosen|built|drawn|taught|thought|brought|said|told|sent|kept|paid|begun|broken|driven|eaten|forgotten|hidden|spoken|stolen|worn)\b/gi;

export function grammar(ctx) {
  for (const p of ctx.body) {
    const t = p.text;
    const toks = words(t);
    const gap = (i) => t.slice(toks[i].end, toks[i + 1].start);

    for (let i = 0; i < toks.length; i += 1) {
      const tok = toks[i];
      const low = tok.text.toLowerCase();
      const hasNext = i + 1 < toks.length && /^\s+$/.test(gap(i));
      const next = hasNext ? toks[i + 1] : null;

      if (next && next.text.toLowerCase() === low && /\p{L}/u.test(low) && low !== 'had' && low !== 'that') {
        ctx.add('warning', 'repeated-word', p.start + tok.start, p.start + next.end,
          `Suggestion: "${tok.text} ${next.text}" looks like a repeated word.`, tok.text);
      }

      if (next && (low === 'a' || low === 'an')) {
        const nw = next.text.split('-')[0];
        const nl = nw.toLowerCase();
        const acronym = nw.length > 1 && nw === nw.toUpperCase();
        if (nw.length > 1 && !/[0-9]/.test(nw) && !acronym && /^[a-z]/.test(nl) && !startsWithAny(nl, UNCERTAIN)) {
          const vowel = startsWithAny(nl, SILENT_H) || (/^[aeiou]/.test(nl) && !startsWithAny(nl, CONSONANT_SOUND));
          const expected = vowel ? 'an' : 'a';
          if (low !== expected) {
            ctx.add('warning', 'a-an', p.start + tok.start, p.start + tok.end,
              `Suggestion: use "${expected}" before "${next.text}".`, matchCase(expected, tok.text));
          }
        }
      }

      const iForm = tok.text.match(/^i(['’](?:m|ve|ll|d))?$/);
      if (iForm) {
        const before = t[tok.start - 1];
        const after = t[tok.end];
        if (iForm[1] || (after !== '.' && after !== ')' && before !== '.')) {
          ctx.add('warning', 'lowercase-i', p.start + tok.start, p.start + tok.end,
            `Suggestion: use "${upperFirst(tok.text)}" instead of "${tok.text}".`, upperFirst(tok.text));
        }
      }
    }

    if (!p.heading) {
      for (const s of paragraphSentences(p)) {
        const first = words(s.text)[0];
        if (first && first.start === 0 && /^\p{Ll}/u.test(first.text) && !/\p{Lu}/u.test(first.text)
          && !/^i(?:['’](?:m|ve|ll|d))?$/.test(first.text) && s.text[first.end] !== ')') {
          ctx.add('warning', 'sentence-capital', s.start, s.start + first.end,
            'Suggestion: start the sentence with a capital letter.', upperFirst(first.text));
        }
      }
    }

    for (const [re, fix] of CONFUSIONS) {
      for (const m of t.matchAll(re)) {
        const suggestion = matchCase(fix(m), m[0]);
        ctx.add('warning', 'common-confusion', p.start + m.index, p.start + m.index + m[0].length,
          `Suggestion: "${m[0]}" may be "${suggestion}".`, suggestion);
      }
    }
  }
}

export function passiveVoice(ctx) {
  for (const p of ctx.body) {
    for (const m of p.text.matchAll(PASSIVE)) {
      ctx.add('info', 'passive-voice', p.start + m.index, p.start + m.index + m[0].length,
        `Suggestion: "${m[0]}" may be passive voice.`);
    }
  }
}
