import { emitApiError } from "./apiErrorBus";
import { apiUsageService } from "./apiUsageService";
import { getDistance, estimateTime } from "../utils/distance";
import {
  isJapanCoordinate,
  calculateJapanStationTransit,
} from "./ekispertService";
import { TransitLegBreakdown } from "../types";

const getApiKey = () => apiUsageService.getActiveMapsKey();

// Persistent cache for search queries
const CACHE_KEY = "reroute_search_cache_v2";
let searchCache: Record<string, any[]> = JSON.parse(
  localStorage.getItem(CACHE_KEY) || "{}",
);

export const clearMapsCache = () => {
  searchCache = {};
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem("reroute_search_cache");
  photoUrlCache = {};
  localStorage.removeItem(PHOTO_URL_CACHE_KEY);
};

const saveToCache = (query: string, results: any[]) => {
  searchCache[query] = results;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(searchCache));
  } catch (e) {
    console.warn("Search cache persistence failed:", e);
  }
};

// --- Photo URL cache (photoName -> resolved CDN URL, persisted) ---
const PHOTO_URL_CACHE_KEY = "reroute_photo_url_cache_v1";
let photoUrlCache: Record<string, string> = JSON.parse(
  localStorage.getItem(PHOTO_URL_CACHE_KEY) || "{}"
);

const savePhotoUrl = (photoName: string, url: string) => {
  photoUrlCache[photoName] = url;
  try {
    localStorage.setItem(PHOTO_URL_CACHE_KEY, JSON.stringify(photoUrlCache));
  } catch (e) {
    console.warn("Photo URL cache persistence failed:", e);
  }
};

/**
 * Lazily resolves a Places API photo reference to a CDN URL.
 * Results are persisted so the same photo is never fetched twice across sessions.
 */
