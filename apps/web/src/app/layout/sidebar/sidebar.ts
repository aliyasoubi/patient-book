import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { roleLabel } from '../../shared/labels';
import { PbAvatar, PbIcon, PbLogo } from '../../shared/ui';
import { NAV_GROUP_LABELS, SHELL_NAV, type NavGroup } from '../shell-nav';
import { SpotlightService } from '../spotlight/spotlight.service';

/**
 * The desktop and tablet sidebar: the brand with search and the collapse
 * toggle, the sections grouped by purpose (the day's work, the files, the
 * practice), and the signed-in user with their menu.
 *
 * Collapsed, it is a rail of icons: labels fade out, each link names itself
 * in a tooltip, and search moves to the shell's toolbar. Whether it is
 * collapsed is the shell's to decide; this only draws it.
 */
@Component({
  selector: 'pb-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe, PbAvatar, PbIcon, PbLogo],
  host: { '[class.is-collapsed]': 'collapsed()' },
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  protected readonly auth = inject(AuthService);
  protected readonly spotlight = inject(SpotlightService);

  readonly collapsed = input(false);
  /** Only a desktop offers the toggle; a tablet always gets the rail. */
  readonly canCollapse = input(true);
  readonly collapseToggle = output<void>();

  protected readonly userMenuOpen = signal(false);
  /** Where the selection card sits: over the active link, inside the nav. */
  protected readonly pill = signal({ top: 0, height: 40, shown: false, instant: true });
  private readonly nav = viewChild<ElementRef<HTMLElement>>('nav');
  protected readonly roleLabel = computed(() => roleLabel(this.auth.role()));

  protected readonly navGroups = computed(() => {
    const role = this.auth.role();
    const items = SHELL_NAV.filter(
      (item) => !item.roles || (role !== null && item.roles.includes(role)),
    );
    return (Object.keys(NAV_GROUP_LABELS) as NavGroup[])
      .map((group) => ({
        group,
        label: NAV_GROUP_LABELS[group],
        items: items.filter((item) => item.group === group),
      }))
      .filter((g) => g.items.length);
  });

  constructor() {
    // A new page, or a change of width, closes the user menu.
    const navigated = toSignal(
      inject(Router).events.pipe(filter((event) => event instanceof NavigationEnd)),
    );
    effect(() => {
      navigated();
      this.collapsed();
      this.userMenuOpen.set(false);
    });

    // Put the card under the active link after every navigation (gliding),
    // and again whenever the nav changes size (instantly).
    const injector = inject(Injector);
    const destroyRef = inject(DestroyRef);
    effect(() => {
      navigated();
      afterNextRender(() => this.placePill(false), { injector });
    });
    afterNextRender(
      () => {
        const nav = this.nav()?.nativeElement;
        if (!nav) return;
        // Only a real change of size snaps the card; the observer also fires
        // on first observing and after layout settles, which must not cancel a glide.
        let size = '';
        const resize = new ResizeObserver(([entry]) => {
          const next = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
          if (next === size) return;
          const first = !size;
          size = next;
          if (!first) this.placePill(true);
        });
        resize.observe(nav);
        destroyRef.onDestroy(() => resize.disconnect());
      },
      { injector },
    );
  }

  private placePill(instant: boolean): void {
    const nav = this.nav()?.nativeElement;
    const active = nav?.querySelector<HTMLElement>('.sidebar__link.is-active');
    if (!nav || !active) {
      this.pill.update((p) => ({ ...p, shown: false }));
      return;
    }
    const top =
      active.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    const first = !this.pill().shown;
    this.pill.set({ top, height: active.offsetHeight, shown: true, instant: instant || first });
  }

  protected logout(): void {
    this.auth.logout();
  }

  /** The menu closes on a press anywhere outside it, and on Escape. */
  @HostListener('document:pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    if (!(event.target as HTMLElement).closest('.user-menu, .shell__user')) {
      this.userMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.userMenuOpen.set(false);
  }
}
