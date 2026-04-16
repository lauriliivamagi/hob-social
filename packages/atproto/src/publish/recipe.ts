import type { Agent } from '@atproto/api';
import type { Recipe } from '@recipe/domain';
import { recipeToLexicon } from '../adapter/recipe.js';
import { AT_RKEY_REGEX, SOCIAL_HOB_TEMP_RECIPE_NSID } from '../constants.js';

export class InvalidSlugError extends Error {
  constructor(slug: string, reason: string) {
    super(`Invalid rkey slug "${slug}": ${reason}`);
    this.name = 'InvalidSlugError';
  }
}

export interface PublishedRecipe {
  uri: string;
  cid: string;
}

export interface PublishRecipeOptions {
  createdAt?: string;
}

export async function publishRecipe(
  agent: Agent,
  recipe: Recipe,
  options: PublishRecipeOptions = {},
): Promise<PublishedRecipe> {
  const slug = recipe.meta.slug as string;
  assertValidRkey(slug);

  const record = recipeToLexicon(recipe, options);
  const did = agent.assertDid;

  const response = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: SOCIAL_HOB_TEMP_RECIPE_NSID,
    rkey: slug,
    record,
  });

  return { uri: response.data.uri, cid: response.data.cid };
}

function assertValidRkey(slug: string): void {
  if (slug.length === 0) {
    throw new InvalidSlugError(slug, 'empty');
  }
  if (slug.length > 512) {
    throw new InvalidSlugError(slug, `length ${slug.length} exceeds 512 chars`);
  }
  if (!AT_RKEY_REGEX.test(slug)) {
    throw new InvalidSlugError(
      slug,
      'contains characters outside [a-zA-Z0-9._~:-]',
    );
  }
}
