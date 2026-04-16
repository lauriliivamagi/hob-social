import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Recipe } from '@recipe/domain';
import {
  loadSession,
  publishRecipe,
  subscribeToSessionEvents,
  type SessionState,
} from '@recipe/atproto';
import { designTokens, baseStyles } from '../shared/styles.js';
import { getOAuthClient } from './oauth-client.js';

type PublishState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; uri: string }
  | { kind: 'error'; reason: string };

export interface RecipePublishedDetail {
  uri: string;
  cid: string;
  rkey: string;
}

@customElement('hob-atproto-publish')
export class HobAtprotoPublish extends LitElement {
  static override styles = [
    designTokens,
    baseStyles,
    css`
      :host { display: inline-block; }
      button {
        font: inherit;
        padding: 8px 16px;
        border-radius: var(--radius-sm);
        border: none;
        background: var(--accent-purple);
        color: white;
        cursor: pointer;
        font-weight: 600;
        min-height: var(--touch-min);
      }
      button:disabled { opacity: 0.5; cursor: wait; }
      .status { font-size: var(--text-sm); margin-top: 8px; }
      .success { color: var(--success); word-break: break-all; }
      .error { color: var(--danger); }
      .unauth { color: var(--text-dim); font-size: var(--text-sm); }
    `,
  ];

  @property({ attribute: false }) recipe!: Recipe;

  /**
   * Existing rkey from a previous publish. Optional override — when unset,
   * the component looks up a stored rkey in localStorage (keyed by
   * DID + slug) after authentication resolves.
   */
  @property({ attribute: false }) rkey?: string;

  @state() private _session: SessionState | { kind: 'pending' } = { kind: 'pending' };
  @state() private _publish: PublishState = { kind: 'idle' };

  override async connectedCallback() {
    super.connectedCallback();
    const { client, events } = await getOAuthClient();
    subscribeToSessionEvents(events, (evt) => {
      if (evt.type === 'deleted') {
        this._session = { kind: 'unauthenticated' };
        this._publish = { kind: 'idle' };
      }
    });
    this._session = await loadSession(client);
  }

  override willUpdate(changed: PropertyValues<this>) {
    // A recipe swap invalidates both the cached rkey (different slug) and the
    // on-screen publish status (belongs to the previous recipe).
    const sessionChanged = (changed as Map<PropertyKey, unknown>).has('_session');
    if (changed.has('recipe')) {
      this._publish = { kind: 'idle' };
      this._syncRkeyFromStorage();
    } else if (sessionChanged) {
      // Session just resolved or refreshed — pick up any cached rkey.
      this._syncRkeyFromStorage();
    }
  }

  private _syncRkeyFromStorage() {
    if (this._session.kind !== 'authenticated') {
      this.rkey = undefined;
      return;
    }
    this.rkey = loadStoredRkey(this._session.did, this.recipe.meta.slug) ?? undefined;
  }

  private async _publishClick() {
    if (this._session.kind !== 'authenticated') return;
    this._publish = { kind: 'pending' };
    try {
      const result = await publishRecipe(this._session.agent, this.recipe, {
        rkey: this.rkey,
      });
      this._publish = { kind: 'success', uri: result.uri };
      this.rkey = result.rkey;
      saveStoredRkey(this._session.did, this.recipe.meta.slug, result.rkey);
      const detail: RecipePublishedDetail = {
        uri: result.uri,
        cid: result.cid,
        rkey: result.rkey,
      };
      this.dispatchEvent(
        new CustomEvent<RecipePublishedDetail>('recipe-published', {
          detail,
          bubbles: true,
          composed: true,
        }),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this._publish = { kind: 'error', reason };
      // Session may have expired — re-check.
      const { client } = await getOAuthClient();
      this._session = await loadSession(client);
    }
  }

  override render() {
    if (this._session.kind === 'pending') return html`<span class="unauth">…</span>`;
    if (this._session.kind !== 'authenticated') {
      return html`<span class="unauth">Log in to publish.</span>`;
    }
    const p = this._publish;
    return html`
      <button
        ?disabled=${p.kind === 'pending'}
        @click=${this._publishClick}
      >
        ${p.kind === 'pending' ? 'Publishing…' : 'Publish to PDS'}
      </button>
      ${p.kind === 'success'
        ? html`<div class="status success">Published: ${p.uri}</div>`
        : null}
      ${p.kind === 'error'
        ? html`<div class="status error">${p.reason}</div>`
        : null}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hob-atproto-publish': HobAtprotoPublish;
  }
}

function rkeyStorageKey(did: string, slug: string): string {
  return `atproto-rkey:${did}:${slug}`;
}

function loadStoredRkey(did: string, slug: string): string | null {
  try {
    return localStorage.getItem(rkeyStorageKey(did, slug));
  } catch {
    return null;
  }
}

function saveStoredRkey(did: string, slug: string, rkey: string): void {
  try {
    localStorage.setItem(rkeyStorageKey(did, slug), rkey);
  } catch {
    // Storage quota or disabled — fall through; republish just creates a new TID.
  }
}
