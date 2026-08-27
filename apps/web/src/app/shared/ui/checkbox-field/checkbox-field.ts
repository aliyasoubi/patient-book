import { Component, input, output } from '@angular/core';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';

/**
 * The checkbox used for filter toggles ("needs review", "has medical
 * history", …). Kept as a simple checked/changed pair rather than a
 * `FormControl` binding, since every current use is a signal-driven filter,
 * not a form field with validation.
 */
@Component({
  selector: 'pb-checkbox-field',
  standalone: true,
  imports: [MatCheckboxModule],
  template: `
    <mat-checkbox [checked]="checked()" (change)="onChange($event)">
      <ng-content />
    </mat-checkbox>
  `,
  styles: `
    :host { display: inline-block; }
  `,
})
export class PbCheckboxField {
  readonly checked = input(false);
  readonly checkedChange = output<boolean>();

  protected onChange(event: MatCheckboxChange): void {
    this.checkedChange.emit(event.checked);
  }
}
