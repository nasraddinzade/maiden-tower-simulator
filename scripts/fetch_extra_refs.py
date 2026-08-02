#!/usr/bin/env python3
"""
fetch_extra_refs.py

Fetches free-licensed reference photos that live OUTSIDE Wikimedia Commons
(so fetch_maiden_tower.py cannot reach them) and appends their attribution to
the same reference-photos/attribution.csv.

Interior views of the Maiden Tower are scarce on Commons (12 files total), so
these fill real gaps — the staircase looking down, the vaulted passage, and the
inner wall surface under lamplight.

Every entry here MUST be a verified free licence; each licence below was checked
against the source page. CC BY requires crediting the author in the app.

Run:
    python scripts/fetch_extra_refs.py --out reference-photos
"""

import argparse
import csv
import os
import sys
import time

try:
    import requests
except ImportError:
    sys.exit("Сначала: pip install requests")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Wikimedia's User-Agent policy requires a real contact address, and rejects
# placeholders with a 403 that reads as "no files found" rather than as an error.
# The address is kept OUT of the source so a public checkout carries nobody's.
UA = os.environ.get("WIKIMEDIA_UA")
if not UA:
    raise SystemExit(
        "WIKIMEDIA_UA is not set. Wikimedia refuses downloads without a real "
        "contact in the User-Agent, and refuses them with a 403 that looks like "
        "an empty result. Set it first, for example:\n"
        "  set WIKIMEDIA_UA=MaidenTowerRecon/1.0 (educational reconstruction; you@example.org)"
    )

# folder, filename, direct url, author, licence, licence url, source page, what it shows
EXTRA = [
    ("interior", "flickr_jb_inside_maiden_tower_1.jpg",
     "https://live.staticflickr.com/1208/1391181345_f928084d07_b.jpg",
     "jb (ritingon)", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/",
     "https://www.flickr.com/photos/64304130@N00/1391181345/",
     "inner wall surface lit by a hanging lamp — wall texture / low-light reference"),
    ("interior", "flickr_jb_inside_maiden_tower_2_staircase.jpg",
     "https://live.staticflickr.com/1156/1391202731_ed55f9b812_k.jpg",
     "jb (ritingon)", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/",
     "https://www.flickr.com/photos/64304130@N00/1391202731/",
     "spiral stair seen from above — wedge treads, newel side, handrail; shows winding direction"),
    ("interior", "flickr_adamharvey_inside_maiden_tower_passage.jpg",
     "https://live.staticflickr.com/3133/2704438158_bb1838d3d8_o.jpg",
     "Adam Harvey (L Gnome)", "CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/",
     "https://www.flickr.com/photos/23553187@N06/2704438158/",
     "barrel-vaulted passage with stone steps up to an arched grilled opening"),
]

FIELDS = ["folder", "file", "author", "license", "license_url",
          "credit", "date", "width", "height", "commons_page"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="./reference-photos")
    args = ap.parse_args()

    session = requests.Session()
    session.headers.update({"User-Agent": UA})

    rows = []
    for folder, fn, url, author, lic, lic_url, page, shows in EXTRA:
        dest = os.path.join(args.out, folder)
        os.makedirs(dest, exist_ok=True)
        path = os.path.join(dest, fn)
        if not os.path.exists(path):
            try:
                r = session.get(url, timeout=90)
                r.raise_for_status()
                with open(path, "wb") as f:
                    f.write(r.content)
                time.sleep(0.25)
            except Exception as e:
                print(f"  ! {fn}: {e}")
                continue
        size = os.path.getsize(path)
        print(f"  ok {fn}  ({size // 1024} KB)  [{lic}]")
        rows.append({
            "folder": folder, "file": fn, "author": author, "license": lic,
            "license_url": lic_url, "credit": shows, "date": "",
            "width": "", "height": "", "commons_page": page,
        })

    # Merge into the shared attribution file without clobbering existing entries.
    csv_path = os.path.join(args.out, "attribution.csv")
    existing = []
    if os.path.exists(csv_path):
        touched = {(r["folder"], r["file"]) for r in rows}
        with open(csv_path, newline="", encoding="utf-8") as f:
            existing = [r for r in csv.DictReader(f)
                        if (r.get("folder"), r.get("file")) not in touched]

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(existing + rows)

    print(f"\nГотово: {len(rows)} файлов; атрибуция дописана в {csv_path}")


if __name__ == "__main__":
    main()
