import { PlaceCategory } from "../types";

// Default visit duration per category (in minutes)
export const CATEGORY_DEFAULTS: Record<
  PlaceCategory,
  { label: string; duration: number; emoji: string; minTimeBetween?: number | null }
> = {
  museum: { label: "Museum", duration: 120, emoji: "🏛️" },
  restaurant: { label: "Restaurant", duration: 90, emoji: "🍽️", minTimeBetween: 180 },
  coffee_shop: { label: "Coffee Shop", duration: 20, emoji: "☕" },
  park: { label: "Park", duration: 60, emoji: "🌳" },
  landmark: { label: "Landmark", duration: 30, emoji: "📸" },
  shopping: { label: "Shopping", duration: 30, emoji: "🛍️" },
  entertainment: { label: "Entertainment", duration: 120, emoji: "🎭" },
  beach: { label: "Beach", duration: 150, emoji: "🏖️" },
  religious_site: { label: "Religious Site", duration: 30, emoji: "⛪" },
  nightlife: { label: "Nightlife", duration: 100, emoji: "🍷" },
  other: { label: "Other", duration: 60, emoji: "📍" },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_DEFAULTS) as PlaceCategory[];
