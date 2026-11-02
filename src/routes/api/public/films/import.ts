import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

/**
 * Film import endpoint for the scraping pipeline.
 *
 * `scripts/publish_to_archive.py` (run after `scripts/scrape_and_normalize_za_films.py`)
 * POSTs batches of normalised film rows here. The caller must send the shared
 * secret in the `x-import-token` header; the same value is stored as the
 * project's FILM_IMPORT_TOKEN secret.
 */

const filmRowSchema = z.object({
  id: z.string().regex(/^za_film_[0-9a-f]{8}$/),
  title: z.string().min(1).max(500),
  search_title: z.string().max(500),
  year: z.number().int().min(1890).max(2100),
  format: z.string().max(50),
  genres: z.array(z.string().max(100)).max(20),
  languages: z.array(z.string().max(100)).max(20),
  runtime_minutes: z.number().int().min(1).max(1000).nullable().optional(),
  summary: z.string().max(5000).nullable().optional(),
  imdb_id: z.string().max(20).nullable().optional(),
  wikidata_id: z.string().max(20).nullable().optional(),
  category: z.string().max(60),
  data: z.record(z.unknown()),
});

const importBodySchema = z.object({
  films: z.array(filmRowSchema).min(1).max(200),
});

function isAuthorized(request: Request): boolean {
  const expected = process.env["FILM_IMPORT_TOKEN"];
  const provided = request.headers.get("x-import-token");
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/films/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let parsed: z.infer<typeof importBodySchema>;
        try {
          parsed = importBodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid payload" }, { status: 400 });
        }

        // Privileged upsert only after the caller is verified; load the
        // service-role client inside the handler, never at module scope.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rows = parsed.films.map((f) => ({
          id: f.id,
          title: f.title,
          search_title: f.search_title,
          year: f.year,
          format: f.format,
          genres: f.genres,
          languages: f.languages,
          runtime_minutes: f.runtime_minutes ?? null,
          summary: f.summary ?? null,
          imdb_id: f.imdb_id ?? null,
          wikidata_id: f.wikidata_id ?? null,
          category: f.category,
          data: f.data as unknown as Json,
        }));
        const { error } = await supabaseAdmin.from("films").upsert(rows, { onConflict: "id" });
        if (error) {
          console.error("film import failed:", error.message);
          return Response.json({ error: "Import failed" }, { status: 500 });
        }

        return Response.json({ imported: parsed.films.length });
      },
    },
  },
});
