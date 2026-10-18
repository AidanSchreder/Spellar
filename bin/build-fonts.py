#!/usr/bin/env python
"""Builds the self-hosted display font: one weight of Cormorant Garamond, Basic Latin only, WOFF2.

    python bin/build-fonts.py              -> assets/fonts/cormorant-garamond-<weight>.woff2
    python bin/build-fonts.py --compare    -> dev/out/fonts/ (all candidates, for the wordmark study)

Needs fontTools and brotli (python -m pip install --user fonttools brotli). The variable source
fonts come from github.com/google/fonts (SIL Open Font License) and are kept, uncommitted, in
dev/fonts-src/; the script downloads them when they are missing.
"""

import io
import os
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "dev", "fonts-src")
BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"

FONTS = {
    "cormorant-garamond": ("cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf", "CormorantGaramond-VF.ttf"),
    "eb-garamond": ("ebgaramond/EBGaramond%5Bwght%5D.ttf", "EBGaramond-VF.ttf"),
    "playfair-display": ("playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf", "PlayfairDisplay-VF.ttf"),
}

# The weight that ships. Change it here, rebuild, and update the @font-face rule in spellar.css.
SHIP = ("cormorant-garamond", 600)

COMPARE = [
    ("cormorant-garamond", 500), ("cormorant-garamond", 600), ("cormorant-garamond", 700),
    ("eb-garamond", 500), ("playfair-display", 500),
]

BASIC_LATIN = list(range(0x20, 0x7F))


def source(name):
    path, filename = FONTS[name]
    local = os.path.join(SRC, filename)
    if not os.path.exists(local):
        os.makedirs(SRC, exist_ok=True)
        print("Downloading", filename)
        urllib.request.urlretrieve(BASE + path, local)
    return local


def build(name, weight, out_dir):
    font = TTFont(source(name))
    font = instancer.instantiateVariableFont(font, {"wght": weight})
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "calt"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6]  # keep the copyright and licence-relevant names
    options.notdef_outline = True
    sub = subset.Subsetter(options)
    sub.populate(unicodes=BASIC_LATIN)
    sub.subset(font)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{name}-{weight}.woff2")
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    with open(out, "wb") as fh:
        fh.write(buf.getvalue())
    print(f"{os.path.relpath(out, ROOT)}  {len(buf.getvalue()):,} bytes")


if __name__ == "__main__":
    if "--compare" in sys.argv:
        for name, weight in COMPARE:
            build(name, weight, os.path.join(ROOT, "dev", "out", "fonts"))
    else:
        build(*SHIP, os.path.join(ROOT, "assets", "fonts"))
