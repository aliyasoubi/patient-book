import { Component, booleanAttribute, input, output } from '@angular/core';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';

/**
 * An on/off switch for something that takes effect the moment it is flipped
 * — "follow-up done" on a surgery row. A setting that waits for a Save
 * button is a `pb-checkbox-field` instead.
 *
 * The same checked/changed pair as `pb-checkbox-field`: every use is a
 * signal-driven action, not a form control with validation.
 */
@Component({
  selector: 'pb-switch',
  standalone: true,
  imports: [MatSlideToggleModule],
  template: `
    <mat-slide-toggle [checked]="checked()" [disabled]="disabled()" (change)="onChange($event)">
      <ng-content />
    </mat-slide-toggle>
  `,
  styles: `
    :host {
      display: inline-block;
    }
  `,
})
export class PbSwitch {
  readonly checked = input(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly checkedChange = output<boolean>();

  protected onChange(event: MatSlideToggleChange): void {
    this.checkedChange.emit(event.checked);
  }
}
