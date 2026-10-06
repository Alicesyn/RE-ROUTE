import { TravelMode } from "../types";

export interface PhysicalLocation {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface GoogleMapsRoutePart {
  label: string;
  stopCount: number;
  url: string;
}

export interface DayGoogleMapsRouteResult {
  totalStops: number;
  primaryUrl: string;
  parts: GoogleMapsRoutePart[];
}

/**
 * Formats a location into a search query string suitable for Google Maps URLs.
 * Prefers "Name Address" (or "Name" / "Address" if only one exists),
 * falling back to "lat,lng" coordinates if name and address are both missing.
 */
export function formatLocationQuery(loc: PhysicalLocation): string {
  const name = loc.name?.trim() || "";
  const address = loc.address?.trim() || "";

  if (name && address) {
    if (address.toLowerCase().includes(name.toLowerCase())) {
      return address;
    }
    return `${name} ${address}`;
  }
  if (name) return name;
  if (address) return address;
  if (loc.lat !== undefined && loc.lng !== undefined) {
    return `${loc.lat},${loc.lng}`;
  }
  return "";
}

const routeCache = new Map<string, DayGoogleMapsRouteResult | null>();
const MAX_CACHE_SIZE = 300;

/**
 * Constructs a Google Maps directions URL (or search URL if single stop)
 * for a sequence of stops in the order provided.
 *
 * Utilizes an in-memory LRU cache to prevent redundant URL string allocations
 * during drag-and-drop or viewport re-renders.
 *
 * Handles Google Maps' 10-stop limit by chunking routes with > 10 stops into continuous parts
 * (e.g. Part 1: Stops 1–10, Part 2: Stops 10–15).
 *
 * Automatically handles travel modes:
 * - Walking and driving apply to multi-stop routes.
 * - Transit is applied only when stops === 2, because Google Maps does not support multi-stop transit directions.
 */
export function buildDayGoogleMapsRoute(
  rawLocations: PhysicalLocation[],
  travelMode?: TravelMode
): DayGoogleMapsRouteResult | null {
  if (!rawLocations || rawLocations.length === 0) {
    return null;
  }

  // Fast cache key calculation
  let cacheKey = travelMode || "none";
  for (let i = 0; i < rawLocations.length; i++) {
    const loc = rawLocations[i];
    cacheKey += `~${loc.name || ""},${loc.address || ""},${loc.lat ?? ""},${loc.lng ?? ""}`;
  }

  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  const result = computeDayGoogleMapsRoute(rawLocations, travelMode);

  if (routeCache.size >= MAX_CACHE_SIZE) {
    const firstKey = routeCache.keys().next().value;
    if (firstKey) routeCache.delete(firstKey);
  }
  routeCache.set(cacheKey, result);

  return result;
}

function computeDayGoogleMapsRoute(
  rawLocations: PhysicalLocation[],
  travelMode?: TravelMode
): DayGoogleMapsRouteResult | null {
  // Filter out invalid/empty queries and consecutive duplicate locations
  const formattedLocations: string[] = [];

  for (const loc of rawLocations) {
    const q = formatLocationQuery(loc);
    if (!q) continue;

    // Skip consecutive identical points (e.g. accidental duplicates or 0-distance loops)
    if (
      formattedLocations.length > 0 &&
      formattedLocations[formattedLocations.length - 1].toLowerCase() === q.toLowerCase()
    ) {
      continue;
    }

    formattedLocations.push(q);
  }

  if (formattedLocations.length === 0) {
    return null;
  }

  // Single stop: open direct Google Maps search / place pin
  if (formattedLocations.length === 1) {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedLocations[0])}`;
    return {
      totalStops: 1,
      primaryUrl: url,
      parts: [
        {
          label: "Google Maps (1 stop)",
          stopCount: 1,
          url,
        },
      ],
    };
  }

  // 2 to 10 stops: standard single directions URL
  const CHUNK_SIZE = 10;
  if (formattedLocations.length <= CHUNK_SIZE) {
    const origin = formattedLocations[0];
    const destination = formattedLocations[formattedLocations.length - 1];
    const waypoints = formattedLocations.slice(1, -1);

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
    if (waypoints.length > 0) {
      url += `&waypoints=${waypoints.map((w) => encodeURIComponent(w)).join("%7C")}`;
    }

    if (travelMode === "walking") {
      url += `&travelmode=walking`;
    } else if (travelMode === "driving") {
      url += `&travelmode=driving`;
    } else if (travelMode === "transit" && formattedLocations.length === 2) {
      url += `&travelmode=transit`;
    }

    return {
      totalStops: formattedLocations.length,
      primaryUrl: url,
      parts: [
        {
          label: `Google Maps Route (${formattedLocations.length} stops)`,
          stopCount: formattedLocations.length,
          url,
        },
      ],
    };
  }

  // > 10 stops: Chunk into multiple parts (up to 10 destinations each, sharing endpoint for continuity)
  const parts: GoogleMapsRoutePart[] = [];
  let startIndex = 0;
  let partNumber = 1;

  while (startIndex < formattedLocations.length - 1) {
    const endIndex = Math.min(startIndex + CHUNK_SIZE - 1, formattedLocations.length - 1);
    const chunk = formattedLocations.slice(startIndex, endIndex + 1);

    const origin = chunk[0];
    const destination = chunk[chunk.length - 1];
    const waypoints = chunk.slice(1, -1);

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
    if (waypoints.length > 0) {
      url += `&waypoints=${waypoints.map((w) => encodeURIComponent(w)).join("%7C")}`;
    }

    if (travelMode === "walking") {
      url += `&travelmode=walking`;
    } else if (travelMode === "driving") {
      url += `&travelmode=driving`;
    } else if (travelMode === "transit" && chunk.length === 2) {
      url += `&travelmode=transit`;
    }

    parts.push({
      label: `Part ${partNumber} (Stops ${startIndex + 1}–${endIndex + 1})`,
      stopCount: chunk.length,
      url,
    });

    partNumber++;
    startIndex = endIndex;
    if (endIndex === formattedLocations.length - 1) break;
  }

  return {
    totalStops: formattedLocations.length,
    primaryUrl: parts[0]?.url || "",
    parts,
  };
}
