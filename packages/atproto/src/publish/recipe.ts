import type { Agent } from '@atproto/api';
import { TID } from '@atproto/common-web';
import type { Recipe } from '@recipe/domain';
import { recipeToLexicon } from '../adapter/recipe.js';
import { SOCIAL_HOB_TEMP_RECIPE_NSID } from '../constants.js';

export interface PublishedRecipe {
  uri: string;
  cid: string;
  rkey: string;
}

export interface PublishRecipeOptions {
  createdAt?: string;
  /**
   * Reuse an existing rkey to overwrite that record (update-in-place).
   * Omit on first publish; a fresh TID is generated.
   */
  rkey?: string;
}

export async function publishRecipe(
  agent: Agent,
  recipe: Recipe,
  options: PublishRecipeOptions = {},
): Promise<PublishedRecipe> {
  const rkey = options.rkey ?? TID.nextStr();
  const record = recipeToLexicon(recipe, { createdAt: options.createdAt });
  const did = agent.assertDid;

  const response = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: SOCIAL_HOB_TEMP_RECIPE_NSID,
    rkey,
    record,
  });

  return { uri: response.data.uri, cid: response.data.cid, rkey };
}
