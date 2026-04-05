import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import type { ScheduleMode } from '../../domain/schedule/types.js';
import { formatMinutes } from '../../domain/cooking/timer.js';

@customElement('recipe-header')
export class RecipeHeader extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host { display: block; }

      .recipe-header {
        padding: var(--space-lg) var(--space-md) var(--space-sm);
        text-align: center;
      }

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--text-sm);
        color: var(--text-dim);
        text-decoration: none;
        margin-bottom: 8px;
        transition: color var(--transition);
      }
      .back-link:hover { color: var(--accent-teal); }

      h1 {
        font-size: var(--text-2xl);
        font-weight: 700;
        margin-bottom: 4px;
        color: #fff;
      }

      .recipe-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        justify-content: center;
        font-size: var(--text-sm);
        color: var(--text-dim);
        margin-top: 8px;
      }

      .recipe-meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .difficulty-badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 20px;
        font-size: var(--text-xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .difficulty-easy { background: var(--success); color: #111; }
      .difficulty-medium { background: var(--accent-orange); color: #111; }
      .difficulty-hard { background: var(--danger); color: #fff; }

      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
        margin-top: 8px;
      }

      .tag {
        padding: 2px 10px;
        background: var(--card-raised);
        border-radius: 20px;
        font-size: var(--text-xs);
        color: var(--text-dim);
      }

      @media (min-width: 600px) {
        .recipe-header { padding: 28px 24px 16px; }
      }
    `,
  ];

  @property() accessor title = '';
  @property() accessor difficulty: 'easy' | 'medium' | 'hard' = 'easy';
  @property({ type: Object }) accessor totalTime: { relaxed: number; optimized: number } = { relaxed: 0, optimized: 0 };
  @property() accessor mode: ScheduleMode = 'relaxed';
  @property({ type: Array }) accessor tags: string[] = [];
  @property({ type: Number }) accessor servings = 1;

  override render() {
    const time = this.mode === 'relaxed' ? this.totalTime.relaxed : this.totalTime.optimized;

    return html`
      <header class="recipe-header">
        <a class="back-link" href="../index.html">&larr; All recipes</a>
        <h1>${this.title}</h1>
        <div class="recipe-meta">
          <span class="recipe-meta-item">
            <span class="difficulty-badge difficulty-${this.difficulty}">${this.difficulty}</span>
          </span>
          <span class="recipe-meta-item">&#9202; ${formatMinutes(time)}</span>
          <span class="recipe-meta-item">&#127860; ${this.servings} servings</span>
        </div>
        ${this.tags.length > 0
          ? html`<div class="tags">${this.tags.map(t => html`<span class="tag">${t}</span>`)}</div>`
          : ''}
      </header>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'recipe-header': RecipeHeader;
  }
}
