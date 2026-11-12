import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

/** The 10 of 60/30/10: the brand orange, or one of two calmer hues. */
export type Accent = 'orange' | 'sage' | 'dusk';
const ACCENTS: readonly Accent[] = ['orange', 'sage', 'dusk'];
const ACCENT_KEY = 'pb.accent.v1';

/** Where an unset preference lands: whatever the device is set to. */
const DEFAULT_MODE: ThemeMode = 'system';

/** The brand is drawn in light and in dark (styles/_brand.scss). */
const DARK_READY = true;

/**
 * Versioned: while dark was off, every visit stored 'light', so the old key
 * would keep everyone light. A new key gives everyone the current default
 * once; a choice made in Settings is kept from then on.
 */
const STORAGE_KEY = 'pb.theme.v3';
const LEGACY_KEY = 'pb.theme.v2';

/**
 * Theme preference. `system` emits no attribute at all, so the stylesheet's
 * `color-scheme: light dark` lets the OS decide; light or dark stamps
 * `data-theme` on the root element to override it. Unset, it is
 * `DEFAULT_MODE`.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _mode = signal<ThemeMode>(this.read());
  readonly mode = this._mode.asReadonly();
  private readonly _accent = signal<Accent>(this.readAccent());
  readonly accent = this._accent.asReadonly();

  constructor() {
    effect(() => {
      const mode = this._mode();
      const root = document.documentElement;
      if (!DARK_READY) root.setAttribute('data-theme', 'light');
      else if (mode === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', mode);
      localStorage.setItem(STORAGE_KEY, mode);
    });
    effect(() => {
      const accent = this._accent();
      const root = document.documentElement;
      if (accent === 'orange') root.removeAttribute('data-accent');
      else root.setAttribute('data-accent', accent);
      localStorage.setItem(ACCENT_KEY, accent);
    });
  }

  /**
   * The new accent cross-fades over the whole window, where the browser can
   * do it, rather than every button flipping colour on its own clock.
   */
  setAccent(accent: Accent): void {
    if (accent === this._accent()) return;
    const quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quiet || !document.startViewTransition) {
      this._accent.set(accent);
      return;
    }
    // The attribute is set here too: the effect would run after the
    // browser has taken its "after" picture.
    document.startViewTransition(() => {
      this._accent.set(accent);
      const root = document.documentElement;
      if (accent === 'orange') root.removeAttribute('data-accent');
      else root.setAttribute('data-accent', accent);
    });
  }

  set(mode: ThemeMode): void {
    this._mode.set(mode);
  }

  private readAccent(): Accent {
    const stored = localStorage.getItem(ACCENT_KEY) as Accent | null;
    return stored && ACCENTS.includes(stored) ? stored : 'orange';
  }

  private read(): ThemeMode {
    localStorage.removeItem(LEGACY_KEY);
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : DEFAULT_MODE;
  }
}
