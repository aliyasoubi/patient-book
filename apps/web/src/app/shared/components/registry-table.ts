import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '@ngx-translate/core';

import { caseStatusLabel } from '../labels';
import { EmptyState } from './empty-state';
import { PbStatusChip } from '../ui';
import type { RegistryCase } from '../../core/models/common.model';

/**
 * Shared presentation for the implant and orthodontic registers.
 *
 * Both books number themselves independently of the main patient file, so the
 * register number is shown as its own value alongside the linked patient file.
 * An unlinked row is surfaced, not hidden, so staff can resolve it.
 */
@Component({
  selector: 'pb-registry-table',
  standalone: true,
  imports: [
    MatButtonModule,
    MatTooltipModule,
    EmptyState,
    PbStatusChip,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './registry-table.html',
  styleUrl: './registry-table.scss',
})
export class RegistryTable {
  readonly cases = input.required<RegistryCase[]>();
  readonly icon = input('deployed_code');
  readonly emptyTitle = input('');
  readonly emptyHint = input('');
  readonly canEdit = input(false);

  readonly edit = output<RegistryCase>();

  protected readonly statusLabel = caseStatusLabel;

  protected patientName(c: RegistryCase): string {
    if (!c.patient) return '';
    return `${c.patient.firstName ?? ''} ${c.patient.lastName ?? ''}`.trim();
  }
}
