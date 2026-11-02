# Film scraping → archive pipeline

Two scripts keep the Mzansi Film Archive catalogue up to date:

1. **`scrape_and_normalize_za_films.py`** — the full harvesting, normalisation and
   entity-resolution pipeline. It writes a `za-film-db/` export whose
   `data/films.json` is the canonical dataset.

2. **`publish_to_archive.py`** — sends that export to the app's import endpoint
   (`/api/public/films/import`), which verifies a shared secret and upserts the
   films straight into the app database. Newly imported films appear in the app
   immediately — no manual data steps.

## Run it

```bash
# 1. Scrape and normalise (writes za-film-db/data/films.json)
python scripts/scrape_and_normalize_za_films.py

# 2. Push the result to the archive
export FILM_IMPORT_TOKEN="<the project's FILM_IMPORT_TOKEN secret>"
python scripts/publish_to_archive.py ./za-film-db --url http://localhost:8080
```

- `--url` — the app to load into. `http://localhost:8080` for the dev server;
  use the published app URL once the project is live (also settable via
  `ARCHIVE_URL`).
- `--limit N` — send only the first N films, handy for a dry run.
- Upserts are keyed on the film id, so re-running with an unchanged export is
  safe; only new or changed films are updated.

## The shared secret

The import endpoint rejects every request that doesn't send
`x-import-token: <FILM_IMPORT_TOKEN>`, so only someone with the project's
secret can change the catalogue. Set the same value in the project's secret
store (FILM_IMPORT_TOKEN) and in your terminal's `FILM_IMPORT_TOKEN` variable
before publishing. The project never displays the token in the app.
