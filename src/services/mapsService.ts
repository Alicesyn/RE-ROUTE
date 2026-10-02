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
const CACHE_KEY = "reroute_search_cache_v3";
let searchCache: Record<string, any[]> = JSON.parse(
  localStorage.getItem(CACHE_KEY) || "{}"
);

// Cache capacity limits (optimized for multi-week itineraries with ~1 MB localStorage budget)
const MAX_SEARCH_CACHE = 1000;
const MAX_PHOTO_CACHE = 2000;
const MAX_ROUTES_CACHE = 3000;
const NO_PHOTO_CACHE_KEY = "reroute_no_photo_cache_v1";

// Persistent negative photo cache to avoid repeatedly checking places with no Google Maps photos
let noPhotoCache: Record<string, boolean> = {};
try {
  noPhotoCache = JSON.parse(localStorage.getItem(NO_PHOTO_CACHE_KEY) || "{}");
} catch {
  noPhotoCache = {};
}

// In-flight request deduplication maps
const pendingRouteRequests = new Map<string, Promise<any>>();
const pendingPhotoRequests = new Map<string, Promise<string | undefined>>();

export const clearRoutesCache = () => {
  for (const k of Object.keys(routesCache)) {
    delete routesCache[k];
  }
  localStorage.removeItem(ROUTES_CACHE_KEY);
  localStorage.removeItem("reroute_routes_cache_v3");
  localStorage.removeItem("reroute_routes_cache_v2");
};

export const clearPhotosCache = () => {
  for (const k of Object.keys(photoUrlCache)) {
    delete photoUrlCache[k];
  }
  for (const k of Object.keys(noPhotoCache)) {
    delete noPhotoCache[k];
  }
  localStorage.removeItem(PHOTO_URL_CACHE_KEY);
  localStorage.removeItem(NO_PHOTO_CACHE_KEY);
};

export const clearSearchCache = () => {
  for (const k of Object.keys(searchCache)) {
    delete searchCache[k];
  }
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem("reroute_search_cache_v2");
  localStorage.removeItem("reroute_search_cache");
};

export const clearMapsCache = () => {
  clearSearchCache();
  clearPhotosCache();
  clearRoutesCache();
};

const pruneLruCache = (cache: Record<string, any>, maxItems: number) => {
  const entries = Object.entries(cache);
  if (entries.length > maxItems) {
    entries.sort((a, b) => {
      const timeA = a[1]?.lastUsedAt || a[1]?.savedAt || 0;
      const timeB = b[1]?.lastUsedAt || b[1]?.savedAt || 0;
      return timeA - timeB;
    });
    const toRemoveCount = entries.length - maxItems;
    for (let i = 0; i < toRemoveCount; i++) {
      delete cache[entries[i][0]];
    }
  }
};

const saveNoPhoto = (key: string) => {
  noPhotoCache[key] = true;
  pruneLruCache(noPhotoCache, MAX_PHOTO_CACHE);
  try {
    localStorage.setItem(NO_PHOTO_CACHE_KEY, JSON.stringify(noPhotoCache));
  } catch (e) {
    console.warn("No-photo cache persistence failed:", e);
  }
};

const saveToCache = (query: string, results: any[]) => {
  searchCache[query] = results;
  pruneLruCache(searchCache, MAX_SEARCH_CACHE);
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
  pruneLruCache(photoUrlCache, MAX_PHOTO_CACHE);
  try {
    localStorage.setItem(PHOTO_URL_CACHE_KEY, JSON.stringify(photoUrlCache));
  } catch (e) {
    console.warn("Photo URL cache persistence failed:", e);
  }
};

/**
 * Lazily resolves a Places API photo reference to a CDN URL.
 * Results are persisted so the same photo is never fetched twice across sessions.
 * Automatically requests smaller thumbnails (300px) on mobile viewports to save cellular bandwidth.
 */
