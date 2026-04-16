import { createOAuthClient, type CreatedOAuthClient } from '@recipe/atproto';

/**
 * Module-level memoized client factory. The OAuth client stores session state
 * in IndexedDB, so one instance per tab is the correct granularity.
 *
 * Dev mode uses loopback redirect (127.0.0.1). Prod mode fetches the hosted
 * `oauth-client-metadata.json` at its canonical URL.
 */
let instancePromise: Promise<CreatedOAuthClient> | undefined;

const PROD_CLIENT_METADATA_URL =
  'https://hob.social/oauth-client-metadata.json';

export function getOAuthClient(): Promise<CreatedOAuthClient> {
  if (!instancePromise) {
    instancePromise = buildClient();
  }
  return instancePromise;
}

async function buildClient(): Promise<CreatedOAuthClient> {
  const origin = window.location.origin;
  const isLoopback =
    origin.startsWith('http://127.0.0.1') || origin.startsWith('http://localhost');

  if (isLoopback) {
    return createOAuthClient({
      mode: 'development',
      loopbackRedirect: `${origin}/auth/callback/`,
    });
  }

  return createOAuthClient({
    mode: 'production',
    clientMetadataUrl: PROD_CLIENT_METADATA_URL,
  });
}
