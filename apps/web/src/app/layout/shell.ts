import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { map } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';

import { AuthService } from '../core/services/auth.service';
import { PaletteService } from '../core/services/palette.service';
import { ThemeService } from '../core/services/theme.service';
import { GlobalSearch } from './global-search';
import { roleLabel } from '../shared/labels';
import type { UserRole } from '../core/models/common.model';
import { PbAvatar, PbLogo } from '../shared/ui';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Shown in the mobile bottom bar; the rest live behind the menu. */
  primary: boolean;
  roles?: UserRole[];
}

/**
 * Stable translation keys are resolved by the template at runtime.
 */
function navItems(): NavItem[] {
  return [
    {
      path: '/dashboard',
      label: 'nav.dashboard',
      icon: 'dashboard',
      primary: true,
    },
    { path: '/patients', label: 'nav.patients', icon: 'groups', primary: true },
    {
      path: '/surgery',
      label: 'nav.surgery',
      icon: 'event_available',
      primary: true,
    },
    {
      path: '/implants',
      label: 'nav.implants',
      icon: 'deployed_code',
      primary: true,
    },
    {
      path: '/ortho',
      label: 'nav.ortho',
      icon: 'straighten',
      primary: false,
    },
    {
      path: '/settings',
      label: 'nav.settings',
      icon: 'settings',
      primary: false,
    },
  ];
}

@Component({
  selector: 'pb-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatListModule,
    MatMenuModule,
    GlobalSearch,
    PbAvatar,
    PbLogo,
    MatIconModule,
    TranslatePipe,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly breakpoints = inject(BreakpointObserver);
  protected readonly auth = inject(AuthService);
  // Both are injected only to apply the stored preference on boot — their
  // constructors are what stamp the theme onto the document. The shell never
  // reads either one; display mode and palette are both picked in settings, so
  // there is exactly one place in the app that changes how it looks.
  private readonly theme = inject(ThemeService);
  private readonly palette = inject(PaletteService);

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
