export const SOCIAL_HOB_TEMP_RECIPE_NSID = 'social.hob.temp.recipe' as const;

// AT Protocol record key spec: 1–512 chars from [a-zA-Z0-9._~:-].
// Our domain slugs (pattern /^[a-z0-9]+(-[a-z0-9]+)*$/) are a strict subset,
// but we validate explicitly at the publish boundary to fail loud on drift.
export const AT_RKEY_REGEX = /^[a-zA-Z0-9._~:-]{1,512}$/;
