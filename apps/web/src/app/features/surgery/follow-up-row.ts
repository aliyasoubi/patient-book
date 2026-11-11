import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';

import type { FollowUpStatus, SurgeryQueueItem } from '../../core/models/common.model';
import {
  abutmentLabel,
  contactOutcomeLabel,
  surgeryDoneLabel,
  surgeryKindIcon,
  surgeryKindLabel,
} from '../../shared/labels';
import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { PhonePipe } from '../../shared/pipes/phone.pipe';
import { placedImplantLine } from '../../shared/placed-implant';
import { PbIcon } from '../../shared/ui/icon/icon';
import { PbIconButton } from '../../shared/ui/icon-button/icon-button';

/**
 * One follow-up, read in a single sweep from the start of the line:
 *
 *   when     how far the follow-up is (or what came of it), big and coloured
 *   who      the patient, the number to ring, their file
 *   work     what was done, on which teeth
 *   contact  the last call and when to call again
 *   actions  record a call; the rest in a menu
 *
 * Its edge carries the urgency, so a column of rows reads as a colour bar
 * before a word is read. Every write goes back to the page, which owns the
 * dialogs and the undo.
 */
@Component({
  selector: 'pb-follow-up-row',
  standalone: true,
  imports: [
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    PersianNumberPipe,
    PhonePipe,
    PbIcon,
    PbIconButton,
    RouterLink,
    TranslatePipe,
  ],
  host: {
    role: 'listitem',
    '[attr.data-state]': 'state()',
    '[class.is-busy]': 'busy()',
  },
  templateUrl: './follow-up-row.html',
  styleUrl: './follow-up-row.scss',
})
export class FollowUpRow {
  readonly item = input.required<SurgeryQueueItem>();
  /** The headline of the "when" column, worked out by the page. */
  readonly when = input('');
  /** The legacy tooth phrase, when there are no chart teeth. */
  readonly position = input('');
  /** The next call's day has come. */
  readonly callDue = input(false);
  /** May record calls and change where the follow-up stands. */
  readonly canEdit = input(false);
  readonly canArchive = input(false);
  /** Listed from the archive: its one action is to come back. */
  readonly archived = input(false);
  /** A write for this row is in flight. */
  readonly busy = input(false);
  /** Some row is being written; hold the actions still. */
  readonly locked = input(false);

  readonly recordCall = output<void>();
  readonly book = output<void>();
  readonly setStatus = output<FollowUpStatus>();
  readonly archive = output<void>();
  readonly restore = output<void>();

  protected readonly kindLabel = surgeryKindLabel;
  protected readonly kindIcon = surgeryKindIcon;
  protected readonly doneLabel = surgeryDoneLabel;
  protected readonly outcomeLabel = contactOutcomeLabel;
  protected readonly abutmentLabel = abutmentLabel;
  protected readonly implantLine = placedImplantLine;

  /** What colours the row: the follow-up's state, or "off" for a surgery that was called off. */
  protected readonly state = computed(() =>
    this.item().status === 'cancelled' ? 'off' : this.item().followUpState,
  );

  protected readonly initial = computed(() => (this.item().recordedName ?? '').trim().charAt(0));

  /** The implants handed out for the surgery, one per line, for the tooltip. */
  protected readonly implantsText = computed(() =>
    this.item()
      .implants.map((implant) => this.implantLine(implant))
      .join('\n'),
  );

  protected readonly open = computed(
    () => this.item().status !== 'cancelled' && !!this.item().followUpDate,
  );
}
