import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import { formatTime } from '../../domain/cooking/timer.js';

@customElement('timer-button')
export class TimerButton extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: inline-block; }

      .timer-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: var(--accent-orange);
        color: #111;
        border: none;
        border-radius: 20px;
        font-size: var(--text-sm);
        font-weight: 600;
        cursor: pointer;
        transition: transform var(--transition), opacity var(--transition);
        min-height: var(--touch-min);
        font-family: inherit;
      }

      .timer-btn:active { transform: scale(0.95); }

      .timer-btn.running {
        background: var(--accent-purple);
        color: #fff;
      }
    `,
  ];

  @property() accessor opId = '';
  @property({ type: Number }) accessor time = 0;
  @property({ type: Boolean }) accessor running = false;
  @property({ type: Number }) accessor remaining = 0;

  private _handleClick() {
    if (this.running) {
      this.dispatchEvent(new CustomEvent('cancel-timer', {
        detail: { opId: this.opId },
        bubbles: true,
        composed: true,
      }));
    } else {
      this.dispatchEvent(new CustomEvent('start-timer', {
        detail: { opId: this.opId, seconds: Math.round(this.time * 60) },
        bubbles: true,
        composed: true,
      }));
    }
  }

  override render() {
    const label = this.running
      ? `${formatTime(this.remaining)} remaining`
      : `Start timer \u2014 ${this.time} min`;

    return html`
      <button
        class=${classMap({ 'timer-btn': true, running: this.running })}
        @click=${this._handleClick}
      >
        <span>&#9202;</span>
        ${label}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'timer-button': TimerButton;
  }
}
