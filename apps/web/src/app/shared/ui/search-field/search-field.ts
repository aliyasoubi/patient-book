import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface SearchFieldOption {
  value: string;
  label: string;
  /** Usually a file/register number. */
  meta?: string | null;
  /** Usually a phone number or short secondary identifier. */
  supporting?: string | null;
  icon?: string;
}

/**
 * One Material 3 search pattern for app bars and data lists.
 *
 * The compact variant is reserved for the top app bar; page/list search uses
 * the standard 56px container. Both variants share interaction, focus, clear,
 * autocomplete and accessibility behaviour.
 */
@Component({
  selector: 'pb-search-field',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="pb-search-field" [class.pb-search-field--compact]="compact()">
      <mat-icon class="pb-search-field__leading" aria-hidden="true">search</mat-icon>
      <input
        #searchInput
        class="pb-search-field__input"
        type="search"
        [formControl]="control()"
        [matAutocomplete]="autocomplete"
        [placeholder]="placeholder()"
        [attr.aria-label]="ariaLabel() || placeholder()"
        autocomplete="off"
        enterkeyhint="search"
      />

      @if (loading()) {
        <mat-spinner class="pb-search-field__spinner" [diameter]="20" aria-label="در حال جستجو" />
      } @else if (control().value) {
        <button
          class="pb-search-field__clear"
          mat-icon-button
          type="button"
          (click)="clear()"
          [attr.aria-label]="clearLabel"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      } @else if (shortcut()) {
        <kbd class="pb-search-field__shortcut" aria-hidden="true">{{ shortcut() }}</kbd>
      }
    </div>

    <mat-autocomplete #autocomplete="matAutocomplete" (optionSelected)="selectOption($event)">
      @for (option of options(); track option.value) {
        <mat-option [value]="option.value">
          <div class="pb-search-option">
            <mat-icon class="pb-search-option__icon" aria-hidden="true">
              {{ option.icon || 'person' }}
            </mat-icon>
            <span class="pb-search-option__body">
              <span class="pb-search-option__label">{{ option.label }}</span>
              @if (option.meta || option.supporting) {
                <span class="pb-search-option__meta">
                  @if (option.meta) {
                    <span class="ltr-nums">{{ option.meta }}</span>
                  }
                  @if (option.meta && option.supporting) {
                    <span aria-hidden="true">·</span>
                  }
                  @if (option.supporting) {
                    <span class="ltr-nums">{{ option.supporting }}</span>
                  }
                </span>
              }
            </span>
          </div>
        </mat-option>
      }
      @if (showEmpty() && options().length === 0 && !loading()) {
        <mat-option disabled>{{ emptyMessage() }}</mat-option>
      }
    </mat-autocomplete>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .pb-search-field {
      display: flex;
      align-items: center;
      gap: var(--pb-space-2);
      width: 100%;
      height: var(--pb-search-height);
      padding-inline: var(--pb-space-4) var(--pb-space-1);
      border: 1px solid transparent;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
      transition:
        background-color 140ms ease,
        border-color 140ms ease,
        box-shadow 140ms ease;

      &:hover {
        background: var(--mat-sys-surface-container-highest);
      }

      &:focus-within {
        border-color: var(--mat-sys-primary);
        box-shadow: 0 0 0 1px var(--mat-sys-primary);
      }

      &:has(input:disabled) {
        opacity: 0.5;
        pointer-events: none;
      }

      &--compact {
        height: var(--pb-control-height);
      }
    }

    .pb-search-field__leading {
      flex: 0 0 auto;
      font-size: var(--pb-icon-md);
      color: var(--mat-sys-on-surface-variant);
    }

    .pb-search-field__input {
      flex: 1 1 auto;
      min-width: 0;
      height: 100%;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: inherit;
      caret-color: var(--mat-sys-primary);
      font: var(--mat-sys-body-large);
      font-family: inherit;

      &::placeholder {
        color: var(--mat-sys-on-surface-variant);
        opacity: 1;
      }

      &::-webkit-search-cancel-button {
        display: none;
      }
    }

    .pb-search-field__clear {
      flex: 0 0 auto;
      color: var(--mat-sys-on-surface-variant);
    }

    .pb-search-field__spinner {
      flex: 0 0 auto;
      margin-inline: var(--pb-space-3);
    }

    .pb-search-field__shortcut {
      flex: 0 0 auto;
      margin-inline-end: var(--pb-space-3);
      padding: 2px 7px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-extra-small);
      background: transparent;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-small);
      direction: ltr;
      white-space: nowrap;

      @media (pointer: coarse) {
        display: none;
      }
    }

    .pb-search-option {
      display: flex;
      align-items: center;
      gap: var(--pb-space-3);
      width: 100%;
      min-width: 0;
    }

    .pb-search-option__icon {
      flex: 0 0 auto;
      font-size: var(--pb-icon-md);
      color: var(--mat-sys-on-surface-variant);
    }

    .pb-search-option__body {
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.4;
    }

    .pb-search-option__label {
      overflow: hidden;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pb-search-option__meta {
      display: inline-flex;
      gap: var(--pb-space-2);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class PbSearchField {
  readonly control = input.required<FormControl<string>>();
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  readonly compact = input(false);
  readonly shortcut = input<string | null>(null);
  readonly loading = input(false);
  readonly options = input<readonly SearchFieldOption[]>([]);
  readonly showEmpty = input(false);
  readonly emptyMessage = input('');
  readonly optionSelected = output<string>();

  private readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly clearLabel = $localize`:@@action.clearSearch:پاک کردن جستجو`;

  focus(): void {
    this.inputElement()?.nativeElement.focus();
  }

  clearAndBlur(): void {
    this.clear();
    this.inputElement()?.nativeElement.blur();
  }

  isFocused(): boolean {
    return document.activeElement === this.inputElement()?.nativeElement;
  }

  protected clear(): void {
    this.control().setValue('');
    this.inputElement()?.nativeElement.focus();
  }

  protected selectOption(event: MatAutocompleteSelectedEvent): void {
    this.optionSelected.emit(String(event.option.value));
  }
}
