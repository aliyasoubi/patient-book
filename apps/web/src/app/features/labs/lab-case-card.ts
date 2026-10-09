import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { LabCase } from '../../core/models/common.model';
import {
  formatPersianCount,
  formatPersianNumber,
  PersianNumberPipe,
} from '../../shared/pipes/persian-number.pipe';
import { labTeethSummary } from './lab-teeth';
import { labJawLabel, labTripKindLabel, labWorkTypeLabel } from '../../shared/labels';
import { PbButton, PbIconButton, PbStatusChip } from '../../shared/ui';
import type { StatusTone } from '../../shared/ui';

/**
 * One case on the lab board. What the case is reads as supporting text; where
 * it stands — the trip, its timing, parts still owed — as status chips; and
 * the move a person makes next as a button, so nobody has to know that cards
 * can also be dragged. Laid out like a surgery-list row: name, file chip, menu.
 */
@Component({
  selector: 'pb-lab-case-card',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    MatIconModule,
    MatMenuModule,
    TranslatePipe,
    PersianNumberPipe,
    PbButton,
    PbIconButton,
    PbStatusChip,
  ],
  template: `
    @let c = labCase();
    <article
      class="card"
      [class.card--overdue]="c.timeliness === 'overdue' || c.appointmentTimeliness === 'overdue'"
      [attr.aria-busy]="busy() || null"
    >
      <header class="card__head">
        <div class="card__identity">
          <strong class="card__name">{{
            c.recordedName || ('patient.unnamed' | translate)
          }}</strong>
          @if (c.patient) {
            <pb-status-chip icon="link" [link]="['/patients', c.patient.id]">
              {{ 'labs.patientFile' | translate: { fileNo: c.patient.fileNo } }}
            </pb-status-chip>
          }
        </div>
        <!-- Edit, undo and archive — or, archived, only the way back. -->
        @if (canEdit()) {
          <pb-icon-button
            class="card__menu"
            icon="more_vert"
            size="compact"
            [menu]="menu"
            [ariaLabel]="'labs.cardActions' | translate"
          />
          <mat-menu #menu="matMenu">
            @if (archived()) {
              <button mat-menu-item type="button" (click)="restore.emit()">
                <mat-icon aria-hidden="true">restore_from_trash</mat-icon>
                <span>{{ 'labs.restore' | translate }}</span>
              </button>
            } @else {
              <a mat-menu-item [routerLink]="['/labs', c.id, 'edit']">
                <mat-icon aria-hidden="true">edit</mat-icon>
                <span>{{ 'common.edit' | translate }}</span>
              </a>
              @if (c.stage === 'booked') {
                <button mat-menu-item type="button" (click)="book.emit()">
                  <mat-icon aria-hidden="true">edit_calendar</mat-icon>
                  <span>{{ 'labs.changeBooking' | translate }}</span>
                </button>
              }
              @if (canUndo()) {
                <button mat-menu-item type="button" (click)="undo.emit()">
                  <mat-icon aria-hidden="true">undo</mat-icon>
                  <span>{{
                    (c.stage === 'booked' ? 'labs.cancelBooking' : 'labs.undoLast') | translate
                  }}</span>
                </button>
              }
              <button mat-menu-item type="button" (click)="archive.emit()">
                <mat-icon aria-hidden="true">delete</mat-icon>
                <span>{{ 'common.delete' | translate }}</span>
              </button>
            }
          </mat-menu>
        }
      </header>

      <div class="card__details">
        <span class="card__detail">
          <mat-icon aria-hidden="true">dentistry</mat-icon>{{ workTypes() }}
        </span>
        @if (c.lab) {
          <span class="card__detail card__detail--lab">
            <mat-icon aria-hidden="true">science</mat-icon>{{ c.lab.name }}
          </span>
        }
        @if (teeth()) {
          <span class="card__detail">
            <mat-icon aria-hidden="true">pin_drop</mat-icon>{{ teeth() }}
          </span>
        }
        @if (parts(); as p) {
          <!-- What went along with an implant crown, and whether it is back. -->
          <span class="card__detail">
            <mat-icon aria-hidden="true">hardware</mat-icon>{{ p }}
          </span>
        }
      </div>

      <div class="card__status">
        <!-- Which trip the work is on; once delivered it is history, on the case page. -->
        @if (c.stage !== 'delivered' && trip(); as t) {
          <pb-status-chip icon="local_shipping" tone="primary">
            {{
              'labs.tripChip'
                | translate: { kind: (tripKindLabel(t.kind) | translate), n: (t.sequence | faNum) }
            }}
          </pb-status-chip>
        }
        @switch (c.stage) {
          @case ('at_lab') {
            <pb-status-chip [icon]="timingIcon()" [tone]="timingTone()">
              @switch (c.timeliness) {
                @case ('overdue') {
                  {{ 'labs.daysLate' | translate: { count: (c.daysLate | faNum) } }}
                }
                @case ('due_today') {
                  {{ 'labs.dueToday' | translate }}
                }
                @default {
                  {{ 'labs.dueOn' | translate: { date: (trip()?.expectedAt | faNum) } }}
                }
              }
            </pb-status-chip>
          }
          @case ('at_clinic') {
            <pb-status-chip icon="hourglass_empty">
              @if (c.daysInStage) {
                {{ 'labs.daysAtClinic' | translate: { count: (c.daysInStage | faNum) } }}
              } @else {
                {{ 'labs.backToday' | translate }}
              }
            </pb-status-chip>
          }
          @case ('booked') {
            <pb-status-chip [icon]="bookingIcon()" [tone]="bookingTone()">
              @switch (c.appointmentTimeliness) {
                @case ('overdue') {
                  {{
                    'labs.appointmentPassed'
                      | translate: { date: (c.appointmentAt | faNum), count: (daysPast() | faNum) }
                  }}
                }
                @case ('due_today') {
                  {{ 'labs.appointmentToday' | translate }}
                }
                @default {
                  {{
                    'labs.appointmentOn'
                      | translate
                        : { date: (c.appointmentAt | faNum), count: (c.appointmentDays | faNum) }
                  }}
                }
              }
            </pb-status-chip>
          }
          @case ('delivered') {
            <pb-status-chip icon="task_alt" tone="success">
              {{ 'labs.deliveredOn' | translate: { date: (c.deliveredAt | faNum) } }}
            </pb-status-chip>
          }
        }
        @if (c.partsOutstanding && c.stage !== 'at_lab') {
          <!-- At the lab the parts are where they should be; once the work is
               back, parts still out are owed — on their own day, if the lab was given one. -->
          <pb-status-chip icon="hardware" [tone]="partsTone()">
            @switch (c.partsTimeliness) {
              @case ('overdue') {
                {{ 'labs.partsLate' | translate: { count: (c.partsDaysLate | faNum) } }}
              }
              @case ('due_today') {
                {{ 'labs.partsDueToday' | translate }}
              }
              @case ('on_time') {
                {{ 'labs.partsDueOn' | translate: { date: (c.partsDueAt | faNum) } }}
              }
              @default {
                {{ 'labs.partsOwed' | translate }}
              }
            }
          </pb-status-chip>
        }
      </div>

      <!-- The next move, one button each; everything else is in the menu. -->
      @if (canEdit() && !archived()) {
        <div class="card__actions">
          @if (partsOnly()) {
            <!-- Listed for the parts alone: the work's own moves are on its own card. -->
            <pb-button
              variant="stroked"
              icon="assignment_return"
              [disabled]="busy()"
              (click)="partsReturned.emit()"
            >
              {{ 'labs.partsReturned' | translate }}
            </pb-button>
          } @else {
            @switch (c.stage) {
              @case ('at_lab') {
                <pb-button
                  variant="stroked"
                  icon="move_to_inbox"
                  [disabled]="busy()"
                  (click)="receive.emit()"
                >
                  {{ 'labs.receive' | translate }}
                </pb-button>
              }
              @case ('at_clinic') {
                <!-- The front desk's move: this column is exactly the work still to book. -->
                <pb-button
                  variant="stroked"
                  icon="event_available"
                  [disabled]="busy()"
                  (click)="book.emit()"
                >
                  {{ 'labs.book' | translate }}
                </pb-button>
                <ng-container *ngTemplateOutlet="partsButton" />
                <pb-button
                  variant="stroked"
                  icon="send"
                  [disabled]="busy()"
                  (click)="sendAgain.emit()"
                >
                  {{ 'labs.sendAgain' | translate }}
                </pb-button>
                <ng-container *ngTemplateOutlet="deliverButton" />
              }
              @case ('booked') {
                <ng-container *ngTemplateOutlet="deliverButton" />
                <ng-container *ngTemplateOutlet="partsButton" />
                <pb-button
                  variant="stroked"
                  icon="send"
                  [disabled]="busy()"
                  (click)="sendAgain.emit()"
                >
                  {{ 'labs.sendAgain' | translate }}
                </pb-button>
              }
              @case ('delivered') {
                <ng-container *ngTemplateOutlet="partsButton" />
              }
            }
          }
        </div>
      }
    </article>

    <ng-template #deliverButton>
      <pb-button variant="stroked" icon="how_to_reg" [disabled]="busy()" (click)="deliver.emit()">
        {{ 'labs.deliver' | translate }}
      </pb-button>
    </ng-template>

    <ng-template #partsButton>
      @if (labCase().partsOutstanding) {
        <pb-button
          variant="stroked"
          icon="assignment_return"
          [disabled]="busy()"
          (click)="partsReturned.emit()"
        >
          {{ 'labs.partsReturned' | translate }}
        </pb-button>
      }
    </ng-template>
  `,
  styleUrl: './lab-case-card.scss',
})
export class LabCaseCard {
  private readonly i18n = inject(TranslateService);

