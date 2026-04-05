import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { ContextConsumer } from '@lit/context';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import { scaleFactorContext } from '../contexts/recipe-contexts.js';
import { scaleQuantity } from '../../domain/scaling/scale.js';
import type { Operation, FinishStep, Ingredient } from '../../domain/recipe/types.js';

@customElement('focus-card')
export class FocusCard extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .focus-card {
        margin: var(--space-sm) var(--space-md);
        background: var(--card);
        border-radius: var(--radius);
        padding: var(--space-lg);
        position: relative;
      }

      .focus-action {
        font-size: var(--text-xl);
        font-weight: 700;
        color: #fff;
        margin-bottom: 12px;
        text-transform: capitalize;
      }

      .focus-ingredients {
        margin-bottom: 12px;
      }

      .ingredient-line {
        font-size: var(--text-base);
        line-height: 1.8;
        color: var(--text);
      }

      .qty {
        font-weight: 700;
        color: #fff;
      }

      .focus-details {
        font-size: var(--text-base);
        line-height: 1.6;
        color: var(--text);
        margin-bottom: 16px;
      }

      .focus-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .focus-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 12px;
        background: var(--card-raised);
        border-radius: 20px;
        font-size: var(--text-sm);
        color: var(--text-dim);
      }

      .focus-tag .icon { font-size: var(--text-base); }

      .focus-hint {
        font-size: var(--text-sm);
        color: var(--text-warm, var(--text-dim));
        font-style: italic;
        margin-bottom: 12px;
        line-height: 1.5;
      }

      .focus-tag.heat {
        background: rgba(244, 162, 97, 0.15);
        color: var(--accent-orange);
      }

      .focus-tag.equipment {
        background: rgba(124, 92, 252, 0.2);
        color: var(--accent-purple);
        border: 1px solid rgba(124, 92, 252, 0.3);
      }

      @media (min-width: 600px) {
        .focus-card {
          max-width: 640px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    `,
  ];

  @property({ type: Object }) accessor operation: Operation | FinishStep | null = null;

  private _scaleFactorConsumer = new ContextConsumer(this, {
    context: scaleFactorContext,
    subscribe: true,
  });

  get scaleFactor(): number {
    return this._scaleFactorConsumer.value ?? 1;
  }
  @property({ type: Array }) accessor ingredients: Ingredient[] = [];
  @property({ type: Boolean }) accessor isPassive = false;
  @property({ type: String }) accessor contextAction = '';

  private _isOperation(op: Operation | FinishStep): op is Operation {
    return 'id' in op;
  }

  private _renderHint(op: Operation | null) {
    if (!op) return nothing;

    if (this.isPassive && op.time > 0) {
      const idleMin = op.time - (op.activeTime ?? op.time);
      if (idleMin > 0) {
        return html`<div class="focus-hint">${idleMin} minutes of hands-free time.</div>`;
      }
    }

    if (this.contextAction) {
      return html`<div class="focus-hint">Meanwhile, ${this.contextAction} is running in the background.</div>`;
    }

    return nothing;
  }

  override render() {
    const op = this.operation;
    if (!op) return nothing;

    const action = op.action;
    const details = op.details ?? '';
    const isOp = this._isOperation(op);
    const heat = isOp ? op.heat : undefined;
    const equipment = isOp ? op.equipment : undefined;

    return html`
      <div class="focus-card">
        <div class="focus-action">${action}</div>

        ${this.ingredients.length > 0 ? html`
          <div class="focus-ingredients">
            ${this.ingredients.map(ing => {
              const scaled = scaleQuantity(ing.quantity, ing.unit, this.scaleFactor);
              return html`
                <div class="ingredient-line">
                  <span class="qty">${scaled} ${ing.unit}</span> ${ing.name}
                </div>
              `;
            })}
          </div>
        ` : nothing}

        ${details ? html`<div class="focus-details">${details}</div>` : nothing}

        ${this._renderHint(isOp ? op as Operation : null)}

        <div class="focus-tags">
          ${heat ? html`
            <span class="focus-tag heat">
              <span class="icon">&#128293;</span> ${heat}
            </span>
          ` : nothing}
          ${equipment ? html`
            <span class="focus-tag equipment">
              <span class="icon">&#127859;</span> ${equipment.use}
            </span>
          ` : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'focus-card': FocusCard;
  }
}
