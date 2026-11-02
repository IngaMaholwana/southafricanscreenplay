import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  filmDetailQueryOptions,
  type FilmDetail,
} from "@/lib/films.functions";
import { categoryLabel, formatLabel, formatMoney } from "@/lib/film-format";

type FilmDoc = {
  titles?: {
    original?: string;
    original_language?: string;
    english?: string | null;
    alternates?: { title?: string; language?: string; region?: string; type?: string }[];
  };
  scope?: { category?: string; reason?: string };
  genres?: string[];
  keywords?: string[];
  languages?: { spoken?: string[]; subtitles?: string[] };
  runtime_minutes?: number;
  technical?: {
    color?: string;
    aspect_ratio?: string;
    sound?: string;
    original_format?: string;
  };
  releases?: {
    country?: string;
    type?: string;
    date?: string;
    venue_or_platform?: string;
    distributor?: string;
    classification?: string;
    notes?: string;
  }[];
  production?: {
    production_companies?: { name?: string; country?: string; role?: string }[];
    distributors?: { name?: string; country?: string }[];
    funders?: { name?: string }[];
    filming_locations?: { place?: string }[];
  };
  cast?: { name?: string; character?: string | null; billing_order?: number }[];
  crew?: Record<string, { name?: string }[] | undefined>;
  awards?: { award?: string; category?: string; year?: number; result?: string }[];
  box_office?: {
    territory?: string;
    amount?: number;
    currency?: string;
    as_of?: string;
  }[];
  ratings?: { imdb?: number | null; tmdb?: number | null; letterboxd?: number | null };
  based_on?: { type?: string | null; source_work?: string | null };
  links?: {
    official_site?: string | null;
    trailer?: string | null;
    wikipedia?: string | null;
    streaming?: { platform?: string; url?: string }[];
  };
  provenance?: {
    sources?: { source_id?: string; url?: string }[];
    confidence?: number;
  };
};

const CREW_LABELS: Record<string, string> = {
  directors: "Directed by",
  writers: "Written by",
  producers: "Produced by",
  executive_producers: "Executive producers",
  cinematographers: "Cinematography",
  editors: "Edited by",
  composers: "Music by",
  production_designers: "Production design",
  costume_designers: "Costume design",
  sound: "Sound",
  visual_effects: "Visual effects",
  casting: "Casting",
  other: "Other crew",
};

function asDoc(film: FilmDetail): FilmDoc {
  return (film.data ?? {}) as FilmDoc;
}

