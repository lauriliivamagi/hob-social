# @recipe/atproto

ATproto / Atmosphere integration for Hob. Publishes recipes as
`social.hob.temp.recipe` records to the logged-in user's PDS.

See the strategy doc for the big picture:
[`docs/strategy/at-protocol-integration.md`](../../docs/strategy/at-protocol-integration.md).

## What's in this package

- **`lexicons/social/hob/temp/recipe.json`** (repo root) — the Lexicon schema.
  `.temp.` signals the schema is unstable. Drop the segment at first stable publish.
- **`src/generated/`** — code generated from the lexicon via `pnpm lex:gen`. Committed.
- **`src/adapter/`** — pure `Recipe` ↔ Lexicon record conversion. Handles
  decimal encoding (AT Protocol forbids floats; see below).
- **`src/auth/`** — `BrowserOAuthClient` factory + session loader.
- **`src/publish/`** — `publishRecipe(agent, recipe)` → `com.atproto.repo.putRecord`.

## Decimal encoding

AT Protocol (DAG-CBOR) has no float type. Decimal fields are encoded as
`{value: integer, scale: integer}` where the real value equals
`value / 10^scale`. Scale 0 is plain integer.

| Original | Encoded                    |
|----------|----------------------------|
| `2.5`    | `{value: 25, scale: 1}`    |
| `175`    | `{value: 175, scale: 0}`   |
| `0.125`  | `{value: 125, scale: 3}`   |
| `-3.75`  | `{value: -375, scale: 2}`  |

Applied to: `Quantity.min/max`, `Temperature.min/max`, `Equipment.capacity.min`.
`TimeRange` is already integer seconds — no scale needed.

## Regenerating types

```bash
pnpm lex:gen
```

This runs `lex gen-api` against `lexicons/social/hob/temp/*.json`. Commit the
output under `src/generated/`. CI should fail if regenerating produces a diff
(drift between schema and generated code).

## OAuth flow

Browser-side OAuth 2.1 with PKCE + DPoP. Session tokens live in IndexedDB,
bound to the origin.

- **Dev (loopback)** — `BrowserOAuthClient` uses
  `buildAtprotoLoopbackClientMetadata()`. Redirects to
  `http://127.0.0.1:<port>/auth/callback`.
- **Prod** — fetches
  [`/oauth-client-metadata.json`](../../public/oauth-client-metadata.json) at
  `https://hob.social/oauth-client-metadata.json`. Redirects to
  `https://hob.social/auth/callback`.

The `hob.social` domain + GitHub Pages hosting must be live before prod OAuth
works. Until then the loopback flow is sufficient for local testing.

## Publish path

1. `publishRecipe(agent, recipe)` asserts the recipe slug is a valid AT rkey
   (`[a-zA-Z0-9._~:-]{1,512}`). Our domain `slugPattern` is a strict subset, so
   this is a defensive guard — throws `InvalidSlugError` on violation.
2. Recipe goes through the adapter → Lexicon record shape.
3. `agent.com.atproto.repo.putRecord` with `rkey = slug` — republishing the
   same recipe overwrites the record rather than creating a duplicate.

**Known limitation:** renaming a recipe changes the slug, which creates a new
PDS record. The old record persists until we add explicit delete-then-put
logic (deferred).

## Deferred

- Reading recipes from the network (Jetstream ingester, PDS fetch-by-handle).
- `social.hob.cook` records (cooking history as social signal).
- Remix provenance (`parent` field linking to a forked recipe's AT-URI).
- AppView / recipe discovery feed.
- `exchange.recipe.recipe` dual-write for community-ecosystem interop.
- Publishing the lexicon to the network via `com.atproto.lexicon.schema` +
  `_lexicon` DNS TXT record. Happens at stable release, when we drop the
  `.temp.` segment.
- iOS standalone-PWA OAuth (browser redirect returns to Safari, not the PWA).
- Permissioned / private records for planning data (pools, themes, staples).
- Multi-user household identity model.
