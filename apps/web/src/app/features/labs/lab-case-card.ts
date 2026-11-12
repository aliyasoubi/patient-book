import { FaDatePipe } from '../../shared/pipes/jalali.pipe';
import { MatTooltipModule } from '@angular/material/tooltip';
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
import { teethByWork, teethSummary } from '../../shared/ui/tooth-picker/teeth';
import {
  LAB_TOOTH_WORK_TYPES,
  labJawLabel,
  labTripKindLabel,
  labWorkTypeLabel,
} from '../../shared/labels';
import { PbButton, PbIcon, PbIconButton } from '../../shared/ui';
import type { LineIconName, StatusTone } from '../../shared/ui';

/**
 * One case on the lab board, read top to bottom in one glance: who (the name,
 * the file and the lab in quiet text), what (each kind of work, how many
 * teeth, which), when (where it stands — the only line with colour, and only
 * when it needs someone: late in red, today in amber), and the next move as
 * one full-width button, the rarer moves quieter beside it. A grip shows the
 * card can be dragged to the next column.
 */
@Component({
  selector: 'pb-lab-case-card',
  standalone: true,
  imports: [
    FaDatePipe,
    MatTooltipModule,
    NgTemplateOutlet,
    RouterLink,
    MatIconModule,
    MatMenuModule,
    TranslatePipe,
    PersianNumberPipe,
    PbButton,
    PbIcon,
    PbIconButton,
  ],
  template: `
    @let c = labCase();
    <article class="card" [attr.data-urgency]="urgency()" [attr.aria-busy]="busy() || null">
      <!-- Who: the name first, then the file and the lab in quiet text. -->
      <header class="card__head">
        @if (draggable()) {
          <span class="card__grip" aria-hidden="true" [matTooltip]="'labs.dragHandle' | translate">
            <pb-icon name="grip-vertical" [size]="16" />
          </span>
        }
        <div class="card__who">
          <strong class="card__name">{{
            c.recordedName || ('patient.unnamed' | translate)
          }}</strong>
          <span class="card__meta">
            @if (c.patient) {
              <a class="card__file" [routerLink]="['/patients', c.patient.id]">{{
                'labs.patientFile' | translate: { fileNo: c.patient.fileNo }
              }}</a>
            }
            @if (c.lab) {
              <span class="card__lab">
                <pb-icon name="flask" [size]="13" />
                {{ c.lab.name }}
              </span>
            }
          </span>
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
                <mat-icon aria-hidden="true">unarchive</mat-icon>
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
                <mat-icon aria-hidden="true">archive</mat-icon>
                <span>{{ 'common.archive' | translate }}</span>
              </button>
            }
          </mat-menu>
        }
      </header>

      <!-- What: each kind of work on its line — the work, how many teeth, which. -->
      <ul class="card__work">
        @for (w of work(); track $index) {
          <li class="work">
            <span class="work__title">
              <pb-icon name="dental" [size]="14" />
              {{ w.title }}
              @if (w.count) {
                <span class="work__count">{{ w.count }}</span>
              }
            </span>
            @if (w.teeth) {
              <span class="work__teeth">{{ w.teeth }}</span>
            }
          </li>
        }
        @if (parts(); as p) {
          <!-- What went along with an implant crown, and whether it is back. -->
          <li class="work work--parts">
            <span class="work__teeth"><pb-icon name="box" [size]="13" /> {{ p }}</span>
          </li>
        }
      </ul>

      <!-- When: where it stands, the one line coloured only when it needs someone. -->
      <div class="card__status">
        <div class="when" [attr.data-tone]="whenTone()">
          <pb-icon [name]="whenIcon()" [size]="15" />
          <span class="when__text">
            @switch (c.stage) {
              @case ('at_lab') {
                @switch (c.timeliness) {
                  @case ('overdue') {
                    {{ 'labs.daysLate' | translate: { count: (c.daysLate | faNum) } }}
                  }
                  @case ('due_today') {
                    {{ 'labs.dueToday' | translate }}
                  }
                  @default {
                    {{ 'labs.dueOn' | translate: { date: (trip()?.expectedAt | faDate) } }}
                  }
                }
              }
              @case ('at_clinic') {
                @if (c.daysInStage) {
                  {{ 'labs.daysAtClinic' | translate: { count: (c.daysInStage | faNum) } }}
                } @else {
                  {{ 'labs.backToday' | translate }}
                }
              }
              @case ('booked') {
                @switch (c.appointmentTimeliness) {
                  @case ('overdue') {
                    {{
                      'labs.appointmentPassed'
                        | translate
                          : { date: (c.appointmentAt | faDate), count: (daysPast() | faNum) }
                    }}
                  }
                  @case ('due_today') {
                    {{ 'labs.appointmentToday' | translate }}
                  }
                  @default {
                    {{
                      'labs.appointmentOn'
                        | translate
                          : { date: (c.appointmentAt | faDate), count: (c.appointmentDays | faNum) }
                    }}
                  }
                }
              }
              @case ('delivered') {
                {{ 'labs.deliveredOn' | translate: { date: (c.deliveredAt | faDate) } }}
              }
            }
          </span>
        </div>
        <!-- Which trip the work is on; once delivered it is history, on the case page. -->
        @if (c.stage !== 'delivered' && trip(); as t) {
          <span class="trip">{{
            'labs.tripChip'
              | translate: { kind: (tripKindLabel(t.kind) | translate), n: (t.sequence | faNum) }
          }}</span>
        }
        @if (c.partsOutstanding && c.stage !== 'at_lab') {
          <!-- At the lab the parts are where they should be; once the work is
               back, parts still out are owed — on their own day, if the lab was given one. -->
          <div class="when" [attr.data-tone]="partsTone()">
            <pb-icon name="box" [size]="15" />
            <span class="when__text">
              @switch (c.partsTimeliness) {
                @case ('overdue') {
                  {{ 'labs.partsLate' | translate: { count: (c.partsDaysLate | faNum) } }}
                }
                @case ('due_today') {
                  {{ 'labs.partsDueToday' | translate }}
                }
                @case ('on_time') {
                  {{ 'labs.partsDueOn' | translate: { date: (c.partsDueAt | faDate) } }}
                }
                @default {
                  {{ 'labs.partsOwed' | translate }}
                }
              }
            </span>
          </div>
        }
      </div>

      <!-- The next move first and full width; the rarer one beside it, quieter. -->
      @if (canEdit() && !archived()) {
        <div class="card__actions">
          @if (partsOnly()) {
            <!-- Listed for the parts alone: the work's own moves are on its own card. -->
            <ng-container *ngTemplateOutlet="partsButton; context: { $implicit: 'stroked' }" />
          } @else {
            @switch (c.stage) {
              @case ('at_lab') {
                <pb-button
                  class="card__primary"
                  [fullWidth]="true"
                  variant="stroked"
                  tone="neutral"
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
                  class="card__primary"
                  [fullWidth]="true"
                  variant="stroked"
                  tone="neutral"
                  icon="event_available"
                  [disabled]="busy()"
                  (click)="book.emit()"
                >
                  {{ 'labs.book' | translate }}
                </pb-button>
                <ng-container *ngTemplateOutlet="partsButton; context: { $implicit: 'text' }" />
                <ng-container *ngTemplateOutlet="sendAgainButton" />
              }
              @case ('booked') {
                <pb-button
                  class="card__primary"
                  [fullWidth]="true"
                  variant="stroked"
                  tone="neutral"
                  icon="how_to_reg"
                  [disabled]="busy()"
                  (click)="deliver.emit()"
                >
                  {{ 'labs.deliver' | translate }}
                </pb-button>
                <ng-container *ngTemplateOutlet="partsButton; context: { $implicit: 'text' }" />
                <ng-container *ngTemplateOutlet="sendAgainButton" />
              }
              @case ('delivered') {
                <ng-container *ngTemplateOutlet="partsButton; context: { $implicit: 'stroked' }" />
              }
            }
          }
        </div>
      }
    </article>

    <!-- Work back for a remake: there when needed, quieter than the next move. -->
    <ng-template #sendAgainButton>
      <pb-button
        variant="text"
        tone="neutral"
        icon="send"
        [disabled]="busy()"
        (click)="sendAgain.emit()"
      >
        {{ 'labs.sendAgain' | translate }}
      </pb-button>
    </ng-template>

    <ng-template #partsButton let-variant>
      @if (labCase().partsOutstanding) {
        <pb-button
          [class.card__primary]="variant === 'stroked'"
          [fullWidth]="variant === 'stroked'"
          [variant]="variant"
          tone="neutral"
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
  /** It can be dragged to another column: shows the grip. */
  readonly draggable = input(false);

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
    // Per-jaw work by its jaw; a case written before the chart as it was typed.
    const { jaw, toothCount, teeth } = this.labCase();
    if (jaw) return this.i18n.instant(labJawLabel(jaw));
    const count = toothCount
      ? this.i18n.instant('labs.toothCount', { count: formatPersianCount(toothCount) })
      : null;
    return [count, teeth || null].filter(Boolean).join(' · ');
  });

  /** The work, kind by kind: a title, the tooth count, and which teeth (or jaw). */
  protected readonly work = computed<
    { title: string; count: string | null; teeth: string | null }[]
  >(() => {
    this.i18n.currentLang();
    const { toothWork } = this.labCase();
    if (toothWork.length) {
      return teethByWork(toothWork, LAB_TOOTH_WORK_TYPES).map(({ workType, teeth }) => ({
        title: this.i18n.instant(labWorkTypeLabel(workType)),
        count: this.i18n.instant('labs.toothCount', { count: formatPersianCount(teeth.length) }),
        teeth: teethSummary(teeth, this.i18n),
      }));
    }
    return [{ title: this.workTypes(), count: null, teeth: this.teeth() || null }];
  });

  /** How urgent the card is, for its edge: late, today, or nothing to flag. */
  protected readonly urgency = computed(() => {
    const tones = [this.whenTone(), this.labCase().partsOutstanding ? this.partsTone() : null];
    if (tones.includes('error')) return 'late';
    if (tones.includes('warning')) return 'soon';
    return null;
  });

  /** The tone of where the case stands. */
  protected readonly whenTone = computed<StatusTone>(() => {
    switch (this.labCase().stage) {
      case 'at_lab':
        return this.timingTone();
      case 'booked':
        return this.bookingTone();
      case 'delivered':
        return 'success';
      default:
        return 'neutral';
    }
  });

  protected readonly whenIcon = computed<LineIconName>(() => {
    const c = this.labCase();
    switch (c.stage) {
      case 'at_lab':
        return c.timeliness === 'overdue' ? 'clock' : 'calendar';
      case 'at_clinic':
        return 'hourglass';
      case 'booked':
        return c.appointmentTimeliness === 'overdue' ? 'calendar-x' : 'calendar-check';
      default:
        return 'circle-check';
    }
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
}

/**
 * A lab card before it has loaded: the same card, with the same classes and
 * sizes as LabCaseCard (it shares its stylesheet) — who, what, when and the
 * next move — so the real card lands in its place without a shift.
 */
@Component({
  selector: 'pb-lab-case-card-skeleton',
  standalone: true,
  template: `
    <!-- Heights match a typical card: a name over its file and lab, a line of
         work over its teeth, where it stands, and the next move. -->
    <article class="card" aria-hidden="true">
      <header class="card__head">
        <div class="card__who skel-col" style="block-size: 70px">
          <span class="pb-skel" style="--w: 55%; --h: 15px"></span>
          <span class="pb-skel" style="--w: 40%; --h: 11px"></span>
          <span class="pb-skel" style="--w: 62%; --h: 11px"></span>
        </div>
      </header>
      <div class="card__work skel-col" style="block-size: 43px">
        <span class="pb-skel" style="--w: 46%; --h: 13px"></span>
        <span class="pb-skel" style="--w: 64%; --h: 11px"></span>
      </div>
      <div class="card__status skel-col" style="block-size: 35px; justify-content: flex-end">
        <span class="pb-skel" style="--w: 38%; --h: 13px"></span>
        <span class="pb-skel" style="--w: 26%; --h: 11px"></span>
      </div>
      <div class="card__actions">
        <span class="pb-skel" style="--h: 40px; --r: 999px"></span>
      </div>
    </article>
  `,
  styleUrl: './lab-case-card.scss',
})
export class LabCaseCardSkeleton {}
