import { Agent } from '@atproto/api';
import type { BrowserOAuthClient, OAuthSession } from '@atproto/oauth-client-browser';
import type { OAuthEventTarget } from './client.js';

export type SessionState =
  | { kind: 'authenticated'; agent: Agent; did: string; handle: string | undefined }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; reason: string };

export type SessionEvent =
  | { type: 'deleted'; sub: string; cause: string }
  | { type: 'updated'; sub: string };

/**
 * Initialize the OAuth client, either resuming a stored session or processing
 * an OAuth callback if the URL contains OAuth params. Normalizes all outcomes
 * (success, no session, thrown error) into a `SessionState` for the UI.
 */
export async function loadSession(
  client: BrowserOAuthClient,
): Promise<SessionState> {
  try {
    const result = await client.init();
    if (!result) return { kind: 'unauthenticated' };
    return await stateFromSession(result.session);
  } catch (err) {
    return {
      kind: 'error',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Subscribe to session lifecycle events from the OAuth client. Returns an
 * unsubscribe function.
 */
export function subscribeToSessionEvents(
  events: OAuthEventTarget,
  listener: (event: SessionEvent) => void,
): () => void {
  const onDeleted = (e: Event) => {
    const detail = (e as CustomEvent<{ sub: string; cause: unknown }>).detail;
    listener({
      type: 'deleted',
      sub: detail.sub,
      cause:
        detail.cause instanceof Error
          ? detail.cause.message
          : String(detail.cause),
    });
  };
  const onUpdated = (e: Event) => {
    const detail = (e as CustomEvent<{ sub: string }>).detail;
    listener({ type: 'updated', sub: detail.sub });
  };
  events.addEventListener('deleted', onDeleted as EventListener);
  events.addEventListener('updated', onUpdated as EventListener);
  return () => {
    events.removeEventListener('deleted', onDeleted as EventListener);
    events.removeEventListener('updated', onUpdated as EventListener);
  };
}

async function stateFromSession(session: OAuthSession): Promise<SessionState> {
  const agent = new Agent(session);
  let handle: string | undefined;
  try {
    const res = await agent.com.atproto.repo.describeRepo({ repo: session.did });
    handle = res.data.handle;
  } catch {
    // Non-fatal: UI can show DID if handle lookup fails.
  }
  return { kind: 'authenticated', agent, did: session.did, handle };
}
