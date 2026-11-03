<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Film archive

- The film catalogue is read-only reference data: schema + all 974 film rows live in `supabase/migrations/20261102000000_za_films_seed.sql` (applied via a database migration; rows also loaded once through the Data API with the service role). Never seed films on page load or through server functions.
- All film reads go through the server functions in `src/lib/films.functions.ts` using the publishable-key client (films table is anon-readable via RLS). Don't query the films table from route loaders or browser code directly.
- Catalogue updates flow through `scripts/scrape_and_normalize_za_films.py` → `scripts/export_films_to_sql.py`, which writes a full upsert SQL file into `supabase/migrations/<timestamp>_za_films_data.sql` (same row mapping as the seed; upserts keyed on film id, schema assumed from the seed migration). That SQL file is the default load path — applied through the privileged database tools by the agent; no token needed. `scripts/publish_to_archive.py` → POST `/api/public/films/import` (TanStack server route, `x-import-token` checked against the FILM_IMPORT_TOKEN secret, timing-safe) remains the fallback for pushing to a running URL. Never weaken that token check, never seed films on page load or through server functions, and don't hand-edit generated SQL exports — regenerate them from `za-film-db/data/films.json`.
