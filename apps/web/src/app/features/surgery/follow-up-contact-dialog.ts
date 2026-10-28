import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DateAdapter } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

import type {
  ContactOutcome,
  FollowUpContact,
  SurgeryQueueItem,
} from '../../core/models/common.model';
import { RecordContactInput, RegistryService } from '../../core/services/registry.service';
import { contactOutcomeLabel } from '../../shared/labels';
import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { PbButton, PbDateField, PbFilterChips, PbTextareaField } from '../../shared/ui';
import type { FilterChipOption } from '../../shared/ui';

export interface FollowUpContactDialogData {
  item: SurgeryQueueItem;
}

const OUTCOMES: readonly (FilterChipOption & { value: ContactOutcome })[] = [
  { value: 'no_answer', label: 'contactOutcome.no_answer', icon: 'phone_missed', translate: true },
  {
    value: 'call_later',
    label: 'contactOutcome.call_later',
    icon: 'phone_callback',
    translate: true,
  },
  { value: 'booked', label: 'contactOutcome.booked', icon: 'event_available', translate: true },
  { value: 'declined', label: 'contactOutcome.declined', icon: 'cancel', translate: true },
];

/** The days a call is most often put off by, one tap each. */
const SOON: readonly FilterChipOption[] = [
  { value: '1', label: 'followUpContact.tomorrow', translate: true },
  { value: '3', label: 'followUpContact.inThreeDays', translate: true },
  { value: '7', label: 'followUpContact.nextWeek', translate: true },
];

/** How many earlier calls the dialog lists; older ones are in the history tab. */
const HISTORY_SHOWN = 5;

/**
 * One call about a follow-up, written down as it ends: what it came to, when
 * to call again, a word for whoever calls next. The number to dial and the
 * calls before it are at the top, so nobody rings a patient twice in a day
 * without knowing. "Booked" and "declined" settle the follow-up as the
 * card's own status would; the other two leave it open with the day to call
 * again — the follow-up's date itself does not move.
 */
