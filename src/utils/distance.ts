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

export const STREET_DETOUR_FACTOR = 1.35; // City grid detour factor (Manhattan / urban grid vs straight line)
export const WALKING_SPEED_MPS = 1.15; // Realistic pedestrian speed (~4.1 km/h) accounting for crosswalks and intersections

// Estimate time in seconds based on mode and distance
export function estimateTime(
  distanceMeters: number,
  mode: "walking" | "transit" | "driving",
): number {
  if (distanceMeters <= 0) return 0;

  if (mode === "walking") {
    // Pedestrian walking on urban street grid
    return Math.round((distanceMeters * STREET_DETOUR_FACTOR) / WALKING_SPEED_MPS);
  }

  if (mode === "driving") {
    const isLongDistance = distanceMeters > 50000;
    const speedMps = isLongDistance ? 20 : 8; // Highway (72 km/h) vs City (30 km/h)
    const cityBufferS = isLongDistance ? 300 : 180; // Parking, ignition, traffic light buffer
    return Math.round((distanceMeters * 1.25) / speedMps + cityBufferS);
  }

  if (mode === "transit") {
    // Intercity / Shinkansen high-speed rail (> 50 km)
    if (distanceMeters > 50000) {
      const shinkansenSpeedMps = 55; // ~200 km/h average
      const stationBoardingOverheadS = 1800; // 30 min (station arrival, ticket barrier, platform, arrival egress)
      return Math.round(distanceMeters / shinkansenSpeedMps + stationBoardingOverheadS);
    }

    // Distances under 800m are faster to walk directly than descending into a train/subway station
    if (distanceMeters < 800) {
      return Math.round((distanceMeters * STREET_DETOUR_FACTOR) / WALKING_SPEED_MPS);
    }

    // Realistic Urban Door-to-Door Public Transit Model:
    // 1. Pedestrian first-mile and last-mile combined walking to/from stations (~450m to 850m)
    const combinedWalkM = Math.min(850, Math.max(450, Math.round(350 + Math.sqrt(distanceMeters) * 5.0)));
    const walkS = Math.round((combinedWalkM * STREET_DETOUR_FACTOR) / WALKING_SPEED_MPS);

    // 2. Station concourse access, ticket gates, stairs/escalator platform descent + headway wait buffer
    const stationWaitS = 300; // 5 minutes

    // 3. In-vehicle transit travel along rail/bus lines (~25-30 km/h for urban metro with stops)
    const inVehicleDistM = distanceMeters * 1.22;
    const inVehicleSpeedMps = distanceMeters > 12000 ? 10.5 : 7.2;
    const rideS = Math.round(inVehicleDistM / inVehicleSpeedMps);

    // 4. Line transfer penalty for cross-city trips (> 3.8 km)
    const transferS = distanceMeters > 3800 ? 270 : 0; // 4.5 min transfer

    return Math.round(walkS + stationWaitS + rideS + transferS);
  }

  return Math.round(distanceMeters / 1.4);
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
