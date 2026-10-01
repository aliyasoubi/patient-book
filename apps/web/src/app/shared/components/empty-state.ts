import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Shared "nothing here" placeholder, so every list explains itself the same way. */
@Component({
  selector: 'pb-empty-state',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="empty">
      <mat-icon class="empty__icon" aria-hidden="true">{{ icon() }}</mat-icon>
      <p class="empty__title">{{ title() }}</p>
      @if (hint()) {
        <p class="empty__hint">{{ hint() }}</p>
      }
      <ng-content />
    </div>
  `,
  styles: `
    @use '../../../styles/type';

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--pb-space-2);
      padding: 56px var(--pb-space-5);
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .empty__icon {
      font-size: var(--pb-icon-xl);
      opacity: 0.45;
      margin-bottom: var(--pb-space-2);
    }
    .empty__title {
      margin: 0;
      font: var(--mat-sys-title-medium);
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }
    .empty__hint {
      @include type.supporting-text;

      max-width: 42ch;
    }
  `,
})
export class EmptyState {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly hint = input<string>('');
}
