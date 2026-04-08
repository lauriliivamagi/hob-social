/**
 * Extract recipe fixtures from URLs using the Defuddle CLI.
 * Produces the same output as the Chrome extension's content script.
 *
 * Usage: npx tsx evals/extract-fixture.ts <url> <output-name> [language-override]
 */
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.argv[2];
const outputName = process.argv[3];
const langOverride = process.argv[4];

if (!url || !outputName) {
  console.error('Usage: npx tsx evals/extract-fixture.ts <url> <output-name> [language-override]');
  process.exit(1);
}

const raw = execFileSync(
  'npx', ['defuddle', 'parse', url, '--markdown', '--json'],
  { encoding: 'utf-8', timeout: 30_000 },
);

const result = JSON.parse(raw);

const fixture = {
  url,
  title: result.title || '',
  contentMarkdown: result.content || '',
  schemaOrgData: result.schemaOrgData || null,
  language: langOverride || result.language || 'en',
};

const outPath = resolve(__dirname, 'fixtures', `${outputName}.json`);
writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');

console.log(`Title: ${fixture.title}`);
console.log(`Language: ${fixture.language}`);
console.log(`Content: ${fixture.contentMarkdown.length} chars`);
console.log(`Schema.org: ${fixture.schemaOrgData && !Array.isArray(fixture.schemaOrgData) ? 'yes' : 'no'}`);
console.log(`Saved: ${outPath}`);