export const Route = createFileRoute("/films/$id")({
  loader: async ({ context, params }) => {
    const film = await context.queryClient.ensureQueryData(filmDetailQueryOptions(params.id));
    if (!film) throw notFound();
    return { film };
  },
  component: FilmDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl text-foreground">Not in the archive</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn't find that film. It may have been removed from the catalogue.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Back to the archive
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
          ? `${loaderData.film.title} (${loaderData.film.year}) — Mzansi Film Archive`
          : "Film — Mzansi Film Archive",
      },
      {
        name: "description",
        content: loaderData?.film.summary
          ? loaderData.film.summary.slice(0, 180)
          : "Film details from the Mzansi Film Archive.",
      },
      {
        property: "og:title",
        content: loaderData
          ? `${loaderData.film.title} (${loaderData.film.year}) — Mzansi Film Archive`
          : "Film — Mzansi Film Archive",
      },
      {
        property: "og:description",
        content: loaderData?.film.summary
          ? loaderData.film.summary.slice(0, 180)
          : "Film details from the Mzansi Film Archive.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function FilmDetailPage() {
  const { id } = Route.useParams();
  const film = useSuspenseQuery(filmDetailQueryOptions(id)).data;
  if (!film) return null; // the loader throws notFound() before this can render
  const d = asDoc(film);

  const spoken = d.languages?.spoken ?? film.languages;
  const subtitles = d.languages?.subtitles ?? [];
  const tech = d.technical ?? {};
  const crew = d.crew ?? {};
  const facts: [string, string][] = [];
  if (d.runtime_minutes ?? film.runtime_minutes)
    facts.push(["Runtime", `${d.runtime_minutes ?? film.runtime_minutes} min`]);
  if (tech.color) facts.push(["Colour", tech.color]);
  if (tech.aspect_ratio) facts.push(["Aspect ratio", tech.aspect_ratio]);
  if (tech.sound) facts.push(["Sound", tech.sound]);
  if (tech.original_format) facts.push(["Original format", tech.original_format]);
  if (subtitles.length) facts.push(["Subtitles", subtitles.join(", ")]);
  if (film.category) facts.push(["Category", categoryLabel(film.category)]);

  const externalLinks: [string, string][] = [];
  if (film.imdb_id) externalLinks.push(["IMDb", `https://www.imdb.com/title/${film.imdb_id}/`]);
  if (film.wikidata_id)
    externalLinks.push(["Wikidata", `https://www.wikidata.org/wiki/${film.wikidata_id}`]);
  if (d.links?.wikipedia) externalLinks.push(["Wikipedia", d.links.wikipedia]);
  if (d.links?.official_site) externalLinks.push(["Official site", d.links.official_site]);
  if (d.links?.trailer) externalLinks.push(["Trailer", d.links.trailer]);
  for (const s of d.links?.streaming ?? []) {
    if (s.platform && s.url) externalLinks.push([`Stream on ${s.platform}`, s.url]);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <Link
        to="/"
        className="text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
      >
        ← Back to the archive
      </Link>

      {/* Header */}
      <header className="mt-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-3xl font-semibold leading-tight text-foreground sm:text-5xl">
            {film.title}
          </h1>
          <span className="font-display text-2xl text-primary">{film.year}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground">
            {formatLabel(film.format)}
          </span>
          {film.genres.map((g) => (
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
          {film.summary && (
            <section>
              <h2 className="font-display text-lg text-primary">Synopsis</h2>
              <div className="gold-rule mt-2 mb-3" />
              <p className="max-w-2xl text-sm leading-relaxed text-foreground/90">
                {film.summary}
              </p>
            </section>
          )}

          {(crew["directors"]?.length ?? 0) > 0 && (
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
                        .cast!.slice()
                        .sort((a, b) => (a.billing_order ?? 99) - (b.billing_order ?? 99))
                        .map((c) =>
                          c.character ? `${c.name} (${c.character})` : c.name,
                        )
                        .filter(Boolean)
                        .join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {(d.awards?.length ?? 0) > 0 && (
            <section>
              <h2 className="font-display text-lg text-primary">Awards &amp; festivals</h2>
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

          {(d.releases?.length ?? 0) > 0 && (
            <section>
              <h2 className="font-display text-lg text-primary">Releases</h2>
              <div className="gold-rule mt-2 mb-3" />
              <ul className="space-y-2 text-sm">
                {d.releases!.map((r, i) => (
                  <li key={i} className="text-foreground/90">
                    <span className="text-muted-foreground">{r.date ?? "—"} · </span>
                    {r.country ?? "ZA"}
                    {r.type ? ` · ${r.type}` : ""}
                    {r.distributor ? ` · ${r.distributor}` : ""}
                    {r.venue_or_platform ? ` · ${r.venue_or_platform}` : ""}
                    {r.notes ? <span className="text-muted-foreground"> — {r.notes}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(d.box_office?.length ?? 0) > 0 && (
            <section>
              <h2 className="font-display text-lg text-primary">Box office</h2>
              <div className="gold-rule mt-2 mb-3" />
              <ul className="space-y-2 text-sm">
                {d.box_office!.map((b, i) => (
                  <li key={i} className="text-foreground/90">
                    {typeof b.amount === "number" && b.currency
                      ? formatMoney(b.amount, b.currency)
                      : "—"}
                    {b.territory ? <span className="text-muted-foreground"> · {b.territory}</span> : null}
                    {b.as_of ? <span className="text-muted-foreground"> (as of {b.as_of})</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(d.production?.filming_locations?.length ?? 0) > 0 && (
            <section>
              <h2 className="font-display text-lg text-primary">Filming locations</h2>
              <div className="gold-rule mt-2 mb-3" />
              <p className="text-sm text-foreground/90">
                {d.production!.filming_locations!.map((l) => l.place).filter(Boolean).join(" · ")}
              </p>
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
              {d.titles?.original && d.titles.original !== film.title && (
                <div>
                  <dt className="text-xs text-muted-foreground">Original title</dt>
                  <dd className="text-foreground/90">{d.titles.original}</dd>
                </div>
              )}
              {d.titles?.english && d.titles.english !== film.title && (
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

          {(d.based_on?.source_work ?? null) && (
            <div className="film-card rounded-xl p-5">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Based on</h3>
              <p className="mt-3 text-sm text-foreground/90">
                {d.based_on!.source_work}
                {d.based_on!.type ? <span className="text-muted-foreground"> ({d.based_on!.type})</span> : null}
              </p>
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

          {(d.ratings?.imdb ?? null) !== null && (
            <div className="film-card rounded-xl p-5">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">IMDb rating</h3>
              <p className="mt-3 font-display text-2xl text-primary">
                {d.ratings!.imdb}
                <span className="text-sm text-muted-foreground"> / 10</span>
              </p>
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
