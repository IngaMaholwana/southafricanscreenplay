import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const FILMS_PAGE_SIZE = 24;

const searchInputSchema = z.object({
  q: z.string().optional().default(""),
  genres: z.array(z.string()).optional().default([]),
  languages: z.array(z.string()).optional().default([]),
  formats: z.array(z.string()).optional().default([]),
  yearFrom: z.number().optional().default(0),
  yearTo: z.number().optional().default(0),
  sort: z.string().optional().default("newest"),
  page: z.number().optional().default(1),
});

export type SearchFilmsInput = z.infer<typeof searchInputSchema>;

export type FilmSummary = {
  id: string;
  title: string;
  year: number;
  format: string;
  genres: string[];
  languages: string[];
  runtime_minutes: number | null;
  summary: string | null;
  category: string;
};

export type SearchFilmsResult = {
  films: FilmSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type FilmDetail = {
  id: string;
  title: string;
  search_title: string;
  year: number;
  format: string;
  genres: string[];
  languages: string[];
  runtime_minutes: number | null;
  summary: string | null;
  imdb_id: string | null;
  wikidata_id: string | null;
  category: string;
  data: unknown;
};

export type FacetBucket = { name: string; count: number };

export type Facets = {
  genres: FacetBucket[];
  languages: FacetBucket[];
  formats: FacetBucket[];
  total: number;
};

/**
 * Public read-only Data API client for server code. Opaque `sb_` keys are not
 * JWTs, so send only `apikey` (never the default Authorization bearer).
 */
function createPublicClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Search text that is safe inside a PostgREST `.or()` filter string. */
function cleanQuery(raw: string): string {
  return raw
    .replace(/[,()%\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export const searchFilms = createServerFn({ method: "GET" })
  .inputValidator((input) => searchInputSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<SearchFilmsResult> => {
    const supabase = createPublicClient();

    let query = supabase
      .from("films")
      .select("id,title,year,format,genres,languages,runtime_minutes,summary,category", {
        count: "exact",
      });

    const q = cleanQuery(data.q);
    if (q) {
      query = query.or(`search_title.ilike.%${q}%,title.ilike.%${q}%`);
    }
    if (data.genres.length > 0) {
      query = query.overlaps("genres", data.genres);
    }
    if (data.languages.length > 0) {
      query = query.overlaps("languages", data.languages);
    }
    if (data.formats.length > 0) {
      query = query.in("format", data.formats);
    }
    const yearFrom = Math.trunc(data.yearFrom);
    const yearTo = Math.trunc(data.yearTo);
    if (yearFrom > 0) {
      query = query.gte("year", yearFrom);
    }
    if (yearTo > 0) {
      query = query.lte("year", yearTo);
    }

    const sort = data.sort;
    if (sort === "oldest") {
      query = query.order("year", { ascending: true }).order("title", { ascending: true });
    } else if (sort === "title") {
      query = query.order("title", { ascending: true }).order("year", { ascending: true });
    } else {
      query = query.order("year", { ascending: false }).order("title", { ascending: true });
    }

    const page = Math.max(1, Math.trunc(data.page) || 1);
    const from = (page - 1) * FILMS_PAGE_SIZE;
    query = query.range(from, from + FILMS_PAGE_SIZE - 1);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    return {
      films: (rows ?? []) as FilmSummary[],
      total: count ?? 0,
      page,
      pageSize: FILMS_PAGE_SIZE,
    };
  });

export const getFilm = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }): Promise<FilmDetail | null> => {
    const supabase = createPublicClient();
    const { data: row, error } = await supabase
      .from("films")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as FilmDetail) ?? null;
  });

export const getFacets = createServerFn({ method: "GET" }).handler(async (): Promise<Facets> => {
  const supabase = createPublicClient();
  const { data: rows, error } = await supabase.from("films").select("genres,languages,format");
  if (error) throw new Error(error.message);

  const genreCounts = new Map<string, number>();
  const languageCounts = new Map<string, number>();
  const formatCounts = new Map<string, number>();
  for (const row of rows ?? []) {
    for (const g of row.genres ?? []) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    for (const l of row.languages ?? []) languageCounts.set(l, (languageCounts.get(l) ?? 0) + 1);
    if (row.format) formatCounts.set(row.format, (formatCounts.get(row.format) ?? 0) + 1);
  }
  const toBuckets = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    genres: toBuckets(genreCounts),
    languages: toBuckets(languageCounts),
    formats: toBuckets(formatCounts),
    total: rows?.length ?? 0,
  };
});

export const filmsSearchQueryOptions = (params: SearchFilmsInput) =>
  queryOptions({
    queryKey: ["films", params],
    queryFn: () => searchFilms({ data: params }),
  });

export const filmDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["film", id],
    queryFn: () => getFilm({ data: { id } }),
  });

export const facetsQueryOptions = () =>
  queryOptions({
    queryKey: ["film-facets"],
    queryFn: () => getFacets(),
    staleTime: 5 * 60_000,
  });
