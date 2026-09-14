import { PlaceCategory } from "../types";

// Default visit duration per category (in minutes)
export const CATEGORY_DEFAULTS: Record<
  PlaceCategory,
  { label: string; duration: number; emoji: string; fallbackImage: string; minTimeBetween?: number | null }
> = {
  museum: { label: "Museum", duration: 120, emoji: "🏛️", fallbackImage: "https://loremflickr.com/800/600/museum,exhibit" },
  restaurant: { label: "Restaurant", duration: 90, emoji: "🍽️", fallbackImage: "https://loremflickr.com/800/600/restaurant,dining", minTimeBetween: 180 },
  coffee_shop: { label: "Coffee Shop", duration: 20, emoji: "☕", fallbackImage: "https://loremflickr.com/800/600/coffeeshop,latte" },
  park: { label: "Park", duration: 60, emoji: "🌳", fallbackImage: "https://loremflickr.com/800/600/park,nature" },
  landmark: { label: "Landmark", duration: 30, emoji: "📸", fallbackImage: "https://loremflickr.com/800/600/landmark,city" },
  shopping: { label: "Shopping", duration: 30, emoji: "🛍️", fallbackImage: "https://loremflickr.com/800/600/shopping,mall" },
  entertainment: { label: "Entertainment", duration: 120, emoji: "🎭", fallbackImage: "https://loremflickr.com/800/600/entertainment,theater" },
  beach: { label: "Beach", duration: 150, emoji: "🏖️", fallbackImage: "https://loremflickr.com/800/600/beach,ocean" },
  religious_site: { label: "Religious Site", duration: 30, emoji: "⛪", fallbackImage: "https://loremflickr.com/800/600/temple,church" },
  nightlife: { label: "Nightlife", duration: 100, emoji: "🍷", fallbackImage: "https://loremflickr.com/800/600/nightlife,bar" },
  other: { label: "Other", duration: 60, emoji: "📍", fallbackImage: "https://loremflickr.com/800/600/city,street" },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_DEFAULTS) as PlaceCategory[];
