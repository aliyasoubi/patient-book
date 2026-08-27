import { Component, input } from '@angular/core';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/**
 * The search box repeated at the top of every list — patients, the implant
 * and ortho registers, the surgery queue, and the global header search.
 *
 * Material 3 treats search as its own pattern distinct from a labelled text
 * field (a leading icon, placeholder instead of a floating label, an
 * always-available clear action), so it gets its own atom rather than being a
 * mode of {@link PbTextField}.
 */
@Component({
  selector: 'pb-search-field',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="pb-search-field">
      <span class="material-symbols-rounded" matPrefix aria-hidden="true">search</span>
      <input
        matInput
        type="search"
        [formControl]="control()"
        [placeholder]="placeholder()"
        [attr.aria-label]="ariaLabel() || placeholder()"
        enterkeyhint="search" />
      @if (control().value) {
        <button
          matSuffix
          mat-icon-button
          type="button"
          (click)="control().setValue('')"
          [attr.aria-label]="clearLabel()">
          <span class="material-symbols-rounded" aria-hidden="true">close</span>
        </button>
      }
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .pb-search-field {
      width: 100%;
      .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }
    }
  `,
})
export class PbSearchField {
  readonly control = input.required<FormControl<string>>();
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  protected readonly clearLabel = () => $localize`:@@action.clearSearch:پاک کردن جستجو`;
}
