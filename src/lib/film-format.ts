export const FORMAT_LABELS: Record<string, string> = {
  feature: "Feature",
  documentary: "Documentary",
  short: "Short",
  animation: "Animation",
  tv_movie: "TV movie",
};

export const CATEGORY_LABELS: Record<string, string> = {
  sa_production: "SA production",
  co_production: "Co-production",
  foreign_service_production: "Foreign service production",
};

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}
