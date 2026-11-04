import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  seriesDetailQueryOptions,
  type SeriesDetail,
} from "@/lib/series.functions";
import {
  seriesCategoryLabel,
  seriesFormatLabel,
  seriesStatusLabel,
  seriesYearsSpan,
} from "@/lib/series-format";

type SeriesDoc = {
  titles?: {
    original?: string;
    original_language?: string;
    english?: string | null;
    alternates?: { title?: string }[];
  };
  scope?: { category?: string; reason?: string };
  genres?: string[];
  keywords?: string[];
  languages?: { spoken?: string[]; subtitles?: string[]; notes?: string };
  counts?: { seasons?: number; episodes?: number; episode_runtime_minutes?: number };
  target_audience?: string;
  dates?: { first_aired?: string; last_aired?: string };
  broadcast?: {
    channel_name?: string;
    platform_type?: string;
    from?: string;
    to?: string;
    time_slot?: string;
    days?: string;
  }[];
  production?: {
    production_companies?: { name?: string; role?: string }[];
    commissioning_broadcaster?: { name?: string } | null;
    distributors?: { name?: string }[];
    funders?: { name?: string; type?: string }[];
    filming_locations?: { place?: string; province?: string; studio?: string }[];
    budget?: { amount?: number | null; currency?: string | null; per_episode?: string | number | null };
  };
  cast?: {
    name?: string;
    character?: string | null;
    credit_type?: string;
    years?: string;
  }[];
  crew?: Record<string, { name?: string }[] | undefined>;
  seasons?: {
    season_number?: number;
    title?: string;
    episode_count?: number;
    first_aired?: string;
    last_aired?: string;
    language_notes?: string;
  }[];
  awards?: { award?: string; category?: string; year?: number; result?: string }[];
  viewership?: { period?: string; metric?: string; value?: number; unit?: string }[];
  classification?: { rating?: string; body?: string; notes?: string | null };
  ratings?: { imdb?: number | null; tmdb?: number | null };
  links?: {
    official_site?: string | null;
    trailer?: string | null;
    wikipedia?: string | null;
    streaming?: { platform?: string; url?: string }[];
  };
  format_rights?: {
    is_local_version?: boolean;
    original_format?: string | null;
    format_owner?: string | null;
    origin_country?: string | null;
  };
  provenance?: {
    sources?: { source_id?: string; url?: string }[];
    confidence?: number;
  };
};

const CREW_LABELS: Record<string, string> = {
  creators: "Created by",
  showrunners: "Showrunner",
  head_writers: "Head writer",
  writers: "Written by",
  directors: "Directed by",
  producers: "Produced by",
  executive_producers: "Executive producers",
  composers: "Music by",
  cinematographers: "Cinematography",
  editors: "Edited by",
  casting: "Casting",
  other: "Other crew",
};

function asDoc(series: SeriesDetail): SeriesDoc {
  return (series.data ?? {}) as unknown as SeriesDoc;
}

