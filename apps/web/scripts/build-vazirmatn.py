#!/usr/bin/env python3
"""
Build the app's Vazirmatn webfonts from the standard TTF release.

The standard build draws 0-9 as Latin digits and keeps ۰-۹ behind the
`ss01` feature, which the app cannot rely on: Material sets component type
with the `font:` shorthand, and that resets `font-feature-settings`. So the
digits are baked in instead — the cmap entries for U+0030-0039 are pointed at
the Persian digit glyphs (uni06F0-uni06F9). Text stays ASCII; only its
outlines change. This is what the author's own "Farsi Digits" build does.

Usage (from apps/web):
  python scripts/build-vazirmatn.py <folder with Vazirmatn-*.ttf>

Writes src/fonts/vazirmatn/Vazirmatn-<Weight>.woff2.
Requires `pip install fonttools brotli`.
"""
from __future__ import annotations

import sys
from pathlib import Path

from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parents[1] / "src/fonts/vazirmatn"


def persian_digits(font: TTFont) -> None:
    for table in font["cmap"].tables:
        if not table.isUnicode():
            continue
        for d in range(10):
            persian = f"uni06F{d}"
            if 0x30 + d in table.cmap and persian in font.getGlyphOrder():
                table.cmap[0x30 + d] = persian


def main(source: str) -> None:
    files = sorted(Path(source).glob("Vazirmatn-*.ttf"))
    if not files:
        sys.exit(f"no Vazirmatn-*.ttf in {source}")
    OUT.mkdir(parents=True, exist_ok=True)
    for path in files:
        font = TTFont(path)
        persian_digits(font)
        font.flavor = "woff2"
        target = OUT / f"{path.stem}.woff2"
        font.save(target)
        print(f"{target.name}  {target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
