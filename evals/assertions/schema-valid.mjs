/**
 * Core assertion: validates LLM output against parseRecipe() (Zod + DAG).
 * Spawns a subprocess with tsx to run the TypeScript validation helper.
 */
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

/** Strip markdown code fences that LLMs sometimes add despite instructions. */
function stripFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
}

export default function (output, context) {
  const cleaned = stripFences(output);

  // Basic JSON parse check
  let json;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    return { pass: false, score: 0, reason: `Invalid JSON: ${err.message}` };
  }

  // Write to temp file, run parseRecipe() via subprocess
  const tmpFile = resolve(tmpdir(), `recipe-eval-${Date.now()}.json`);
  try {
    writeFileSync(tmpFile, JSON.stringify(json));
    execFileSync(
      'npx', ['tsx', resolve(root, 'evals/validate-recipe.ts'), tmpFile],
      { encoding: 'utf-8', timeout: 15_000 },
    );
    return { pass: true, score: 1, reason: 'Passes parseRecipe() validation (Zod + DAG)' };
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    const stdout = err.stdout?.toString() || '';
    let reason = 'parseRecipe() failed';
    try {
      const result = JSON.parse(stdout);
      if (result.error) reason = result.error;
    } catch {
      if (stderr) reason = stderr.slice(0, 500);
    }
    return { pass: false, score: 0, reason };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}
