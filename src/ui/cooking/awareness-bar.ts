import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import { formatTime } from '../../domain/cooking/timer.js';

interface TimerPill {
  opId: string;
  remaining: number;
  action: string;
}

@customElement('awareness-bar')
export class AwarenessBar extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .awareness-bar {
        padding: 8px 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        min-height: 0;
      }

      .awareness-bar:empty { display: none; }

      .awareness-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: var(--accent-purple);
        border-radius: 20px;
        font-size: var(--text-sm);
        font-weight: 500;
        color: #fff;
        cursor: pointer;
        transition: transform var(--transition);
        animation: pillPulse 2s ease-in-out infinite;
      }

      .awareness-pill.done {
        background: var(--success);
        animation: none;
      }

      .awareness-pill.urgent {
        animation: pillPulse 1s ease-in-out infinite;
      }

      @keyframes pillPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }

      @media (min-width: 600px) {
        .awareness-bar {
          max-width: 640px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    `,
  ];

  @property({ type: Array }) accessor timers: TimerPill[] = [];

  private _lastTimerKey = '';

  protected override shouldUpdate(): boolean {
    const key = this.timers
      .map(t => `${t.opId}:${t.remaining}`)
      .join(',');
    if (key === this._lastTimerKey) return false;
    this._lastTimerKey = key;
    return true;
  }

  override render() {
    if (!this.timers || this.timers.length === 0) return nothing;

    return html`
      <div class="awareness-bar">
        ${repeat(
          this.timers,
          (t) => t.opId,
          (t) => {
            const done = t.remaining <= 0;
            const urgent = !done && t.remaining <= 60;
            return html`
              <span class=${classMap({ 'awareness-pill': true, done, urgent })}>
                ${t.action} \u2014 ${done ? 'Done!' : formatTime(t.remaining)}
              </span>
            `;
          },
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'awareness-bar': AwarenessBar;
  }
}
