import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@atproto/api';
import type { Recipe, RecipeSlug } from '@recipe/domain';
import { publishRecipe } from './recipe.js';

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

const TID_REGEX = /^[2-7a-z]{13}$/;

describe('publishRecipe', () => {
  it('generates a TID rkey when none is provided', async () => {
    const { agent, putRecord } = makeMockAgent();
    await publishRecipe(agent, makeRecipe('my-recipe'), {
      createdAt: '2026-04-16T00:00:00.000Z',
    });

    expect(putRecord).toHaveBeenCalledTimes(1);
    const call = putRecord.mock.calls[0]![0];
    expect(call.repo).toBe('did:plc:test');
    expect(call.collection).toBe('social.hob.temp.recipe');
    expect(call.rkey).toMatch(TID_REGEX);
    expect(call.rkey).not.toBe('my-recipe');
    expect(call.record.$type).toBe('social.hob.temp.recipe');
    expect(call.record.createdAt).toBe('2026-04-16T00:00:00.000Z');
  });

  it('reuses a provided rkey (republish overwrites the same record)', async () => {
    const { agent, putRecord } = makeMockAgent();
    await publishRecipe(agent, makeRecipe('my-recipe'), { rkey: '3lzy2ji4nms2z' });

    const call = putRecord.mock.calls[0]![0];
    expect(call.rkey).toBe('3lzy2ji4nms2z');
  });

  it('returns uri, cid, and the rkey that was used', async () => {
    const { agent } = makeMockAgent(
      'at://did:plc:test/social.hob.temp.recipe/3lzy2ji4nms2z',
      'bafyabc',
    );
    const result = await publishRecipe(agent, makeRecipe('my-recipe'), {
      rkey: '3lzy2ji4nms2z',
    });
    expect(result).toEqual({
      uri: 'at://did:plc:test/social.hob.temp.recipe/3lzy2ji4nms2z',
      cid: 'bafyabc',
      rkey: '3lzy2ji4nms2z',
    });
  });

  it('generates a fresh TID on each call when no rkey is provided', async () => {
    const { agent, putRecord } = makeMockAgent();
    await publishRecipe(agent, makeRecipe('a'));
    await publishRecipe(agent, makeRecipe('b'));
    const first = putRecord.mock.calls[0]![0].rkey;
    const second = putRecord.mock.calls[1]![0].rkey;
    expect(first).not.toBe(second);
  });
});
