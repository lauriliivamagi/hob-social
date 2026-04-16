import { LitElement, html, css } from 'lit';
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

  private async _publishClick() {
    if (this._session.kind !== 'authenticated') return;
    this._publish = { kind: 'pending' };
    try {
      const { uri } = await publishRecipe(this._session.agent, this.recipe);
      this._publish = { kind: 'success', uri };
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
