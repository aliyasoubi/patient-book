import { Component, input } from '@angular/core';

/** Shared "nothing here" placeholder, so every list explains itself the same way. */
@Component({
  selector: 'pb-empty-state',
  standalone: true,
  template: `
    <div class="empty">
      <span class="material-symbols-rounded empty__icon" aria-hidden="true">{{ icon() }}</span>
      <p class="empty__title">{{ title() }}</p>
      @if (hint()) {
        <p class="empty__hint">{{ hint() }}</p>
      }
      <ng-content />
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 56px 24px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .empty__icon {
      font-size: 52px;
      width: 52px;
      height: 52px;
      opacity: 0.45;
      margin-bottom: 6px;
    }
    .empty__title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }
    .empty__hint {
      margin: 0;
      font-size: 0.875rem;
      max-width: 42ch;
      line-height: 1.8;
    }
  `,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly hint = input<string>('');
}