export const Route = createFileRoute("/tv/$id")({
  loader: async ({ context, params }) => {
    const series = await context.queryClient.ensureQueryData(
      seriesDetailQueryOptions(params.id),
    );
    if (!series) throw notFound();
    return { series };
  },
  component: SeriesDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl text-foreground">Not in the vault</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn't find that series. It may have been removed from the catalogue.
      </p>
      <Link
        to="/tv"
        className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Back to the TV vault
      </Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">
      {error instanceof Error ? error.message : "Something went wrong."}
    </div>
  ),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.series.title} (${loaderData.series.year}) — Mzansi Film Archive`
          : "TV series — Mzansi Film Archive",
      },
      {
        name: "description",
        content: loaderData?.series.summary
          ? loaderData.series.summary.slice(0, 180)
          : "South African TV series details from the Mzansi Film Archive.",
      },
      {
        property: "og:title",
        content: loaderData
          ? `${loaderData.series.title} (${loaderData.series.year}) — Mzansi Film Archive`
          : "TV series — Mzansi Film Archive",
      },
      {
        property: "og:description",
        content: loaderData?.series.summary
          ? loaderData.series.summary.slice(0, 180)
          : "South African TV series details from the Mzansi Film Archive.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function SeriesDetailPage() {
  const { id } = Route.useParams();
  const series = useSuspenseQuery(seriesDetailQueryOptions(id)).data;
  if (!series) return null; // the loader throws notFound() before this can render
  const d = asDoc(series);

  const spoken = d.languages?.spoken ?? series.languages;
  const subtitles = d.languages?.subtitles ?? [];
  const crew = d.crew ?? {};
  const yearsSpan = seriesYearsSpan(series.year, series.end_year);
  const isRunning = series.status === "running";

  const facts: [string, string][] = [];
  if (d.counts?.seasons ?? series.seasons)
    facts.push(["Seasons", String(d.counts?.seasons ?? series.seasons)]);
  if (d.counts?.episodes ?? series.episodes)
    facts.push(["Episodes", String(d.counts?.episodes ?? series.episodes)]);
  if (d.counts?.episode_runtime_minutes ?? series.runtime_minutes)
    facts.push(["Episode length", `${d.counts?.episode_runtime_minutes ?? series.runtime_minutes} min`]);
  if (d.target_audience) facts.push(["Audience", d.target_audience]);
  if (d.classification?.rating)
    facts.push(["Age rating", d.classification.body ? `${d.classification.rating} (${d.classification.body})` : d.classification.rating]);
  if (subtitles.length) facts.push(["Subtitles", subtitles.join(", ")]);
  if (series.category) facts.push(["Category", seriesCategoryLabel(series.category)]);
  if (d.format_rights?.is_local_version) {
    const owner = d.format_rights.format_owner
      ? ` — ${d.format_rights.format_owner}`
      : "";
    facts.push([
      "Format rights",
      `Local version${d.format_rights.original_format ? ` of ${d.format_rights.original_format}` : ""}${owner}`,
    ]);
  }

  const externalLinks: [string, string][] = [];
  if (series.imdb_id) externalLinks.push(["IMDb", `https://www.imdb.com/title/${series.imdb_id}/`]);
  if (series.wikidata_id)
    externalLinks.push(["Wikidata", `https://www.wikidata.org/wiki/${series.wikidata_id}`]);
  if (d.links?.wikipedia) externalLinks.push(["Wikipedia", d.links.wikipedia]);
  if (d.links?.official_site) externalLinks.push(["Official site", d.links.official_site]);
  if (d.links?.trailer) externalLinks.push(["Trailer", d.links.trailer]);
  for (const s of d.links?.streaming ?? []) {
    if (s.platform && s.url) externalLinks.push([`Stream on ${s.platform}`, s.url]);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <Link
        to="/tv"
        className="text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
      >
        ← Back to the TV vault
      </Link>

      {/* Header */}
      <header className="mt-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-3xl font-semibold leading-tight text-foreground sm:text-5xl">
            {series.title}
          </h1>
          <span className="font-display text-2xl text-primary">
            {yearsSpan}
            {isRunning ? "–" : ""}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground">
            {seriesFormatLabel(series.format)}
          </span>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            {seriesStatusLabel(series.status)}
          </span>
          {series.genres.map((g) => (
            <span
              key={g}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            >
              {g}
            </span>
          ))}
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-8">
          {series.summary && (
            <section>
              <h2 className="font-display text-lg text-primary">Synopsis</h2>
              <div className="gold-rule mt-2 mb-3" />
              <p className="max-w-2xl text-sm leading-relaxed text-foreground/90">
                {series.summary}
              </p>
            </section>
          )}

          {(Object.keys(crew).some((k) => (crew[k]?.length ?? 0) > 0) ||
            (d.cast?.length ?? 0) > 0) && (
            <section>
              <h2 className="font-display text-lg text-primary">Cast &amp; crew</h2>
              <div className="gold-rule mt-2 mb-3" />
              <dl className="space-y-2 text-sm">
                {Object.entries(CREW_LABELS)
                  .filter(([key]) => (crew[key]?.length ?? 0) > 0)
                  .map(([key, label]) => (
                    <div key={key} className="flex gap-3">
                      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
                      <dd className="text-foreground/90">
                        {crew[key]!.map((p) => p.name).filter(Boolean).join(", ")}
                      </dd>
                    </div>
                  ))}
                {(d.cast?.length ?? 0) > 0 && (
                  <div className="flex gap-3">
                    <dt className="w-36 shrink-0 text-muted-foreground">Cast</dt>
                    <dd className="text-foreground/90">
                      {d
                        .cast!.map((c) =>
                          c.character
                            ? `${c.name} (${c.character})`
                            : c.name,
                        )
                        .filter(Boolean)
                        .join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {(d.broadcast?.length ?? 0) > 0 && (
            <section>
              <h2 className="font-display text-lg text-primary">Broadcast history</h2>
              <div className="gold-rule mt-2 mb-3" />
              <ul className="space-y-2 text-sm">
                {d.broadcast!.map((b, i) => (
                  <li key={i} className="text-foreground/90">
                    <span className="text-muted-foreground">
                      {b.from ?? "—"}
                      {b.to ? `–${b.to}` : ""} ·{" "}
                    </span>
                    {b.channel_name ?? "Unknown channel"}
                    {b.time_slot ? <span className="text-muted-foreground"> · {b.time_slot}</span> : null}
                    {b.days ? <span className="text-muted-foreground"> · {b.days}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(d.seasons?.length ?? 0) > 0 && (
            <section>
              <h2 className="font-display text-lg text-primary">Seasons</h2>
              <div className="gold-rule mt-2 mb-3" />
              <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                {d.seasons!.map((s, i) => (
                  <li key={i} className="rounded-lg border border-border p-3">
                    <span className="font-display text-foreground">
                      {s.title ?? `Season ${s.season_number ?? i + 1}`}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.first_aired ?? "—"}
                      {s.last_aired && s.last_aired !== s.first_aired ? `–${s.last_aired}` : ""}
                      {s.episode_count ? ` · ${s.episode_count} episodes` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(d.awards?.length ?? 0) > 0 && (
            <section>
              <h2 className="font-display text-lg text-primary">Awards</h2>
              <div className="gold-rule mt-2 mb-3" />
              <ul className="space-y-2 text-sm">
                {d.awards!.map((a, i) => (
                  <li key={i} className="text-foreground/90">
                    <span className="text-muted-foreground">{a.year ?? "—"} · </span>
                    {a.award}
                    {a.category ? <> — {a.category}</> : null}
                    {a.result ? (
                      <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {a.result}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(d.viewership?.length ?? 0) > 0 && (
            <section>
              <h2 className="font-display text-lg text-primary">Viewership</h2>
              <div className="gold-rule mt-2 mb-3" />
              <ul className="space-y-2 text-sm">
                {d.viewership!.map((v, i) => (
                  <li key={i} className="text-foreground/90">
                    {typeof v.value === "number"
                      ? `${v.value.toLocaleString()}${v.unit ? ` ${v.unit}` : ""}`
                      : "—"}
                    {v.metric ? <span className="text-muted-foreground"> · {v.metric.replace(/_/g, " ")}</span> : null}
                    {v.period ? <span className="text-muted-foreground"> · {v.period}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {((d.production?.production_companies?.length ?? 0) > 0 ||
            d.production?.commissioning_broadcaster ||
            (d.production?.filming_locations?.length ?? 0) > 0) && (
            <section>
              <h2 className="font-display text-lg text-primary">Production</h2>
              <div className="gold-rule mt-2 mb-3" />
              <dl className="space-y-2 text-sm">
                {(d.production!.production_companies?.length ?? 0) > 0 && (
                  <div className="flex gap-3">
                    <dt className="w-36 shrink-0 text-muted-foreground">Companies</dt>
                    <dd className="text-foreground/90">
                      {d.production!.production_companies!.map((c) => c.name).filter(Boolean).join(", ")}
                    </dd>
                  </div>
                )}
                {d.production!.commissioning_broadcaster?.name && (
                  <div className="flex gap-3">
                    <dt className="w-36 shrink-0 text-muted-foreground">Commissioned by</dt>
                    <dd className="text-foreground/90">
                      {d.production!.commissioning_broadcaster!.name}
                    </dd>
                  </div>
                )}
                {(d.production!.funders?.length ?? 0) > 0 && (
                  <div className="flex gap-3">
                    <dt className="w-36 shrink-0 text-muted-foreground">Funded by</dt>
                    <dd className="text-foreground/90">
                      {d.production!.funders!.map((f) => f.name).filter(Boolean).join(", ")}
                    </dd>
                  </div>
                )}
                {(d.production!.filming_locations?.length ?? 0) > 0 && (
                  <div className="flex gap-3">
                    <dt className="w-36 shrink-0 text-muted-foreground">Filmed at</dt>
                    <dd className="text-foreground/90">
                      {d.production!.filming_locations!
                        .map((l) => [l.place, l.studio].filter(Boolean).join(" — "))
                        .join(" · ")}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {d.scope?.reason && (
            <section>
              <h2 className="font-display text-lg text-primary">Why it's in the archive</h2>
              <div className="gold-rule mt-2 mb-3" />
              <p className="max-w-2xl text-sm text-muted-foreground">{d.scope.reason}</p>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="film-card rounded-xl p-5">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Facts</h3>
            <dl className="mt-4 space-y-2 text-sm">
              {d.titles?.original && d.titles.original !== series.title && (
                <div>
                  <dt className="text-xs text-muted-foreground">Original title</dt>
                  <dd className="text-foreground/90">{d.titles.original}</dd>
                </div>
              )}
              {d.titles?.english && d.titles.english !== series.title && (
                <div>
                  <dt className="text-xs text-muted-foreground">English title</dt>
                  <dd className="text-foreground/90">{d.titles.english}</dd>
                </div>
              )}
              {(d.titles?.alternates?.length ?? 0) > 0 && (
                <div>
                  <dt className="text-xs text-muted-foreground">Also known as</dt>
                  <dd className="text-foreground/90">
                    {d.titles!.alternates!.map((a) => a.title).filter(Boolean).join(", ")}
                  </dd>
                </div>
              )}
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-foreground/90">{v}</dd>
                </div>
              ))}
              {spoken.length > 0 && (
                <div>
                  <dt className="text-xs text-muted-foreground">Languages</dt>
                  <dd className="text-foreground/90">{spoken.join(", ")}</dd>
                </div>
              )}
              {d.languages?.notes && (
                <div>
                  <dt className="text-xs text-muted-foreground">Language notes</dt>
                  <dd className="text-foreground/90">{d.languages.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {externalLinks.length > 0 && (
            <div className="film-card rounded-xl p-5">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Elsewhere</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {externalLinks.map(([label, url]) => (
                  <li key={label}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {((d.ratings?.imdb ?? null) !== null || (d.ratings?.tmdb ?? null) !== null) && (
            <div className="film-card rounded-xl p-5">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Ratings</h3>
              <dl className="mt-3 space-y-1 text-sm">
                {(d.ratings?.imdb ?? null) !== null && (
                  <div>
                    <dt className="inline text-muted-foreground">IMDb </dt>
                    <dd className="inline font-display text-primary">
                      {d.ratings!.imdb}
                      <span className="text-sm text-muted-foreground"> / 10</span>
                    </dd>
                  </div>
                )}
                {(d.ratings?.tmdb ?? null) !== null && (
                  <div>
                    <dt className="inline text-muted-foreground">TMDB </dt>
                    <dd className="inline font-display text-primary">{d.ratings!.tmdb}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {(d.keywords?.length ?? 0) > 0 && (
            <div className="film-card rounded-xl p-5">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Keywords</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.keywords!.map((k) => (
                  <span
                    key={k}
                    className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(d.provenance?.sources?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border p-5">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Data sources</h3>
              <ul className="mt-3 space-y-1.5 text-xs">
                {d.provenance!.sources!.map((s, i) => (
                  <li key={i}>
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                      >
                        {s.source_id}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">{s.source_id}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
