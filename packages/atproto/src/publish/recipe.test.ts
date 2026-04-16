import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import type { Recipe } from '@recipe/domain';
import type { RecipeSlug } from '@recipe/domain';
import { InvalidSlugError, publishRecipe } from './recipe.js';

function makeRecipe(slug: string): Recipe {
  return {
    meta: {
      title: 'Test',
      slug: slug as RecipeSlug,
      language: 'en',
      originalText: 'x',
      tags: [],
      servings: 1,
      totalTime: {
        relaxed: { min: 60 },
        optimized: { min: 60 },
      },
      difficulty: 'easy',
    },
    ingredients: [],
    equipment: [],
    operations: [],
    subProducts: [],
  } as unknown as Recipe;
}

function makeMockAgent(uri = 'at://did:plc:test/social.hob.temp.recipe/s', cid = 'bafytest') {
  const putRecord = vi.fn().mockResolvedValue({ data: { uri, cid } });
  return {
    agent: {
      assertDid: 'did:plc:test',
      com: { atproto: { repo: { putRecord } } },
    } as unknown as Agent,
    putRecord,
  };
}

describe('publishRecipe', () => {
  it('calls putRecord with the right repo/collection/rkey', async () => {
    const { agent, putRecord } = makeMockAgent();
    const recipe = makeRecipe('my-recipe');
    await publishRecipe(agent, recipe, { createdAt: '2026-04-16T00:00:00.000Z' });

    expect(putRecord).toHaveBeenCalledTimes(1);
    const call = putRecord.mock.calls[0]![0];
    expect(call.repo).toBe('did:plc:test');
    expect(call.collection).toBe('social.hob.temp.recipe');
    expect(call.rkey).toBe('my-recipe');
    expect(call.record.$type).toBe('social.hob.temp.recipe');
    expect(call.record.createdAt).toBe('2026-04-16T00:00:00.000Z');
  });

  it('returns the URI and CID from putRecord', async () => {
    const { agent } = makeMockAgent('at://did:plc:test/social.hob.temp.recipe/xyz', 'bafyabc');
    const recipe = makeRecipe('my-recipe');
    const result = await publishRecipe(agent, recipe);
    expect(result.uri).toBe('at://did:plc:test/social.hob.temp.recipe/xyz');
    expect(result.cid).toBe('bafyabc');
  });

  it('throws InvalidSlugError on empty slug', async () => {
    const { agent } = makeMockAgent();
    await expect(publishRecipe(agent, makeRecipe(''))).rejects.toBeInstanceOf(
      InvalidSlugError,
    );
  });

  it('throws InvalidSlugError on slug over 512 chars', async () => {
    const { agent } = makeMockAgent();
    const longSlug = 'a'.repeat(513);
    await expect(publishRecipe(agent, makeRecipe(longSlug))).rejects.toBeInstanceOf(
      InvalidSlugError,
    );
  });

  it('throws InvalidSlugError on disallowed characters', async () => {
    const { agent } = makeMockAgent();
    await expect(publishRecipe(agent, makeRecipe('my recipe'))).rejects.toBeInstanceOf(
      InvalidSlugError,
    );
    await expect(publishRecipe(agent, makeRecipe('my/recipe'))).rejects.toBeInstanceOf(
      InvalidSlugError,
    );
  });

  it('accepts valid AT rkey characters beyond the domain slugPattern', async () => {
    const { agent, putRecord } = makeMockAgent();
    await publishRecipe(agent, makeRecipe('recipe_with.dots'));
    expect(putRecord).toHaveBeenCalled();
  });
});
