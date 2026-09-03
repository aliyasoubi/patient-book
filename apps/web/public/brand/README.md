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

Rasterised outputs live one level up: `../favicon.svg`, `../favicon.ico`,
`../apple-touch-icon.png`, `../icons/icon-{192,512}.png`,
`../icons/icon-maskable-512.png`, all wired up in `src/index.html` and
`../manifest.webmanifest`.

## In the app

Don't reference these files from a component. `<pb-logo [size]="32" />`
(`src/app/shared/ui/logo/logo.ts`) inlines the same geometry as SVG, which is
what lets it inherit `currentColor` — an `<img>` can't. It also swaps to the
heavier small-size drawing on its own under 24px.

The wordmark in the app is real HTML text, not artwork: it stays selectable,
scales with the type tokens, and needs no second font.

## Colour

The mark carries no colour of its own. In the app it inherits
`--mat-sys-primary`, so it follows whichever palette the user picks in
settings (cyan / green / violet) and flips to `--mat-sys-on-primary` on the
login screen's coloured panel.

The only place a hex is pinned is the icon tile — `#00808a → #004f52`, matching
the `theme-color` meta tags — because a file on a phone's home screen can't
resolve a CSS variable.

If you ever want the brand teal from the identity sheet (`#009688`) as the
product's actual primary, don't hand-edit hexes: regenerate the M3 ramp from
that seed, otherwise dark mode and every container/on-container pairing drift
out of contrast.

```bash
npx ng generate @angular/material:theme-color
```

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
