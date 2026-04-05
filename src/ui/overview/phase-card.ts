import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { ContextConsumer } from '@lit/context';
import { classMap } from 'lit/directives/class-map.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import { scaleFactorContext } from '../contexts/recipe-contexts.js';
import type { Phase } from '../../domain/schedule/types.js';
import type { Operation, FinishStep } from '../../domain/recipe/types.js';
import { scaleQuantity } from '../../domain/scaling/scale.js';
import { formatMinutes } from '../../domain/cooking/timer.js';

@customElement('phase-card')
export class PhaseCard extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .phase-card {
        background: var(--card);
        border-radius: var(--radius);
        overflow: hidden;
        cursor: pointer;
        transition: transform var(--transition);
      }
      .phase-card:active { transform: scale(0.98); }

      .phase-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 16px;
        border-left: 4px solid;
      }
      .phase-header.prep { border-color: var(--accent-orange); }
      .phase-header.cook,
      .phase-header.build { border-color: var(--accent-teal); }
      .phase-header.simmer,
      .phase-header.passive { border-color: var(--accent-purple); }
      .phase-header.finish { border-color: var(--accent-gray); }

      .phase-label {
        font-size: var(--text-xs);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        padding: 2px 8px;
        border-radius: 4px;
        color: #111;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .phase-label.prep { background: var(--accent-orange); }
      .phase-label.cook,
      .phase-label.build { background: var(--accent-teal); }
      .phase-label.simmer,
      .phase-label.passive { background: var(--accent-purple); color: #fff; }
      .phase-label.finish { background: var(--accent-gray); }

      .phase-time {
        font-size: var(--text-sm);
        color: var(--text-dim);
        flex-shrink: 0;
        white-space: nowrap;
      }

      .phase-ops {
        padding: 0 16px 12px;
      }

      .phase-op {
        padding: 8px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
      }
      .phase-op:first-child { border-top: none; }

      .phase-op-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .op-action-tag {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: var(--text-xs);
        font-weight: 600;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-dim);
        white-space: nowrap;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .op-text {
        font-size: var(--text-base);
        flex: 1;
      }
      .op-text .qty {
        font-weight: 700;
        color: #fff;
      }

      .op-meta {
        display: flex;
        gap: 8px;
        margin-top: 4px;
        font-size: var(--text-xs);
        color: var(--text-dim);
      }

      .op-meta-tag {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .passive-badge {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: var(--text-xs);
        font-weight: 600;
        text-transform: uppercase;
        background: var(--accent-purple);
        color: #fff;
        margin-left: 4px;
      }

      .parallel-group {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
      }

      @media (min-width: 480px) {
        .parallel-group {
          grid-template-columns: 1fr 1fr;
        }
      }
      .parallel-group .phase-op {
        background: rgba(255, 255, 255, 0.03);
        border-radius: var(--radius-sm);
        padding: 8px;
        border-top: none;
      }

      @media (min-width: 600px) {
        .parallel-group { gap: 12px; }
      }
    `,
  ];

  @property({ type: Object }) accessor phase!: Phase;
  @property({ type: Number }) accessor index = 0;

  private _scaleFactorConsumer = new ContextConsumer(this, {
    context: scaleFactorContext,
    subscribe: true,
  });

  get scaleFactor(): number {
    return this._scaleFactorConsumer.value ?? 1;
  }

  private _isOperation(op: Operation | FinishStep): op is Operation {
    return 'id' in op;
  }

  private _jumpToPhase() {
    this.dispatchEvent(
      new CustomEvent('jump-to-phase', {
        detail: { index: this.index },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderOperation(op: Operation | FinishStep) {
    if (this._isOperation(op)) {
      return html`
        <div class="phase-op">
          <div class="phase-op-row">
            <span class="op-action-tag">${op.action}</span>
            <span class="op-text">${op.details ?? op.action}${
              op.time > 0 && op.activeTime < op.time
                ? html`<span class="passive-badge">passive</span>`
                : nothing
            }</span>
          </div>
          ${op.time > 0 || op.equipment
            ? html`
                <div class="op-meta">
                  ${op.time > 0 ? html`<span class="op-meta-tag">&#9202; ${formatMinutes(op.time)}</span>` : nothing}
                  ${op.equipment ? html`<span class="op-meta-tag">&#127859; ${op.equipment.use}</span>` : nothing}
                  ${op.heat ? html`<span class="op-meta-tag">&#128293; ${op.heat}</span>` : nothing}
                </div>
              `
            : nothing}
        </div>
      `;
    }

    // FinishStep
    return html`
      <div class="phase-op">
        <div class="phase-op-row">
          <span class="op-action-tag">${op.action}</span>
          <span class="op-text">${op.details ?? op.action}</span>
        </div>
      </div>
    `;
  }

  override render() {
    if (!this.phase) return nothing;

    const phaseType = this.phase.type;

    return html`
      <div class="phase-card" @click=${this._jumpToPhase}>
        <div class="phase-header ${phaseType}">
          <span class="phase-label ${phaseType}">${this.phase.name}</span>
          <span class="phase-time">${formatMinutes(this.phase.time)}</span>
        </div>
        <div class="phase-ops">
          ${this.phase.parallel && this.phase.parallelOps && this.phase.parallelOps.length > 1
            ? html`
                <div class="parallel-group">
                  ${this.phase.parallelOps.map(op => this._renderOperation(op))}
                </div>
              `
            : this.phase.operations.map(op => this._renderOperation(op))}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'phase-card': PhaseCard;
  }
}
