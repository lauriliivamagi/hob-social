import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { when } from 'lit/directives/when.js';
import { createActor } from 'xstate';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';
import { catalogMachine } from '../state/catalog-machine.js';
import { ActorController } from '../controllers/actor-controller.js';
import type { CatalogRecipe } from '@recipe/domain/catalog/types.js';

import './search-bar.js';
import './tag-filters.js';
import './recipe-card.js';
import '../auth/hob-atproto-login.js';

interface I18NLabels {
  allRecipes?: string;
  searchPlaceholder?: string;
  noResults?: string;
  minutes?: string;
  servings?: string;
}

@customElement('catalog-page')
export class CatalogPage extends LitElement {
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

      .container {
        max-width: 960px;
        margin: 0 auto;
        padding: 2rem 1.25rem;
      }

      header {
        text-align: center;
        margin-bottom: 2rem;
      }

      header h1 {
        font-size: var(--text-2xl);
        font-weight: 700;
        color: var(--accent-orange);
        margin-bottom: 0.25rem;
      }

      .recipe-count {
        font-size: var(--text-sm);
        color: var(--text-dim);
      }

      search-bar {
        margin-bottom: 1rem;
      }

      tag-filters {
        margin-bottom: 2rem;
      }

      .recipe-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.25rem;
      }

      @media (min-width: 520px) {
        .recipe-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (min-width: 800px) {
        .recipe-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: var(--text-muted);
        font-size: var(--text-base);
        grid-column: 1 / -1;
      }
    `,
  ];

  private _ctrl!: ActorController<typeof catalogMachine>;

  @state() accessor _labels: I18NLabels = {};

  override connectedCallback() {
    super.connectedCallback();

    const recipes: CatalogRecipe[] = (window as any).RECIPES ?? [];
    const i18n = (window as any).I18N ?? {};
    this._labels = i18n.labels ?? {};

    const actor = createActor(catalogMachine, {
      input: { recipes },
    });

    this._ctrl = new ActorController(this, actor);
    actor.start();
  }

  private get _allTags(): string[] {
    const tagSet = new Set<string>();
    for (const r of this._ctrl.snapshot.context.recipes) {
      for (const t of r.tags ?? []) {
        tagSet.add(t);
      }
    }
    return [...tagSet].sort();
  }

  private _onSearch(e: CustomEvent<string>) {
    this._ctrl.send({ type: 'SEARCH', query: e.detail });
  }

  private _onTagToggle(e: CustomEvent<string>) {
    this._ctrl.send({ type: 'TAG_TOGGLE', tag: e.detail });
  }

  override render() {
    if (!this._ctrl) return html``;

    const ctx = this._ctrl.snapshot.context;
    const filtered = ctx.filteredRecipes;
    const countLabel =
      filtered.length === 1 ? '1 recipe' : `${filtered.length} recipes`;

    return html`
      <div class="container">
        <header>
          <h1>${this._labels.allRecipes ?? 'All Recipes'}</h1>
          <div class="recipe-count">${countLabel}</div>
          <div style="margin-top: 1rem;">
            <hob-atproto-login></hob-atproto-login>
          </div>
        </header>

        <search-bar
          .placeholder=${this._labels.searchPlaceholder ?? 'Search recipes...'}
          @search=${this._onSearch}
        ></search-bar>

        <tag-filters
          .tags=${this._allTags}
          .activeTags=${ctx.activeTags}
          @tag-toggle=${this._onTagToggle}
        ></tag-filters>

        <div class="recipe-grid">
          ${when(
            filtered.length === 0,
            () => html`<div class="empty-state">
                ${this._labels.noResults ?? 'No recipes found'}
              </div>`,
            () => repeat(
              filtered,
              (r) => r.title,
              (r, i) => html`<recipe-card .recipe=${r} style="--index: ${i}"></recipe-card>`,
            ),
          )}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'catalog-page': CatalogPage;
  }
}
