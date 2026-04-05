import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import type { Equipment } from '../../domain/recipe/types.js';

@customElement('equipment-summary')
export class EquipmentSummary extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .equipment-summary {
        margin: 0 16px 16px;
        padding: 12px 16px;
        background: var(--card);
        border-radius: var(--radius);
      }

      h3 {
        font-size: var(--text-sm);
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text-dim);
        margin-bottom: 8px;
      }

      .equipment-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .equipment-chip {
        padding: 4px 12px;
        background: var(--card-raised);
        border-radius: 20px;
        font-size: var(--text-sm);
        color: var(--text);
      }

      @media (min-width: 600px) {
        .equipment-summary {
          max-width: 640px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    `,
  ];

  @property({ type: Array }) accessor equipment: Equipment[] = [];
  @property() accessor label = 'Equipment';

  override render() {
    if (this.equipment.length === 0) return html``;

    return html`
      <div class="equipment-summary">
        <h3>${this.label}</h3>
        <div class="equipment-list">
          ${this.equipment.map(
            eq => html`<span class="equipment-chip">${eq.count > 1 ? `${eq.count}x ` : ''}${eq.name}</span>`,
          )}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'equipment-summary': EquipmentSummary;
  }
}
