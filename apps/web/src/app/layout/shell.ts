import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map } from 'rxjs';

import { AuthService } from '../core/services/auth.service';
import { ThemeService } from '../core/services/theme.service';
import { GlobalSearch } from './global-search';
import { roleLabel } from '../shared/labels';
import type { UserRole } from '../core/models/common.model';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Shown in the mobile bottom bar; the rest live behind the menu. */
  primary: boolean;
  roles?: UserRole[];
}

/**
 * Built on demand rather than as a module constant: a `$localize` template
 * evaluated at module load runs before the runtime has its translations.
 */
function navItems(): NavItem[] {
  return [
    { path: '/dashboard', label: $localize`:@@nav.dashboard:داشبورد`, icon: 'dashboard', primary: true },
    { path: '/patients', label: $localize`:@@nav.patients:بیماران`, icon: 'groups', primary: true },
    { path: '/surgery', label: $localize`:@@nav.surgery:لیست جراحی`, icon: 'event_available', primary: true },
    { path: '/implants', label: $localize`:@@nav.implants:دفتر ایمپلنت`, icon: 'deployed_code', primary: true },
    { path: '/ortho', label: $localize`:@@nav.ortho:دفتر ارتودنسی`, icon: 'straighten', primary: false },
    { path: '/settings', label: $localize`:@@nav.settings:تنظیمات`, icon: 'settings', primary: false },
  ];
}

@Component({
  selector: 'pb-shell',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatButtonModule,
    MatListModule, MatMenuModule, MatTooltipModule,
    GlobalSearch,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly breakpoints = inject(BreakpointObserver);
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);

  /**
   * Three layouts, not two: a phone gets a bottom bar, a tablet gets a
   * collapsible drawer, and a desktop gets a permanent rail. Driven off the CDK
   * so it tracks the same breakpoints the stylesheet does.
   */
  protected readonly isHandset = toSignal(
    this.breakpoints.observe([Breakpoints.Handset]).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  protected readonly isDesktop = toSignal(
    this.breakpoints.observe('(min-width: 1024px)').pipe(map((r) => r.matches)),
    { initialValue: true },
  );

  protected readonly drawerOpen = signal(false);

  protected readonly navItems = computed(() =>
    navItems().filter((item) => {
      if (!item.roles) return true;
      const role = this.auth.role();
      return role !== null && item.roles.includes(role);
    }),
  );

  protected readonly primaryNav = computed(() => this.navItems().filter((i) => i.primary));

  protected readonly roleLabel = computed(() => roleLabel(this.auth.role()));

  /** Initials for the avatar, from the Persian full name. */
  protected readonly initials = computed(() => {
    const name = this.auth.user()?.fullName ?? '';
    const parts = name.split(' ').filter(Boolean);
    return parts.slice(0, 2).map((p) => p[0]).join('');
  });

  /** Tooltip naming the current theme mode. */
  protected themeTooltip(): string {
    switch (this.theme.mode()) {
      case 'light':
        return $localize`:@@theme.tooltipLight:حالت نمایش: روشن`;
      case 'dark':
        return $localize`:@@theme.tooltipDark:حالت نمایش: تیره`;
      default:
        return $localize`:@@theme.tooltipSystem:حالت نمایش: خودکار`;
    }
  }

  protected toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  protected logout(): void {
    this.auth.logout();
  }
}
