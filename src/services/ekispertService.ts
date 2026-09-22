import { apiUsageService } from "./apiUsageService";
import { getDistance, estimateTime } from "../utils/distance";

const getApiKey = () =>
  (typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_EKISPERT_API_KEY
    : "") ||
  (typeof process !== "undefined" && process.env
    ? process.env.VITE_EKISPERT_API_KEY
    : "") ||
  "";
const EKISPERT_API_ENDPOINT = "https://api.ekispert.jp/v1/json";

export interface EkispertStation {
  code: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  distanceMeters: number;
}

import { TransitLegBreakdown } from "../types";

export interface JapanStationTransitResult {
  distanceM: number;
  durationS: number;
  isHeuristic: boolean;
  heuristicReason: string;
  stationFrom?: string;
  stationTo?: string;
  transitUrl?: string;
  transitDetails?: TransitLegBreakdown;
}

// Persistent Ekispert caches — backed by localStorage so lookups survive page reloads
const STATION_CACHE_KEY = "reroute_ekispert_stations_v1";
const ROUTE_URL_CACHE_KEY = "reroute_ekispert_routes_v1";
const EKISPERT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type CachedStation = { value: EkispertStation | null; savedAt: number };
type CachedRouteUrl = { value: string | null; savedAt: number };

let _stationCacheRaw: Record<string, CachedStation> = {};
let _routeUrlCacheRaw: Record<string, CachedRouteUrl> = {};

try {
  _stationCacheRaw = JSON.parse(localStorage.getItem(STATION_CACHE_KEY) || "{}");
} catch { _stationCacheRaw = {}; }
try {
  _routeUrlCacheRaw = JSON.parse(localStorage.getItem(ROUTE_URL_CACHE_KEY) || "{}");
} catch { _routeUrlCacheRaw = {}; }

// In-memory working caches (evict stale on load)
const stationCache: Record<string, EkispertStation | null> = {};
const routeUrlCache: Record<string, string | null> = {};

const now = Date.now();
for (const [k, v] of Object.entries(_stationCacheRaw)) {
  if (now - v.savedAt < EKISPERT_CACHE_TTL_MS) stationCache[k] = v.value;
}
for (const [k, v] of Object.entries(_routeUrlCacheRaw)) {
  if (now - v.savedAt < EKISPERT_CACHE_TTL_MS) routeUrlCache[k] = v.value;
}

const persistStationCache = (key: string, value: EkispertStation | null) => {
  stationCache[key] = value;
  _stationCacheRaw[key] = { value, savedAt: Date.now() };
  try { localStorage.setItem(STATION_CACHE_KEY, JSON.stringify(_stationCacheRaw)); } catch { /* quota */ }
};

const persistRouteUrlCache = (key: string, value: string | null) => {
  routeUrlCache[key] = value;
  _routeUrlCacheRaw[key] = { value, savedAt: Date.now() };
  try { localStorage.setItem(ROUTE_URL_CACHE_KEY, JSON.stringify(_routeUrlCacheRaw)); } catch { /* quota */ }
};

/**
 * Checks if geographic coordinates are within Japan's territory
 */
export const isJapanCoordinate = (lat: number, lng: number): boolean => {
  return lat >= 20.0 && lat <= 46.0 && lng >= 122.0 && lng <= 154.0;
};

/**
 * Checks if Ekispert API is configured
 */
export const isEkispertConfigured = (): boolean => {
  return !!getApiKey();
};

/**
 * Searches for stations matching a name using the Ekispert Free Plan (/station/light)
 */
export const searchEkispertStation = async (
  name: string
): Promise<{ code: string; name: string; type?: string }[]> => {
  const key = getApiKey();
  if (!key || !name.trim()) return [];

  try {
    const url = new URL(`${EKISPERT_API_ENDPOINT}/station/light`);
    url.searchParams.append("key", key);
    url.searchParams.append("name", name.trim());

    apiUsageService.recordCall("ekispert");
    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data = await response.json();
    const points = data?.ResultSet?.Point;
    if (!points) return [];

    const list = Array.isArray(points) ? points : [points];
    return list.map((p: any) => ({
      code: p.Station?.code || "",
      name: p.Station?.Name || "",
      type: p.Station?.Type || "train",
    }));
  } catch (e) {
    console.warn("Ekispert station search error:", e);
    return [];
  }
};

/**
 * Finds the nearest train station to given coordinates using Ekispert /geo/station
 */
