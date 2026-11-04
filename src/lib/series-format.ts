export const SERIES_FORMAT_LABELS: Record<string, string> = {
  series: "Series",
  reality: "Reality",
  sitcom: "Sitcom",
  telenovela: "Telenovela",
  children: "Children's",
  documentary_series: "Documentary series",
  miniseries: "Miniseries",
  game_show: "Game show",
  soap_opera: "Soap opera",
  talk_show: "Talk show",
  magazine: "Magazine",
  animation: "Animation",
  variety: "Variety",
  anthology: "Anthology",
  sketch: "Sketch",
  sport: "Sport",
};

export const SERIES_CATEGORY_LABELS: Record<string, string> = {
  sa_production: "SA production",
  local_format: "Local format",
  streaming_original: "Streaming original",
  co_production: "Co-production",
  foreign_service_production: "Foreign service production",
  acquired_foreign: "Acquired foreign",
};

export const SERIES_STATUS_LABELS: Record<string, string> = {
  ended: "Ended",
  running: "Running",
  cancelled: "Cancelled",
};

export function seriesFormatLabel(format: string): string {
  return SERIES_FORMAT_LABELS[format] ?? format;
}

export function seriesCategoryLabel(category: string): string {
  return SERIES_CATEGORY_LABELS[category] ?? category;
}

export function seriesStatusLabel(status: string): string {
  return SERIES_STATUS_LABELS[status] ?? status;
}

/** "1975–1981" for a span, "1975" for a single year. */
export function seriesYearsSpan(year: number, endYear: number | null): string {
  if (endYear && endYear !== year) return `${year}–${endYear}`;
  return `${year}`;
}
