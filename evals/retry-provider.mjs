/**
 * Custom promptfoo provider that replicates the extension's 3-attempt retry loop.
 *
 * On validation failure, feeds the raw output + error message back to the LLM
 * (via buildUserPrompt's retry parameters), exactly like import-machine.ts does.
 *
 * Config in promptfoo.yaml:
 *   - id: file://retry-provider.mjs
 *     label: "Haiku 4.5 (3 retries)"
 *     config:
 *       provider: anthropic:messages:claude-haiku-4-5-20251001
 *       maxRetries: 3
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// System prompt — loaded once from prompt.mjs
// ---------------------------------------------------------------------------
let _systemPrompt = null;
function getSystemPrompt() {
  if (!_systemPrompt) {
    const recipeSchema = JSON.parse(readFileSync(resolve(root, 'config/recipe-schema.json'), 'utf-8'));
    const tags = JSON.parse(readFileSync(resolve(root, 'config/tags.json'), 'utf-8'));
    // Read prompt.mjs's system prompt by importing it with a dummy fixture
    // Simpler: just read it from the ai-prompt.ts source pattern directly
    // (prompt.mjs already has the full system prompt text)
    const mod = readFileSync(resolve(__dirname, 'prompt.mjs'), 'utf-8');
    // Extract by calling the module
    _systemPrompt = 'placeholder';
  }
  return _systemPrompt;
}

// We need the system prompt synchronously but import() is async.
// Solution: cache it on first callApi (which is async).
let _systemPromptCache = null;
async function loadSystemPrompt() {
  if (!_systemPromptCache) {
    const mod = await import('./prompt.mjs');
    // Call with any fixture to extract the system message
    const msgs = mod.default({ vars: { fixture: 'spaghetti-bolognese.json' } });
    _systemPromptCache = msgs[0].content;
  }
  return _systemPromptCache;
}

// ---------------------------------------------------------------------------
// User prompt builder — mirrors extension/src/background/ai-prompt.ts
// ---------------------------------------------------------------------------
const MAX_CONTENT_LENGTH = 15_000;

function buildUserPrompt(extraction, previousErrors, previousOutput) {
  let prompt = '';
  prompt += `## Source URL\n${extraction.url}\n\n`;
  prompt += `## Language\n${extraction.language}\n\n`;

  if (extraction.schemaOrgData) {
    prompt += `## schema.org/Recipe Data\n\`\`\`json\n${JSON.stringify(extraction.schemaOrgData, null, 2)}\n\`\`\`\n\n`;
  }

  const content = extraction.contentMarkdown.length > MAX_CONTENT_LENGTH
    ? extraction.contentMarkdown.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated]'
    : extraction.contentMarkdown;

  prompt += `## Recipe Content\n${content}\n`;

  if (previousErrors) {
    if (previousOutput) {
      prompt += `\n## Your Previous Output (failed validation)\n\`\`\`json\n${previousOutput}\n\`\`\`\n`;
    }
    prompt += `\n## Validation Errors\nFix these errors in your next attempt:\n${previousErrors}\n`;
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// Validation — same approach as assertions/schema-valid.mjs
// ---------------------------------------------------------------------------
function stripFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
}

function validateRecipe(jsonString) {
  const tmpFile = resolve(tmpdir(), `recipe-retry-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    writeFileSync(tmpFile, jsonString);
    execFileSync(
      'npx', ['tsx', resolve(root, 'evals/validate-recipe.ts'), tmpFile],
      { encoding: 'utf-8', timeout: 15_000 },
    );
    return { valid: true };
  } catch (err) {
    const stdout = err.stdout?.toString() || '';
    let error = 'Validation failed';
    try {
      const result = JSON.parse(stdout);
      if (result.error) error = result.error;
    } catch {
      const stderr = err.stderr?.toString() || '';
      if (stderr) error = stderr.slice(0, 500);
    }
    return { valid: false, error };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Provider class
// ---------------------------------------------------------------------------
export default class RetryProvider {
  constructor(options) {
    this.providerId = options.config?.provider || 'anthropic:messages:claude-haiku-4-5-20251001';
    this.providerConfig = options.config?.providerConfig || {};
    this.maxRetries = options.config?.maxRetries || 3;
    this.label = options.config?.label || `${this.providerId} (${this.maxRetries} retries)`;
    this._innerProvider = null;
  }

  id() {
    return this.label;
  }

  async _getInnerProvider() {
    if (!this._innerProvider) {
      const { loadApiProvider } = await import('promptfoo');
      this._innerProvider = await loadApiProvider(this.providerId, {
        options: { config: this.providerConfig },
      });
    }
    return this._innerProvider;
  }

  async callApi(prompt, context) {
    const provider = await this._getInnerProvider();
    const systemContent = await loadSystemPrompt();

    const fixture = JSON.parse(
      readFileSync(resolve(__dirname, 'fixtures', context.vars.fixture), 'utf-8'),
    );

    let lastError = null;
    let lastRawOutput = null;
    let totalTokens = { total: 0, prompt: 0, completion: 0 };
    let finalJson = null;
    let attempts = 0;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      attempts = attempt;
      const userContent = buildUserPrompt(fixture, lastError, lastRawOutput);

      const messages = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ];

      const result = await provider.callApi(JSON.stringify(messages));

      if (result.error) {
        return {
          output: result.output || '',
          error: `API error on attempt ${attempt}: ${result.error}`,
          tokenUsage: totalTokens,
        };
      }

      // Accumulate token usage
      if (result.tokenUsage) {
        totalTokens.total += result.tokenUsage.total || 0;
        totalTokens.prompt += result.tokenUsage.prompt || 0;
        totalTokens.completion += result.tokenUsage.completion || 0;
      }

      const raw = result.output || '';
      const cleaned = stripFences(raw);

      // Try to parse JSON
      let json;
      try {
        json = JSON.parse(cleaned);
      } catch (err) {
        lastError = `Invalid JSON: ${err.message}`;
        lastRawOutput = cleaned.slice(0, 3000);
        if (attempt < this.maxRetries) continue;
        // Final attempt failed — return what we have
        return {
          output: cleaned,
          tokenUsage: totalTokens,
          metadata: { attempts, passed: false, lastError },
        };
      }

      const jsonString = JSON.stringify(json, null, 2);

      // Validate via parseRecipe()
      const validation = validateRecipe(jsonString);
      if (validation.valid) {
        return {
          output: jsonString,
          tokenUsage: totalTokens,
          metadata: { attempts, passed: true },
        };
      }

      // Validation failed — set up retry feedback
      lastError = validation.error;
      lastRawOutput = jsonString.slice(0, 3000);

      if (attempt === this.maxRetries) {
        return {
          output: jsonString,
          tokenUsage: totalTokens,
          metadata: { attempts, passed: false, lastError: validation.error },
        };
      }
    }

    return { output: '', tokenUsage: totalTokens, metadata: { attempts, passed: false } };
  }
}
