import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../../core/services/auth.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { roleLabel } from '../../shared/labels';
import { PbButton, PbPage, PbPageHeader, PbSegmentedButton, PbSurface } from '../../shared/ui';
import type { SegmentOption } from '../../shared/ui';

/**
 * Appearance and account. The labs are managed on the lab board. Backups and the
 * Excel export/reconcile tools are deliberately not here: they are operated from
 * the server's terminal (see the README), not from the clinic's screens.
 */
@Component({
  selector: 'pb-settings',
  standalone: true,
  imports: [PbSegmentedButton, PbButton, PbSurface, PbPageHeader, TranslatePipe, PbPage],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);

  protected readonly roleLabel = roleLabel;

  protected readonly themeOptions: SegmentOption[] = [
    { value: 'system', label: 'settings.automatic', icon: 'brightness_auto', translate: true },
    { value: 'light', label: 'settings.light', icon: 'light_mode', translate: true },
    { value: 'dark', label: 'settings.dark', icon: 'dark_mode', translate: true },
  ];

  protected setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
  }
}