export const resolvePhotoUrl = async (photoName: string, apiKey?: string): Promise<string | undefined> => {
  const activeKey = apiKey || getApiKey();
  if (!photoName || !activeKey || activeKey === "undefined") return undefined;
  if (photoUrlCache[photoName]) return photoUrlCache[photoName];

  try {
    apiUsageService.recordCall("maps_photo");
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    const maxHeightPx = isMobile ? 300 : 400;
    const photoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?key=${activeKey}&maxHeightPx=${maxHeightPx}&skipHttpRedirect=true`
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

const ROUTES_CACHE_KEY = "reroute_routes_cache_v4";
const ROUTES_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

type CachedRoute = {
  distanceM: number;
  durationS: number;
  isHeuristic?: boolean;
  heuristicReason?: string;
  stationFrom?: string;
  stationTo?: string;
  transitUrl?: string;
  transitDetails?: TransitLegBreakdown;
  savedAt?: number;
  lastUsedAt?: number;
};
const routesCache: Record<string, CachedRoute> = {};

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

const saveToRoutesCache = (key: string, result: any, symmetricKey?: string) => {
  const now = Date.now();
  const entry: CachedRoute = { ...result, savedAt: now, lastUsedAt: now };
  routesCache[key] = entry;
  if (symmetricKey && symmetricKey !== key) {
    routesCache[symmetricKey] = { ...entry };
  }
  pruneLruCache(routesCache, MAX_ROUTES_CACHE);
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
  businessStatus?: string;
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
            "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.regularOpeningHours,places.editorialSummary,places.photos,places.priceLevel,places.businessStatus",
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
          businessStatus: p.businessStatus || "OPERATIONAL",
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

  // Cache key: round coords to 4 decimals (~11m precision) + travel mode + departure time bucket for transit
  const oLat = origin.lat.toFixed(4);
  const oLng = origin.lng.toFixed(4);
  const dLat = destination.lat.toFixed(4);
  const dLng = destination.lng.toFixed(4);

  // For transit, bucket by time-of-day so AM/PM/Evening get distinct cache entries
  const timeBucket = (mode === "transit" && departureTime)
    ? (departureTime.getHours() < 12 ? "AM" : departureTime.getHours() < 18 ? "PM" : "EVE")
    : "ANY";
  const cacheKey = `${oLat},${oLng}_${dLat},${dLng}_${travelMode}_${timeBucket}`;
  const reverseCacheKey = mode === "walking"
    ? `${dLat},${dLng}_${oLat},${oLng}_${travelMode}_${timeBucket}`
    : undefined;

  // 1. Check forward cache
  if (routesCache[cacheKey]) {
    routesCache[cacheKey].lastUsedAt = Date.now();
    apiUsageService.recordCacheHit();
    return routesCache[cacheKey];
  }
  // 2. Check symmetric reverse cache for walking (A->B has identical distance and walking speed to B->A)
  if (reverseCacheKey && routesCache[reverseCacheKey]) {
    routesCache[reverseCacheKey].lastUsedAt = Date.now();
    apiUsageService.recordCacheHit();
    return routesCache[reverseCacheKey];
  }

  // 3. Deduplicate in-flight concurrent requests for the exact same segment across days
  if (pendingRouteRequests.has(cacheKey)) {
    return await pendingRouteRequests.get(cacheKey)!;
  }
  if (reverseCacheKey && pendingRouteRequests.has(reverseCacheKey)) {
    return await pendingRouteRequests.get(reverseCacheKey)!;
  }

  const fetchPromise = (async () => {
    // Handle Japan Transit via Ekispert Station-Aware Modeling
    if (mode === "transit" && (isJapanCoordinate(origin.lat, origin.lng) || isJapanCoordinate(destination.lat, destination.lng))) {
      try {
        const ekispertResult = await calculateJapanStationTransit(origin, destination);
        if (ekispertResult) {
          saveToRoutesCache(cacheKey, ekispertResult);
          return ekispertResult;
        }
      } catch (err) {
        console.warn("Station transit calculation error, falling back to geometric estimate:", err);
      }

      // Google Maps transit API strictly returns ZERO_RESULTS in Japan (developer licensing blackout).
      // Never call routes.googleapis.com for Japan transit — fall back immediately and cache to protect API quota.
      const dist = getDistance(origin.lat, origin.lng, destination.lat, destination.lng);
      const durationS = Math.round(estimateTime(dist, "transit"));
      const fallbackResult = {
        distanceM: Math.round(dist),
        durationS,
        isHeuristic: true,
        heuristicReason: "Japan transit estimated via regional railway velocity (Google Maps API does not license Japan transit data).",
      };
      saveToRoutesCache(cacheKey, fallbackResult);
      return fallbackResult;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      const dist = getDistance(origin.lat, origin.lng, destination.lat, destination.lng);
      const durationS = Math.round(estimateTime(dist, mode));
      const fallbackResult = {
        distanceM: Math.round(dist),
        durationS,
        isHeuristic: true,
        heuristicReason: mode === "transit"
          ? "No Google Maps API key; transit calculated using geometric velocity heuristic."
          : "Estimated geometrically without live API.",
      };
      saveToRoutesCache(cacheKey, fallbackResult, reverseCacheKey);
      return fallbackResult;
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
        const dist = getDistance(origin.lat, origin.lng, destination.lat, destination.lng);
        const durationS = Math.round(estimateTime(dist, mode));
        const fallbackResult = {
          distanceM: Math.round(dist),
          durationS,
          isHeuristic: true,
          heuristicReason: mode === "transit"
            ? "Live transit routing unavailable; estimated using regional transit velocity."
            : "No route found; estimated geometrically.",
        };
        saveToRoutesCache(cacheKey, fallbackResult, reverseCacheKey);
        return fallbackResult;
      }

      const distanceM = route.distanceMeters || 0;
      const durationS = route.duration ? parseInt(route.duration.replace("s", "")) : 0;

      const result = { distanceM, durationS, isHeuristic: false };
      saveToRoutesCache(cacheKey, result, reverseCacheKey);
      return result;
    } catch (error) {
      console.error("Maps Routes Error:", error);
      const dist = getDistance(origin.lat, origin.lng, destination.lat, destination.lng);
      const durationS = Math.round(estimateTime(dist, mode));
      const fallbackResult = {
        distanceM: Math.round(dist),
        durationS,
        isHeuristic: true,
        heuristicReason: mode === "transit"
          ? "Live transit routing unavailable; estimated using regional transit velocity."
          : "Routing error; estimated geometrically.",
      };
      saveToRoutesCache(cacheKey, fallbackResult, reverseCacheKey);
      return fallbackResult;
    }
  })();

  pendingRouteRequests.set(cacheKey, fetchPromise);
  if (reverseCacheKey) pendingRouteRequests.set(reverseCacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    pendingRouteRequests.delete(cacheKey);
    if (reverseCacheKey) pendingRouteRequests.delete(reverseCacheKey);
  }
};

export const fetchFreshPhoto = async (place: {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  photoReference?: string;
}): Promise<string | undefined> => {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === "undefined") return undefined;

  const rawGoogleId = place.googlePlaceId || place.id;
  const placeKey = (rawGoogleId && !rawGoogleId.startsWith("p_") ? rawGoogleId : place.name).replace(/^places\//, "");

  // Check negative photo cache (places previously verified to have no photo)
  if (noPhotoCache[placeKey]) {
    return undefined;
  }

  // Deduplicate in-flight concurrent requests for the same place
  if (pendingPhotoRequests.has(placeKey)) {
    return await pendingPhotoRequests.get(placeKey);
  }

  const photoPromise = (async () => {
    // 1. Direct photoReference resolution if already available (saves an extra Place Details API call)
    if (place.photoReference) {
      try {
        const directUrl = await resolvePhotoUrl(place.photoReference, apiKey);
        if (directUrl) return directUrl;
      } catch (e) {
        console.warn("Direct photoReference resolution failed:", e);
      }
    }

    // 2. Lookup photo reference via Google Place Details
    const googleId = rawGoogleId && !rawGoogleId.startsWith("p_") ? rawGoogleId : undefined;

    let photoName: string | undefined = undefined;
    if (googleId) {
      try {
        apiUsageService.recordCall("maps_photo");
        const cleanGoogleId = googleId.replace(/^places\//, "");
        const r = await fetch(`https://places.googleapis.com/v1/places/${cleanGoogleId}`, {
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
      const directUrl = await resolvePhotoUrl(photoName, apiKey);
      if (directUrl) return directUrl;
    }

    // 3. Fallback: Search Places by name & location and resolve the top result's photo reference
    try {
      const queryStr = place.address ? `${place.name} ${place.address}` : place.name;
      const searchResults = await searchPlaces(
        queryStr,
        place.lat && place.lng ? { lat: place.lat, lng: place.lng } : undefined
      );
      if (searchResults && searchResults.length > 0) {
        const topResult = searchResults[0];
        if (topResult.photoReference) {
          const directUrl = await resolvePhotoUrl(topResult.photoReference, apiKey);
          if (directUrl) return directUrl;
        }
      }
    } catch (e) {
      console.warn("Search fallback photo lookup failed:", e);
    }

    // Mark as no photo available so subsequent sessions never waste API calls checking again
    saveNoPhoto(placeKey);
    return undefined;
  })();

  pendingPhotoRequests.set(placeKey, photoPromise);
  try {
    return await photoPromise;
  } finally {
    pendingPhotoRequests.delete(placeKey);
  }
};
