import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, Outlet, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  seriesFacetsQueryOptions,
  seriesSearchQueryOptions,
  type SeriesSummary,
} from "@/lib/series.functions";
import { seriesFormatLabel, seriesStatusLabel, seriesYearsSpan } from "@/lib/series-format";
import heroImg from "@/assets/hero.jpg";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  genres: fallback(z.string().array(), []).default([]),
  languages: fallback(z.string().array(), []).default([]),
  formats: fallback(z.string().array(), []).default([]),
  status: fallback(z.string(), "").default(""),
  from: fallback(z.number(), 1975).default(1975),
  to: fallback(z.number(), 2026).default(2026),
  sort: fallback(z.string(), "newest").default("newest"),
  page: fallback(z.number(), 1).default(1),
});

type SearchOutput = z.output<typeof searchSchema>;

const DEFAULT_SEARCH = {
  q: "",
  genres: [],
  languages: [],
  formats: [],
  status: "",
  from: 1975,
  to: 2026,
  sort: "newest",
  page: 1,
};

export const Route = createFileRoute("/tv")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams(DEFAULT_SEARCH)],
  },
  loaderDeps: ({ search }) => ({
    q: search.q,
    genres: search.genres,
    languages: search.languages,
    formats: search.formats,
    status: search.status,
    from: search.from,
    to: search.to,
    sort: search.sort,
    page: search.page,
  }),
  loader: ({ context, deps }) => {
    const params = {
      q: deps.q,
      genres: deps.genres,
      languages: deps.languages,
      formats: deps.formats,
      status: deps.status,
      yearFrom: deps.from,
      yearTo: deps.to,
      sort: deps.sort,
      page: deps.page,
    };
    return Promise.all([
      context.queryClient.ensureQueryData(seriesSearchQueryOptions(params)),
      context.queryClient.ensureQueryData(seriesFacetsQueryOptions()),
    ]);
  },
  component: TvIndex,
  notFoundComponent: () => <div className="p-10 text-muted-foreground">Nothing here.</div>,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-10 text-muted-foreground">
      {error instanceof Error ? error.message : "Something went wrong."}
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Browse South African TV Series — Mzansi Film Archive" },
      {
        name: "description",
        content:
          "Search and filter South African TV series from 1975 to 2026 by title, genre, language, format, status, and year.",
      },
      { property: "og:title", content: "Browse South African TV Series — Mzansi Film Archive" },
      {
        property: "og:description",
        content:
          "Search and filter South African TV series from 1975 to 2026 by title, genre, language, format, status, and year.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A–Z" },
];

