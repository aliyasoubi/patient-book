#!/usr/bin/env python3
"""
Build the Material Symbols subset the app actually ships.

The full Rounded variable font is 4.9 MiB — larger than the entire JS bundle —
and `font-display: block` hides every icon until it arrives. This keeps only
the glyphs the sources use, which is a few dozen kilobytes.

How icons are found: every lowercase string literal in the web sources and the
API seeds (`'person_add'`, `icon="tune"`, `<mat-icon>cloud_off</mat-icon>`) is
a candidate; a candidate is an icon if the font has a glyph by that name. That
over-includes a little (`'error'`, `'search'` and `'check'` are both plain
words and icons) at a cost of a few hundred bytes each, and cannot miss an
icon whose name appears anywhere in source. Treatment-type icons come from the
database, but the seed is their only writer, so scanning it covers them.

Usage:
  python3 scripts/subset-icons.py          regenerate the font and manifest
  python3 scripts/subset-icons.py --check  exit 1 if sources use an icon the
                                           shipped subset lacks (run in CI)

Requires `pip install fonttools brotli`. Run from apps/web.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
ROOT = WEB.parents[1]
SOURCE_FONT = ROOT / "node_modules/material-symbols/material-symbols-rounded.woff2"
OUT_DIR = WEB / "src/fonts"
OUT_FONT = OUT_DIR / "material-symbols-rounded.woff2"
MANIFEST = OUT_DIR / "material-symbols-rounded.icons.txt"

SCAN_DIRS = [WEB / "src", ROOT / "apps/api/src/database/seeds"]
SCAN_SUFFIXES = {".ts", ".html"}

# The FILL axis swaps a glyph for its `.fill` twin through these lookups, and
# the icon name itself is typed as text that a ligature turns into the glyph.
LAYOUT_FEATURES = ["rclt", "rlig"]
LIGATURE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789_"

# styles.scss pins these two axes, so their variation data is dead weight;
# FILL and wght stay variable because the app animates between their values.
PINNED_AXES = {"GRAD": 0, "opsz": 24}

LITERAL = re.compile(r"""['"]([a-z][a-z0-9_]{1,48})['"]""")
ICON_TEXT = re.compile(r"<mat-icon\b[^>]*>\s*([a-z][a-z0-9_]+)\s*</mat-icon>", re.S)


def candidates() -> set[str]:
    found: set[str] = set()
    for base in SCAN_DIRS:
        for path in base.rglob("*"):
            if path.suffix not in SCAN_SUFFIXES or path.name.endswith(".spec.ts"):
                continue
            text = path.read_text(encoding="utf-8")
            found.update(LITERAL.findall(text))
            found.update(ICON_TEXT.findall(text))
    return found


def load_font():
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        sys.exit("fontTools is required: pip install fonttools brotli")
    if not SOURCE_FONT.exists():
        sys.exit(f"source font missing — run npm install first: {SOURCE_FONT}")
    return TTFont(SOURCE_FONT)


def used_icons(glyph_names: set[str]) -> list[str]:
    return sorted(name for name in candidates() if name in glyph_names)


def build() -> None:
    from fontTools import subset

    from fontTools.varLib import instancer

    font = load_font()
    glyph_names = set(font.getGlyphOrder())
    icons = used_icons(glyph_names)
    keep = [g for name in icons for g in (name, f"{name}.fill") if g in glyph_names]

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = LAYOUT_FEATURES
    # Closure would follow every ligature reachable from the alphabet — i.e.
    # every icon in the font. We list the ligature glyphs ourselves instead.
    options.layout_closure = False
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(glyphs=keep, text=LIGATURE_ALPHABET)
    subsetter.subset(font)
    # After subsetting: the instancer leaves delta-less glyphs out of gvar,
    # which the subsetter would then trip over.
    font = instancer.instantiateVariableFont(font, PINNED_AXES, inplace=True)
    font.flavor = "woff2"

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    font.save(OUT_FONT)
    MANIFEST.write_text("\n".join(icons) + "\n", encoding="utf-8")
    size_kib = OUT_FONT.stat().st_size / 1024
    print(f"{len(icons)} icons → {OUT_FONT.relative_to(ROOT)} ({size_kib:.0f} KiB)")


def check() -> None:
    if not MANIFEST.exists():
        sys.exit(f"{MANIFEST.relative_to(ROOT)} missing — run scripts/subset-icons.py")
    shipped = set(MANIFEST.read_text(encoding="utf-8").split())
    glyph_names = set(load_font().getGlyphOrder())
    missing = sorted(set(used_icons(glyph_names)) - shipped)
    if missing:
        print("Icons used in source but not in the shipped subset:", file=sys.stderr)
        for name in missing:
            print(f"  {name}", file=sys.stderr)
        sys.exit("Regenerate with: python3 scripts/subset-icons.py")
    print(f"Icon subset check passed: {len(shipped)} icons shipped, none missing.")


if __name__ == "__main__":
    check() if "--check" in sys.argv[1:] else build()
