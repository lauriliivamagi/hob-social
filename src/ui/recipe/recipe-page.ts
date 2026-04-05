import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';
import { cache } from 'lit/directives/cache.js';
import { createActor, type Actor } from 'xstate';
import { recipeMachine } from '../state/recipe-machine.js';
import type { RecipeContext } from '../state/recipe-machine.js';
import type { Recipe } from '../../domain/recipe/types.js';
import type { Phase, ScheduleMode } from '../../domain/schedule/types.js';
import { ContextProvider } from '@lit/context';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import { i18nContext, scaleFactorContext } from '../contexts/recipe-contexts.js';
import { TimerController } from '../controllers/timer-controller.js';
import { playTimerAlarm } from '../state/audio.js';
import { requestWakeLock, releaseWakeLock } from '../state/wake-lock.js';
import { loadState, saveState } from '../state/persistence.js';
import './recipe-header.js';
import './servings-adjuster.js';
import './view-tabs.js';
import '../overview/overview-view.js';
import '../cooking/cooking-view.js';

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

  private _actor!: Actor<typeof recipeMachine>;
  private _timers = new TimerController(this, {
    onTick: (opId) => this._handleTimerTick(opId),
    onDone: (opId) => this._handleTimerDone(opId),
  });
  private _i18nProvider = new ContextProvider(this, { context: i18nContext, initialValue: {} });
  private _scaleFactorProvider = new ContextProvider(this, { context: scaleFactorContext, initialValue: 1 });

  @state() private accessor _snapshot: { context: RecipeContext; value: string } | null = null;

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
    const slug = recipe.meta.title.toLowerCase().replace(/\s+/g, '-');
    const savedServings = persisted.servings?.[slug];

    const totalSteps = this._scheduleRelaxed.reduce(
      (sum, phase) => sum + phase.operations.length,
      0,
    );

    this._actor = createActor(recipeMachine, {
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
      },
    });

    this._i18nProvider.setValue(this._i18n);

    this._actor.subscribe(snapshot => {
      this._snapshot = {
        context: snapshot.context,
        value: snapshot.value as string,
      };
      const ctx = snapshot.context;
      this._scaleFactorProvider.setValue(ctx.servings / ctx.originalServings);
    });

    this._actor.start();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    releaseWakeLock();
    this._actor?.stop();
  }

  private _onAdjustServings(e: CustomEvent<{ delta: number }>) {
    this._actor.send({ type: 'ADJUST_SERVINGS', delta: e.detail.delta });
    this._persistState();
  }

  private _onSwitchView(e: CustomEvent<{ view: 'overview' | 'cooking' }>) {
    const prev = this._snapshot?.value;
    this._actor.send({ type: 'SWITCH_VIEW', view: e.detail.view });

    if (e.detail.view === 'cooking' && prev !== 'cooking') {
      requestWakeLock();
    } else if (e.detail.view === 'overview' && prev === 'cooking') {
      releaseWakeLock();
    }
  }

  private _onSetMode(e: CustomEvent<{ mode: ScheduleMode }>) {
    this._actor.send({ type: 'SET_MODE', mode: e.detail.mode });
    this._persistState();
  }

  private _persistState() {
    const snap = this._actor.getSnapshot();
    const ctx = snap.context;
    const slug = ctx.recipe.meta.title.toLowerCase().replace(/\s+/g, '-');
    const persisted = loadState();
    saveState({
      ...persisted,
      lastRecipeSlug: slug,
      mode: ctx.mode,
      servings: { ...persisted.servings, [slug]: ctx.servings },
    });
  }

  private _buildTimerPills(ctx: RecipeContext) {
    const pills: { opId: string; remaining: number; action: string }[] = [];
    for (const [opId, timer] of ctx.timers) {
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

  private _onNextStep() {
    this._actor.send({ type: 'NEXT_STEP' });
  }

  private _onPrevStep() {
    this._actor.send({ type: 'PREV_STEP' });
  }

  private _onStartTimer(e: CustomEvent<{ opId: string; seconds: number }>) {
    const { opId, seconds } = e.detail;
    this._actor.send({ type: 'START_TIMER', opId, seconds });
    this._timers.start(opId, seconds);
  }

  private _onCancelTimer(e: CustomEvent<{ opId: string }>) {
    const { opId } = e.detail;
    this._timers.cancel(opId);
    this._actor.send({ type: 'CANCEL_TIMER', opId });
  }

  private _handleTimerTick(opId: string) {
    const snap = this._actor.getSnapshot();
    const timer = snap.context.timers.get(opId);
    if (!timer || timer.remaining <= 0) {
      this._timers.done(opId);
      return;
    }
    this._actor.send({ type: 'TIMER_TICK', opId });
  }

  private _handleTimerDone(opId: string) {
    this._actor.send({ type: 'TIMER_DONE', opId });
    playTimerAlarm();
  }

  override render() {
    if (!this._snapshot || !this._recipe) {
      return html`<div class="loading-placeholder">Loading recipe...</div>`;
    }

    const ctx = this._snapshot.context;
    const activeView = this._snapshot.value as 'overview' | 'cooking';
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
