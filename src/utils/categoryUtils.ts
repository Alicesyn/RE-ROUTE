import { PlaceCategory } from "../types";

import { useRouteStore } from "../store/useRouteStore";
import { CATEGORY_DEFAULTS, ALL_CATEGORIES } from "./categoryConstants";

export { CATEGORY_DEFAULTS, ALL_CATEGORIES };

export function getCategoryLabel(cat: PlaceCategory): string {
  return CATEGORY_DEFAULTS[cat]?.label ?? "Other";
}

/**
 * @deprecated No default photos allowed. Returns undefined.
 */
export function getCategoryFallbackImage(): string | undefined {
  return undefined;
}

export function getCategoryEmoji(cat: PlaceCategory): string {
  return CATEGORY_DEFAULTS[cat]?.emoji ?? "📍";
}

export function getDefaultDuration(cat: PlaceCategory): number {
  const customDurations = useRouteStore.getState().categoryDurations;
  return customDurations?.[cat] ?? CATEGORY_DEFAULTS[cat]?.duration ?? 60;
}

export function getActivePhotoUrl(photoUrl: string | undefined): string | undefined {
  if (!photoUrl) return undefined;

  // Filter out any mock/stock or default fallback photo domains
  if (
    photoUrl.includes("loremflickr.com") ||
    photoUrl.includes("images.unsplash.com") ||
    photoUrl.includes("places.googleapis.com")
  ) {
    return undefined;
  }

  const trimmed = photoUrl.trim();
  return trimmed || undefined;
}


// Keyword-based auto-categorizer
// Scans name and description to infer the most likely category
const KEYWORD_MAP: { category: PlaceCategory; keywords: string[] }[] = [
  {
    category: "museum",
    keywords: [
      "museum",
      "gallery",
      "exhibit",
      "art collection",
      "heritage center",
      "art_gallery",
    ],
  },
  {
    category: "restaurant",
    keywords: [
      "restaurant",
      "bistro",
      "grill",
      "diner",
      "eatery",
      "steakhouse",
      "pizzeria",
      "sushi",
      "taco",
      "ramen",
      "food hall",
      "food",
      "meal_takeaway",
      "meal_delivery",
    ],
  },
  {
    category: "coffee_shop",
    keywords: [
      "coffee",
      "café",
      "cafe",
      "espresso",
      "tea house",
      "bakery",
      "patisserie",
    ],
  },
  {
    category: "park",
    keywords: [
      "park",
      "garden",
      "botanical",
      "greenway",
      "trail",
      "nature reserve",
      "high line",
      "highline",
      "natural_feature",
      "campground",
    ],
  },
  {
    category: "beach",
    keywords: ["beach", "shore", "coast", "waterfront", "boardwalk", "pier"],
  },
  {
    category: "religious_site",
    keywords: [
      "church",
      "cathedral",
      "temple",
      "mosque",
      "synagogue",
      "basilica",
      "chapel",
      "shrine",
      "place_of_worship",
      "hindu_temple",
    ],
  },
  {
    category: "shopping",
    keywords: [
      "mall",
      "shopping",
      "market",
      "bazaar",
      "outlet",
      "boutique",
      "store",
      "soho",
      "shopping_mall",
      "clothing_store",
      "shoe_store",
      "electronics_store",
      "book_store",
      "supermarket",
    ],
  },
  {
    category: "entertainment",
    keywords: [
      "theater",
      "theatre",
      "cinema",
      "concert",
      "arena",
      "stadium",
      "zoo",
      "aquarium",
      "amusement",
      "theme park",
      "amusement_park",
      "movie_theater",
      "bowling_alley",
    ],
  },
  {
    category: "nightlife",
    keywords: [
      "bar",
      "club",
      "pub",
      "lounge",
      "nightclub",
      "speakeasy",
      "rooftop bar",
      "night_club",
    ],
  },
  {
    category: "landmark",
    keywords: [
      "statue",
      "monument",
      "tower",
      "bridge",
      "building",
      "square",
      "plaza",
      "memorial",
      "observation",
      "viewpoint",
      "skyline",
      "skyscraper",
      "iconic",
      "historic",
      "tourist_attraction",
    ],
  },
];

// Direct Google Places type to PlaceCategory mapping for O(1) fast-path matching
const DIRECT_TYPE_MAP: Record<string, PlaceCategory> = {
  restaurant: "restaurant",
  food: "restaurant",
  meal_takeaway: "restaurant",
  meal_delivery: "restaurant",
  cafe: "coffee_shop",
  bakery: "coffee_shop",
  coffee_shop: "coffee_shop",
  museum: "museum",
  art_gallery: "museum",
  park: "park",
  natural_feature: "park",
  campground: "park",
  beach: "beach",
  church: "religious_site",
  place_of_worship: "religious_site",
  hindu_temple: "religious_site",
  mosque: "religious_site",
  synagogue: "religious_site",
  shopping_mall: "shopping",
  clothing_store: "shopping",
  shoe_store: "shopping",
  electronics_store: "shopping",
  book_store: "shopping",
  supermarket: "shopping",
  department_store: "shopping",
  store: "shopping",
  tourist_attraction: "landmark",
  historical_landmark: "landmark",
  point_of_interest: "landmark",
  movie_theater: "entertainment",
  amusement_park: "entertainment",
  bowling_alley: "entertainment",
  aquarium: "entertainment",
  zoo: "entertainment",
  stadium: "entertainment",
  bar: "nightlife",
  night_club: "nightlife",
  casino: "nightlife",
};

export function autoCategorize(
  name: string,
  description: string = "",
  types: string[] = []
): PlaceCategory {
  // Fast path: Check Google Places types against direct category mappings
  if (types.length > 0) {
    for (const t of types) {
      const match = DIRECT_TYPE_MAP[t.toLowerCase()];
      if (match) return match;
    }
  }

  const text = `${name} ${description} ${types.join(" ")}`.toLowerCase();

  // Check each category's keywords
  for (const { category, keywords } of KEYWORD_MAP) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return category;
      }
    }
  }

  return "other";
}