  readonly labCase = input.required<LabCase>();
  readonly canEdit = input(false);
  /** A move on this case is in flight. */
  readonly partsOnly = input(false);
  readonly busy = input(false);
  /** Shown in the archive: restore is the only thing to do. */
  readonly archived = input(false);

  readonly receive = output<void>();
  readonly book = output<void>();
  readonly sendAgain = output<void>();
  readonly deliver = output<void>();
  readonly partsReturned = output<void>();
  readonly undo = output<void>();
  readonly archive = output<void>();
  readonly restore = output<void>();

  protected readonly tripKindLabel = labTripKindLabel;

  /** The trip the card is about: the one out at the lab, or the last one back. */
  protected readonly trip = computed(() => this.labCase().trips.at(-1) ?? null);

  protected readonly workTypes = computed(() => {
    this.i18n.currentLang();
    return this.labCase()
      .workTypes.map((type) => this.i18n.instant(labWorkTypeLabel(type)))
      .join(this.i18n.instant('list.separator'));
  });

  protected readonly teeth = computed(() => {
    this.i18n.currentLang();
    const { jaw, teethFdi, toothCount, teeth } = this.labCase();
    if (jaw) return this.i18n.instant(labJawLabel(jaw));
    // Picked on the chart: the count, then which teeth. Older cases show what was typed.
    if (teethFdi.length) {
      return [
        this.i18n.instant('labs.toothCount', { count: formatPersianCount(teethFdi.length) }),
        labTeethSummary(teethFdi, this.i18n),
      ].join(' · ');
    }
    const count = toothCount
      ? this.i18n.instant('labs.toothCount', { count: formatPersianCount(toothCount) })
      : null;
    return [count, teeth || null].filter(Boolean).join(' · ');
  });

