#!/usr/bin/env python3
"""
export_series_to_sql.py
=======================
Turns a scraped + normalised `za-tv-db` export (data/series.json) into a plain
SQL file with one INSERT per TV series, written straight into the project's
migrations folder — the TV counterpart of export_films_to_sql.py.

Typical flow (after running the TV scraper, which writes
`za-tv-db/data/series.json`):

    python scripts/export_series_to_sql.py /path/to/za-tv-db

By default the file is written to
`supabase/migrations/<UTC timestamp>_za_series_data.sql`. Hand the updated
project to Lovable and the migration gets applied to the app database — no
import token, no running app required.

The statements are upserts keyed on the series id, so regenerating and
re-applying an unchanged export is safe: existing series are updated in place
and nothing is duplicated.
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from publish_to_archive import norm_title  # shared title normalisation

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERIES_PER_STATEMENT = 25

COLUMNS = [
    "id", "title", "search_title", "year", "end_year", "format", "genres",
    "languages", "status", "seasons", "episodes", "runtime_minutes",
    "summary", "imdb_id", "wikidata_id", "category", "data",
]

UPDATE_SET = ", ".join(
    f"{col} = EXCLUDED.{col}" for col in COLUMNS if col != "id"
)


def sql_str(value) -> str:
    """Quote a text value as a SQL string literal (standard_conforming_strings=on)."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_text_array(values) -> str:
    if not values:
        return "'{}'::text[]"
    return "ARRAY[" + ", ".join(sql_str(v) for v in values) + "]::text[]"


def to_row(series: dict) -> dict:
    titles = series.get("titles") or {}
    title = titles.get("original") or titles.get("english") or series["id"]
    ext = series.get("external_ids") or {}
    counts = series.get("counts") or {}
    dates = series.get("dates") or {}
    first = str(dates.get("first_aired") or "")[:4]
    last = str(dates.get("last_aired") or "")[:4]
    year = int(first) if first.isdigit() else 0
    end_year = int(last) if last.isdigit() and last != first else None
    return {
        "id": series["id"],
        "title": title,
        "search_title": norm_title(title) or norm_title(titles.get("english") or ""),
        "year": year,
        "end_year": end_year,
        "format": series.get("format") or "series",
        "genres": series.get("genres") or [],
        "languages": (series.get("languages") or {}).get("spoken") or [],
        "status": series.get("status") or "ended",
        "seasons": counts.get("seasons"),
        "episodes": counts.get("episodes"),
        "runtime_minutes": counts.get("episode_runtime_minutes"),
        "summary": series.get("summary"),
        "imdb_id": ext.get("imdb"),
        "wikidata_id": ext.get("wikidata"),
        "category": (series.get("scope") or {}).get("category") or "sa_production",
        "data": series,
    }


def row_to_values(row: dict) -> list[str]:
    return [
        sql_str(row["id"]),
        sql_str(row["title"]),
        sql_str(row["search_title"]),
        str(int(row["year"])),
        sql_str(row["end_year"]),
        sql_str(row["format"]),
        sql_text_array(row["genres"]),
        sql_text_array(row["languages"]),
        sql_str(row["status"]),
        sql_str(row["seasons"]),
        sql_str(row["episodes"]),
        sql_str(row["runtime_minutes"]),
        sql_str(row["summary"]),
        sql_str(row["imdb_id"]),
        sql_str(row["wikidata_id"]),
        sql_str(row["category"]),
        sql_str(json.dumps(row["data"], ensure_ascii=False, separators=(",", ":"))) + "::jsonb",
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db_dir", help="Path to the za-tv-db export folder")
    parser.add_argument("--out", default=None,
                        help="Output SQL path (default: supabase/migrations/<UTC timestamp>_za_series_data.sql)")
    parser.add_argument("--limit", type=int, default=None, help="Only export the first N series (for testing)")
    args = parser.parse_args()

    series_path = os.path.join(args.db_dir, "data", "series.json")
    with open(series_path, encoding="utf-8") as f:
        series = json.load(f)
    if args.limit:
        series = series[: args.limit]
    rows = [to_row(s) for s in series]
    bad = [r for r in rows if not re.match(r"^za_tv_[0-9a-f]{8}$", r["id"]) or not (1890 <= r["year"] <= 2100)]
    if bad:
        print(f"ERROR: {len(bad)} rows fail the archive's id/year validation; fix the export first.", file=sys.stderr)
        for r in bad[:5]:
            print("  e.g.", r["id"], r["year"], file=sys.stderr)
        return 2
    print(f"Loaded {len(rows)} series from {series_path}")

    if args.out:
        out_path = args.out
    else:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        out_path = os.path.join(
            REPO_ROOT, "supabase", "migrations", f"{stamp}_za_series_data.sql"
        )
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)

    lines = [
        "-- Mzansi Film Archive: TV series data export (generated by scripts/export_series_to_sql.py)",
        f"-- Source: {series_path}",
        f"-- Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"-- Series: {len(rows)}",
        "--",
        "-- Upserts by series id: re-applying an unchanged export is safe and only",
        "-- new or changed series are written. Assumes the public.series schema from",
        "-- the create_series_table migration already exists.",
        "",
    ]

    for i in range(0, len(rows), SERIES_PER_STATEMENT):
        chunk = rows[i : i + SERIES_PER_STATEMENT]
        lines.append(
            "INSERT INTO public.series (" + ", ".join(COLUMNS) + ") VALUES"
        )
        for j, row in enumerate(chunk):
            values = ", ".join(row_to_values(row))
            lines.append(f"  ({values}){',' if j < len(chunk) - 1 else ''}")
        lines.append(f"ON CONFLICT (id) DO UPDATE SET {UPDATE_SET};")
        lines.append("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote {out_path} ({size_kb:.0f} KB, {len(rows)} series).")
    print("Apply it to the app database as the next step (see scripts/README.md).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
