#!/usr/bin/env python3
"""
publish_to_archive.py
=====================
Sends a scraped + normalised `za-film-db` export to the Mzansi Film Archive
import endpoint, so the app database is updated automatically.

Typical flow (after running scrape_and_normalize_za_films.py, which writes
`za-film-db/data/films.json`):

    export FILM_IMPORT_TOKEN="<same value as the project's FILM_IMPORT_TOKEN secret>"
    python scripts/publish_to_archive.py /path/to/za-film-db \
        --url http://localhost:8080            # local dev server
        # --url https://<preview-or-published-url>   for the live app

The endpoint upserts by film id, so re-publishing the same export is safe and
only new/changed films are updated.
"""

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request

BATCH_SIZE = 50


def norm_title(title: str) -> str:
    """Mirrors the scraper's normalisation key for title search."""
    s = unicodedata.normalize("NFC", (title or "")).strip().lower()
    s = re.sub(r"\s*\((?:\d{4}[^)]*|[^)]*film[^)]*|[^)]*rolprent[^)]*)\)\s*", " ", s).strip()
    for a in ("the ", "die ", "'n ", "\u2019n "):
        if s.startswith(a):
            s = s[len(a):].strip()
            break
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def to_row(film: dict) -> dict:
    titles = film.get("titles") or {}
    title = titles.get("original") or titles.get("english") or film["id"]
    ext = film.get("external_ids") or {}
    return {
        "id": film["id"],
        "title": title,
        "search_title": norm_title(title) or norm_title(titles.get("english") or ""),
        "year": int(film["year"]),
        "format": film.get("format") or "feature",
        "genres": film.get("genres") or [],
        "languages": (film.get("languages") or {}).get("spoken") or [],
        "runtime_minutes": film.get("runtime_minutes"),
        "summary": film.get("summary"),
        "imdb_id": ext.get("imdb"),
        "wikidata_id": ext.get("wikidata"),
        "category": (film.get("scope") or {}).get("category") or "sa_production",
        "data": film,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_dir", help="Path to the za-film-db export folder")
    parser.add_argument("--url", default=os.environ.get("ARCHIVE_URL", "http://localhost:8080"),
                        help="Base URL of the archive app")
    parser.add_argument("--batch", type=int, default=BATCH_SIZE, help="Films per request (max 200)")
    parser.add_argument("--limit", type=int, default=None, help="Only send the first N films (for testing)")
    args = parser.parse_args()

    token = os.environ.get("FILM_IMPORT_TOKEN")
    if not token:
        print("ERROR: set FILM_IMPORT_TOKEN to the project's import secret "
              "(see scripts/README.md).", file=sys.stderr)
        return 2

    films_path = os.path.join(args.db_dir, "data", "films.json")
    with open(films_path, encoding="utf-8") as f:
        films = json.load(f)
    if args.limit:
        films = films[: args.limit]
    rows = [to_row(film) for film in films]
    print(f"Loaded {len(rows)} films from {films_path}")

    endpoint = args.url.rstrip("/") + "/api/public/films/import"
    ok = failed = 0
    for i in range(0, len(rows), max(1, min(args.batch, 200))):
        batch = rows[i : i + max(1, min(args.batch, 200))]
        req = urllib.request.Request(
            endpoint,
            data=json.dumps({"films": batch}).encode(),
            headers={"Content-Type": "application/json", "x-import-token": token},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode())
            ok += body.get("imported", 0)
            print(f"  batch {i // args.batch + 1}: imported {body.get('imported', 0)}")
        except urllib.error.HTTPError as e:
            failed += len(batch)
            print(f"  batch {i // args.batch + 1}: HTTP {e.code} — {e.read().decode(errors='replace')[:200]}")
        except Exception as e:
            failed += len(batch)
            print(f"  batch {i // args.batch + 1}: {e}")

    print(f"Done: {ok} imported, {failed} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
