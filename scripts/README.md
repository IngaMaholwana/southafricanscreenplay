# Film scraping → archive pipeline

Scripts that keep the Mzansi Film Archive catalogue up to date:

1. **`scrape_and_normalize_za_films.py`** — the full harvesting, normalisation and
   entity-resolution pipeline. It writes a `za-film-db/` export whose
   `data/films.json` is the canonical dataset.

2. **`export_films_to_sql.py`** — turns that export into a plain SQL file
   (one INSERT per film, upserts keyed on the film id) written straight into
   the project's migrations folder, the same way
   `20261102000000_za_films_seed.sql` loaded the original catalogue.
   **This is the default way to load film data — no token, no running app.**

3. **`publish_to_archive.py`** (fallback) — sends the export to the running
   app's import endpoint (`/api/public/films/import`), which verifies a shared
   secret and upserts the films straight into the app database. Useful only
   when you want to push data to a live URL yourself.

## Run it

```bash
# 1. Scrape and normalise (writes za-film-db/data/films.json)
python scripts/scrape_and_normalize_za_films.py

# 2. Write the film SQL into the project's migrations folder
python scripts/export_films_to_sql.py ./za-film-db
# → supabase/migrations/<UTC timestamp>_za_films_data.sql
```

Then share the updated project (or the generated SQL file) with Lovable and
the films are loaded into the app database. Because the statements are
upserts keyed on the film id, re-applying an unchanged export is safe — only
new or changed films are written.

Options:

- `--out PATH` — write the SQL somewhere other than the migrations folder.
- `--limit N` — only export the first N films, handy for a dry run.

## The SQL file

The generated file contains `INSERT INTO public.films ... ON CONFLICT (id)
DO UPDATE SET ...` statements in batches of 25 films. It assumes the schema
from `20261102000000_za_films_seed.sql` already exists (it does — that
migration created the table and its indexes). Do not edit the generated file
by hand; regenerate it from `za-film-db/data/films.json` instead.

## The import endpoint (fallback, uses a token)

`/api/public/films/import` rejects every request that doesn't send
`x-import-token: <FILM_IMPORT_TOKEN>`, so only someone with the project's
secret can change the catalogue through the running app. Set the same value
in the project's secret store (FILM_IMPORT_TOKEN) and in your terminal's
`FILM_IMPORT_TOKEN` variable before publishing:

```bash
export FILM_IMPORT_TOKEN="<the project's FILM_IMPORT_TOKEN secret>"
python scripts/publish_to_archive.py ./za-film-db --url http://localhost:8080
```

- `--url` — the app to load into. `http://localhost:8080` for the dev server;
  use the published app URL once the project is live (also settable via
  `ARCHIVE_URL`).
- `--limit N` — send only the first N films, handy for a dry run.
