import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { ContextConsumer } from '@lit/context';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import { scaleFactorContext } from '../contexts/recipe-contexts.js';
import { scaleQuantity } from '../../domain/scaling/scale.js';
import type { Operation } from '../../domain/recipe/types.js';

@customElement('secondary-task')
export class SecondaryTask extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .secondary-task {
        margin: 0 16px 12px;
        padding: 14px 16px;
        background: var(--card);
        border-radius: var(--radius);
        border: 1px dashed rgba(255, 255, 255, 0.15);
        cursor: pointer;
        transition: transform var(--transition);
      }

      .secondary-task:active { transform: scale(0.98); }

      .secondary-task-label {
        font-size: var(--text-xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--accent-teal);
        margin-bottom: 4px;
      }

      .secondary-task-summary {
        font-size: var(--text-base);
        color: var(--text);
        margin-bottom: 4px;
      }

      .secondary-task-hint {
        font-size: var(--text-xs);
        color: var(--text-muted);
        margin-top: 4px;
      }

      .op-item {
        padding: 6px 0;
      }

      .op-item + .op-item {
        border-top: 1px solid rgba(255, 255, 255, 0.05);
      }

      .op-action {
        font-weight: 600;
        color: var(--text);
        text-transform: capitalize;
      }

      .op-details {
        font-size: var(--text-sm);
        color: var(--text-dim);
        margin-top: 2px;
      }

      @media (min-width: 600px) {
        .secondary-task {
          max-width: 640px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    `,
  ];

  @property({ type: Array }) accessor operations: Operation[] = [];

  private _scaleFactorConsumer = new ContextConsumer(this, {
    context: scaleFactorContext,
    subscribe: true,
  });

  get scaleFactor(): number {
    return this._scaleFactorConsumer.value ?? 1;
  }

  override render() {
    if (!this.operations || this.operations.length === 0) return nothing;

    return html`
      <div class="secondary-task">
        <div class="secondary-task-label">While waiting</div>
        ${this.operations.map(op => html`
          <div class="op-item">
            <div class="secondary-task-summary">
              <span class="op-action">${op.action}</span>
              ${op.time > 0 ? html` \u2014 ${op.time} min` : nothing}
            </div>
            ${op.details ? html`<div class="op-details">${op.details}</div>` : nothing}
          </div>
        `)}
        <div class="secondary-task-hint">Tap to focus on this task</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'secondary-task': SecondaryTask;
  }
}
