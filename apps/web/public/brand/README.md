# Dentixo brand assets

**سامانه هوشمند مدیریت مطب دندانپزشکی**

Everything here is vector and generated from two paths, so the mark can be
re-cut at any size without a design tool in the loop.

## Files

| File                         | Use                                                            |
| ---------------------------- | -------------------------------------------------------------- |
| `dentixo-mark.svg`           | Symbol mark, 24px and up. `currentColor`.                        |
| `dentixo-mark-small.svg`     | Symbol mark below 24px — heavier stroke, chunkier spark.          |
| `dentixo-logo.svg`           | Horizontal lockup (mark + wordmark).                             |
| `dentixo-logo-stacked.svg`   | Stacked lockup with the Persian tagline.                         |
| `dentixo-icon.svg`           | App-icon source, full bleed square.                              |
| `dentixo-icon-maskable.svg`  | Android maskable source — mark held inside the safe zone.         |

The browser uses `../favicon.svg` with a multi-size `../favicon.ico` fallback.
Android uses the standard and maskable 192px and 512px PNGs in `../icons/`,
declared in `../manifest.webmanifest`. The 120px, 152px and 167px Apple touch
icons live in `../icons/` alongside the root-level 180px `../apple-touch-icon.png`.
The app declares all four sizes in `src/index.html` for iPhone and iPad.

## In the app

Don't reference these files from a component. `<pb-logo [size]="32" />`
(`src/app/shared/ui/logo/logo.ts`) inlines the same geometry as SVG, which is
what lets it inherit `currentColor` — an `<img>` can't. It also swaps to the
heavier small-size drawing on its own under 24px.

The wordmark in the app is real HTML text, not artwork: it stays selectable,
scales with the type tokens, and needs no second font.

## Colour

The in-app mark inherits `--mat-sys-primary`. The favicon and launcher artwork
use electric orange (`#ff6a00`) on graphite (`#2f2f33`) from
`src/styles/_brand.scss`. The manifest and light browser chrome use the fog
grey (`#e6e8eb`) of the login background. Update the SVGs, HTML theme colours
and manifest together when changing these brand colours.

## Rules

- **Clear space** — a quarter of the mark's height on every side.
- **Minimum size** — 16px for the mark, 120px wide for the horizontal lockup.
  Below that, drop the wordmark.
- **Don't** re-colour the tooth and spark separately, add effects, stretch it,
  or set the wordmark in another face.
- **Do** put the mark on the primary colour or on a surface — never on a busy
  photograph, which is what the clear-space rule is protecting.

## Regenerating the raster set

The SVGs here are the source of truth; every PNG and the `.ico` fall out of
them. After changing a mark, re-cut the lot:

```bash
cd apps/web && npm i --no-save sharp && node scripts/build-icons.mjs public
```

`favicon.ico` is written as a multi-size icon (16/32/48) wrapping PNG entries —
browsers read the first two, Windows uses 48 for taskbar and desktop shortcuts.

Don't reach for macOS's `qlmanage` here. It pastes an SVG at its intrinsic size
into a canvas of the requested size rather than scaling it, so a 48px source
asked for at 512 comes back as a speck in the corner of an empty square.
