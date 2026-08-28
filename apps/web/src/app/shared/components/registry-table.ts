import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { caseStatusLabel, matchMethodLabel } from '../labels';
import { EmptyState } from './empty-state';
import { PbStatusChip } from '../ui';
import type { RegistryCase } from '../../core/models/common.model';

/**
 * Shared presentation for the implant and orthodontic registers.
 *
 * Both books number themselves independently of the main patient file, so the
 * register number is shown as its own value and the link to a patient — which
 * an import inferred from a name — is labelled with how it was established.
 * An unlinked row is surfaced, not hidden, so staff can resolve it.
 */
@Component({
  selector: 'pb-registry-table',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatTooltipModule, EmptyState, PbStatusChip, MatIconModule],
  templateUrl: './registry-table.html',
  styleUrl: './registry-table.scss',
})
export class RegistryTable {
  readonly cases = input.required<RegistryCase[]>();
  readonly icon = input('deployed_code');
  readonly emptyTitle = input($localize`:@@registry.emptyDefault:پرونده‌ای یافت نشد`);
  readonly emptyHint = input('');
  readonly canEdit = input(false);

  readonly edit = output<RegistryCase>();

  protected readonly statusLabel = caseStatusLabel;
  protected readonly matchMethodLabel = matchMethodLabel;

  protected readonly unnamed = $localize`:@@patient.unnamed:بدون نام`;

  protected patientName(c: RegistryCase): string {
    if (!c.patient) return '';
    return `${c.patient.firstName ?? ''} ${c.patient.lastName ?? ''}`.trim();
  }
}
