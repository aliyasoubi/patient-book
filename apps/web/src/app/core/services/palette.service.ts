import { Injectable, effect, signal } from '@angular/core';

export type PaletteName = 'cyan' | 'green' | 'violet';

const STORAGE_KEY = 'pb.palette';

/**
 * Colour palette preference. `cyan` is the default and emits no attribute, so
 * the stylesheet's base `mat.theme` block applies. Picking green or violet
 * stamps `data-palette` on the root element, selecting that block's scoped
 * `mat.theme` override in styles.scss.
 */
@Injectable({ providedIn: 'root' })
export class PaletteService {
  private readonly _palette = signal<PaletteName>(this.read());
  readonly palette = this._palette.asReadonly();

  constructor() {
    effect(() => {
      const palette = this._palette();
      const root = document.documentElement;
      if (palette === 'cyan') root.removeAttribute('data-palette');
      else root.setAttribute('data-palette', palette);
      localStorage.setItem(STORAGE_KEY, palette);
    });
  }

  set(palette: PaletteName): void {
    this._palette.set(palette);
  }

  private read(): PaletteName {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'green' || stored === 'violet' || stored === 'cyan' ? stored : 'cyan';
  }
}
