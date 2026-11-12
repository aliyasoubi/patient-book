import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../core/services/auth.service';
import { PageScroll } from '../core/services/page-scroll.service';
import { PbIcon, PbLogo } from '../shared/ui';
import { SHELL_NAV } from './shell-nav';
import { Sidebar } from './sidebar/sidebar';
import { Spotlight } from './spotlight/spotlight';
import { SpotlightService } from './spotlight/spotlight.service';
import { SignOutService } from '../core/services/sign-out.service';

/** A per-device convenience, not patient data — so `localStorage` is fine here. */
const COLLAPSED_KEY = 'pb.sidebar.collapsed';

/**
 * The frame every signed-in page sits in, drawn in the brand rather than
 * Material: a sidebar on the fog ground (the right, in RTL) and the page in
 * one white panel beside it, inset and softly lifted.
 *
 * - Desktop: the sidebar expands to labels or collapses to a 72px rail; the
 *   choice is remembered on this device. Expanded, search is an icon in the
 *   sidebar; collapsed, it becomes a field in the toolbar. Both open the
 *   spotlight, as does Ctrl+Space.
 * - Tablet: always the rail.
 * - Phone: no sidebar — a toolbar on top and a bottom bar for the main
 *   sections, with the rest in a sheet behind «more».
 */
@Component({
  selector: 'pb-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    PbIcon,
    PbLogo,
    Spotlight,
    Sidebar,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly pageScroll = inject(PageScroll);
  protected readonly auth = inject(AuthService);
  private readonly signOut = inject(SignOutService);
  protected readonly spotlight = inject(SpotlightService);

  protected readonly isHandset = toSignal(
    this.breakpoints.observe([Breakpoints.Handset]).pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  protected readonly isDesktop = toSignal(
    this.breakpoints.observe('(min-width: 1024px)').pipe(map((r) => r.matches)),
    { initialValue: true },
  );

  /** What the user chose on a desktop; a tablet always gets the rail. */
  private readonly chosenCollapsed = signal(this.readCollapsed());
  protected readonly collapsed = computed(() => !this.isDesktop() || this.chosenCollapsed());
  protected readonly canCollapse = computed(() => this.isDesktop());

  protected readonly moreOpen = signal(false);

  /** The page on screen, without its query. */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url.split(/[?#]/)[0]),
      startWith(this.router.url.split(/[?#]/)[0]),
    ),
    { initialValue: '' },
  );

  private readonly page = viewChild<ElementRef<HTMLElement>>('page');

  protected readonly navItems = computed(() =>
    SHELL_NAV.filter((item) => {
      if (!item.roles) return true;
      const role = this.auth.role();
      return role !== null && item.roles.includes(role);
    }),
  );

  protected readonly primaryNav = computed(() => this.navItems().filter((i) => i.primary));
  protected readonly moreNav = computed(() => this.navItems().filter((i) => !i.primary));

  /** On a phone, «more» is marked while a section behind it is on screen. */
  protected readonly moreActive = computed(() => {
    const path = this.path();
    return this.moreNav().some((item) => path === item.path || path.startsWith(`${item.path}/`));
  });

  constructor() {
    effect(() => this.pageScroll.attach(this.page()?.nativeElement ?? null));

    // A new page opens at its top and closes whatever menu led to it. A new
    // query on the same page keeps its place.
    effect(() => {
      this.path();
      untracked(() => {
        this.pageScroll.scrollTo(0);
        this.moreOpen.set(false);
      });
    });

    effect(() => {
      const collapsed = this.chosenCollapsed();
      try {
        localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
      } catch {
        // Storage refused (private mode): the choice lasts this visit only.
      }
    });
  }

  protected toggleCollapsed(): void {
    this.chosenCollapsed.update((c) => !c);
  }

  protected logout(): void {
    this.signOut.ask();
  }

  /** Menus close on a press anywhere outside them, and on Escape. */
  @HostListener('document:pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.more-sheet, .bottom-nav__more')) this.moreOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.moreOpen.set(false);
  }

  private readCollapsed(): boolean {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  }
}