@Component({
  selector: 'pb-follow-up-contact-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatIconModule,
    TranslatePipe,
    PersianNumberPipe,
    PbButton,
    PbDateField,
    PbFilterChips,
    PbTextareaField,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'followUpContact.title' | translate }}</h2>
    <mat-dialog-content class="call">
      <!-- Who, and the number to dial: read off the patient's file. -->
      <div class="call__who">
        <strong>{{ item.recordedName || ('patient.unnamed' | translate) }}</strong>
        @if (item.patient; as patient) {
          <span class="call__file">
            {{ 'surgery.patientFile' | translate: { fileNo: patient.fileNo } }}
          </span>
          @if (patient.mobile) {
            <span class="call__phone" dir="ltr">
              <mat-icon aria-hidden="true">smartphone</mat-icon>
              {{ patient.mobile | faNum }}
            </span>
          }
        } @else {
          <span class="call__no-phone">{{ 'followUpContact.noPhone' | translate }}</span>
        }
      </div>

      @if (history().length) {
        <section class="call__history" [attr.aria-label]="'followUpContact.history' | translate">
          <span class="call__label">{{ 'followUpContact.history' | translate }}</span>
          <ul>
            @for (c of history(); track $index) {
              <li>
                <span class="call__when">{{ c.at | faNum }}</span>
                @if (c.by) {
                  <span>{{ c.by }}</span>
                }
                <strong>{{ outcomeLabel(c.outcome) | translate }}</strong>
                @if (c.note) {
                  <span class="call__note">{{ c.note }}</span>
                }
              </li>
            }
          </ul>
        </section>
      } @else if (historyFailed()) {
        <p class="call__hint">{{ 'followUpContact.historyFailed' | translate }}</p>
      }

      <span class="call__label">{{ 'followUpContact.outcome' | translate }}</span>
      <pb-filter-chips
        [options]="outcomes"
        [selected]="outcome() ? [outcome()!] : []"
        (selectedChange)="setOutcome($event[0])"
        [ariaLabel]="'followUpContact.outcome' | translate"
      />

      @if (outcome() === 'no_answer' || outcome() === 'call_later') {
        <div class="call__next">
          <pb-filter-chips
            [options]="soon"
            [selected]="soonSelected()"
            (selectedChange)="setSoon($event[0])"
            [ariaLabel]="'followUpContact.nextCall' | translate"
          />
          <pb-date-field
            [control]="form.controls.nextContactAt"
            [label]="'followUpContact.nextCall' | translate"
            [hint]="'followUpContact.nextCallHint' | translate"
          />
        </div>
      } @else if (outcome() === 'booked') {
        <pb-date-field
          [control]="form.controls.appointmentAt"
          [label]="'followUpContact.appointment' | translate"
          [hint]="'surgeryBook.hint' | translate"
        />
      } @else if (outcome() === 'declined') {
        <p class="call__hint">{{ 'followUpContact.declinedHint' | translate }}</p>
      }

      @if (outcome()) {
        <pb-textarea-field
          [control]="form.controls.note"
          [label]="'followUpContact.note' | translate"
          [hint]="'followUpContact.noteHint' | translate"
          [rows]="2"
          [maxlength]="300"
        />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <pb-button variant="text" type="button" (click)="ref.close()">
        {{ 'action.cancel' | translate }}
      </pb-button>
      <pb-button
        variant="flat"
        type="button"
        icon="call"
        [disabled]="!outcome()"
        (click)="submit()"
      >
        {{ 'followUpContact.save' | translate }}
      </pb-button>
    </mat-dialog-actions>
  `,
  styles: `
    .call {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-2);
      min-width: min(440px, 80vw);
    }
    .call__who {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--pb-space-1) var(--pb-space-3);
      margin-bottom: var(--pb-space-2);
      strong {
        font: var(--mat-sys-title-medium);
      }
    }
    .call__file,
    .call__no-phone,
    .call__hint,
    .call__label {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .call__no-phone {
      color: var(--mat-sys-tertiary);
    }
    .call__phone {
      display: inline-flex;
      align-items: center;
      gap: var(--pb-space-1);
      font: var(--mat-sys-title-medium);
      font-feature-settings: var(--pb-font-numeric);
      user-select: all;
      mat-icon {
        font-size: var(--pb-icon-sm);
      }
    }
    .call__history {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-1);
      padding: var(--pb-space-2) var(--pb-space-3);
      border-radius: var(--mat-sys-corner-medium);
      background: var(--mat-sys-surface-container);
      ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: var(--pb-space-1);
      }
      li {
        display: flex;
        flex-wrap: wrap;
        gap: var(--pb-space-1) var(--pb-space-2);
        font: var(--mat-sys-body-small);
      }
    }
    .call__when {
      color: var(--mat-sys-on-surface-variant);
      font-feature-settings: var(--pb-font-numeric);
    }
    .call__note {
      flex-basis: 100%;
      color: var(--mat-sys-on-surface-variant);
    }
    .call__hint {
      margin: 0;
    }
    .call__next {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-2);
    }
  `,
})
export class FollowUpContactDialog {
  protected readonly ref =
    inject<MatDialogRef<FollowUpContactDialog, RecordContactInput | undefined>>(MatDialogRef);
  private readonly data = inject<FollowUpContactDialogData>(MAT_DIALOG_DATA);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);
  private readonly registry = inject(RegistryService);

  protected readonly item = this.data.item;
  protected readonly outcomes = OUTCOMES;
  protected readonly soon = SOON;
  protected readonly outcomeLabel = contactOutcomeLabel;

  protected readonly outcome = signal<ContactOutcome | null>(null);
  protected readonly history = signal<FollowUpContact[]>([]);
  protected readonly historyFailed = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    nextContactAt: [null as Date | null],
    appointmentAt: [
      this.item.followUpAppointmentAt
        ? this.dateAdapter.parse(this.item.followUpAppointmentAt, 'yyyy/MM/dd')
        : (null as Date | null),
    ],
    note: ['', Validators.maxLength(300)],
  });

  private readonly nextCallValue = toSignal(this.form.controls.nextContactAt.valueChanges, {
    initialValue: this.form.controls.nextContactAt.value,
  });

  /** The quick choice the picked day matches, so the chip shows it. */
  protected readonly soonSelected = computed(() => {
    const picked = this.nextCallValue();
    if (!picked) return [];
    const match = SOON.find(
      (s) => this.dateAdapter.compareDate(this.daysFromToday(Number(s.value)), picked) === 0,
    );
    return match ? [match.value] : [];
  });

  constructor() {
    this.registry.surgeryContacts(this.item.id).subscribe({
      next: (rows) => this.history.set(rows.slice(0, HISTORY_SHOWN)),
      error: () => this.historyFailed.set(true),
    });
  }

  /** No answer usually means "try tomorrow": offered, and changed with one tap. */
  protected setOutcome(value: string | undefined): void {
    const outcome = (OUTCOMES.find((o) => o.value === value)?.value ??
      null) as ContactOutcome | null;
    this.outcome.set(outcome);
    const next = this.form.controls.nextContactAt;
    if (outcome === 'no_answer' && !next.value) next.setValue(this.daysFromToday(1));
  }

  protected setSoon(value: string | undefined): void {
    this.form.controls.nextContactAt.setValue(value ? this.daysFromToday(Number(value)) : null);
  }

  protected submit(): void {
    const outcome = this.outcome();
    if (!outcome) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { nextContactAt, appointmentAt, note } = this.form.getRawValue();
    const day = (date: Date | null): string | null =>
      date ? this.dateAdapter.toIso8601(date) : null;
    const opensAgain = outcome === 'no_answer' || outcome === 'call_later';
    this.ref.close({
      outcome,
      note: note.trim() || null,
      nextContactAt: opensAgain ? day(nextContactAt) : null,
      appointmentAt: outcome === 'booked' ? day(appointmentAt) : null,
    });
  }

  private daysFromToday(days: number): Date {
    return this.dateAdapter.addCalendarDays(this.dateAdapter.today(), days);
  }
}
