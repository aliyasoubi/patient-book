import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { format, isValid } from 'date-fns-jalali';

import type { AuditEntry } from '../../core/models/common.model';
import { LoadError } from '../../shared/components/load-error';
import { educationLabel, fieldLabel, genderLabel } from '../../shared/labels';
import { timeAgo } from '../../shared/pipes/ago.pipe';
import { formatPhone } from '../../shared/pipes/phone.pipe';
import { formatPersianCount, formatPersianNumber } from '../../shared/pipes/persian-number.pipe';
import { PbFilterChips, type FilterChipOption } from '../../shared/ui';
import { PbIcon } from '../../shared/ui/icon/icon';

type Kind = 'create' | 'update' | 'archive';

interface Change {
  key: string;
  label: string;
  /** Set for an edit: what it was. */
  from: string | null;
  to: string;
}

interface Event {
  id: string;
  kind: Kind;
  action: string;
  actor: string;
  initial: string;
  system: boolean;
  time: string;
  changes: Change[];
}

interface Day {
  key: string;
  label: string;
  events: Event[];
}

const LTR_START = String.fromCharCode(0x2066);
const LTR_END = String.fromCharCode(0x2069);

/** How many of a new record's fields show before "show all". */
const FIRST_FIELDS = 6;

/**
 * A patient's record over time, read like a log book rather than a dump of
 * fields: a line on top that says how much has happened and the last of it,
 * chips to narrow to edits or to the record's creation, and the events by
 * day. An edit shows each field it touched as the old value struck through
 * beside the new one; the record's creation shows only the fields that were
 * filled in, the first few at once and the rest a tap away.
 */
@Component({
  selector: 'pb-patient-history',
  standalone: true,
  imports: [LoadError, MatIconModule, PbFilterChips, PbIcon, TranslatePipe],
  templateUrl: './patient-history.html',
  styleUrl: './patient-history.scss',
})
export class PatientHistory {
  private readonly i18n = inject(TranslateService);

  readonly entries = input.required<readonly AuditEntry[]>();
  readonly state = input.required<'idle' | 'loading' | 'loaded' | 'failed'>();
  readonly retry = output<void>();

  protected readonly firstFields = FIRST_FIELDS;
  protected readonly filter = signal<Kind | ''>('');
  /** The creation entries opened to all their fields. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly events = computed<Event[]>(() => {
    this.i18n.currentLang();
    return this.entries().map((entry) => this.toEvent(entry));
  });

  protected readonly filterOptions = computed<FilterChipOption[]>(() => {
    const kinds = new Set(this.events().map((e) => e.kind));
    const options: FilterChipOption[] = [];
    if (kinds.has('update')) {
      options.push({
        value: 'update',
        label: 'patientHistory.filterEdits',
        icon: 'edit',
        translate: true,
      });
    }
    if (kinds.has('create')) {
      options.push({
        value: 'create',
        label: 'patientHistory.filterCreate',
        icon: 'add',
        translate: true,
      });
    }
    if (kinds.has('archive')) {
      options.push({
        value: 'archive',
        label: 'patientHistory.filterArchive',
        icon: 'archive',
        translate: true,
      });
    }
    return options;
  });

  /** The events by day, newest first, under «امروز», «دیروز» or the date. */
  protected readonly days = computed<Day[]>(() => {
    const kind = this.filter();
    const days: Day[] = [];
    for (const entry of this.entries()) {
      const event = this.events().find((e) => e.id === entry.id);
      if (!event || (kind && event.kind !== kind)) continue;
      const key = dayKey(entry.createdAt);
      const last = days.at(-1);
      if (last?.key === key) last.events.push(event);
      else days.push({ key, label: this.dayLabel(entry.createdAt), events: [event] });
    }
    return days;
  });

  /** The line on top: how much has happened, the last of it, and when the record began. */
  protected readonly overview = computed(() => {
    const entries = this.entries();
    if (!entries.length) return null;
    const latest = entries[0];
    const created = entries.find((e) => e.action === 'create') ?? entries.at(-1)!;
    return {
      count: formatPersianCount(entries.length),
      when: timeAgo(latest.createdAt, this.i18n),
      who: this.actorName(latest),
      created: stampDay(created.createdAt),
    };
  });

  protected setFilter(selected: string[]): void {
    const value = selected[0];
    this.filter.set(value === 'create' || value === 'update' || value === 'archive' ? value : '');
  }

