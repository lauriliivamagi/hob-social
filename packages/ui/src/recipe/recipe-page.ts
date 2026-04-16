import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';
import { cache } from 'lit/directives/cache.js';
import { createActor } from 'xstate';
import { ContextProvider } from '@lit/context';
import { recipeMachine } from '../state/recipe-machine.js';
import type { RecipeContext } from '../state/recipe-machine.js';
import { ActorController } from '../controllers/actor-controller.js';
import { animatedSend } from '../state/animated-send.js';
import type { Recipe } from '@recipe/domain/recipe/types.js';
import type { Phase, ScheduleMode } from '@recipe/domain/schedule/types.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import { i18nContext, scaleFactorContext, recipeMachineContext } from '../contexts/recipe-contexts.js';
import { loadState } from '../state/persistence.js';
import './recipe-header.js';
import './servings-adjuster.js';
import './view-tabs.js';
import '../overview/overview-view.js';
import '../cooking/cooking-view.js';
import '../auth/hob-atproto-publish.js';

interface WindowGlobals {
  RECIPE: Recipe;
  I18N: Record<string, any>;
  SCHEDULE_RELAXED: Phase[];
  SCHEDULE_OPTIMIZED: Phase[];
}

@customElement('recipe-page')
export class RecipePage extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host {
        display: block;
        background: var(--bg);
        min-height: 100dvh;
      }

      .loading-placeholder {
        margin: 16px;
        padding: 24px;
        background: var(--card);
        border-radius: var(--radius);
        text-align: center;
        color: var(--text-dim);
        font-size: var(--text-base);
      }
    `,
  ];

  private _ctrl!: ActorController<typeof recipeMachine>;
  private _i18nProvider = new ContextProvider(this, { context: i18nContext, initialValue: {} });
  private _scaleFactorProvider = new ContextProvider(this, { context: scaleFactorContext, initialValue: 1 });
  private _machineProvider!: ContextProvider<typeof recipeMachineContext>;

  private get _recipe(): Recipe | null {
    return (window as unknown as WindowGlobals).RECIPE ?? null;
  }

  private get _i18n(): Record<string, any> {
    return (window as unknown as WindowGlobals).I18N ?? {};
  }

  private get _scheduleRelaxed(): Phase[] {
    return (window as unknown as WindowGlobals).SCHEDULE_RELAXED ?? [];
  }

  private get _scheduleOptimized(): Phase[] {
    return (window as unknown as WindowGlobals).SCHEDULE_OPTIMIZED ?? [];
  }

  override connectedCallback() {
    super.connectedCallback();

    const recipe = this._recipe;
    if (!recipe) return;

    const persisted = loadState();
    const slug = recipe.meta.slug;
    const savedServings = persisted.servings?.[slug];
    const savedStep = persisted.currentStep?.[slug];

    const totalSteps = this._scheduleRelaxed.reduce(
      (sum, phase) => sum + phase.operations.length,
      0,
    );

    const actor = createActor(recipeMachine, {
      input: {
        recipe,
        scheduleModes: {
          relaxed: this._scheduleRelaxed,
          optimized: this._scheduleOptimized,
        },
        mode: persisted.mode ?? 'relaxed' as ScheduleMode,
        servings: savedServings ?? recipe.meta.servings,
        originalServings: recipe.meta.servings,
        totalSteps,
        currentStep: savedStep !== undefined ? Math.min(savedStep, totalSteps) : undefined,
      },
    });

    this._ctrl = new ActorController(this, actor);
    this._i18nProvider.setValue(this._i18n);

    // Provide actor ref via context so child components can access it directly
    this._machineProvider = new ContextProvider(this, {
      context: recipeMachineContext,
      initialValue: actor,
    });

    // Update scale factor on every snapshot change
    actor.subscribe(snapshot => {
      const ctx = snapshot.context;
      this._scaleFactorProvider.setValue(ctx.servings / ctx.originalServings);
    });

    actor.start();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._ctrl?.actorRef?.stop();
  }

  // -- Event handlers (thin: just forward to machine) ----------------------

  private _onAdjustServings(e: CustomEvent<{ delta: number }>) {
    this._ctrl.send({ type: 'ADJUST_SERVINGS', delta: e.detail.delta });
  }

  private _onSwitchView(e: CustomEvent<{ view: 'overview' | 'cooking' }>) {
    animatedSend(this._ctrl.actorRef, { type: 'SWITCH_VIEW', view: e.detail.view });
  }

  private _onSetMode(e: CustomEvent<{ mode: ScheduleMode }>) {
    animatedSend(this._ctrl.actorRef, { type: 'SET_MODE', mode: e.detail.mode });
  }

  private _onNextStep() {
    animatedSend(this._ctrl.actorRef, { type: 'NEXT_STEP' });
  }

  private _onPrevStep() {
    animatedSend(this._ctrl.actorRef, { type: 'PREV_STEP' });
  }

  private _onStartTimer(e: CustomEvent<{ opId: string; seconds: number }>) {
    this._ctrl.send({ type: 'START_TIMER', opId: e.detail.opId, seconds: e.detail.seconds });
  }

  private _onCancelTimer(e: CustomEvent<{ opId: string }>) {
    this._ctrl.send({ type: 'CANCEL_TIMER', opId: e.detail.opId });
  }

  // -- Derived data --------------------------------------------------------

  private _buildTimerPills(ctx: RecipeContext) {
    const pills: { opId: string; remaining: number; action: string }[] = [];
    for (const [opId, timer] of ctx.timerStates) {
      let action = '';
      for (const phase of ctx.scheduleModes[ctx.mode]) {
        for (const op of phase.operations) {
          if ('id' in op && op.id === opId) {
            action = op.action;
          }
        }
      }
      pills.push({ opId, remaining: timer.remaining, action });
    }
    return pills;
  }

  private _getActiveView(): 'overview' | 'cooking' {
    return this._ctrl.matches({ view: 'cooking' }) ? 'cooking' : 'overview';
  }

  // -- Render --------------------------------------------------------------

  override render() {
    if (!this._ctrl?.snapshot || !this._recipe) {
      return html`<div class="loading-placeholder">Loading recipe...</div>`;
    }

    const ctx = this._ctrl.snapshot.context;
    const activeView = this._getActiveView();
    const phases = ctx.scheduleModes[ctx.mode];

    return html`
      <recipe-header
        .title=${ctx.recipe.meta.title}
        .difficulty=${ctx.recipe.meta.difficulty}
        .totalTime=${ctx.recipe.meta.totalTime}
        .mode=${ctx.mode}
        .tags=${ctx.recipe.meta.tags}
        .servings=${ctx.servings}
      ></recipe-header>

      <servings-adjuster
        .servings=${ctx.servings}
        .label=${this._i18n.servings ?? 'Servings'}
        @adjust-servings=${this._onAdjustServings}
      ></servings-adjuster>

      <div style="text-align: center; padding: 0 var(--space-md);">
        <hob-atproto-publish .recipe=${ctx.recipe}></hob-atproto-publish>
      </div>

      <view-tabs
        .activeView=${activeView}
        .overviewLabel=${this._i18n.overview ?? 'Overview'}
        .cookingLabel=${this._i18n.cooking ?? 'Cooking'}
        @switch-view=${this._onSwitchView}
      ></view-tabs>

      ${cache(when(
        activeView === 'overview',
        () => html`
            <overview-view
              .phases=${phases}
              .equipment=${ctx.recipe.equipment}
              .mode=${ctx.mode}
              .i18n=${this._i18n}
              @set-mode=${this._onSetMode}
            ></overview-view>
          `,
        () => html`
            <cooking-view
              .phases=${phases}
              .currentStep=${ctx.currentStep}
              .recipe=${ctx.recipe}
              .i18n=${this._i18n}
              .activeTimers=${this._buildTimerPills(ctx)}
              @next-step=${this._onNextStep}
              @prev-step=${this._onPrevStep}
              @start-timer=${this._onStartTimer}
              @cancel-timer=${this._onCancelTimer}
            ></cooking-view>
          `,
      ))}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'recipe-page': RecipePage;
  }
}
