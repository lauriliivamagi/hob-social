import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
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

      .timer-row {
        display: flex;
        justify-content: center;
        padding: 0 var(--space-md) var(--space-sm);
      }

      .fade-in {
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `,
  ];

  @property({ type: Array }) accessor phases: Phase[] = [];
  @property({ type: Number }) accessor scaleFactor = 1;
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

    const idx = Math.max(0, Math.min(this.currentStep, this._steps.length - 1));
    const step = this._steps[idx]!;
    const op = step.op;
    const isOp = this._isOperation(op);
    const hasTime = isOp && op.time > 0;
    const ingredients = this._getIngredients(op);

    const timerForOp = isOp
      ? this.activeTimers.find(t => t.opId === op.id)
      : undefined;

    return html`
      <awareness-bar .timers=${this.activeTimers}></awareness-bar>

      ${step.contextOp ? html`
        <context-banner .operation=${step.contextOp}></context-banner>
      ` : nothing}

      <div class="cooking-content fade-in">
        <div class="step-counter">
          Step ${idx + 1} of ${this._steps.length}
        </div>

        <focus-card
          .operation=${op}
          .scaleFactor=${this.scaleFactor}
          .ingredients=${ingredients}
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
          .scaleFactor=${this.scaleFactor}
        ></secondary-task>
      ` : nothing}

      <nav-buttons
        .currentStep=${idx}
        .totalSteps=${this._steps.length}
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