  /** Impression copings and analogs sent along, and when they came back. */
  protected readonly parts = computed(() => {
    this.i18n.currentLang();
    const c = this.labCase();
    if (!(c.impressionCount ?? 0) && !(c.analogCount ?? 0)) return null;
    const counts = this.i18n.instant('labs.parts', {
      impressions: formatPersianCount(c.impressionCount ?? 0),
      analogs: formatPersianCount(c.analogCount ?? 0),
    });
    return c.partsReturnedAt
      ? `${counts} · ${this.i18n.instant('labs.partsReturnedOn', { date: formatPersianNumber(c.partsReturnedAt) })}`
      : counts;
  });

  /** Undo has nothing to take back on a case still on its first trip out. */
  protected readonly canUndo = computed(() => {
    const c = this.labCase();
    return !(c.stage === 'at_lab' && c.trips.length < 2);
  });

  protected readonly timingTone = computed<StatusTone>(() => {
    switch (this.labCase().timeliness) {
      case 'overdue':
        return 'error';
      case 'due_today':
        return 'warning';
      default:
        return 'neutral';
    }
  });

  /** Parts owed are an error until the lab names a day; then they are judged against it like a trip. */
  protected readonly partsTone = computed<StatusTone>(() => {
    switch (this.labCase().partsTimeliness) {
      case 'on_time':
        return 'neutral';
      case 'due_today':
        return 'warning';
      default:
        return 'error';
    }
  });

  /** Days past the booking, for a booked case whose day has gone by. */
  protected readonly daysPast = computed(() => Math.abs(this.labCase().appointmentDays ?? 0));

  protected readonly bookingTone = computed<StatusTone>(() => {
    switch (this.labCase().appointmentTimeliness) {
      case 'overdue':
        return 'error';
      case 'due_today':
        return 'warning';
      default:
        return 'neutral';
    }
  });

  protected readonly bookingIcon = computed(() =>
    this.labCase().appointmentTimeliness === 'overdue' ? 'event_busy' : 'event_available',
  );

  protected readonly timingIcon = computed(() =>
    this.labCase().timeliness === 'overdue' ? 'schedule' : 'event',
  );
}
