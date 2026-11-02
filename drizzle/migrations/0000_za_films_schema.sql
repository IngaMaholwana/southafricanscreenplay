CREATE TABLE public.films (
  id text PRIMARY KEY,
  title text NOT NULL,
  search_title text NOT NULL,
  year integer NOT NULL,
  format text NOT NULL,
  genres text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  runtime_minutes integer,
  summary text,
  imdb_id text,
  wikidata_id text,
  category text NOT NULL DEFAULT 'sa_production',
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.films TO anon;
GRANT SELECT ON public.films TO authenticated;
GRANT ALL ON public.films TO service_role;

ALTER TABLE public.films ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Films are publicly readable"
  ON public.films FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX films_year_idx ON public.films (year);
CREATE INDEX films_format_idx ON public.films (format);
CREATE INDEX films_genres_idx ON public.films USING gin (genres);
CREATE INDEX films_languages_idx ON public.films USING gin (languages);
CREATE INDEX films_search_title_idx ON public.films (search_title);