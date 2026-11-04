import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";

export const SERIES_PAGE_SIZE = 24;

const searchInputSchema = z.object({
  q: z.string().optional().default(""),
  genres: z.array(z.string()).optional().default([]),
  languages: z.array(z.string()).optional().default([]),
  formats: z.array(z.string()).optional().default([]),
  status: z.string().optional().default(""),
  yearFrom: z.number().optional().default(0),
  yearTo: z.number().optional().default(0),
  sort: z.string().optional().default("newest"),
  page: z.number().optional().default(1),
});

export type SearchSeriesInput = z.infer<typeof searchInputSchema>;

export type SeriesSummary = {
  id: string;
  title: string;
  year: number;
  end_year: number | null;
  format: string;
  genres: string[];
  languages: string[];
  status: string;
  seasons: number | null;
  episodes: number | null;
  runtime_minutes: number | null;
  summary: string | null;
  category: string;
};

export type SearchSeriesResult = {
  series: SeriesSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type SeriesDetail = {
  id: string;
  title: string;
  search_title: string;
  year: number;
  end_year: number | null;
  format: string;
  genres: string[];
  languages: string[];
  status: string;
  seasons: number | null;
  episodes: number | null;
  runtime_minutes: number | null;
  summary: string | null;
  imdb_id: string | null;
  wikidata_id: string | null;
  category: string;
  data: Json;
};

export type FacetBucket = { name: string; count: number };

export type SeriesFacets = {
  genres: FacetBucket[];
  languages: FacetBucket[];
  formats: FacetBucket[];
  statuses: FacetBucket[];
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

export const searchSeries = createServerFn({ method: "GET" })
  .inputValidator((input) => searchInputSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<SearchSeriesResult> => {
    const supabase = createPublicClient();

    let query = supabase
      .from("series")
      .select(
        "id,title,year,end_year,format,genres,languages,status,seasons,episodes,runtime_minutes,summary,category",
        { count: "exact" },
      );

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
    if (data.status) {
      query = query.eq("status", data.status);
    }
    // A series falls in the range when it started by `yearTo` and was still
    // airing at `yearFrom` (its last year — or first, if still listed) is on
    // or after `yearFrom`.
    const yearFrom = Math.trunc(data.yearFrom);
    const yearTo = Math.trunc(data.yearTo);
    if (yearFrom > 0) {
      query = query.or(`end_year.gte.${yearFrom},year.gte.${yearFrom}`);
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
    const from = (page - 1) * SERIES_PAGE_SIZE;
    query = query.range(from, from + SERIES_PAGE_SIZE - 1);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    return {
      series: (rows ?? []) as SeriesSummary[],
      total: count ?? 0,
      page,
      pageSize: SERIES_PAGE_SIZE,
    };
  });

export const getSeries = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data }): Promise<SeriesDetail | null> => {
    const supabase = createPublicClient();
    const { data: row, error } = await supabase
      .from("series")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as SeriesDetail) ?? null;
  });

export const getSeriesFacets = createServerFn({ method: "GET" }).handler(
  async (): Promise<SeriesFacets> => {
    const supabase = createPublicClient();
    const { data: rows, error } = await supabase
      .from("series")
      .select("genres,languages,format,status");
    if (error) throw new Error(error.message);

    const genreCounts = new Map<string, number>();
    const languageCounts = new Map<string, number>();
    const formatCounts = new Map<string, number>();
    const statusCounts = new Map<string, number>();
    for (const row of rows ?? []) {
      for (const g of row.genres ?? []) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      for (const l of row.languages ?? []) languageCounts.set(l, (languageCounts.get(l) ?? 0) + 1);
      if (row.format) formatCounts.set(row.format, (formatCounts.get(row.format) ?? 0) + 1);
      if (row.status) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
    }
    const toBuckets = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return {
      genres: toBuckets(genreCounts),
      languages: toBuckets(languageCounts),
      formats: toBuckets(formatCounts),
      statuses: toBuckets(statusCounts),
      total: rows?.length ?? 0,
    };
  },
);

export const seriesSearchQueryOptions = (params: SearchSeriesInput) =>
  queryOptions({
    queryKey: ["series", params],
    queryFn: () => searchSeries({ data: params }),
  });

export const seriesDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["series-detail", id],
    queryFn: () => getSeries({ data: { id } }),
  });

export const seriesFacetsQueryOptions = () =>
  queryOptions({
    queryKey: ["series-facets"],
    queryFn: () => getSeriesFacets(),
    staleTime: 5 * 60_000,
  });
