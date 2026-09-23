import type { Place } from "../types";
import { searchPlaces } from "../services/mapsService";
import { parseOpeningHoursString } from "./timeUtils";

/**
 * Google Maps 'types' that indicate a geographic area/district rather than a specific business.
 * Places with these types often have no meaningful openingHours of their own.
 */
const AREA_TYPES = new Set([
  "neighborhood",
  "locality",
  "sublocality",
  "sublocality_level_1",
  "route",
  "street_address",
  "political",
  "colloquial_area",
]);

/**
 * Categories for which opening hours meaningfully affect scheduling.
 */
const HOUR_SENSITIVE_CATEGORIES = new Set(["shopping", "restaurant", "coffee_shop", "nightlife"]);

/**
 * Returns true if the place represents a street/neighborhood/district rather than
 * a single business.
 */
export const isAreaPlace = (place: {
  category?: Place["category"];
  openingHours?: string[];
  types?: string[];
  isArea?: boolean;
  areaNote?: string;
}): boolean => {
  if (place.isArea || Boolean(place.areaNote)) return true;
  if (!place.category || !HOUR_SENSITIVE_CATEGORIES.has(place.category)) return false;
  if (place.openingHours && place.openingHours.length > 0 && !place.areaNote) return false;
  const types: string[] = place.types || [];
  return types.some((t) => AREA_TYPES.has(t));
};

/**
 * Returns true if this area place still needs its opening hours derived.
 */
export const shouldDeriveAreaOpeningHours = (place: {
  category?: Place["category"];
  openingHours?: string[];
  types?: string[];
  isArea?: boolean;
  areaNote?: string;
}): boolean => {
  if (place.areaNote) return false;
  if (!place.category || !HOUR_SENSITIVE_CATEGORIES.has(place.category)) return false;
  if (place.openingHours && place.openingHours.length > 0) return false;
  if (place.isArea) return true;
  const types: string[] = place.types || [];
  return types.some((t) => AREA_TYPES.has(t));
};

export interface AreaShopInfo {
  name: string;
  hours: string; // e.g. "11:00 AM – 8:00 PM"
}

export interface AreaHoursResult {
  /** Synthetic 7-day openingHours array for the optimizer, e.g. ["Monday: 11:00 AM – 8:00 PM", ...] */
  hours: string[];
  /** Individual shops found in the area, with their representative hours */
  shops: AreaShopInfo[];
  /**
   * Human-readable note to store on place.areaNote and note in description, e.g.:
   *   "Area shops typically open 11:00 AM – 8:00 PM. Qualifying places: 2nd Street (11 AM–8 PM), Flamingo (12 PM–8 PM)."
   */
  areaNote: string;
}

/**
 * Derives representative opening hours for an area/district place by searching
 * for actual businesses in the vicinity and aggregating their opening hours.
 *
 * Returns an AreaHoursResult with:
 *   - hours: synthetic openingHours array for the optimizer
 *   - shops: list of qualifying businesses found with their hours
 *   - areaNote: human-readable description note for the place card
 */
export const deriveAreaOpeningHours = async (
  place: Pick<Place, "name" | "lat" | "lng" | "category"> & {
    openingHours?: string[];
    types?: string[];
    isArea?: boolean;
    areaNote?: string;
  },
  appMode: "real" | "mock" | "dropdown-mock",
): Promise<AreaHoursResult | null> => {
  if (!isAreaPlace(place) && !shouldDeriveAreaOpeningHours(place)) return null;

  if (appMode !== "real") {
    const isRestaurant = place.category === "restaurant";
    const categoryQuery = isRestaurant ? "restaurants" : "shops";
    const repHoursStr = isRestaurant ? "11:30 AM – 9:30 PM" : "11:00 AM – 8:00 PM";
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const hours = days.map((day) => `${day}: ${repHoursStr}`);
    const sampleShops: AreaShopInfo[] = isRestaurant
      ? [
          { name: `${place.name} Dining Lane`, hours: "11:30 AM–9:30 PM" },
          { name: "Local Izakaya & Bistro", hours: "12:00 PM–10:00 PM" },
          { name: "Specialty Cafe", hours: "11:00 AM–8:00 PM" },
        ]
      : [
          { name: "2nd Street Vintage", hours: "11:00 AM–8:00 PM" },
          { name: "Select Apparel Boutique", hours: "11:30 AM–7:30 PM" },
          { name: "Local Retail & Crafts", hours: "12:00 PM–8:00 PM" },
        ];
    const shopListStr = sampleShops.map((s) => `${s.name} (${s.hours})`).join(", ");
    const areaNote = `Area ${categoryQuery} typically open ${repHoursStr}. Qualifying places: ${shopListStr}.`;
    return { hours, shops: sampleShops, areaNote };
  }

  try {
    const categoryQuery = place.category === "restaurant" ? "restaurants" : "shops";
    const query = `${categoryQuery} in ${place.name}`;
    const results = await searchPlaces(query, { lat: place.lat, lng: place.lng });

    const openMinutes: number[] = [];
    const closeMinutes: number[] = [];
    const shops: AreaShopInfo[] = [];

    const toTimeStr = (minutes: number): string => {
      const h = Math.floor(minutes / 60) % 24;
      const m = minutes % 60;
      const period = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 || 12;
      const displayM = m < 10 ? `0${m}` : `${m}`;
      // Omit ":00" for clean display (e.g. "11 AM" not "11:00 AM")
      return m === 0 ? `${displayH} ${period}` : `${displayH}:${displayM} ${period}`;
    };

    for (const r of results) {
      if (!r.openingHours || r.openingHours.length === 0) continue;
      // Try Monday first, then any non-closed entry
      const entry =
        r.openingHours.find((h: string) => h.toLowerCase().startsWith("monday")) ||
        r.openingHours.find((h: string) => !h.toLowerCase().includes("closed")) ||
        r.openingHours[0];
      if (!entry) continue;
      const parsed = parseOpeningHoursString(entry);
      if (parsed && parsed !== "closed" && parsed !== "24hours") {
        openMinutes.push(parsed.open);
        closeMinutes.push(parsed.close);
        shops.push({
          name: r.name,
          hours: `${toTimeStr(parsed.open)}–${toTimeStr(parsed.close)}`,
        });
      }
    }

    if (openMinutes.length === 0) return null;

    // Median open/close time for a robust representative range
    const median = (arr: number[]): number => {
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
    };

    const repOpen = median(openMinutes);
    const repClose = median(closeMinutes);
    const repHoursStr = `${toTimeStr(repOpen)} – ${toTimeStr(repClose)}`;

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const hours = days.map((day) => `${day}: ${repHoursStr}`);

    // Build a readable area note listing up to 5 notable shops
    const shopListStr = shops
      .slice(0, 5)
      .map((s) => `${s.name} (${s.hours})`)
      .join(", ");

    const areaNote =
      `Area ${categoryQuery} typically open ${repHoursStr}.` +
      (shops.length > 0 ? ` Qualifying places: ${shopListStr}${shops.length > 5 ? ` and ${shops.length - 5} more` : ""}.` : "");

    return { hours, shops, areaNote };
  } catch (e) {
    console.warn(`deriveAreaOpeningHours failed for "${place.name}":`, e);
    return null;
  }
};
