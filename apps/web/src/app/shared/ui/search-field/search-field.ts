import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';

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
 * One Material 3 search bar for app bars and data lists.
 *
 * M3's search bar is a 56dp pill on `surface-container-high` with a leading
 * search icon and a trailing clear; it has no focus outline — the container
 * stays put and the caret and suggestion panel are what signal focus. A ring
 * here would make it read as an outlined text field, which is the one thing
 * next to it in every list toolbar.
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
    TranslatePipe,
  ],
  template: `
    <div class="pb-search-field">
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
        <mat-spinner
          class="pb-search-field__spinner"
          [diameter]="20"
          [attr.aria-label]="'common.searching' | translate"
        />
      } @else if (control().value) {
        <button
          class="pb-search-field__clear"
          mat-icon-button
          type="button"
          (click)="clear()"
          [attr.aria-label]="'action.clearSearch' | translate"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      }
    </div>

    <mat-autocomplete
      #autocomplete="matAutocomplete"
      panelClass="pb-search-panel"
      (optionSelected)="selectOption($event)"
    >
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
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
      transition: background-color 140ms ease;

      /* M3 state layer: on-surface at 8% over the container, no outline. */
      &:hover,
      &:focus-within {
        background: color-mix(
          in srgb,
          var(--mat-sys-on-surface) 8%,
          var(--mat-sys-surface-container-high)
        );
      }

      &:has(input:disabled) {
        opacity: 0.5;
        pointer-events: none;
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
  readonly loading = input(false);
  readonly options = input<readonly SearchFieldOption[]>([]);
  readonly showEmpty = input(false);
  readonly emptyMessage = input('');
  readonly optionSelected = output<string>();

  private readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('searchInput');
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
