import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { loadSession, subscribeToSessionEvents, type SessionState } from '@recipe/atproto';
import { designTokens, baseStyles } from '../shared/styles.js';
import { getOAuthClient } from './oauth-client.js';

@customElement('hob-atproto-login')
export class HobAtprotoLogin extends LitElement {
  static override styles = [
    designTokens,
    baseStyles,
    css`
      :host {
        display: inline-block;
      }
      .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      input, button {
        font: inherit;
        padding: 8px 12px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--text-muted);
        background: var(--card);
        color: var(--text);
        min-height: var(--touch-min);
      }
      button {
        cursor: pointer;
        background: var(--accent-teal);
        color: #0e1720;
        border: none;
        font-weight: 600;
      }
      button.secondary {
        background: transparent;
        color: var(--text-dim);
        border: 1px solid var(--text-muted);
      }
      .handle { color: var(--accent-teal); font-weight: 600; }
      .error { color: var(--danger); font-size: var(--text-sm); }
      .pending { color: var(--text-dim); font-size: var(--text-sm); }
    `,
  ];

  @state() private _state: SessionState | { kind: 'pending' } = { kind: 'pending' };
  @state() private _handleInput = '';

  override async connectedCallback() {
    super.connectedCallback();
    await this._initSession();
  }

  private async _initSession() {
    this._state = { kind: 'pending' };
    const { client, events } = await getOAuthClient();
    subscribeToSessionEvents(events, (evt) => {
      if (evt.type === 'deleted') this._state = { kind: 'unauthenticated' };
    });
    this._state = await loadSession(client);
  }

  private async _signIn(e: Event) {
    e.preventDefault();
    const handle = this._handleInput.trim();
    if (!handle) return;
    try {
      const { client } = await getOAuthClient();
      await client.signIn(handle);
    } catch (err) {
      this._state = {
        kind: 'error',
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async _signOut() {
    const s = this._state;
    if (s.kind !== 'authenticated') return;
    const { client } = await getOAuthClient();
    await client.revoke(s.did);
    this._state = { kind: 'unauthenticated' };
  }

  override render() {
    const s = this._state;
    if (s.kind === 'pending') return html`<span class="pending">Checking session…</span>`;
    if (s.kind === 'authenticated') {
      return html`
        <div class="row">
          <span>Signed in as <span class="handle">@${s.handle ?? s.did}</span></span>
          <button class="secondary" @click=${this._signOut}>Sign out</button>
        </div>
      `;
    }
    return html`
      <form class="row" @submit=${this._signIn}>
        <input
          type="text"
          placeholder="your.handle.bsky.social"
          .value=${this._handleInput}
          @input=${(e: InputEvent) => (this._handleInput = (e.target as HTMLInputElement).value)}
          autocomplete="username"
        />
        <button type="submit">Log in with Bluesky</button>
        ${s.kind === 'error' ? html`<span class="error">${s.reason}</span>` : null}
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hob-atproto-login': HobAtprotoLogin;
  }
}