  protected toggle(id: string): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected countLabel(key: string, count: number): string {
    return this.i18n.instant(key, { count: formatPersianCount(count) });
  }

  private toEvent(entry: AuditEntry): Event {
    const kind: Kind =
      entry.action === 'create'
        ? 'create'
        : entry.action === 'delete' || entry.action === 'restore'
          ? 'archive'
          : 'update';
    const changes: Change[] = [];
    for (const [key, raw] of Object.entries(entry.changes ?? {})) {
      const diff = asChange(raw);
      if (diff && kind !== 'create') {
        changes.push({
          key,
          label: this.i18n.instant(fieldLabel(key)),
          from: this.format(diff.from, key),
          to: this.format(diff.to, key),
        });
      } else {
        const value = this.format(diff ? diff.to : raw, key);
        // A new record lists what was filled in; the blanks say nothing.
        if (kind === 'create' && value === '—') continue;
        changes.push({ key, label: this.i18n.instant(fieldLabel(key)), from: null, to: value });
      }
    }
    const actor = this.actorName(entry);
    return {
      id: entry.id,
      kind,
      action: this.actionLabel(entry.action),
      actor,
      initial: actor.trim().charAt(0),
      system: !entry.userId,
      time: stampTime(entry.createdAt),
      changes,
    };
  }

  private actorName(entry: AuditEntry): string {
    return (
      entry.fullName ??
      entry.username ??
      this.i18n.instant(entry.userId ? 'audit.deletedUser' : 'audit.systemUser')
    );
  }

  private actionLabel(action: string): string {
    const known = ['create', 'update', 'delete', 'restore'];
    return this.i18n.instant(`auditAction.${known.includes(action) ? action : 'other'}`);
  }

  private dayLabel(iso: string): string {
    const days = Math.round(
      (startOfDay(new Date()).getTime() - startOfDay(new Date(iso)).getTime()) / 86_400_000,
    );
    if (days === 0) return this.i18n.instant('time.today');
    if (days === 1) return this.i18n.instant('time.yesterday');
    return stampDay(iso);
  }

  /** A value as the practice reads it: labels for codes, counts for lists, "—" for nothing. */
  private format(value: unknown, field: string): string {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'gender' && typeof value === 'string')
      return this.i18n.instant(genderLabel(value));
    if (field === 'education' && typeof value === 'string') {
      return this.i18n.instant(educationLabel(value));
    }
    if (field === 'resolvedIssue' && typeof value === 'string') {
      return this.i18n.instant(fieldLabel(value));
    }
    if (field === 'isArchived' && typeof value === 'boolean') {
      return this.i18n.instant(value ? 'archive.statusArchived' : 'archive.statusActive');
    }
    if (field === 'referralSource' && typeof value === 'object') {
      const name = (value as { name?: unknown }).name;
      return typeof name === 'string' ? name : this.i18n.instant('value.notRecorded');
    }
    if (field === 'treatments' && Array.isArray(value)) {
      return this.countLabel('audit.treatmentCount', value.length);
    }
    if (field === 'dataIssues' && Array.isArray(value)) {
      return this.countLabel('audit.issueCount', value.length);
    }
    if ((field === 'mobile' || field === 'homePhone') && typeof value === 'string') {
      // Isolated left to right, so its groups keep their order inside Persian text.
      return LTR_START + formatPersianNumber(formatPhone(value)) + LTR_END;
    }
    if (typeof value === 'boolean') return this.i18n.instant(value ? 'value.yes' : 'value.no');
    if (Array.isArray(value)) return this.countLabel('value.itemCount', value.length);
    if (typeof value === 'object') return this.i18n.instant('value.recordedDetails');
    return formatPersianNumber(String(value));
  }
}

function asChange(value: unknown): { from?: unknown; to?: unknown } | null {
  return value && typeof value === 'object' && ('from' in value || 'to' in value)
    ? (value as { from?: unknown; to?: unknown })
    : null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  return isValid(date) ? format(date, 'yyyy/MM/dd') : iso;
}

function stampDay(iso: string): string {
  const date = new Date(iso);
  return isValid(date) ? formatPersianNumber(format(date, 'yyyy/MM/dd')) : '—';
}

function stampTime(iso: string): string {
  const date = new Date(iso);
  return isValid(date) ? formatPersianNumber(format(date, 'HH:mm')) : '';
}
