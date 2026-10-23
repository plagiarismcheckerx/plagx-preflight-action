// Plagx Preflight Draft Check: GitHub Action entry point.
// A free academic writing utility by Plagiarism Checker X (https://plagiarismcheckerx.com/).
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { checkDraft, CHECKS, STYLES } from './lib/index.js';

const PCX = 'https://plagiarismcheckerx.com/?utm_source=github-action&utm_medium=job-summary&utm_campaign=plagx&utm_content=plagx-preflight-action';
const MAX_ROWS = 100;
const LEVEL = { error: 'error', warning: 'warning', info: 'notice' };
const ICON = { error: '❌', warning: '⚠️', info: 'ℹ️' };

const input = (name, fallback = '') => (process.env[`INPUT_${name.toUpperCase()}`] ?? fallback).trim();
const bool = (value) => /^(true|yes|1|on)$/i.test(value);
const list = (value) => value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
// Workflow command escaping (https://docs.github.com/actions/reference/workflow-commands-for-github-actions)
const escData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
const mdCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function annotate(level, file, issue, message) {
  const props = [`file=${escProp(file)}`];
  if (issue && issue.end > issue.start) {
    props.push(`line=${issue.line}`, `col=${issue.column}`);
    if (!issue.text.includes('\n')) props.push(`endColumn=${issue.column + issue.text.length}`);
  }
  props.push(`title=${escProp(issue ? `Plagx Preflight: ${issue.code}` : 'Plagx Preflight')}`);
  console.log(`::${LEVEL[level] ?? level} ${props.join(',')}::${escData(message)}`);
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** Converts a wildcard pattern (*, **, ?) to a regular expression on forward-slash paths. */
function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      re += pattern[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += pattern[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

let allFiles;
function listFiles() {
  allFiles ??= readdirSync('.', { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath ?? d.path, d.name).replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter((f) => !/(^|\/)(node_modules|\.git)\//.test(f));
  return allFiles;
}

export function expandFiles(spec) {
  const found = [];
  for (const raw of spec.split(/\s+/).filter(Boolean)) {
    const pattern = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    const matches = /[*?]/.test(pattern) ? listFiles().filter((f) => globToRegExp(pattern).test(f)).sort() : [pattern];
    for (const m of matches) if (!found.includes(m)) found.push(m);
  }
  return found;
}

export function readOptions() {
  const num = (name) => {
    const v = input(name);
    if (!v) return undefined;
    if (!/^\d+$/.test(v)) throw new Error(`${name} must be a whole number.`);
    return Number(v);
  };
  const style = input('style', 'apa').toLowerCase();
  if (!STYLES.includes(style)) throw new Error(`Unknown style "${style}". Use: ${STYLES.join(', ')}.`);
  const checks = list(input('checks'));
  for (const c of checks) if (!CHECKS.includes(c)) throw new Error(`Unknown check "${c}". Use: ${CHECKS.join(', ')}.`);
  const failOn = input('fail-on', 'error').toLowerCase();
  if (!['error', 'warning', 'never'].includes(failOn)) throw new Error('fail-on must be "error", "warning" or "never".');
  return {
    draft: {
      minWords: num('min-words'),
      maxWords: num('max-words'),
      style,
      checks: checks.length ? checks : undefined,
      requiredHeadings: list(input('required-headings')),
    },
    failOn,
    summary: bool(input('summary', 'true')),
  };
}

export async function run() {
  const files = expandFiles(input('files'));
  const { draft, failOn, summary } = readOptions();
  if (!files.length) throw new Error('No files matched the "files" input.');

  const totals = { files: 0, words: 0, errors: 0, warnings: 0, infos: 0 };
  const rows = [];
  const sections = [];

  for (const file of files) {
    const fail = (message) => {
      annotate('error', file, null, message);
      totals.errors += 1;
      rows.push(`| \`${mdCell(file)}\` | | | | ❌ ${mdCell(message)} |`);
    };
    if (!existsSync(file)) { fail('File not found'); continue; }
    if (!['.txt', '.md'].includes(extname(file).toLowerCase())) { fail('Only .txt and .md files are supported'); continue; }

    const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
    const r = checkDraft(text, draft);
    totals.files += 1;
    totals.words += r.stats.words;
    totals.errors += r.errors;
    totals.warnings += r.warnings;
    totals.infos += r.infos;
    for (const x of r.issues) annotate(x.level, file, x, x.message);
    console.log(`${file}: ${r.stats.words} words, ${r.errors} error(s), ${r.warnings} warning(s), ${r.infos} info`);

    const s = r.stats;
    rows.push(`| \`${mdCell(file)}\` | ${s.words} | ${s.readingTimeMinutes} min | ${s.fleschReadingEase} | ${r.errors} ❌ · ${r.warnings} ⚠️ · ${r.infos} ℹ️ |`);
    if (r.issues.length) {
      let md = `<details><summary><code>${file}</code>: ${r.issues.length} suggestion(s)</summary>\n\n| | Line | Check | Suggestion |\n|---|---|---|---|\n`;
      md += r.issues.slice(0, MAX_ROWS).map((x) => `| ${ICON[x.level]} | ${x.line} | \`${x.code}\` | ${mdCell(x.message)} |`).join('\n');
      if (r.issues.length > MAX_ROWS) md += `\n\n…and ${r.issues.length - MAX_ROWS} more (see the annotations).`;
      sections.push(`${md}\n\n</details>\n`);
    }
  }

  for (const [k, v] of Object.entries(totals)) setOutput(k, v);

  if (summary && process.env.GITHUB_STEP_SUMMARY) {
    const table = `| File | Words | Reading time | Flesch | Suggestions |\n|---|---|---|---|---|\n${rows.join('\n')}\n\n`;
    const footer = `\n---\n<sub>Automated suggestions by Plagx Preflight, a free academic writing utility by Plagiarism Checker X. It checks structure, references, punctuation and basic grammar. Originality and AI-generated text are checked in [Plagiarism Checker X](${PCX}).</sub>\n`;
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Plagx Preflight draft check\n\n${table}${sections.join('\n')}${footer}`);
  }

  const failed = failOn === 'error' ? totals.errors > 0 : failOn === 'warning' ? totals.errors + totals.warnings > 0 : false;
  if (failed) {
    console.log(`::error title=Plagx Preflight::${totals.errors} error(s) and ${totals.warnings} warning(s) in ${totals.files} file(s)`);
    return 1;
  }
  return 0;
}

if (process.env.GITHUB_ACTIONS || process.env.PLAGX_RUN) {
  run().then((code) => { process.exitCode = code; }).catch((err) => {
    console.log(`::error title=Plagx Preflight::${escData(err.message)}`);
    process.exitCode = 1;
  });
}
