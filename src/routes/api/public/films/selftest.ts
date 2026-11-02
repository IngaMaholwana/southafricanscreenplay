import { createFileRoute } from "@tanstack/react-router";

// TEMPORARY diagnostic route: round-trips three existing films through the
// real import endpoint to prove the authorized path works. Deleted after the
// test — do not ship.
export const Route = createFileRoute("/api/public/films/selftest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = process.env["FILM_IMPORT_TOKEN"];
        if (!token) return Response.json({ secretConfigured: false });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin
          .from("films")
          .select("id,title,search_title,year,format,genres,languages,runtime_minutes,summary,imdb_id,wikidata_id,category,data")
          .limit(3);
        if (error || !rows || rows.length === 0) {
          return Response.json({ error: "could not read films", detail: error?.message }, { status: 500 });
        }

        const origin = new URL(request.url).origin;
        const res = await fetch(`${origin}/api/public/films/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-import-token": token },
          body: JSON.stringify({ films: rows }),
        });
        const body = (await res.json()) as Record<string, unknown>;
        return Response.json({ secretConfigured: true, status: res.status, ...body });
      },
    },
  },
});
