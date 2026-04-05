import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import type { ScheduleMode } from '../../domain/schedule/types.js';

@customElement('mode-toggle')
export class ModeToggle extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .mode-toggle {
        display: flex;
        margin: 0 16px 16px;
        background: var(--card);
        border-radius: var(--radius);
        overflow: hidden;
        position: relative;
      }

      .mode-btn {
        flex: 1;
        padding: 10px 8px;
        border: none;
        background: transparent;
        color: var(--text-dim);
        font-size: var(--text-sm);
        font-weight: 600;
        cursor: pointer;
        transition: background var(--transition), color var(--transition);
        min-height: var(--touch-min);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        z-index: 1;
        font-family: inherit;
      }

      .mode-btn.active {
        background: var(--accent-purple);
        color: #fff;
      }

      @media (min-width: 600px) {
        .mode-toggle {
          max-width: 640px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    `,
  ];

  @property() accessor mode: ScheduleMode = 'relaxed';
  @property({ type: Object }) accessor labels: { relaxed: string; optimized: string } = {
    relaxed: 'Relaxed',
    optimized: 'Optimized',
  };

  private _setMode(mode: ScheduleMode) {
    this.dispatchEvent(
      new CustomEvent('set-mode', {
        detail: { mode },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="mode-toggle" role="radiogroup" aria-label="Schedule mode">
        <button
          class=${classMap({ 'mode-btn': true, active: this.mode === 'relaxed' })}
          role="radio"
          aria-checked=${this.mode === 'relaxed'}
          @click=${() => this._setMode('relaxed')}
        >${this.labels.relaxed}</button>
        <button
          class=${classMap({ 'mode-btn': true, active: this.mode === 'optimized' })}
          role="radio"
          aria-checked=${this.mode === 'optimized'}
          @click=${() => this._setMode('optimized')}
        >${this.labels.optimized}</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mode-toggle': ModeToggle;
  }
}
