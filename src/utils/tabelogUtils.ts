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

const JAPAN_KEYWORDS_REGEX =
  /(?:japan|tokyo|kyoto|osaka|hokkaido|sapporo|fukuoka|kanagawa|yokohama|aichi|nagoya|hiroshima|okinawa|nara|kobe|hyogo|shizuoka|sendai|miyagi|chiba|saitama|shibuya|shinjuku|ginza|roppongi|asakusa)/i;

const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;

const TABELOG_PREFIX_REGEX =
  /^(?:\[Tabelog\s*[^\]]+\]|★\s*[\d.]+\s*(?:Tabelog)?(?:\s*\([^)]+\))?)\s*[•—–-]?\s*/i;

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

  // 2. Address check via pre-compiled keyword & character regexes
  const address = place.address;
  if (address) {
    if (JAPAN_KEYWORDS_REGEX.test(address)) return true;
    if (JAPANESE_CHAR_REGEX.test(address)) return true;
  }

  return false;
}

/**
 * Builds direct search URL on Tabelog for a restaurant.
 * Points to Tabelog's English site search (/en/rstLst/).
 * Example: https://tabelog.com/en/rstLst/?utf8=✓&pal=&LstPrf=&LstAre=&station_id=&area_datatype=&area_id=&genre_name=&sw=Jambo+Hanare&search_mode=
 */
export function getTabelogSearchUrl(place: PlaceLike): string {
  // Prefer romanized name if available for English search, fallback to standard or native name
  const query = (place.romanizedName || place.name || "").trim();
  const encodedQuery = encodeURIComponent(query).replace(/%20/g, "+");
  return `https://tabelog.com/en/rstLst/?utf8=✓&pal=&LstPrf=&LstAre=&station_id=&area_datatype=&area_id=&genre_name=&sw=${encodedQuery}&search_mode=`;
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
  return description.replace(TABELOG_PREFIX_REGEX, "").trim();
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
