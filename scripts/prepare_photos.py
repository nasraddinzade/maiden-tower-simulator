#!/usr/bin/env python3
"""
prepare_photos.py

Picks the handful of reference photographs the app actually shows, downscales
them into public/photos/, and writes src/data/attribution.json with the author
and licence of each one.

Why a script rather than shipping reference-photos/ wholesale:
  - that folder is ~600 MB and gitignored;
  - it also contains reference-photos/_research-only/, which is NOT freely
    licensed and must never reach the build. This script only ever reads the
    curated list below, so an unlicensed file cannot leak in by accident.

Attribution is a licence condition for CC BY / CC BY-SA, not a nicety: the file
this writes is what the credits screen renders.

Run:
    python scripts/prepare_photos.py
"""

import csv
import json
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Сначала: pip install pillow")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "reference-photos")
OUT_DIR = os.path.join(ROOT, "public", "photos")
ATTRIBUTION_OUT = os.path.join(ROOT, "src", "data", "attribution.json")
MAX_WIDTH = 1400

# (hotspot id, folder, source filename, output name)
# Every entry must be a freely licensed file from reference-photos/, never from
# reference-photos/_research-only/.
SELECTED = [
    ("cupola-oculus", "interior", "Baku Maiden Tower floor.JPG", "cupola-oculus.jpg"),
    ("well", "interior", "Qız qalası.3 cü mərtəbə.jpg", "well.jpg"),
    ("staircase", "interior", "Qız qalası mərtəbələrarası pilləkən.JPG", "staircase.jpg"),
    ("window-niche", "interior", "Inside of Maiden Tower in Baku.JPG", "window-niche.jpg"),
    ("slits", "exterior", "Old City, Baku- Part I - OldCityBaku8362.jpg", "slits.jpg"),
    ("entrance", "exterior",
     "Torre de la Doncella, Baku, Azerbaiyán, 2016-09-26, DD 06.jpg", "entrance.jpg"),
    ("buttress", "exterior", "Baku Maiden Tower 004 7736.jpg", "buttress.jpg"),
    ("section", "plans", "Jungfrauenbastei.png", "section.jpg"),
]

FREE_LICENCE_MARKERS = ("cc by", "cc0", "public domain", "no restrictions")


def load_attribution():
    path = os.path.join(SRC, "attribution.csv")
    if not os.path.exists(path):
        sys.exit(f"нет {path} — сначала запусти scripts/fetch_maiden_tower.py")
    rows = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows[(r.get("folder"), r.get("file"))] = r
    return rows


def main():
    attribution = load_attribution()
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = []
    missing = []

    for hotspot_id, folder, filename, out_name in SELECTED:
        src_path = os.path.join(SRC, folder, filename)
        if not os.path.exists(src_path):
            missing.append(f"{folder}/{filename}")
            continue

        meta = attribution.get((folder, filename))
        if not meta:
            print(f"  ! {filename}: нет записи в attribution.csv — пропуск")
            continue

        licence = (meta.get("license") or "").strip()
        if not any(m in licence.lower() for m in FREE_LICENCE_MARKERS):
            print(f"  ! {filename}: лицензия «{licence}» не свободная — пропуск")
            continue

        im = Image.open(src_path).convert("RGB")
        if im.width > MAX_WIDTH:
            h = round(im.height * MAX_WIDTH / im.width)
            im = im.resize((MAX_WIDTH, h), Image.LANCZOS)
        out_path = os.path.join(OUT_DIR, out_name)
        im.save(out_path, "JPEG", quality=82, optimize=True)

        kb = os.path.getsize(out_path) // 1024
        print(f"  ok {out_name:20s} {im.width}x{im.height}  {kb:4d} KB  [{licence}]")

        manifest.append({
            "hotspotId": hotspot_id,
            "file": f"photos/{out_name}",
            "author": meta.get("author") or "—",
            "license": licence,
            "licenseUrl": meta.get("license_url") or "",
            "sourcePage": meta.get("commons_page") or "",
        })

    if missing:
        print("\nне найдено (запусти fetch-скрипты):")
        for m in missing:
            print("  -", m)

    os.makedirs(os.path.dirname(ATTRIBUTION_OUT), exist_ok=True)
    with open(ATTRIBUTION_OUT, "w", encoding="utf-8") as f:
        json.dump({"photos": manifest}, f, ensure_ascii=False, indent=2)

    print(f"\nГотово: {len(manifest)} фото -> public/photos/")
    print(f"Атрибуция -> {ATTRIBUTION_OUT}")


if __name__ == "__main__":
    main()
