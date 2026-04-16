import {
  BrowserOAuthClient,
  buildAtprotoLoopbackClientMetadata,
} from '@atproto/oauth-client-browser';

export interface OAuthClientEnv {
  /** Build mode — determines how `clientMetadata` is assembled. */
  mode: 'development' | 'production';
  /** Handle resolver service (default: https://bsky.social). */
  handleResolver?: string;
  /** Production: the public URL of `oauth-client-metadata.json` (client_id). */
  clientMetadataUrl?: string;
  /** Development: loopback redirect URI (e.g. `http://127.0.0.1:5173/auth/callback`). */
  loopbackRedirect?: string;
  /** Scope string. Defaults to recipe-publish scope. */
  scope?: string;
}

const DEFAULT_HANDLE_RESOLVER = 'https://bsky.social';
const DEFAULT_SCOPE = 'atproto transition:generic';

export type OAuthEventDetail =
  | { type: 'deleted'; sub: string; cause: unknown }
  | { type: 'updated'; sub: string };

export type OAuthEventTarget = EventTarget;

export interface CreatedOAuthClient {
  client: BrowserOAuthClient;
  events: OAuthEventTarget;
}

export async function createOAuthClient(
  env: OAuthClientEnv,
): Promise<CreatedOAuthClient> {
  const handleResolver = env.handleResolver ?? DEFAULT_HANDLE_RESOLVER;
  const scope = env.scope ?? DEFAULT_SCOPE;

  const events: OAuthEventTarget = new EventTarget();
  const onDelete = (sub: string, cause: unknown) => {
    events.dispatchEvent(new CustomEvent('deleted', { detail: { sub, cause } }));
  };
  const onUpdate = (sub: string) => {
    events.dispatchEvent(new CustomEvent('updated', { detail: { sub } }));
  };

  if (env.mode === 'development') {
    if (!env.loopbackRedirect) {
      throw new Error('loopbackRedirect is required in development mode');
    }
    const client = new BrowserOAuthClient({
      allowHttp: true,
      handleResolver,
      clientMetadata: buildAtprotoLoopbackClientMetadata({
        scope,
        redirect_uris: [env.loopbackRedirect],
      }),
      onDelete,
      onUpdate,
    });
    return { client, events };
  }

  if (!env.clientMetadataUrl) {
    throw new Error('clientMetadataUrl is required in production mode');
  }
  const client = await BrowserOAuthClient.load({
    clientId: env.clientMetadataUrl,
    handleResolver,
    onDelete,
    onUpdate,
  });
  return { client, events };
}
