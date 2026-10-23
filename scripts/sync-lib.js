// Copies the Plagx Preflight library (../plagx-preflight/src) into lib/ so the action runs with no install step.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = process.argv[2] || `${root}../plagx-preflight`;
const { version } = JSON.parse(readFileSync(`${source}/package.json`, 'utf8'));

rmSync(`${root}lib`, { recursive: true, force: true });
cpSync(`${source}/src`, `${root}lib`, { recursive: true });
writeFileSync(`${root}lib/VERSION`, `${version}\n`);
console.log(`Copied plagx-preflight ${version} into lib/`);
