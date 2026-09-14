import { PlaceCategory } from "../types";

import { useRouteStore } from "../store/useRouteStore";
import { CATEGORY_DEFAULTS, ALL_CATEGORIES } from "./categoryConstants";

export { CATEGORY_DEFAULTS, ALL_CATEGORIES };

export function getCategoryLabel(cat: PlaceCategory): string {
  return CATEGORY_DEFAULTS[cat]?.label ?? "Other";
}

export function getCategoryFallbackImage(cat: PlaceCategory): string {
  return CATEGORY_DEFAULTS[cat]?.fallbackImage ?? CATEGORY_DEFAULTS.other.fallbackImage;
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
  // If it's a direct Google CDN or external photo, use directly
  if (photoUrl.includes("googleusercontent.com") || photoUrl.includes("loremflickr.com")) {
    return photoUrl;
  }
  // Prevent raw places.googleapis.com redirect URLs from rendering in <img> to avoid Safari 400 errors
  if (photoUrl.includes("places.googleapis.com")) {
    return undefined;
  }
  return photoUrl;
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

export function autoCategorize(
  name: string,
  description: string = "",
  types: string[] = []
): PlaceCategory {
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
