const EARTH_RADIUS_METERS = 6371000;
const TO_RAD = Math.PI / 180;

// Calculate haversine distance in meters
export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = lat1 * TO_RAD;
  const φ2 = lat2 * TO_RAD;
  const Δφ = (lat2 - lat1) * TO_RAD;
  const Δλ = (lon2 - lon1) * TO_RAD;

  const halfΔφ = Math.sin(Δφ / 2);
  const halfΔλ = Math.sin(Δλ / 2);

  const a =
    halfΔφ * halfΔφ +
    Math.cos(φ1) * Math.cos(φ2) * halfΔλ * halfΔλ;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

// Estimate time in seconds based on mode and distance
export function estimateTime(
  distanceMeters: number,
  mode: "walking" | "transit" | "driving",
): number {
  const isLongDistance = distanceMeters > 50000; // Over 50 km is inter-city

  let speedMps = 1.4; // walking avg speed ~ 1.4 m/s (5km/h)

  if (mode === "driving") {
    speedMps = isLongDistance ? 20 : 8; // Highway (72 km/h) vs City (30 km/h)
  } else if (mode === "transit") {
    speedMps = isLongDistance ? 45 : 5; // Bullet train (162 km/h) vs Local (18 km/h)
  }

  return distanceMeters / speedMps;
}

export const WALKING_THRESHOLD_METERS = 800;

export function isWalkSegment(segment: {
  travelMode?: string;
  distance?: number;
  customTravelMode?: boolean;
  heuristicReason?: string;
  transitDetails?: {
    trainMin?: number;
    totalMin?: number;
    summary?: string;
  };
}): boolean {
  if (segment.travelMode === "walking") return true;
  if (segment.customTravelMode) return false;

  const dist = segment.distance ?? 0;
  if (dist >= 0 && dist <= WALKING_THRESHOLD_METERS) return true;

  if (segment.travelMode === "transit") {
    if (segment.transitDetails && (!segment.transitDetails.trainMin || segment.transitDetails.trainMin === 0)) {
      return true;
    }
    const reason = segment.heuristicReason?.toLowerCase() || "";
    if (reason.includes("direct walk") || reason.includes("walking connection")) {
      return true;
    }
  }

  return false;
}