export const resolvePhotoUrl = async (photoName: string, apiKey: string): Promise<string | undefined> => {
  if (!photoName || !apiKey) return undefined;
  if (photoUrlCache[photoName]) return photoUrlCache[photoName];

  try {
    apiUsageService.recordCall("maps_photo");
    const photoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?key=${apiKey}&maxHeightPx=400&skipHttpRedirect=true`
    );
    if (photoRes.ok) {
      const pData = await photoRes.json();
      const url: string | undefined = pData.photoUri;
      if (url) savePhotoUrl(photoName, url);
      return url;
    }
  } catch (e) {
    console.warn("Failed to resolve photo URL:", e);
  }
  return undefined;
};

const ROUTES_CACHE_KEY = "reroute_routes_cache_v3";
const ROUTES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type CachedRoute = { distanceM: number; durationS: number; savedAt?: number };
let routesCache: Record<string, CachedRoute> = {};

// Hydrate routes cache, evicting stale entries on load
try {
  const raw = JSON.parse(localStorage.getItem(ROUTES_CACHE_KEY) || "{}");
  const now = Date.now();
  for (const [k, v] of Object.entries(raw) as [string, CachedRoute][]) {
    if (!v.savedAt || now - v.savedAt < ROUTES_CACHE_TTL_MS) {
      routesCache[k] = v;
    }
  }
} catch (e) {
  console.warn("Routes cache load failed:", e);
}

const saveToRoutesCache = (key: string, result: { distanceM: number; durationS: number }) => {
  routesCache[key] = { ...result, savedAt: Date.now() };
  try {
    localStorage.setItem(ROUTES_CACHE_KEY, JSON.stringify(routesCache));
  } catch (e) {
    console.warn("Routes cache persistence failed:", e);
  }
};

export interface MapsPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  openingHours?: string[];
  editorialSummary?: string;
  photoReference?: string; // Raw Places API photo name — resolve lazily via resolvePhotoUrl()
  photoUrl?: string;
  priceLevel?: string;
  priceEstimate?: string;
}

export const searchPlaces = async (
  query: string,
  biasLocation?: { lat: number; lng: number }
): Promise<MapsPlace[]> => {
  if (!query) return [];

  const cacheKey = biasLocation
    ? `${query}_${biasLocation.lat.toFixed(1)}_${biasLocation.lng.toFixed(1)}`
    : query;

  if (searchCache[cacheKey]) {
    const cached = searchCache[cacheKey];
    const hasLegacy = cached.some((p: any) => p.photoUrl && p.photoUrl.includes("places.googleapis.com"));
    if (!hasLegacy) {
      apiUsageService.recordCacheHit();
      return cached;
    }
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Google Maps API Key is missing. Please configure one in Settings/API Budget.");
  }

  try {
    apiUsageService.recordCall("maps_search");
    const response = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.regularOpeningHours,places.editorialSummary,places.photos,places.priceLevel",
        },
        body: JSON.stringify({
          textQuery: query,
          ...(biasLocation && {
            locationBias: {
              circle: {
                center: {
                  latitude: biasLocation.lat,
                  longitude: biasLocation.lng,
                },
                radius: 50000.0, // 50km radius
              },
            },
          }),
        }),
      },
    );

    if (!response.ok) {
      let errorMessage = "Failed to search places";
      let isQuota = false;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
        isQuota = response.status === 429 || errorMessage.toLowerCase().includes("quota");
      } catch (e) {}
      emitApiError({ source: "google-maps", message: errorMessage, isQuota });
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (!data.places) return [];

    const mapped: MapsPlace[] = data.places.map((p: any) => {
        let priceEstimate: string | undefined = undefined;
        if (p.priceLevel) {
          switch (p.priceLevel) {
            case "PRICE_LEVEL_FREE":        priceEstimate = "Free"; break;
            case "PRICE_LEVEL_INEXPENSIVE": priceEstimate = "$"; break;
            case "PRICE_LEVEL_MODERATE":    priceEstimate = "$$"; break;
            case "PRICE_LEVEL_EXPENSIVE":   priceEstimate = "$$$"; break;
            case "PRICE_LEVEL_VERY_EXPENSIVE": priceEstimate = "$$$$"; break;
          }
        }
        return {
          id: p.id,
          name: p.displayName?.text || "",
          address: p.formattedAddress || "",
          lat: p.location?.latitude || 0,
          lng: p.location?.longitude || 0,
          types: p.types || [],
          openingHours: p.regularOpeningHours?.weekdayDescriptions || [],
          editorialSummary: p.editorialSummary?.text,
          // Store raw photo reference; caller resolves URL lazily via resolvePhotoUrl()
          photoReference: p.photos?.[0]?.name,
          photoUrl: undefined,
          priceLevel: p.priceLevel,
          priceEstimate,
        };
      });

    saveToCache(cacheKey, mapped);
    return mapped;
  } catch (error) {
    console.error("Maps Search Error:", error);
    throw error;
  }
};

export const fetchRouteSegment = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: "driving" | "transit" | "walking",
  departureTime?: Date
): Promise<{
  distanceM: number;
  durationS: number;
  isHeuristic?: boolean;
  heuristicReason?: string;
  stationFrom?: string;
  stationTo?: string;
  transitUrl?: string;
  transitDetails?: TransitLegBreakdown;
}> => {
  // Format mode for API
  let travelMode = "DRIVE";
  if (mode === "transit") travelMode = "TRANSIT";
  if (mode === "walking") travelMode = "WALK";

  // Cache key: round coords to 4 decimals + travel mode + departure time bucket for transit
  const oLat = origin.lat.toFixed(4);
  const oLng = origin.lng.toFixed(4);
  const dLat = destination.lat.toFixed(4);
  const dLng = destination.lng.toFixed(4);

  // For transit, bucket by time-of-day so AM/PM/Evening get distinct cache entries
  const timeBucket = (mode === "transit" && departureTime)
    ? (departureTime.getHours() < 12 ? "AM" : departureTime.getHours() < 18 ? "PM" : "EVE")
    : "ANY";
  const cacheKey = `${oLat},${oLng}_${dLat},${dLng}_${travelMode}_${timeBucket}`;

  if (routesCache[cacheKey]) {
    apiUsageService.recordCacheHit();
    return routesCache[cacheKey];
  }

  // Handle Japan Transit via Ekispert Station-Aware Modeling
  if (mode === "transit" && isJapanCoordinate(origin.lat, origin.lng) && isJapanCoordinate(destination.lat, destination.lng)) {
    try {
      const ekispertResult = await calculateJapanStationTransit(origin, destination);
      if (ekispertResult) {
        saveToRoutesCache(cacheKey, ekispertResult);
        return ekispertResult;
      }
    } catch (err) {
      console.warn("Station transit calculation error, falling back to geometric estimate:", err);
    }
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    const dist = getDistance(origin.lat, origin.lng, destination.lat, destination.lng);
    const durationS = Math.round(estimateTime(dist, mode));
    return {
      distanceM: Math.round(dist),
      durationS,
      isHeuristic: true,
      heuristicReason: mode === "transit"
        ? "No Google Maps API key; transit calculated using geometric velocity heuristic."
        : "Estimated geometrically without live API.",
    };
  }

  try {
    apiUsageService.recordCall("maps_route");
    const body: any = {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: travelMode,
      ...(travelMode === "DRIVE" && { routingPreference: "TRAFFIC_AWARE" }),
    };

    if (travelMode === "TRANSIT" && departureTime) {
      body.departureTime = departureTime.toISOString();
    }

    const response = await fetch(`https://routes.googleapis.com/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage = "Failed to fetch route";
      let isQuota = false;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
        isQuota = response.status === 429 && errorMessage.toLowerCase().includes("quota");
      } catch (e) {}
      emitApiError({ source: "google-maps", message: errorMessage, isQuota });
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) {
      if (mode === "transit") {
        const dist = getDistance(origin.lat, origin.lng, destination.lat, destination.lng);
        const durationS = Math.round(estimateTime(dist, "transit"));
        const fallbackResult = {
          distanceM: Math.round(dist),
          durationS,
          isHeuristic: true,
          heuristicReason: "Live transit routing unavailable; estimated using regional transit velocity."
        };
        saveToRoutesCache(cacheKey, fallbackResult);
        return fallbackResult;
      }
      throw new Error("No route found");
    }

    const distanceM = route.distanceMeters || 0;
    const durationS = route.duration ? parseInt(route.duration.replace("s", "")) : 0;

    const result = { distanceM, durationS, isHeuristic: false };
    saveToRoutesCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Maps Routes Error:", error);
    if (mode === "transit") {
      const dist = getDistance(origin.lat, origin.lng, destination.lat, destination.lng);
      const durationS = Math.round(estimateTime(dist, "transit"));
      return {
        distanceM: Math.round(dist),
        durationS,
        isHeuristic: true,
        heuristicReason: "Live transit routing unavailable; estimated using regional transit velocity."
      };
    }
    throw error;
  }
};