function TvIndex() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/tv" });

  const facets = useSuspenseQuery(seriesFacetsQueryOptions()).data;
  const results = useSuspenseQuery(
    seriesSearchQueryOptions({
      q: search.q,
      genres: search.genres,
      languages: search.languages,
      formats: search.formats,
      status: search.status,
      yearFrom: search.from,
      yearTo: search.to,
      sort: search.sort,
      page: search.page,
    }),
  ).data;

  const update = (patch: Partial<SearchOutput>) => {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });
  };

  const [text, setText] = useState(search.q);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    setText(search.q);
  }, [search.q]);
  const onSearchInput = (value: string) => {
    setText(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => update({ q: value }), 300);
  };

  const toggleInList = (key: "genres" | "languages" | "formats", name: string) => {
    const current = search[key];
    update({ [key]: current.includes(name) ? current.filter((v) => v !== name) : [...current, name] });
  };

  const totalPages = Math.max(1, Math.ceil(results.total / results.pageSize));
  const activeFilters =
    search.genres.length + search.languages.length + search.formats.length +
    (search.q ? 1 : 0) +
    (search.status ? 1 : 0) +
    (search.from !== 1975 || search.to !== 2026 ? 1 : 0);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={heroImg}
          alt=""
          width={1920}
          height={896}
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
        <div className="hero-scrim absolute inset-0" />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:py-24">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">
            The TV vault
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight text-foreground sm:text-6xl">
            Fifty years of South African television.
          </h1>
          <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            {facets.total} TV series from 1975 to 2026 — soaps, telenovelas,
            sitcoms, reality and children's shows, in all official languages.
          </p>

          <form
            className="mt-8 flex max-w-xl items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: text });
            }}
          >
            <input
              value={text}
              onChange={(e) => onSearchInput(e.target.value)}
              placeholder="Search by series title…"
              aria-label="Search TV series by title"
              className="h-12 w-full rounded-lg border border-input bg-background/80 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              className="h-12 shrink-0 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b border-border bg-card/40">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs uppercase tracking-widest text-muted-foreground">
              Genre
            </span>
            {facets.genres.slice(0, 16).map((g) => {
              const active = search.genres.includes(g.name);
              return (
                <button
                  key={g.name}
                  onClick={() => toggleInList("genres", g.name)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary text-secondary-foreground hover:border-primary/60"
                  }`}
                >
                  {g.name}
                  <span className={`ml-1.5 ${active ? "opacity-70" : "text-muted-foreground"}`}>
                    {g.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Language
              <select
                value={search.languages[0] ?? ""}
                onChange={(e) => update({ languages: e.target.value ? [e.target.value] : [] })}
                className="h-9 w-44 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Any language</option>
                {facets.languages.slice(0, 14).map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name} ({l.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Format
              <select
                value={search.formats[0] ?? ""}
                onChange={(e) => update({ formats: e.target.value ? [e.target.value] : [] })}
                className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Any format</option>
                {facets.formats.map((f) => (
                  <option key={f.name} value={f.name}>
                    {seriesFormatLabel(f.name)} ({f.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={search.status}
                onChange={(e) => update({ status: e.target.value })}
                className="h-9 w-36 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Any status</option>
                {facets.statuses.map((s) => (
                  <option key={s.name} value={s.name}>
                    {seriesStatusLabel(s.name)} ({s.count})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              From year
              <input
                type="number"
                value={search.from === 1975 ? "" : search.from}
                placeholder="1975"
                onChange={(e) =>
                  update({
                    from: e.target.value === "" ? 1975 : Math.trunc(Number(e.target.value)) || 1975,
                  })
                }
                className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              To year
              <input
                type="number"
                value={search.to === 2026 ? "" : search.to}
                placeholder="2026"
                onChange={(e) =>
                  update({
                    to: e.target.value === "" ? 2026 : Math.trunc(Number(e.target.value)) || 2026,
                  })
                }
                className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Sort
              <select
                value={search.sort}
                onChange={(e) => update({ sort: e.target.value })}
                className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            {activeFilters > 0 && (
              <button
                onClick={() =>
                  update({
                    q: "",
                    genres: [],
                    languages: [],
                    formats: [],
                    status: "",
                    from: 1975,
                    to: 2026,
                  })
                }
                className="h-9 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                Clear filters ({activeFilters})
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-display text-lg text-foreground">
            {results.total.toLocaleString()} series
            {search.q ? <> matching “{search.q}”</> : null}
          </h2>
          <span className="text-xs text-muted-foreground">
            Page {results.page} of {totalPages}
          </span>
        </div>

        {results.series.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <p className="font-display text-xl text-foreground">Nothing on this channel</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a different title or loosen the filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.series.map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              disabled={results.page <= 1}
              onClick={() => update({ page: results.page - 1 })}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {results.page} of {totalPages}
            </span>
            <button
              disabled={results.page >= totalPages}
              onClick={() => update({ page: results.page + 1 })}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function SeriesCard({ series }: { series: SeriesSummary }) {
  return (
    <Link
      to="/tv/$id"
      params={{ id: series.id }}
      className="film-card flex flex-col rounded-xl p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-lg text-primary">
          {seriesYearsSpan(series.year, series.end_year)}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {seriesStatusLabel(series.status)}
        </span>
      </div>
      <h3 className="mt-2 font-display text-xl leading-snug text-foreground">{series.title}</h3>
      {series.summary && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {series.summary}
        </p>
      )}
      <div className="mt-auto pt-3">
        <div className="gold-rule mb-2" />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {seriesFormatLabel(series.format)}
          </span>
          {series.seasons !== null && (
            <span className="text-[11px] text-muted-foreground/70">
              · {series.seasons} season{series.seasons === 1 ? "" : "s"}
            </span>
          )}
          {series.languages.length > 0 && (
            <span className="text-[11px] text-muted-foreground/70">
              · {series.languages.slice(0, 2).join(", ")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// /tv/$id nests under this route, so the outlet must render here.
export const TvOutlet = Outlet;
