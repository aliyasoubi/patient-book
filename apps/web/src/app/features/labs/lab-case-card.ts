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
      [class.card--overdue]="c.timeliness === 'overdue'"
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
              @if (canUndo()) {
                <button mat-menu-item type="button" (click)="undo.emit()">
                  <mat-icon aria-hidden="true">undo</mat-icon>
                  <span>{{ 'labs.undoLast' | translate }}</span>
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
          @case ('delivered') {
            <pb-status-chip icon="task_alt" tone="success">
              {{ 'labs.deliveredOn' | translate: { date: (c.deliveredAt | faNum) } }}
            </pb-status-chip>
          }
        }
        @if (c.partsOutstanding && c.stage !== 'at_lab') {
          <!-- At the lab the parts are where they should be; once the work is
               back, parts still out are owed. -->
          <pb-status-chip icon="hardware" tone="error">
            {{ 'labs.partsOwed' | translate }}
          </pb-status-chip>
        }
      </div>

      <!-- The next move, one button each; everything else is in the menu. -->
      @if (canEdit() && !archived()) {
        <div class="card__actions">
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
              <pb-button
                variant="stroked"
                icon="send"
                [disabled]="busy()"
                (click)="sendAgain.emit()"
              >
                {{ 'labs.sendAgain' | translate }}
              </pb-button>
              <pb-button
                variant="stroked"
                icon="how_to_reg"
                [disabled]="busy()"
                (click)="deliver.emit()"
              >
                {{ 'labs.deliver' | translate }}
              </pb-button>
            }
            @case ('delivered') {
              @if (c.partsOutstanding) {
                <pb-button
                  variant="stroked"
                  icon="assignment_return"
                  [disabled]="busy()"
                  (click)="partsReturned.emit()"
                >
                  {{ 'labs.partsReturned' | translate }}
                </pb-button>
              }
            }
          }
        </div>
      }
    </article>
  `,
  styleUrl: './lab-case-card.scss',
})
export class LabCaseCard {
  private readonly i18n = inject(TranslateService);

  readonly labCase = input.required<LabCase>();
  readonly canEdit = input(false);
  /** A move on this case is in flight. */
  readonly busy = input(false);
  /** Shown in the archive: restore is the only thing to do. */
  readonly archived = input(false);

  readonly receive = output<void>();
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
    const { jaw, toothCount, teeth } = this.labCase();
    if (jaw) return this.i18n.instant(labJawLabel(jaw));
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

  protected readonly timingIcon = computed(() =>
    this.labCase().timeliness === 'overdue' ? 'schedule' : 'event',
  );
}
