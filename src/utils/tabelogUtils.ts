/**
 * Utility functions for Tabelog (食べログ) integration, detection, and formatting.
 * Tabelog is Japan's premier restaurant review platform.
 * Rating benchmarks in Japan:
 *   >= 3.80: Top tier / Michelin tier (Gold)
 *   >= 3.50: Top ~3% of all restaurants in Japan (Bronze / Hyakumeiten)
 *   3.00 - 3.49: Good local standard
 */

export interface PlaceLike {
  category?: string;
  name?: string;
  romanizedName?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

/**
 * Determines whether a place is a restaurant located in Japan.
 */
export function isJapanRestaurant(place?: PlaceLike | null): boolean {
  if (!place || place.category !== "restaurant") return false;

  // 1. Geocoordinates check (Japan bounding box approx: lat 24°–46°N, lng 122°–154°E)
  if (typeof place.lat === "number" && typeof place.lng === "number") {
    if (
      place.lat >= 24 &&
      place.lat <= 46 &&
      place.lng >= 122 &&
      place.lng <= 154
    ) {
      return true;
    }
  }

  // 2. Address keywords check
  const addr = (place.address || "").toLowerCase();
  const japanKeywords = [
    "japan",
    "tokyo",
    "kyoto",
    "osaka",
    "hokkaido",
    "sapporo",
    "fukuoka",
    "kanagawa",
    "yokohama",
    "aichi",
    "nagoya",
    "hiroshima",
    "okinawa",
    "nara",
    "kobe",
    "hyogo",
    "shizuoka",
    "sendai",
    "miyagi",
    "chiba",
    "saitama",
    "shibuya",
    "shinjuku",
    "ginza",
    "roppongi",
    "asakusa",
  ];

  if (japanKeywords.some((kw) => addr.includes(kw))) {
    return true;
  }

  // 3. Japanese character presence (Kanji/Hiragana/Katakana) in address
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(place.address || "")) {
    return true;
  }

  return false;
}

/**
 * Builds direct search URL on Tabelog for a restaurant.
 */
export function getTabelogSearchUrl(place: PlaceLike): string {
  // Prefer native name if available, fallback to romanized or standard name
  const query = (place.name || place.romanizedName || "").trim();
  return `https://tabelog.com/rstLst/?vs=1&sa=&sk=${encodeURIComponent(query)}`;
}

/**
 * Strips any existing Tabelog prefix from a description string to avoid duplicate prefixes.
 * Handles patterns like:
 *   "★ 3.78 Tabelog • ..."
 *   "★ 3.78 Tabelog (Hyakumeiten 2024) • ..."
 *   "[Tabelog ★ 3.78] ..."
 *   "★ 3.78 • ..."
 */
export function stripTabelogPrefix(description?: string | null): string {
  if (!description) return "";
  return description
    .replace(
      /^(?:\[Tabelog\s*[^\]]+\]|★\s*[\d.]+\s*(?:Tabelog)?(?:\s*\([^)]+\))?)\s*[•—–-]?\s*/i,
      ""
    )
    .trim();
}

/**
 * Formats a description with the Tabelog rating prepended to the start.
 * e.g. "★ 3.78 Tabelog • 3-star Michelin Edomae sushi in Ginza"
 */
export function formatDescriptionWithTabelog(
  description: string,
  rating?: number | null,
  award?: string | null
): string {
  const cleaned = stripTabelogPrefix(description);
  if (!rating || isNaN(rating) || rating <= 0) {
    return cleaned;
  }

  const ratingStr = `★ ${Number(rating).toFixed(2)} Tabelog`;
  const awardStr = award?.trim() ? ` (${award.trim()})` : "";
  const prefix = `${ratingStr}${awardStr} • `;

  return cleaned ? `${prefix}${cleaned}` : `${ratingStr}${awardStr}`;
}

/**
 * Returns color classes and label for Tabelog rating tiers.
 */
export function getTabelogBadgeStyle(rating?: number | null): {
  badgeBg: string;
  textColor: string;
  borderColor: string;
  tierLabel: string;
} {
  const num = typeof rating === "number" ? rating : 0;

  if (num >= 3.8) {
    return {
      badgeBg: "bg-amber-500/15 dark:bg-amber-400/20",
      textColor: "text-amber-600 dark:text-amber-300 font-semibold",
      borderColor: "border-amber-500/30",
      tierLabel: "Legendary / Top Tier",
    };
  }

  if (num >= 3.5) {
    return {
      badgeBg: "bg-orange-500/15 dark:bg-orange-400/20",
      textColor: "text-orange-600 dark:text-orange-300 font-semibold",
      borderColor: "border-orange-500/30",
      tierLabel: "Top ~3% in Japan",
    };
  }

  return {
    badgeBg: "bg-surface-200/70 dark:bg-surface-800",
    textColor: "text-surface-700 dark:text-surface-300 font-medium",
    borderColor: "border-surface-300/50 dark:border-surface-700",
    tierLabel: "Tabelog",
  };
}
