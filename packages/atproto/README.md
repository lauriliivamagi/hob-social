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
- **`src/publish/`** — `publishRecipe(agent, recipe, { rkey? })` → `com.atproto.repo.putRecord`.

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
  `http://127.0.0.1:<port>/auth/callback/`.
- **Prod** — fetches
  [`/oauth-client-metadata.json`](../../public/oauth-client-metadata.json) at
  `https://hob.social/oauth-client-metadata.json`. Redirects to
  `https://hob.social/auth/callback/`.

Prod is live on `hob.social` (GitHub Pages + Cloudflare DNS, Let's
Encrypt cert). Verified end-to-end with a successful recipe publish on
2026-04-16.

### Gotchas learned during prod rollout

Both were invisible in dev (Vite dev server handles routing differently)
and only surface on GitHub Pages. Documented here so a future reader
doesn't re-debug:

1. **Trailing-slash redirect URI.** `BrowserOAuthClient.findRedirectUrl()`
   does an exact string match on `location.pathname` against registered
   `redirect_uris`. GitHub Pages serves the callback HTML at
   `site/auth/callback/index.html`, reachable at `/auth/callback/` (with
   trailing slash — `/auth/callback` gets 301'd). The registered URI
   must include the trailing slash, or `init()` silently skips the
   callback and the user lands on "No session found".
2. **Service worker `navigateFallback` hijacks the callback.** Workbox's
   `NavigationRoute` with `navigateFallback: 'offline.html'` serves
   `offline.html` for any URL not explicitly precached. `/auth/callback`
   (without the trailing slash) doesn't match because directory-index
   mapping only fires for trailing-slash paths. Add
   `navigateFallbackDenylist: [/^\/auth\/callback/]` to let the SW pass
   through to network; GitHub's 301 preserves the OAuth fragment; the
   SW then serves the precached index from `/auth/callback/`.

## Publish path

1. `publishRecipe(agent, recipe, { rkey? })` — if `rkey` is provided, that
   record is overwritten; otherwise a fresh TID (`TID.nextStr()` from
   `@atproto/common-web`) is generated.
2. Recipe goes through the adapter → Lexicon record shape.
3. `agent.com.atproto.repo.putRecord` with the TID-based rkey.
4. Returns `{ uri, cid, rkey }`. Callers persist the rkey (e.g. the viewer
   component stores it in localStorage keyed by DID + slug) so subsequent
   republishes update the same record and the `at://` permalink stays stable.

The rkey is deliberately decoupled from `meta.slug`: renaming a recipe changes
the slug but the rkey (and therefore the AT-URI) stays stable. See the lexicon
description for the full rationale.

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
