import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import type { Operation } from '../../domain/recipe/types.js';
import { formatMinutes } from '../../domain/cooking/timer.js';

@customElement('context-banner')
export class ContextBanner extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .context-banner {
        margin: 0 var(--space-md) var(--space-sm);
        padding: 12px 16px;
        background: var(--accent-purple);
        border-radius: var(--radius);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
      }

      .context-banner-text {
        font-size: var(--text-sm);
        font-weight: 600;
        color: #fff;
      }

      .context-banner-sub {
        font-size: var(--text-xs);
        color: rgba(255, 255, 255, 0.7);
      }

      @media (min-width: 600px) {
        .context-banner {
          max-width: 640px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    `,
  ];

  @property({ type: Object }) accessor operation: Operation | null = null;

  override render() {
    if (!this.operation) return nothing;

    const op = this.operation;
    const timeLabel = op.time > 0 ? ` \u2014 ${formatMinutes(op.time)}` : '';

    return html`
      <div class="context-banner">
        <div>
          <div class="context-banner-text">${op.action}${timeLabel}</div>
          ${op.details ? html`<div class="context-banner-sub">${op.details}</div>` : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'context-banner': ContextBanner;
  }
}
