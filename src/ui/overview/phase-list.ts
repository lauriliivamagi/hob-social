import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import type { Phase } from '../../domain/schedule/types.js';
import './phase-card.js';

@customElement('phase-list')
export class PhaseList extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .phase-list {
        padding: 0 16px 100px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      @media (min-width: 600px) {
        .phase-list {
          max-width: 640px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    `,
  ];

  @property({ type: Array }) accessor phases: Phase[] = [];

  override render() {
    return html`
      <div class="phase-list">
        ${repeat(
          this.phases,
          (phase) => phase.name,
          (phase, i) => html`
            <phase-card
              .phase=${phase}
              .index=${i}
            ></phase-card>
          `,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'phase-list': PhaseList;
  }
}
