import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';

@customElement('servings-adjuster')
export class ServingsAdjuster extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .servings-adjuster {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 12px 16px;
      }

      label {
        font-size: var(--text-sm);
        color: var(--text-dim);
        font-weight: 500;
      }

      .servings-btn {
        width: var(--touch-min);
        height: var(--touch-min);
        border-radius: 50%;
        border: 2px solid var(--accent-teal);
        background: transparent;
        color: var(--accent-teal);
        font-size: 1.4rem;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--transition), color var(--transition);
        -webkit-user-select: none;
        user-select: none;
      }
      .servings-btn:active {
        background: var(--accent-teal);
        color: var(--bg);
      }

      .servings-count {
        font-size: 1.5rem;
        font-weight: 700;
        min-width: 48px;
        text-align: center;
        color: #fff;
      }

      @media (min-width: 600px) {
        .servings-adjuster {
          max-width: 640px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    `,
  ];

  @property({ type: Number }) accessor servings = 1;
  @property() accessor label = 'Servings';

  private _adjust(delta: number) {
    this.dispatchEvent(
      new CustomEvent('adjust-servings', {
        detail: { delta },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="servings-adjuster">
        <label>${this.label}</label>
        <button
          class="servings-btn"
          @click=${() => this._adjust(-1)}
          ?disabled=${this.servings <= 1}
          aria-label="Decrease servings"
        >&minus;</button>
        <span class="servings-count">${this.servings}</span>
        <button
          class="servings-btn"
          @click=${() => this._adjust(1)}
          aria-label="Increase servings"
        >+</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'servings-adjuster': ServingsAdjuster;
  }
}
