import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import { resolveIngredients } from '../../domain/recipe/resolve.js';
import type { Phase } from '../../domain/schedule/types.js';
import type { Operation, FinishStep, Recipe } from '../../domain/recipe/types.js';
import './focus-card.js';
import './timer-button.js';
import './awareness-bar.js';
import './context-banner.js';
import './secondary-task.js';
import './nav-buttons.js';

interface CookingStep {
  phase: Phase;
  phaseIdx: number;
  op: Operation | FinishStep;
  opIdx: number;
  isParallel: boolean;
  parallelOps?: Operation[];
  contextOp?: Operation;
}

function buildCookingSteps(phases: Phase[]): CookingStep[] {
  const steps: CookingStep[] = [];
  let activeContext: Operation | undefined;

  for (let pi = 0; pi < phases.length; pi++) {
    const phase = phases[pi]!;

    if (phase.type === 'simmer' && phase.operations.length === 1) {
      const op = phase.operations[0]!;
      activeContext = 'id' in op ? op : undefined;

      steps.push({
        phase, phaseIdx: pi,
        op,
        opIdx: 0,
        isParallel: phase.parallel,
        parallelOps: phase.parallelOps,
        contextOp: undefined,
      });
      continue;
    }

    for (let oi = 0; oi < phase.operations.length; oi++) {
      steps.push({
        phase, phaseIdx: pi,
        op: phase.operations[oi]!,
        opIdx: oi,
        isParallel: false,
        contextOp: activeContext,
      });
    }

    if (phase.type !== 'simmer') {
      activeContext = undefined;
    }
  }
  return steps;
}

interface ActiveTimer {
  opId: string;
  remaining: number;
  action: string;
}

@customElement('cooking-view')
export class CookingView extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host {
        display: block;
        padding-bottom: 120px;
      }

      .cooking-content {
        view-transition-name: focus-area;
      }

      .step-counter {
        text-align: center;
        font-size: var(--text-xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--accent-teal);
        padding: var(--space-sm) var(--space-md) 0;
      }

      .progress-track {
        height: 3px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 2px;
        margin: 6px var(--space-md) 0;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: var(--accent-teal);
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      .timer-row {
        display: flex;
        justify-content: center;
        padding: 0 var(--space-md) var(--space-sm);
      }

      .completion-card {
        margin: var(--space-lg) var(--space-md);
        padding: var(--space-lg);
        background: var(--surface-complete);
        border-radius: var(--radius);
        text-align: center;
      }

      .completion-icon {
        font-size: 2.5rem;
        color: var(--text-celebrate);
        margin-bottom: 12px;
      }

      .completion-title {
        font-size: var(--text-xl);
        font-weight: 700;
        color: #fff;
        margin-bottom: 8px;
      }

      .completion-subtitle {
        font-size: var(--text-base);
        color: var(--text-dim);
      }

      .fade-in {
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (min-width: 600px) {
        .step-counter,
        .progress-track,
        .timer-row,
        .completion-card {
          max-width: 640px;
          margin-left: auto;
          margin-right: auto;
        }
      }
    `,
  ];

  @property({ type: Array }) accessor phases: Phase[] = [];
  @property({ type: Number }) accessor currentStep = 0;
  @property({ type: Object }) accessor i18n: any = {};
  @property({ type: Object }) accessor recipe: Recipe | null = null;

  @property({ type: Array }) accessor activeTimers: ActiveTimer[] = [];

  private _steps: CookingStep[] = [];

  private _isOperation(op: Operation | FinishStep): op is Operation {
    return 'id' in op;
  }

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('phases')) {
      this._steps = buildCookingSteps(this.phases);
    }
  }

  private _getIngredients(op: Operation | FinishStep) {
    if (!this.recipe || !this._isOperation(op)) return [];
    return resolveIngredients(op, this.recipe);
  }

  private _handleStepChange(fn: () => void) {
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        fn();
        this.requestUpdate();
      });
    } else {
      fn();
    }
  }

  override render() {
    if (this._steps.length === 0) return nothing;

    const total = this._steps.length;
    const isComplete = this.currentStep >= total;

    if (isComplete) {
      const title = this.recipe?.meta?.title ?? 'Your meal';
      return html`
        <div class="cooking-content fade-in">
          <div class="step-counter">
            Step ${total} of ${total}
          </div>
          <div class="progress-track">
            <div class="progress-fill" style=${styleMap({ width: '100%' })}></div>
          </div>
          <div class="completion-card">
            <div class="completion-icon">&#10003;</div>
            <div class="completion-title">Enjoy your meal</div>
            <div class="completion-subtitle">${title} — done in ${total} steps</div>
          </div>
        </div>
        <nav-buttons
          .currentStep=${total}
          .totalSteps=${total}
          .backLabel=${this.i18n?.back ?? 'Back'}
          .nextLabel=${this.i18n?.next ?? 'Next'}
        ></nav-buttons>
      `;
    }

    const idx = Math.max(0, Math.min(this.currentStep, total - 1));
    const step = this._steps[idx]!;
    const op = step.op;
    const isOp = this._isOperation(op);
    const hasTime = isOp && op.time > 0;
    const ingredients = this._getIngredients(op);
    const progressPct = ((idx + 1) / total) * 100;

    const timerForOp = isOp
      ? this.activeTimers.find(t => t.opId === op.id)
      : undefined;

    const isPassive = isOp && op.time > 0 && op.activeTime !== undefined && op.activeTime < op.time;
    const contextAction = step.contextOp?.action ?? '';

    return html`
      <awareness-bar .timers=${this.activeTimers}></awareness-bar>

      ${step.contextOp ? html`
        <context-banner .operation=${step.contextOp}></context-banner>
      ` : nothing}

      <div class="cooking-content fade-in">
        <div class="step-counter">
          Step ${idx + 1} of ${total}
        </div>
        <div class="progress-track">
          <div class="progress-fill" style=${styleMap({ width: `${progressPct}%` })}></div>
        </div>

        <focus-card
          .operation=${op}
          .ingredients=${ingredients}
          .isPassive=${isPassive}
          .contextAction=${contextAction}
        ></focus-card>

        ${hasTime ? html`
          <div class="timer-row">
            <timer-button
              .opId=${(op as Operation).id}
              .time=${(op as Operation).time}
              .running=${timerForOp?.remaining ? timerForOp.remaining > 0 : false}
              .remaining=${timerForOp?.remaining ?? 0}
            ></timer-button>
          </div>
        ` : nothing}
      </div>

      ${step.parallelOps && step.parallelOps.length > 0 ? html`
        <secondary-task
          .operations=${step.parallelOps}
        ></secondary-task>
      ` : nothing}

      <nav-buttons
        .currentStep=${idx}
        .totalSteps=${total}
        .backLabel=${this.i18n?.back ?? 'Back'}
        .nextLabel=${this.i18n?.next ?? 'Next'}
      ></nav-buttons>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cooking-view': CookingView;
  }
}
