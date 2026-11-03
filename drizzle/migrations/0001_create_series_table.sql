CREATE TABLE public.series (
  id text PRIMARY KEY,
  title text NOT NULL,
  search_title text NOT NULL,
  year integer NOT NULL,
  end_year integer,
  format text NOT NULL,
  genres text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ended',
  seasons integer,
  episodes integer,
  runtime_minutes integer,
  summary text,
  imdb_id text,
  wikidata_id text,
  category text NOT NULL DEFAULT 'sa_production',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.series TO anon, authenticated;
GRANT ALL ON public.series TO service_role;

ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Series are publicly readable"
  ON public.series
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX series_year_idx ON public.series (year);
CREATE INDEX series_end_year_idx ON public.series (end_year);
CREATE INDEX series_format_idx ON public.series (format);
CREATE INDEX series_status_idx ON public.series (status);
CREATE INDEX series_search_title_idx ON public.series (search_title);
CREATE INDEX series_genres_idx ON public.series USING GIN (genres);
CREATE INDEX series_languages_idx ON public.series USING GIN (languages);