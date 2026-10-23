// In-text citations (APA author-date, MLA author-page) and reference list entries.

export const STYLES = ['apa', 'mla'];

const YEAR = '(?:\\d{4}[a-z]?|n\\.d\\.)';
const NAME = "\\p{Lu}[\\p{L}'\\u2019-]+";
const NOT_AUTHORS = new Set([
  'appendix', 'chapter', 'chapters', 'fig', 'figure', 'figures', 'line', 'lines', 'p', 'page', 'pages', 'part',
  'phase', 'pp', 'section', 'see', 'step', 'table', 'tables', 'version', 'vol', 'volume',
]);

const firstWord = (s) => {
  const m = s.match(/\p{L}[\p{L}'’-]*/u);
  return m ? m[0].toLowerCase().replace(/’/g, "'") : '';
};

function apa(text) {
  const out = [];
  // Parenthetical: (Smith, 2020), (Smith & Lee, 2020, p. 4; Brown, 2018a)
  const paren = new RegExp(`\\(([^()]*?${YEAR}[^()]*)\\)`, 'gu');
  for (const m of text.matchAll(paren)) {
    let offset = m.index + 1;
    for (const part of m[1].split(';')) {
      const lead = part.length - part.trimStart().length;
      const trimmed = part.trim();
      const pStart = offset + lead;
      offset += part.length + 1;
      const prefix = trimmed.match(/^(?:e\.g\.|see also|see|cf\.),?\s+/i);
      const skip = prefix ? prefix[0].length : 0;
      const rest = trimmed.slice(skip);
      const authorMatch = rest.match(new RegExp(`^(.*?\\p{L}.*?),?\\s+(${YEAR}(?:,\\s*${YEAR})*)(?=$|,)`, 'u'));
      if (!authorMatch) continue;
      const author = authorMatch[1];
      if (!/^\p{Lu}/u.test(author) || NOT_AUTHORS.has(firstWord(author))) continue;
      for (const y of authorMatch[2].split(/,\s*/)) {
        out.push({ text: rest, start: pStart + skip, end: pStart + trimmed.length, author, key: firstWord(author), year: y.toLowerCase() });
      }
    }
  }
  // Narrative: Smith (2020), Smith and Lee (2020, p. 4), Smith et al. (2020)
  // The name may be several capitalised words (American Psychological Association).
  const narrative = new RegExp(`((?:${NAME}\\s+){0,4}${NAME}(?:\\s+(?:and|&)\\s+${NAME}|\\s+et\\.?\\s*al\\.*)?)\\s+\\((${YEAR})(?:,[^()]*)?\\)`, 'gu');
  for (const m of text.matchAll(narrative)) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length, author: m[1], key: firstWord(m[1]), year: m[2].toLowerCase() });
  }
  return out;
}

function mla(text) {
  const out = [];
  // (Smith 50), (Smith and Lee 50-52), (Smith et al. 12; Brown 7)
  for (const m of text.matchAll(/\(([^()]+)\)/g)) {
    let offset = m.index + 1;
    for (const part of m[1].split(';')) {
      const lead = part.length - part.trimStart().length;
      const trimmed = part.trim();
      const pStart = offset + lead;
      offset += part.length + 1;
      const pm = trimmed.match(/^(\p{Lu}[\p{L}'’.\- &,]*?),?\s+(\d+(?:\s*[-–]\s*\d+)?)$/u);
      if (!pm || NOT_AUTHORS.has(firstWord(pm[1])) || /^\d{4}$/.test(pm[2])) continue;
      out.push({ text: trimmed, start: pStart, end: pStart + trimmed.length, author: pm[1], key: firstWord(pm[1]), year: null });
    }
  }
  return out;
}

/**
 * In-text citations as { text, start, end, author, key, year }. key is the
 * first word of the author text in lowercase; year is null for MLA.
 */
export function findCitations(text, style = 'apa') {
  if (!STYLES.includes(style)) throw new TypeError(`Unknown style "${style}". Use: ${STYLES.join(', ')}`);
  const list = style === 'apa' ? apa(String(text)) : mla(String(text));
  return list.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Whether a citation points at a reference entry: the entry's first word is
 * one of the words of the citation's author text, and (APA) the years agree.
 */
export function citationMatches(citation, entry) {
  if (citation.year !== null && citation.year !== entry.year) return false;
  const names = (citation.author.match(/\p{L}[\p{L}'’-]*/gu) || []).map((w) => w.toLowerCase().replace(/’/g, "'"));
  return names.includes(entry.key);
}

/** Key and year of a reference list entry. */
export function parseEntry(text) {
  const body = text.replace(/^(?:\[\d+\]|\d+\.|[-*•])\s+/, '');
  const y = body.match(new RegExp(`\\((${YEAR})`));
  return { key: firstWord(body), year: y ? y[1].toLowerCase() : null };
}
