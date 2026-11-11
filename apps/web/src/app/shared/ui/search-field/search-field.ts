import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

import { PbIcon } from '../icon/icon';
import { lineIconFor, type LineIconName } from '../icon/line-icons';

export interface SearchFieldOption {
  value: string;
  label: string;
  /** Usually a file/register number. */
  meta?: string | null;
  /** Usually a phone number or short secondary identifier. */
  supporting?: string | null;
  /** A few words of text — unlike `meta`/`supporting`, not laid out as a number. */
  tag?: string | null;
  icon?: string;
}

/**
 * The search bar above a list. Drawn as the app's field (styles/_field.scss)
 * so it lines up with the selects and buttons beside it in a list toolbar;
 * its suggestions open in the app's autocomplete panel, each with a small
 * tile for what it is.
 */
@Component({
  selector: 'pb-search-field',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatIconModule,
    TranslatePipe,
    PbIcon,
  ],
  templateUrl: './search-field.html',
  styleUrl: './search-field.scss',
})
export class PbSearchField {
  readonly control = input.required<FormControl<string>>();
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  readonly loading = input(false);
  readonly options = input<readonly SearchFieldOption[]>([]);
  readonly showEmpty = input(false);
  readonly emptyMessage = input('');
  /** Labels the options as a group, e.g. what an empty field is offering. */
  readonly heading = input<string | null>(null);
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

  /** The option's icon as a line icon; an unmapped Material name returns null and draws as a glyph. */
  protected iconFor(name: string | undefined): LineIconName | null {
    return lineIconFor(name || 'user');
  }

  protected clear(): void {
    this.control().setValue('');
    this.inputElement()?.nativeElement.focus();
  }

  protected selectOption(event: MatAutocompleteSelectedEvent): void {
    this.optionSelected.emit(String(event.option.value));
  }
}
