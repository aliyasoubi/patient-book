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
      font: var(--mat-sys-title-medium);
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }
    .empty__hint {
      margin: 0;
      font-size: var(--mat-sys-body-medium-size);
      font-weight: var(--mat-sys-body-medium-weight);
      letter-spacing: var(--mat-sys-body-medium-tracking);
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
