import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AuthService } from '../../core/services/auth.service';
import { Accent, ThemeService, ThemeMode } from '../../core/services/theme.service';
import { LabService } from '../../core/services/lab.service';
import { roleLabel } from '../../shared/labels';
import {
  PbButton,
  PbIcon,
  PbPage,
  PbPageHeader,
  PbSwitch,
  PbSwitcher,
  ToastService,
} from '../../shared/ui';
import type { SwitcherOption } from '../../shared/ui';
import type { Lab } from '../../core/models/common.model';
import { LabNameDialog } from './lab-name-dialog';

/**
 * Appearance, account and the labs the practice works with. Backups and the
 * Excel export/reconcile tools are deliberately not here: they are operated from
 * the server's terminal (see the README), not from the clinic's screens.
 */
@Component({
  selector: 'pb-settings',
  standalone: true,
  imports: [PbButton, PbIcon, PbSwitch, PbSwitcher, PbPageHeader, TranslatePipe, PbPage],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly labService = inject(LabService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslateService);

  protected readonly roleLabel = roleLabel;

  protected readonly modes: readonly SwitcherOption[] = [
    { value: 'system', label: 'settings.automatic', icon: 'device-desktop' },
    { value: 'light', label: 'settings.light', icon: 'sun' },
    { value: 'dark', label: 'settings.dark', icon: 'moon' },
  ];
  protected readonly accents: readonly { value: Accent; label: string }[] = [
    { value: 'orange', label: 'settings.accentOrange' },
    { value: 'sage', label: 'settings.accentSage' },
    { value: 'dusk', label: 'settings.accentDusk' },
  ];
  /** The letter on the person's tile. */
  protected readonly initial = computed(() => (this.auth.user()?.fullName ?? '').trim().charAt(0));

  protected readonly labs = signal<Lab[]>([]);
  /** The lab whose switch is mid-flight. */
  protected readonly labBusy = signal<string | null>(null);

  constructor() {
    this.loadLabs();
  }

  private loadLabs(): void {
    this.labService
      .labs()
      .subscribe({ next: (labs) => this.labs.set(labs), error: () => undefined });
  }

  protected addLab(): void {
    this.openLabDialog(null);
  }

  protected renameLab(lab: Lab): void {
    this.openLabDialog(lab);
  }

  private openLabDialog(lab: Lab | null): void {
    this.dialog
      .open(LabNameDialog, { data: lab, width: '420px', maxWidth: '92vw' })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.toast.success(this.i18n.instant('settings.labSaved'));
        this.loadLabs();
      });
  }

  /** Off: no longer offered for new cases. Its old cases keep naming it. */
  protected setLabActive(lab: Lab, isActive: boolean): void {
    this.labBusy.set(lab.id);
    this.labService.updateLab(lab.id, { isActive }).subscribe({
      next: () => {
        this.labBusy.set(null);
        this.loadLabs();
      },
      error: () => {
        this.labBusy.set(null);
        this.loadLabs();
      },
    });
  }

  protected setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
  }
}