export const findNearestStation = async (
  lat: number,
  lng: number,
  radiusMeters = 2000
): Promise<EkispertStation | null> => {
  const key = getApiKey();
  if (!key || !isJapanCoordinate(lat, lng)) return null;

  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}_${radiusMeters}`;
  if (stationCache[cacheKey] !== undefined) {
    return stationCache[cacheKey];
  }

  try {
    const url = new URL(`${EKISPERT_API_ENDPOINT}/geo/station`);
    url.searchParams.append("key", key);
    url.searchParams.append("geoPoint", `${lat},${lng},wgs84,${radiusMeters}`);

    apiUsageService.recordCall("ekispert");
    const response = await fetch(url.toString());
    if (!response.ok) {
      persistStationCache(cacheKey, null);
      return null;
    }

    const data = await response.json();
    const rawPoints = data?.ResultSet?.Point;
    if (!rawPoints) {
      stationCache[cacheKey] = null;
      return null;
    }

    const points = Array.isArray(rawPoints) ? rawPoints : [rawPoints];
    const stations: EkispertStation[] = points
      .filter((p: any) => p?.Station?.code)
      .map((p: any) => ({
        code: String(p.Station.code),
        name: p.Station.Name || "",
        type: p.Station.Type || "train",
        lat: parseFloat(p.GeoPoint?.lati_d) || lat,
        lng: parseFloat(p.GeoPoint?.longi_d) || lng,
        distanceMeters: parseInt(p.Distance, 10) || 0,
      }));

    stations.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const nearest = stations[0] || null;
    persistStationCache(cacheKey, nearest);
    return nearest;
  } catch (e) {
    console.warn("Ekispert geo station lookup error:", e);
    persistStationCache(cacheKey, null);
    return null;
  }
};

/**
 * Generates an Ekispert official transit route URL using the Free Plan endpoint (/search/course/light).
 * Returns the ResourceURI linking to roote.ekispert.net with live timetables and transfers.
 */
export const getEkispertRouteUrl = async (
  from: string,
  to: string
): Promise<string | null> => {
  const key = getApiKey();
  if (!key || !from.trim() || !to.trim()) return null;

  const cacheKey = `${from.trim()}->${to.trim()}`;
  if (routeUrlCache[cacheKey] !== undefined) {
    return routeUrlCache[cacheKey];
  }

  try {
    const url = new URL(`${EKISPERT_API_ENDPOINT}/search/course/light`);
    url.searchParams.append("key", key);
    url.searchParams.append("from", from.trim());
    url.searchParams.append("to", to.trim());

    apiUsageService.recordCall("ekispert");
    const response = await fetch(url.toString());
    if (!response.ok) {
      persistRouteUrlCache(cacheKey, null);
      return null;
    }

    const data = await response.json();
    const resourceUri = data?.ResultSet?.ResourceURI || null;
    persistRouteUrlCache(cacheKey, resourceUri);
    return resourceUri;
  } catch (e) {
    console.warn("Ekispert route light error:", e);
    persistRouteUrlCache(cacheKey, null);
    return null;
  }
};

/**
 * Computes a realistic station-aware transit estimate for travel in Japan.
 * Models: Walk to station -> Headway/Platform buffer -> Train ride -> Megastation padding -> Walk to destination
 */
export const calculateJapanStationTransit = async (
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<JapanStationTransitResult | null> => {
  if (!isJapanCoordinate(origin.lat, origin.lng) || !isJapanCoordinate(destination.lat, destination.lng)) {
    return null;
  }

  const directDist = getDistance(origin.lat, origin.lng, destination.lat, destination.lng);

  // If places are closer than 800m, direct walking is faster than descending to train platforms
  if (directDist < 800) {
    const walkTimeS = Math.round(directDist / 1.25);
    const walkMin = Math.max(1, Math.round(walkTimeS / 60));
    return {
      distanceM: Math.round(directDist),
      durationS: walkTimeS,
      isHeuristic: true,
      heuristicReason: `Direct walk: ${walkMin} min (<800m is faster than rail transfer in Japan).`,
      transitDetails: {
        walkToStationMin: undefined,
        trainMin: undefined,
        walkFromStationMin: walkMin,
        totalMin: walkMin,
        summary: `${walkMin} min direct walk (<800m)`,
      },
    };
  }

  // Lookup nearest stations for origin and destination (search up to 5000m)
  let stationA: EkispertStation | null = null;
  let stationB: EkispertStation | null = null;

  if (isEkispertConfigured()) {
    try {
      [stationA, stationB] = await Promise.all([
        findNearestStation(origin.lat, origin.lng, 5000),
        findNearestStation(destination.lat, destination.lng, 5000),
      ]);
    } catch (e) {
      console.warn("Ekispert station lookup error, using geometric station model:", e);
    }
  }

  // Robust fallback if station is beyond 5km or Ekispert API is rate-limited/unconfigured
  if (!stationA || !stationB) {
    const estTimeS = Math.round(estimateTime(directDist, "transit"));
    const totalMin = Math.max(5, Math.round(estTimeS / 60));
    const walkAMin = Math.min(10, Math.max(4, Math.round(totalMin * 0.2)));
    const walkBMin = Math.min(10, Math.max(4, Math.round(totalMin * 0.2)));
    const trainMin = Math.max(3, totalMin - walkAMin - walkBMin);
    const stationFrom = stationA?.name || "Local Station";
    const stationTo = stationB?.name || "Destination Station";
    return {
      distanceM: Math.round(directDist),
      durationS: totalMin * 60,
      isHeuristic: true,
      heuristicReason: `Station-aware transit estimate: ${walkAMin} min walk to ${stationFrom}, ${trainMin} min train ride, ${walkBMin} min walk to destination.`,
      stationFrom,
      stationTo,
      transitDetails: {
        walkToStationMin: walkAMin,
        trainMin,
        walkFromStationMin: walkBMin,
        totalMin,
        summary: `${totalMin} min (${walkAMin} min walking to ${stationFrom}, ${trainMin} min train ride, ${walkBMin} min walk to destination)`,
      },
    };
  }

  // If both origin and destination share the same nearest station
  if (stationA.code === stationB.code) {
    const walkDist = stationA.distanceMeters + stationB.distanceMeters;
    const walkTimeS = Math.round(walkDist / 1.25);
    const walkMin = Math.max(1, Math.round(walkTimeS / 60));
    return {
      distanceM: Math.round(walkDist),
      durationS: walkTimeS,
      isHeuristic: true,
      heuristicReason: `Both locations near ${stationA.name} station: ${walkMin} min walking connection.`,
      stationFrom: stationA.name,
      stationTo: stationB.name,
      transitDetails: {
        totalMin: walkMin,
        summary: `${walkMin} min walking via ${stationA.name} station`,
      },
    };
  }

  // 1. Walk from origin to Station A (~1.25 m/s or 4.5 km/h)
  const walkToStationS = Math.round(stationA.distanceMeters / 1.25);

  // 2. Headway wait time & platform ticket gates (4 minutes average in Japan urban networks)
  const waitBufferS = 240;

  // 3. Train rail travel between stations
  const interStationDist = getDistance(stationA.lat, stationA.lng, stationB.lat, stationB.lng);
  const isLongDistance = interStationDist > 50000;

  // ~36 km/h (10 m/s) urban metro/JR including station stops, or ~150 km/h (41.7 m/s) express/Shinkansen
  const trainSpeedMps = isLongDistance ? 41.7 : 10.0;
  let trainTimeS = Math.round(interStationDist / trainSpeedMps);
  if (isLongDistance) {
    trainTimeS += 600; // 10 min intercity ticket gate / boarding buffer
  }

  // 4. Megastation transfer / navigation padding (Shinjuku, Tokyo, Shibuya, Ikebukuro, Shinagawa, Yokohama)
  const MEGASTATIONS = ["新宿", "東京", "渋谷", "池袋", "品川", "横浜", "Shinjuku", "Tokyo", "Shibuya", "Ikebukuro", "Shinagawa", "Yokohama"];
  const isMegastation = MEGASTATIONS.some((m) => stationA.name.includes(m) || stationB.name.includes(m));
  const megastationPaddingS = isMegastation ? 180 : 0; // 3 min extra for deep underground/complex stations

  // 5. Walk from Station B to destination (~1.25 m/s)
  const walkFromStationS = Math.round(stationB.distanceMeters / 1.25);

  const totalDurationS = walkToStationS + waitBufferS + trainTimeS + megastationPaddingS + walkFromStationS;
  const totalDistanceM = Math.round(stationA.distanceMeters + interStationDist + stationB.distanceMeters);

  // Fetch Ekispert official timetable link
  const transitUrl = (await getEkispertRouteUrl(stationA.code, stationB.code)) || undefined;

  const walkAMin = Math.max(1, Math.round(walkToStationS / 60));
  const trainMin = Math.max(1, Math.round((trainTimeS + megastationPaddingS + waitBufferS) / 60));
  const walkBMin = Math.max(1, Math.round(walkFromStationS / 60));
  const totalMin = Math.round(totalDurationS / 60);

  const parts: string[] = [
    `${walkAMin} min walking to ${stationA.name}`,
    `${trainMin} min train ride`,
    `${walkBMin} min walking to destination`,
  ];
  const summary = `${totalMin} min (${parts.join(", ")})`;
  const heuristicReason = `Station-aware transit via Ekispert: ${parts.join(", ")}.`;

  const transitDetails: TransitLegBreakdown = {
    walkToStationMin: walkAMin,
    trainMin,
    walkFromStationMin: walkBMin,
    totalMin,
    summary,
  };

  return {
    distanceM: totalDistanceM,
    durationS: totalDurationS,
    isHeuristic: true,
    heuristicReason,
    stationFrom: stationA.name,
    stationTo: stationB.name,
    transitUrl,
    transitDetails,
  };
};