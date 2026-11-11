import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Where an unset preference lands. Light while the redesign is reviewed in
 * light mode; dark is tested next, then this returns to 'system'.
 */
const DEFAULT_MODE: ThemeMode = 'light';

/**
 * Versioned: until now the default was 'system' and every visit stored it,
 * so the old key would keep everyone on 'system'. A new key gives everyone
 * the current default once; a choice made in Settings is kept from then on.
 */
const STORAGE_KEY = 'pb.theme.v2';
const LEGACY_KEY = 'pb.theme';

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

  constructor() {
    effect(() => {
      const mode = this._mode();
      const root = document.documentElement;
      if (mode === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', mode);
      localStorage.setItem(STORAGE_KEY, mode);
    });
  }

  set(mode: ThemeMode): void {
    this._mode.set(mode);
  }

  private read(): ThemeMode {
    localStorage.removeItem(LEGACY_KEY);
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : DEFAULT_MODE;
  }
}
