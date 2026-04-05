import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { designTokens, resetStyles, baseStyles } from '../shared/styles.js';

@customElement('tag-filters')
export class TagFilters extends LitElement {
  static override styles = [
    designTokens,
    resetStyles,
    baseStyles,
    css`
      :host {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-sm);
        margin-bottom: 2rem;
      }

      .tag-pill {
        display: inline-flex;
        align-items: center;
        padding: 0.375rem 0.75rem;
        border-radius: 999px;
        font-size: var(--text-xs);
        font-weight: 500;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: var(--card);
        color: var(--text-dim);
        transition: all var(--transition);
        user-select: none;
      }

      .tag-pill:hover {
        border-color: var(--accent-teal);
        color: var(--text);
      }

      .tag-pill.active {
        background: var(--accent-teal);
        color: var(--bg);
        border-color: var(--accent-teal);
        font-weight: 600;
      }
    `,
  ];

  @property({ type: Array }) accessor tags: string[] = [];

  @property({ type: Array, attribute: 'active-tags' }) accessor activeTags: string[] = [];

  private _onTagClick(tag: string) {
    this.dispatchEvent(
      new CustomEvent('tag-toggle', {
        detail: tag,
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      ${this.tags.map(
        (tag) => html`
          <span
            class=${classMap({ 'tag-pill': true, active: this.activeTags.includes(tag) })}
            @click=${() => this._onTagClick(tag)}
          >
            ${tag}
          </span>
        `,
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tag-filters': TagFilters;
  }
}
