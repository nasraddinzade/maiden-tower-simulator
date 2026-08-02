#!/usr/bin/env python3
"""
fetch_maiden_tower.py

Собирает фотографии Девичьей башни (Qız Qalası, Баку) с Wikimedia Commons
через официальный MediaWiki API, складывает их в папки по категориям
и пишет attribution.csv с автором/лицензией для каждого файла.

Всё, что скачивается отсюда — свободные лицензии (CC BY-SA / CC0 / PD).
Их МОЖНО использовать как референс и даже в продукте, при соблюдении
условий лицензии (указание автора + ShareAlike там, где он есть).

Запуск:
    pip install requests
    python fetch_maiden_tower.py

Опции:
    --min-width 1200     минимальная ширина файла (по умолчанию 800)
    --out ./photos       куда складывать
    --limit 0            максимум файлов на категорию (0 = без лимита)
"""

import argparse
import csv
import os
import re
import sys
import time
from urllib.parse import unquote

try:
    import requests
except ImportError:
    sys.exit("Сначала: pip install requests")

# Windows consoles default to cp1252 and blow up on the Russian progress output.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia's User-Agent policy requires a real contact address, and rejects
# placeholders with a 403 that reads as "no files found" rather than as an error
# — which is exactly how this script once produced zero downloads and exit 0.
# The address is kept OUT of the source so a public checkout carries nobody's.
UA = os.environ.get("WIKIMEDIA_UA")
if not UA:
    raise SystemExit(
        "WIKIMEDIA_UA is not set. Wikimedia refuses downloads without a real "
        "contact in the User-Agent, and refuses them with a 403 that looks like "
        "an empty result. Set it first, for example:\n"
        "  set WIKIMEDIA_UA=MaidenTowerRecon/1.0 (educational reconstruction; you@example.org)"
    )

# Категории на Commons. Первые две — самое ценное для интерьера.
CATEGORIES = {
    # Commons renamed these with a ", Baku" suffix; the old titles resolve to
    # empty categories and silently yielded zero interior photos.
    "interior":   "Category:Interior of the Maiden Tower, Baku",
    "exterior":   "Category:Maiden Tower, Baku",
    "views_from": "Category:Views from the Maiden Tower, Baku",
    "historical": "Category:Historical images of Maiden Tower, Baku",
    "plans":      "Category:Plans of Maiden Tower, Baku",
    "in_art":     "Category:Maiden Tower, Baku in art",
    "old_city":   "Category:Icheri Sheher",          # контекст вокруг башни
    "wlm_az":     "Category:Images from Wiki Loves Monuments 2019 in Azerbaijan",
}

# Категории, которые обычно шумные — берём с лимитом
NOISY = {"old_city", "wlm_az"}

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})


def api(params):
    params = {**params, "format": "json", "formatversion": "2"}
    for attempt in range(4):
        try:
            r = SESSION.get(API, params=params, timeout=45)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    return {}


def category_files(category, recurse_depth=1, _seen=None):
    """Все файлы категории + подкатегорий на глубину recurse_depth."""
    if _seen is None:
        _seen = set()
    if category in _seen:
        return []
    _seen.add(category)

    files, subcats, cont = [], [], {}
    while True:
        data = api({
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category,
            "cmlimit": "500",
            "cmtype": "file|subcat",
            **cont,
        })
        for m in data.get("query", {}).get("categorymembers", []):
            (subcats if m["title"].startswith("Category:") else files).append(m["title"])
        if "continue" in data:
            cont = data["continue"]
        else:
            break

    if recurse_depth > 0:
        for sc in subcats:
            files.extend(category_files(sc, recurse_depth - 1, _seen))
    return files


def file_info(titles):
    """imageinfo пачками по 50."""
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        data = api({
            "action": "query",
            "titles": "|".join(chunk),
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": "2400",
        })
        for page in data.get("query", {}).get("pages", []):
            ii = (page.get("imageinfo") or [None])[0]
            if ii:
                out[page["title"]] = ii
        time.sleep(0.2)
    return out


def meta(ii, key, default=""):
    v = ii.get("extmetadata", {}).get(key, {}).get("value", default)
    return re.sub(r"<[^>]+>", "", str(v)).strip()


def safe_name(title):
    name = unquote(title.replace("File:", "")).replace("/", "_")
    return re.sub(r'[<>:"\\|?*]', "_", name)[:150]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="./maiden_tower_photos")
    ap.add_argument("--min-width", type=int, default=800)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", default="",
                    help="comma-separated folder keys to fetch (e.g. interior,historical); default: all")
    args = ap.parse_args()

    only = {k.strip() for k in args.only.split(",") if k.strip()}
    if only:
        unknown = only - set(CATEGORIES)
        if unknown:
            sys.exit(f"неизвестные категории: {', '.join(sorted(unknown))}; "
                     f"доступны: {', '.join(CATEGORIES)}")

    os.makedirs(args.out, exist_ok=True)
    rows, total = [], 0

    for folder, cat in CATEGORIES.items():
        if only and folder not in only:
            continue
        print(f"\n=== {cat}")
        try:
            titles = category_files(cat, recurse_depth=1)
        except Exception as e:
            print(f"  пропуск ({e})")
            continue

        titles = [t for t in titles
                  if t.lower().endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"))]
        cap = args.limit or (120 if folder in NOISY else 0)
        if cap:
            titles = titles[:cap]
        print(f"  найдено файлов: {len(titles)}")

        infos = file_info(titles)
        dest = os.path.join(args.out, folder)
        os.makedirs(dest, exist_ok=True)

        for title, ii in infos.items():
            if ii.get("width", 0) < args.min_width:
                continue
            url = ii.get("thumburl") or ii["url"]
            fn = safe_name(title)
            path = os.path.join(dest, fn)
            if not os.path.exists(path):
                try:
                    r = SESSION.get(url, timeout=90)
                    r.raise_for_status()
                    with open(path, "wb") as f:
                        f.write(r.content)
                    time.sleep(0.25)
                except Exception as e:
                    print(f"  ! {fn}: {e}")
                    continue
            total += 1
            rows.append({
                "folder": folder,
                "file": fn,
                "author": meta(ii, "Artist"),
                "license": meta(ii, "LicenseShortName"),
                "license_url": meta(ii, "LicenseUrl"),
                "credit": meta(ii, "Credit"),
                "date": meta(ii, "DateTimeOriginal"),
                "width": ii.get("width"),
                "height": ii.get("height"),
                "commons_page": ii.get("descriptionurl", ""),
            })
            print(f"  ok {fn}  ({ii.get('width')}x{ii.get('height')})")

    csv_path = os.path.join(args.out, "attribution.csv")
    fields = ["folder", "file", "author", "license", "license_url",
              "credit", "date", "width", "height", "commons_page"]

    # A partial run (--only) must not wipe attribution for the folders it skipped:
    # CC BY-SA compliance depends on this file staying complete.
    if only and os.path.exists(csv_path):
        touched = {(r["folder"], r["file"]) for r in rows}
        with open(csv_path, newline="", encoding="utf-8") as f:
            kept = [r for r in csv.DictReader(f)
                    if (r.get("folder"), r.get("file")) not in touched]
        rows = kept + rows

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    print(f"\nГотово: {total} файлов -> {args.out}")
    print(f"Атрибуция: {csv_path}")
    print("Не удаляй attribution.csv — CC BY-SA требует указания автора в приложении.")


if __name__ == "__main__":
    main()
