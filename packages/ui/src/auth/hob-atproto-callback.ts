import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { loadSession, type SessionState } from '@recipe/atproto';
import { designTokens, baseStyles } from '../shared/styles.js';
import { getOAuthClient } from './oauth-client.js';

@customElement('hob-atproto-callback')
export class HobAtprotoCallback extends LitElement {
  static override styles = [
    designTokens,
    baseStyles,
    css`
      :host { display: block; padding: var(--space-lg); text-align: center; }
      .msg { color: var(--text-dim); font-size: var(--text-base); }
      .err { color: var(--danger); font-size: var(--text-sm); margin-top: 12px; }
      a { color: var(--accent-teal); }
    `,
  ];

  @state() private _state: SessionState | { kind: 'pending' } = { kind: 'pending' };

  override async connectedCallback() {
    super.connectedCallback();
    const { client } = await getOAuthClient();
    this._state = await loadSession(client);
    if (this._state.kind === 'authenticated') {
      window.location.replace('../../');
    }
  }

  override render() {
    const s = this._state;
    if (s.kind === 'pending' || s.kind === 'authenticated') {
      return html`<p class="msg">Completing sign-in…</p>`;
    }
    if (s.kind === 'unauthenticated') {
      return html`<p class="msg">No session found. <a href="../../">Return home</a>.</p>`;
    }
    return html`
      <p class="msg">Sign-in failed.</p>
      <p class="err">${s.reason}</p>
      <p><a href="../../">Return home</a></p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hob-atproto-callback': HobAtprotoCallback;
  }
}