export const fetchFreshPhoto = async (place: {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
}): Promise<string | undefined> => {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === "undefined") return undefined;

  let photoName: string | undefined = undefined;
  if (place.id && place.id.startsWith("ChIJ")) {
    try {
      apiUsageService.recordCall("maps_photo");
      const r = await fetch(`https://places.googleapis.com/v1/places/${place.id}`, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,photos",
        },
      });
      if (r.ok) {
        const d = await r.json();
        photoName = d.photos?.[0]?.name;
      }
    } catch (e) {
      console.warn("Place details photo lookup failed:", e);
    }
  }

  if (photoName) {
    try {
      apiUsageService.recordCall("maps_photo");
      const photoRes = await fetch(
        `https://places.googleapis.com/v1/${photoName}/media?key=${apiKey}&maxHeightPx=400&skipHttpRedirect=true`
      );
      if (photoRes.ok) {
        const pData = await photoRes.json();
        return pData.photoUri;
      }
    } catch (e) {
      console.warn("Photo media redirect lookup failed:", e);
    }
  }

  try {
    const queryStr = place.address ? `${place.name} ${place.address}` : place.name;
    const searchResults = await searchPlaces(
      queryStr,
      place.lat && place.lng ? { lat: place.lat, lng: place.lng } : undefined
    );
    if (searchResults && searchResults.length > 0) {
      return searchResults[0].photoUrl;
    }
  } catch (e) {
    console.warn("Search fallback photo lookup failed:", e);
  }

  return undefined;
};
