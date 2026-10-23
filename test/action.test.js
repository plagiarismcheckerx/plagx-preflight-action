import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'plagx-preflight-action-'));
mkdirSync(join(dir, 'docs/sub'), { recursive: true });
writeFileSync(join(dir, 'docs/essay.md'), '# Introduction\n\nShown (Smith, 2020). the the end.\n\nReferences\n\nBrown, A. (2019). Title.\n');
writeFileSync(join(dir, 'docs/sub/clean.txt'), 'A clean draft. It has two sentences.\n');
writeFileSync(join(dir, 'docs/notes.docx'), 'x');
process.chdir(dir);

const { run, expandFiles, readOptions } = await import('../index.js');

async function runWith(inputs) {
  for (const k of Object.keys(process.env)) if (k.startsWith('INPUT_')) delete process.env[k];
  for (const [k, v] of Object.entries(inputs)) process.env[`INPUT_${k.toUpperCase()}`] = v;
  const out = join(dir, `out-${Math.random()}`);
  const summary = join(dir, `summary-${Math.random()}`);
  writeFileSync(out, '');
  writeFileSync(summary, '');
  process.env.GITHUB_OUTPUT = out;
  process.env.GITHUB_STEP_SUMMARY = summary;
  const logs = [];
  const log = console.log;
  console.log = (s) => logs.push(String(s));
  try {
    const code = await run();
    const outputs = Object.fromEntries(readFileSync(out, 'utf8').trim().split('\n').map((l) => l.split('=')));
    return { code, logs, outputs, summary: readFileSync(summary, 'utf8') };
  } finally {
    console.log = log;
  }
}

test('expandFiles handles ** and * patterns', () => {
  assert.deepEqual(expandFiles('docs/**/*.md'), ['docs/essay.md']);
  assert.deepEqual(expandFiles('docs/**/*.txt docs/*.md'), ['docs/sub/clean.txt', 'docs/essay.md']);
  assert.deepEqual(expandFiles('missing.txt'), ['missing.txt']);
});

test('errors fail the step and produce annotations with positions', async () => {
  const r = await runWith({ files: 'docs/essay.md' });
  assert.equal(r.code, 1);
  assert.ok(r.logs.some((l) => l.startsWith('::error file=docs/essay.md,line=3,col=8,endColumn=19,title=Plagx Preflight%3A citation-no-reference::')));
  assert.ok(r.logs.some((l) => l.startsWith('::warning file=docs/essay.md,line=3,col=22,') && l.includes('repeated-word')));
});

test('info suggestions become notices', async () => {
  writeFileSync(join(dir, 'one.txt'), 'Only one sentence here.\n');
  const r = await runWith({ files: 'one.txt' });
  assert.equal(r.code, 0);
  assert.ok(r.logs.some((l) => l.startsWith('::notice file=one.txt,line=1,col=1,endColumn=24,title=Plagx Preflight%3A single-sentence-paragraph::')));
});

test('outputs and job summary', async () => {
  const r = await runWith({ files: 'docs/**/*' + '.md docs/sub/clean.txt' });
  assert.equal(r.outputs.files, '2');
  assert.equal(r.outputs.errors, '1');
  assert.match(r.summary, /## Plagx Preflight draft check/);
  assert.match(r.summary, /\| `docs\/sub\/clean.txt` \| 7 \|/);
  assert.match(r.summary, /<details><summary><code>docs\/essay.md<\/code>/);
  assert.match(r.summary, /utm_content=plagx-preflight-action/);
});

test('fail-on never and warning', async () => {
  assert.equal((await runWith({ files: 'docs/essay.md', 'fail-on': 'never' })).code, 0);
  assert.equal((await runWith({ files: 'docs/sub/clean.txt', 'fail-on': 'warning' })).code, 0);
  assert.equal((await runWith({ files: 'docs/sub/clean.txt', 'fail-on': 'warning', 'min-words': '100' })).code, 1);
});

test('options are passed to checkDraft', async () => {
  const r = await runWith({ files: 'docs/sub/clean.txt', 'required-headings': 'Introduction,\nConclusion', 'max-words': '3', checks: 'length' });
  assert.equal(r.outputs.warnings, '3');
  assert.ok(r.logs.some((l) => l.includes('Suggestion: add a \\"Conclusion\\" heading.') || l.includes('Suggestion: add a "Conclusion" heading.')));
});

test('missing and unsupported files are errors', async () => {
  const r = await runWith({ files: 'nope.txt docs/notes.docx', 'fail-on': 'never' });
  assert.equal(r.outputs.errors, '2');
  assert.ok(r.logs.some((l) => l.includes('File not found')));
  assert.ok(r.logs.some((l) => l.includes('Only .txt and .md files are supported')));
});

test('invalid inputs throw', () => {
  const bad = [{ style: 'chicago' }, { checks: 'magic' }, { 'fail-on': 'sometimes' }, { 'min-words': 'ten' }];
  for (const inputs of bad) {
    for (const k of Object.keys(process.env)) if (k.startsWith('INPUT_')) delete process.env[k];
    for (const [k, v] of Object.entries(inputs)) process.env[`INPUT_${k.toUpperCase()}`] = v;
    assert.throws(() => readOptions(), Error, JSON.stringify(inputs));
  }
});

test('no matching files throws', async () => {
  await assert.rejects(runWith({ files: 'docs/**/*.rst' }), /No files matched/);
});
