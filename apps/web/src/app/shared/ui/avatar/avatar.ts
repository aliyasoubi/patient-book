import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type AvatarSize = 'small' | 'medium' | 'large';
export type AvatarTone = 'primary' | 'neutral' | 'male' | 'female' | 'unknown';

/** Consistent identity mark for staff and patients. */
@Component({
  selector: 'pb-avatar',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <span
      class="pb-avatar"
      [attr.data-size]="size()"
      [attr.data-tone]="tone()"
      [attr.aria-hidden]="ariaLabel() ? null : 'true'"
      [attr.aria-label]="ariaLabel()"
    >
      @if (icon()) {
        <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
      } @else if (initials()) {
        <span>{{ initials() }}</span>
      } @else {
        <mat-icon aria-hidden="true">person</mat-icon>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-grid;
      flex: 0 0 auto;
      vertical-align: middle;
    }

    .pb-avatar {
      display: grid;
      place-items: center;
      width: var(--pb-avatar-md);
      height: var(--pb-avatar-md);
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
      font-weight: 700;
      line-height: 1;
      user-select: none;

      &[data-size='small'] {
        width: var(--pb-avatar-sm);
        height: var(--pb-avatar-sm);
        font: var(--mat-sys-label-medium);
        font-weight: 700;

        mat-icon {
          font-size: var(--pb-icon-sm);
        }
      }

      &[data-size='large'] {
        width: var(--pb-avatar-lg);
        height: var(--pb-avatar-lg);
        font: var(--mat-sys-title-medium);
        font-weight: 700;

        mat-icon {
          font-size: 28px;
        }
      }

      &[data-tone='primary'],
      &[data-tone='male'] {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }

      &[data-tone='female'] {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }

      mat-icon {
        font-size: var(--pb-icon-md);
      }
    }
  `,
})
export class PbAvatar {
  readonly name = input('');
  readonly icon = input<string | null>(null);
  readonly size = input<AvatarSize>('medium');
  readonly tone = input<AvatarTone>('neutral');
  readonly ariaLabel = input<string | null>(null);

  protected readonly initials = computed(() =>
    this.name()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join(''),
  );
}
