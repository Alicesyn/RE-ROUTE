import {
  Place,
  Hotel,
  DayRoute,
  RouteSegment,
  TravelMode,
  OptimizationResult,
  CategoryConfig,
  PlaceCategory,
} from "../types";
import { getDistance, estimateTime } from "../utils/distance";
import { fetchRouteSegment } from "./mapsService";
import { parseISO, addDays, setHours, setMinutes } from "date-fns";
import { checkTimeConflict, getPlaceDayHours } from "../utils/timeUtils";
import { parseEarlyArrivalMinutes } from "../utils/reservationUtils";
import {
  isDayAllowedForPlace,
  getEffectiveAllowedDayRange,
  formatDayRangeBadge,
} from "../utils/dayRangeUtils";


export interface FlightInfo {
  time: string;
  buffer?: number;
  location?: Place | null;
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Resolves the effective category configuration for a given place category on a specific day,
 * taking into account customDayOverrides, firstDayOverride, and lastDayOverride.
 * Crucially guarantees that effective maxPerDay is at least effective minPerDay so a higher min
 * override is not accidentally throttled by a lower default/inherited max.
 */
export function getEffectiveCategoryConfig(
  categoryConfigs: Partial<Record<PlaceCategory, CategoryConfig>> | undefined,
  category: PlaceCategory,
  dayIndex: number,
  totalDays: number,
): CategoryConfig | undefined {
  if (!categoryConfigs) return undefined;
  const base = categoryConfigs[category];
  if (!base) return undefined;

  const isFirstDay = dayIndex === 0;
  const isLastDay = dayIndex === totalDays - 1;
  const customOverride = base.customDayOverrides?.[dayIndex];
  const positionalOverride = isFirstDay ? base.firstDayOverride : isLastDay ? base.lastDayOverride : undefined;

  const effectiveMin = (customOverride?.minPerDay !== undefined && customOverride?.minPerDay !== null)
    ? customOverride.minPerDay
    : (positionalOverride?.minPerDay !== undefined && positionalOverride?.minPerDay !== null)
      ? positionalOverride.minPerDay
      : base.minPerDay;

  let effectiveMax = (customOverride?.maxPerDay !== undefined && customOverride?.maxPerDay !== null)
    ? customOverride.maxPerDay
    : (positionalOverride?.maxPerDay !== undefined && positionalOverride?.maxPerDay !== null)
      ? positionalOverride.maxPerDay
      : base.maxPerDay;

  if (effectiveMin != null && effectiveMax != null && effectiveMax < effectiveMin) {
    effectiveMax = effectiveMin;
  }

  return {
    ...base,
    minPerDay: effectiveMin,
    maxPerDay: effectiveMax,
  };
}

// Time-budget-aware clustering
// Distributes places across days so no single day exceeds the budget
// Respects pinnedToDay: pinned places stay on their assigned day
export function clusterPlaces(
  places: Place[],
  hotels: Hotel[],
  days: number,
  travelMode: TravelMode,
  dailyBudgets: number[],
  strictBudget: boolean = false,
  arrivalLocation?: Place | null,
  departureLocation?: Place | null,
  categoryConfigs?: Partial<Record<PlaceCategory, CategoryConfig>>,
  startDateISO: string = new Date().toISOString(),
  avoidClosedHours: boolean = true,
  dayStartTime: string = "09:00",
  dayEndTime: string = "21:00",
  arrivalFlight?: FlightInfo | null,
  departureFlight?: FlightInfo | null,
  exemptDays: number[] = [],
  customTransitTimes?: Record<string, number>,
): Place[] {
  const safeExemptDays = Array.isArray(exemptDays) ? exemptDays : [];
  const isExempt = (dayIdx: number | null) => dayIdx !== null && safeExemptDays.includes(dayIdx);
  const pinned = places.filter((p) => p.dayIndex !== null && (p.pinnedToDay || isExempt(p.dayIndex)));
  const unassigned = places.filter(
    (p) => (p.dayIndex === null || !p.pinnedToDay) && !isExempt(p.dayIndex),
  );

  if (unassigned.length === 0) return places;

  // Calculate base day operating window
  const [baseStartH, baseStartM] = dayStartTime.split(":").map(Number);
  const [baseEndH, baseEndM] = dayEndTime.split(":").map(Number);
  const baseDayStartMin = (baseStartH || 0) * 60 + (baseStartM || 0);
  let baseDayEndMin = (baseEndH || 0) * 60 + (baseEndM || 0);
  if (baseDayEndMin === 0) baseDayEndMin = 24 * 60;
  if (baseDayEndMin < baseDayStartMin) baseDayEndMin += 24 * 60;

  const dayWindows: { start: number; end: number }[] = [];
  for (let d = 0; d < days; d++) {
    let dStart = baseDayStartMin;
    let dEnd = baseDayEndMin;
    if (d === 0 && arrivalFlight) {
      const arrMin = parseTimeToMinutes(arrivalFlight.time) + (arrivalFlight.buffer ?? 30);
      let arrivalTransferMin = 0;
      if (customTransitTimes?.["arrival->start-hotel"]) {
        arrivalTransferMin = Math.round(customTransitTimes["arrival->start-hotel"] / 60);
      } else if (arrivalLocation) {
        const h0 = hotels.find((h) => h.dayIndex === 0) || hotels[0];
        if (h0) {
          arrivalTransferMin = Math.round(estimateTime(getDistance(arrivalLocation.lat, arrivalLocation.lng, h0.lat, h0.lng), travelMode) / 60);
        }
      }
      dStart = Math.max(baseDayStartMin, arrMin + arrivalTransferMin);
    }
    if (d === days - 1 && departureFlight) {
      const depMin = parseTimeToMinutes(departureFlight.time) - (departureFlight.buffer ?? 90);
      let departureTransferMin = 0;
      if (customTransitTimes?.["hotel->departure"]) {
        departureTransferMin = Math.round(customTransitTimes["hotel->departure"] / 60);
      } else if (departureLocation) {
        const lastHotel = hotels.find((h) => h.dayIndex === days - 1) || hotels[0];
        if (lastHotel) {
          departureTransferMin = Math.round(estimateTime(getDistance(lastHotel.lat, lastHotel.lng, departureLocation.lat, departureLocation.lng), travelMode) / 60);
        }
      }
      dEnd = Math.min(baseDayEndMin, depMin - departureTransferMin);
    }
    dayWindows.push({ start: dStart, end: dEnd });
  }

  const effectiveDayBudgets = dailyBudgets.map((b, d) => {
    const w = dayWindows[d];
    if (w) {
      const windowDur = Math.max(0, w.end - w.start);
      return Math.min(b, windowDur);
    }
    return b;
  });

  // Calculate already-committed time per day from pinned places
  const dayTimeUsed: number[] = Array(days).fill(0);
  for (const p of pinned) {
    if (p.dayIndex !== null) {
      dayTimeUsed[p.dayIndex] += p.estimatedDuration ?? 60;
    }
  }

  // Add estimated travel time for pinned places (rough: avg travel between pinned stops + to/from hotel)
  for (let d = 0; d < days; d++) {
    const dayPinned = pinned.filter((p) => p.dayIndex === d);
    const hotel = hotels.find((h) => h.dayIndex === d);
    if (dayPinned.length > 0 && hotel) {
      // Rough: add avg travel from hotel to first place and back
      const avgDist =
        dayPinned.reduce(
          (sum, p) => sum + getDistance(hotel.lat, hotel.lng, p.lat, p.lng),
          0,
        ) / dayPinned.length;
      dayTimeUsed[d] += estimateTime(avgDist * 2, travelMode) / 60; // convert seconds to minutes
    }
  }

  // Pre-allocate base inter-hotel travel time on transition days (traveling between different hotels)
  for (let d = 0; d < days; d++) {
    // If d === 0 and arrivalFlight exists, dStart is already shifted to arrival at start hotel; do not double count
    if (d === 0 && arrivalFlight) continue;
    // If d === days - 1 and departureFlight exists, dEnd is already shifted to departure from last hotel; do not double count
    if (d === days - 1 && departureFlight) continue;

    const startHotelRaw =
      d > 0
        ? hotels.find((h) => h.dayIndex === d - 1) || null
        : hotels.find((h) => h.dayIndex === 0) || null;
    const endHotelRaw = hotels.find((h) => h.dayIndex === d) || null;

    const startAnchor = startHotelRaw;
    const endAnchor = endHotelRaw;

    if (startAnchor && endAnchor) {
      const baseInterDist = getDistance(startAnchor.lat, startAnchor.lng, endAnchor.lat, endAnchor.lng);
      if (baseInterDist > 500) {
        // Inter-hotel travel between different cities naturally consumes available travel time
        dayTimeUsed[d] += Math.round(estimateTime(baseInterDist, travelMode) / 60);
      }
    }
  }

  const validAnchors = [...hotels];
  if (arrivalLocation) validAnchors.push({ ...arrivalLocation, dayIndex: 0 } as any);
  if (departureLocation) validAnchors.push({ ...departureLocation, dayIndex: days - 1 } as any);

  // Filter out 500km unfeasible ones
  const toAssign: Place[] = [];
  const rejectedUnassigned: Place[] = [];

  for (const p of unassigned) {
    if (validAnchors.length > 0) {
      let minDist = Infinity;
      for (const anchor of validAnchors) {
        const d = getDistance(p.lat, p.lng, anchor.lat, anchor.lng);
        if (d < minDist) minDist = d;
      }
      if (minDist > 500 * 1000) { // 500 km in meters
        rejectedUnassigned.push({
          ...p,
          dayIndex: null,
          orderInDay: null,
          unfeasibleReason: "Over 500km from any hotel or flight.",
        });
        continue;
      }
    }
    
    // Clear out old unfeasible reasons since it passed the distance check
    toAssign.push({
      ...p,
      dayIndex: null,
      orderInDay: null,
      unfeasibleReason: undefined,
    });
  }

  // Collect categories that have active minPerDay targets across any non-exempt day
  const categoriesWithMinTarget = new Set<string>();
  if (categoryConfigs) {
    for (const [cat, cfg] of Object.entries(categoryConfigs)) {
      if (!cfg) continue;
      for (let d = 0; d < days; d++) {
        if (exemptDays.includes(d)) continue;
        const eff = getEffectiveCategoryConfig(categoryConfigs, cat as PlaceCategory, d, days);
        if (eff?.minPerDay != null && eff.minPerDay > 0) {
          categoriesWithMinTarget.add(cat);
          break;
        }
      }
    }
  }

  // Sort starred places first (must-visit priority), then places with locked custom arrival times,
  // then categories that have minimum requirements (to guarantee slots before budget fills up),
  // then by longest duration (greedy packing)
  toAssign.sort((a, b) => {
    const aStarred = a.isStarred ? 1 : 0;
    const bStarred = b.isStarred ? 1 : 0;
    if (aStarred !== bStarred) return bStarred - aStarred; // starred first

    const aCustom = a.customTime ? 1 : 0;
    const bCustom = b.customTime ? 1 : 0;
    if (aCustom !== bCustom) return bCustom - aCustom; // locked time places next

    const aHasMin = categoriesWithMinTarget.has(a.category) ? 1 : 0;
    const bHasMin = categoriesWithMinTarget.has(b.category) ? 1 : 0;
    if (aHasMin !== bHasMin) return bHasMin - aHasMin; // categories needing quotas next

    return (b.estimatedDuration ?? 60) - (a.estimatedDuration ?? 60);
  });

  // Initialize category counts per day (using pinned places)
  const categoryCounts: Record<number, Record<string, number>> = {};
  for (let d = 0; d < days; d++) categoryCounts[d] = {};
  for (const p of pinned) {
    if (p.dayIndex !== null) {
      categoryCounts[p.dayIndex][p.category] = (categoryCounts[p.dayIndex][p.category] || 0) + 1;
    }
  }

  // Anchor resolver for any day d
  const getDayAnchors = (d: number) => {
    const startHotelRaw =
      d > 0
        ? hotels.find((h) => h.dayIndex === d - 1) || null
        : hotels.find((h) => h.dayIndex === 0) || null;
    const endHotelRaw = hotels.find((h) => h.dayIndex === d) || null;

    const startAnchor = d === 0 && arrivalLocation ? arrivalLocation : startHotelRaw;
    const endAnchor = d === days - 1 && departureLocation ? departureLocation : endHotelRaw;

    return { startAnchor, endAnchor };
  };

  // Computes the detour distance in meters for a place on day d.
  // If start and end hotels differ (transition days > 500m),
  // places in between are NOT penalized as much (measures incremental detour beyond base inter-hotel travel).
  // If loop day (same hotel morning & night), measures round-trip travel to the place.
  const computeDayDetourMeters = (p: Place, d: number) => {
    const { startAnchor, endAnchor } = getDayAnchors(d);
    if (startAnchor && endAnchor) {
      const baseInterDist = getDistance(startAnchor.lat, startAnchor.lng, endAnchor.lat, endAnchor.lng);
      const isTransition = baseInterDist > 500;
      if (isTransition) {
        const dStart = getDistance(p.lat, p.lng, startAnchor.lat, startAnchor.lng);
        const dEnd = getDistance(p.lat, p.lng, endAnchor.lat, endAnchor.lng);
        return Math.max(0, dStart + dEnd - baseInterDist);
      } else {
        // Loop day: round-trip travel from hotel/anchor
        return getDistance(p.lat, p.lng, startAnchor.lat, startAnchor.lng) * 2;
      }
    } else if (startAnchor || endAnchor) {
      const a = (startAnchor || endAnchor)!;
      return getDistance(p.lat, p.lng, a.lat, a.lng) * 2;
    }
    return 0;
  };

  const getTransitMin = (
    from: { lat: number; lng: number; id?: string },
    to: { lat: number; lng: number; id?: string },
  ): number => {
    if (from.id && to.id && customTransitTimes?.[`${from.id}->${to.id}`] !== undefined) {
      return Math.round(customTransitTimes[`${from.id}->${to.id}`] / 60);
    }
    if (from.id && to.id && customTransitTimes?.[`${to.id}->${from.id}`] !== undefined) {
      return Math.round(customTransitTimes[`${to.id}->${from.id}`] / 60);
    }
    return Math.round(estimateTime(getDistance(from.lat, from.lng, to.lat, to.lng), travelMode) / 60);
  };

  const isPlaceFeasibleOnDay = (place: Place, d: number): boolean => {
    if (!avoidClosedHours || !place.openingHours || place.openingHours.length === 0) {
      return true;
    }
    const dayDate = addDays(parseISO(startDateISO), d);
    const dayHours = getPlaceDayHours(place.openingHours, dayDate);
    if (dayHours === "closed") {
      return false;
    }
    if (typeof dayHours !== "object" || dayHours === null) {
      return true;
    }

    const duration = place.estimatedDuration || 60;
    const intervals = dayHours.intervals || [{ open: dayHours.open, close: dayHours.close }];
    const window = dayWindows[d] || { start: baseDayStartMin, end: baseDayEndMin };

    // Find locked/custom-timed stops on day d (both previously pinned and newly assigned)
    const dayLocked = [
      ...pinned.filter((p) => p.dayIndex === d && p.customTime),
      ...toAssign.filter((p) => p.dayIndex === d && p.customTime),
    ]
      .map((p) => {
        const startMin = parseTimeToMinutes(p.customTime!);
        const dur = p.estimatedDuration || 60;
        return {
          place: p,
          start: startMin,
          end: startMin + dur,
        };
      })
      .sort((a, b) => a.start - b.start);

    // If no locked stops, simple window overlap check
    if (dayLocked.length === 0) {
      return intervals.some((inv) => {
        const overlapStart = Math.max(inv.open, window.start);
        const overlapEnd = Math.min(inv.close, window.end);
        return overlapEnd - overlapStart >= duration;
      });
    }

    // Construct feasible time blocks outside of locked stops
    const freeBlocks: { start: number; end: number }[] = [];

    // 1. Block before first locked stop
    const firstLocked = dayLocked[0];
    const transitToFirst = getTransitMin(place, firstLocked.place);
    const block1End = firstLocked.start - transitToFirst;
    if (block1End > window.start) {
      freeBlocks.push({ start: window.start, end: block1End });
    }

    // 2. Blocks between consecutive locked stops
    for (let i = 0; i < dayLocked.length - 1; i++) {
      const prev = dayLocked[i];
      const next = dayLocked[i + 1];
      const transitFromPrev = getTransitMin(prev.place, place);
      const transitToNext = getTransitMin(place, next.place);
      const blockStart = prev.end + transitFromPrev;
      const blockEnd = next.start - transitToNext;
      if (blockEnd > blockStart) {
        freeBlocks.push({ start: blockStart, end: blockEnd });
      }
    }

    // 3. Block after last locked stop
    const lastLocked = dayLocked[dayLocked.length - 1];
    const transitFromLast = getTransitMin(lastLocked.place, place);
    const blockLastStart = lastLocked.end + transitFromLast;
    if (window.end > blockLastStart) {
      freeBlocks.push({ start: blockLastStart, end: window.end });
    }

    // Check if place can fit into ANY free block during its operating hours
    return intervals.some((inv) =>
      freeBlocks.some((block) => {
        const overlapStart = Math.max(inv.open, block.start);
        const overlapEnd = Math.min(inv.close, block.end);
        return overlapEnd - overlapStart >= duration;
      })
    );
  };

  // 1. Establish Day Cluster Anchors / Gravity Centers:
  // Pre-seed days with locked reservations or pinned places, and seed remaining days
  // with geographically separated anchor places (K-Means++ style) to partition the city into distinct daily neighborhood pods.
  const daySeeds: ({ lat: number; lng: number; name?: string; isReservation?: boolean } | null)[] = Array(days).fill(null);

  for (let d = 0; d < days; d++) {
    const dayPinnedWithCustom = pinned.find((p) => p.dayIndex === d && p.customTime);
    if (dayPinnedWithCustom) {
      daySeeds[d] = { lat: dayPinnedWithCustom.lat, lng: dayPinnedWithCustom.lng, name: dayPinnedWithCustom.name, isReservation: true };
      continue;
    }
    const dayPinned = pinned.find((p) => p.dayIndex === d);
    if (dayPinned) {
      daySeeds[d] = { lat: dayPinned.lat, lng: dayPinned.lng, name: dayPinned.name };
      continue;
    }
  }

  // Check if any unassigned place with locked customTime can seed an empty allowed day
  for (const p of toAssign) {
    if (p.customTime) {
      for (let d = 0; d < days; d++) {
        if (exemptDays.includes(d)) continue;
        if (!isDayAllowedForPlace(p, d, days)) continue;
        if (avoidClosedHours && !isPlaceFeasibleOnDay(p, d)) continue;
        if (daySeeds[d] === null) {
          daySeeds[d] = { lat: p.lat, lng: p.lng, name: p.name, isReservation: true };
          break;
        }
      }
    }
  }

  // For any remaining empty days, seed with unassigned places maximizing geographic separation (K-Means++ style)
  for (let d = 0; d < days; d++) {
    if (exemptDays.includes(d)) continue;
    if (daySeeds[d] !== null) continue;

    const availableCandidates = toAssign.filter(
      (p) =>
        isDayAllowedForPlace(p, d, days) &&
        (!avoidClosedHours || isPlaceFeasibleOnDay(p, d)) &&
        !daySeeds.some((s) => s && s.lat === p.lat && s.lng === p.lng)
    );
    if (availableCandidates.length === 0) continue;

    const activeSeeds = daySeeds.filter((s): s is NonNullable<typeof s> => s !== null);
    if (activeSeeds.length === 0) {
      const cand = availableCandidates.find((c) => c.isStarred) || availableCandidates[0];
      daySeeds[d] = { lat: cand.lat, lng: cand.lng, name: cand.name };
    } else {
      let bestCand: Place | null = null;
      let maxMinDist = -1;
      const pool = availableCandidates.some((c) => c.isStarred)
        ? availableCandidates.filter((c) => c.isStarred)
        : availableCandidates;

      for (const cand of pool) {
        let minDistToSeed = Infinity;
        for (const s of activeSeeds) {
          const dist = getDistance(cand.lat, cand.lng, s.lat, s.lng);
          if (dist < minDistToSeed) minDistToSeed = dist;
        }
        if (minDistToSeed > maxMinDist) {
          maxMinDist = minDistToSeed;
          bestCand = cand;
        }
      }
      if (bestCand) {
        daySeeds[d] = { lat: bestCand.lat, lng: bestCand.lng, name: bestCand.name };
      }
    }
  }

  const getDayCentroid = (d: number): { lat: number; lng: number } | null => {
    const assignedStops = [
      ...pinned.filter((p) => p.dayIndex === d),
      ...toAssign.filter((p) => p.dayIndex === d),
    ];
    if (assignedStops.length > 0) {
      let totalWeight = 0;
      let sumLat = 0;
      let sumLng = 0;
      for (const s of assignedStops) {
        const weight = s.customTime ? 4 : 1;
        sumLat += s.lat * weight;
        sumLng += s.lng * weight;
        totalWeight += weight;
      }
      return { lat: sumLat / totalWeight, lng: sumLng / totalWeight };
    }
    if (daySeeds[d]) {
      return { lat: daySeeds[d]!.lat, lng: daySeeds[d]!.lng };
    }
    const hotel = hotels.find((h) => h.dayIndex === d) || hotels[0];
    if (hotel) return { lat: hotel.lat, lng: hotel.lng };
    return null;
  };

  // Spatial clustering assignment: balances available budget, excess detour relative to the best candidate day,
  // neighborhood clustering affinity, reservation gravity centers, and end-of-day progression.
  for (const place of toAssign) {
    let bestDay = -1;
    let maxScore = -Infinity;

    // Determine the minimum detour for this place across all allowed, non-exempt candidate days.
    let minDetourKm = Infinity;
    for (let d = 0; d < days; d++) {
      if (exemptDays.includes(d)) continue;
      if (!isDayAllowedForPlace(place, d, days)) continue;
      const dKm = computeDayDetourMeters(place, d) / 1000;
      if (dKm < minDetourKm) minDetourKm = dKm;
    }
    if (!isFinite(minDetourKm)) minDetourKm = 0;

    for (let d = 0; d < days; d++) {
      // Days marked exempt are protected from receiving unassigned places
      if (exemptDays.includes(d)) {
        continue;
      }

      // Unified check: respects both hard-pinning (pinnedToDay) and allowedDayRange
      if (!isDayAllowedForPlace(place, d, days)) {
        continue;
      }

      // 1c. If place has a locked arrival time, verify day d does not already have an overlapping locked arrival time
      if (place.customTime) {
        const customMin = parseTimeToMinutes(place.customTime);
        const duration = place.estimatedDuration || 60;
        const customEnd = customMin + duration;

        // Conflict check: against other places on day d with locked customTime
        const dayPlaces = [
          ...pinned.filter((p) => p.dayIndex === d),
          ...toAssign.filter((p) => p.dayIndex === d),
        ];
        const hasTimeOverlap = dayPlaces.some((p) => {
          if (!p.customTime) return false;
          const pMin = parseTimeToMinutes(p.customTime);
          const pEnd = pMin + (p.estimatedDuration || 60);
          return customMin < pEnd && customEnd > pMin;
        });

        if (hasTimeOverlap) {
          continue; // Cannot place two locked-time stops at the same hour
        }

        // Verify customTime falls within place's operating hours on day d
        if (avoidClosedHours && place.openingHours && place.openingHours.length > 0) {
          const dayDate = addDays(parseISO(startDateISO), d);
          const dayHours = getPlaceDayHours(place.openingHours, dayDate);
          if (typeof dayHours === "object" && dayHours !== null) {
            const intervals = dayHours.intervals || [{ open: dayHours.open, close: dayHours.close }];
            const isOpenAtCustomTime = intervals.some(
              (inv) => customMin >= inv.open && customMin + duration <= inv.close
            );
            if (!isOpenAtCustomTime) {
              continue; // Place is closed at the requested custom locked time on day d
            }
          }
        }
      }

      // Resolve effective category config with day overrides
      const isFirstDay = d === 0;
      const isLastDay = d === days - 1;
      const baseCatConfig = categoryConfigs?.[place.category];
      const customDayOverride = baseCatConfig?.customDayOverrides?.[d];
      const hasSpecificDayOverride = !!customDayOverride || (isFirstDay && !!baseCatConfig?.firstDayOverride) || (isLastDay && !!baseCatConfig?.lastDayOverride);
      const catConfig = getEffectiveCategoryConfig(categoryConfigs, place.category, d, days);

      const minTarget = catConfig?.minPerDay;
      const maxTarget = catConfig?.maxPerDay;
      const currentCount = categoryCounts[d]?.[place.category] || 0;

      // 1. Check max limit constraint
      if (maxTarget != null) {
        if (currentCount >= maxTarget) {
          continue; // Skip this day, it's at max capacity for this category
        }
      }

      // 1b. Check minTimeBetween feasibility (e.g. minimum time between restaurants)
      const isQuickSnack = place.category === "restaurant" && (place.estimatedDuration || 60) <= 30;
      const minSpacing = isQuickSnack ? 0 : (catConfig?.minTimeBetween ?? (place.category === "restaurant" ? 150 : 0));
      const isUnderMinQuota = minTarget != null && currentCount < minTarget;

      if (minSpacing > 0 && currentCount > 0) {
        const duration = place.estimatedDuration || 60;
        const dayWindow = dayWindows[d] || { start: baseDayStartMin, end: baseDayEndMin };
        const availableWindow = dayWindow.end - dayWindow.start;
        const effectiveSpacing = isUnderMinQuota
          ? Math.max(30, Math.min(minSpacing, Math.floor((availableWindow - (currentCount + 1) * duration) / currentCount)))
          : minSpacing;
        const totalMealSpan = (currentCount + 1) * duration + currentCount * effectiveSpacing;
        if (totalMealSpan > availableWindow) {
          continue; // Day window physically cannot fit another visit even with reduced spacing
        }
      }

      // 1c. Dinner capacity feasibility check for sit-down restaurants:
      // Prevents packing multiple dinner-only restaurants into an evening window that cannot accommodate them.
      if (place.category === "restaurant" && !isQuickSnack && minSpacing > 0) {
        const dayDate = addDays(parseISO(startDateISO), d);
        let placeIsDinnerOnly = false;
        if (place.customTime) {
          placeIsDinnerOnly = parseTimeToMinutes(place.customTime) >= 990;
        } else if (place.openingHours && place.openingHours.length > 0) {
          const dh = getPlaceDayHours(place.openingHours, dayDate);
          if (typeof dh === "object" && dh !== null) {
            const invs = dh.intervals || [{ open: dh.open, close: dh.close }];
            placeIsDinnerOnly = invs.every((inv) => inv.open >= 990); // opens >= 16:30
          }
        }

        if (placeIsDinnerOnly) {
          const existingDayPlaces = [
            ...pinned.filter((p) => p.dayIndex === d),
            ...toAssign.filter((p) => p.dayIndex === d),
          ];

          const existingDinnerMeals = existingDayPlaces.filter((p) => {
            if (p.category !== "restaurant") return false;
            if ((p.estimatedDuration || 60) <= 30) return false;
            if (p.customTime) {
              return parseTimeToMinutes(p.customTime) >= 990;
            }
            if (p.openingHours && p.openingHours.length > 0) {
              const dh = getPlaceDayHours(p.openingHours, dayDate);
              if (typeof dh === "object" && dh !== null) {
                const invs = dh.intervals || [{ open: dh.open, close: dh.close }];
                return invs.every((inv) => inv.open >= 990);
              }
            }
            return false;
          });

          // Check if there is a locked dinner reservation on day d
          const lockedDinner = existingDinnerMeals.find((p) => !!p.customTime);
          if (lockedDinner && lockedDinner.customTime) {
            const lockedStart = parseTimeToMinutes(lockedDinner.customTime);
            const latestAllowedPriorMealEnd = lockedStart - minSpacing;
            const earliestDinnerStart = 1020; // 17:00 earliest dinner opening
            const availableDinnerBeforeLocked = latestAllowedPriorMealEnd - earliestDinnerStart;

            const nonLockedExistingDinnerCount = existingDinnerMeals.filter((p) => !p.customTime).length;
            const neededSpan = (nonLockedExistingDinnerCount + 1) * (place.estimatedDuration || 60) +
              nonLockedExistingDinnerCount * minSpacing;

            if (neededSpan > availableDinnerBeforeLocked) {
              continue; // Physically cannot fit another dinner before the locked reservation!
            }
          } else {
            // General evening window (17:00 to midnight = 420 mins). With 150m spacing, max 2 sit-down dinners.
            if (existingDinnerMeals.length >= 2) {
              continue;
            }
          }
        }
      }

      // 2. Strict Avoid Closed Hours Check:
      if (avoidClosedHours && !isPlaceFeasibleOnDay(place, d)) {
        continue;
      }

      // Detour & travel time estimation
      const { startAnchor, endAnchor } = getDayAnchors(d);
      const detourMeters = computeDayDetourMeters(place, d);
      const detourKm = detourMeters / 1000;
      const excessDetourKm = Math.max(0, detourKm - minDetourKm);
      const travelMin = Math.round(estimateTime(detourMeters, travelMode) / 60);

      const totalIfAdded = dayTimeUsed[d] + (place.estimatedDuration ?? 60) + travelMin;
      const remaining = effectiveDayBudgets[d] - totalIfAdded;

      // Force strict if this day has a reduced budget (e.g. due to a flight cutoff)
      const baseBudget = effectiveDayBudgets.length > 0 ? Math.max(...effectiveDayBudgets) : effectiveDayBudgets[d];
      const dayIsConstrained = effectiveDayBudgets[d] < baseBudget;
      const forceStrict = strictBudget || dayIsConstrained;

      // Allow slight budget flexibility for required minimums (e.g. remaining >= -45)
      const canConsiderDay = !forceStrict || remaining >= 0 || (isUnderMinQuota && remaining >= -45);

      if (canConsiderDay) {
        const currentAssignedToDay = [
          ...pinned.filter((p) => p.dayIndex === d),
          ...toAssign.filter((p) => p.dayIndex === d),
        ];

        // Day trip protection: if place is far from anchor (>= 45 km, like Ashikaga, Kawaguchiko, Shima Onsen),
        // don't put it on a day that ALREADY has a distant day trip in an incompatible direction (> 35 km apart)
        if (startAnchor) {
          const placeDistFromAnchor = getDistance(place.lat, place.lng, startAnchor.lat, startAnchor.lng);
          if (placeDistFromAnchor >= 45000) {
            const hasClashingDayTrip = currentAssignedToDay.some((p) => {
              const pDist = getDistance(p.lat, p.lng, startAnchor.lat, startAnchor.lng);
              if (pDist >= 45000) {
                const distBetween = getDistance(p.lat, p.lng, place.lat, place.lng);
                return distBetween > 35000;
              }
              return false;
            });
            if (hasClashingDayTrip) continue;
          }
        }

        // 1. Day Anchor / Centroid Cohesion:
        // Places cluster tightly around the day's neighborhood gravity center
        const dayCentroid = getDayCentroid(d);
        let centroidBonus = 0;
        if (dayCentroid) {
          const distToCentroidKm = getDistance(place.lat, place.lng, dayCentroid.lat, dayCentroid.lng) / 1000;
          if (distToCentroidKm <= 1.5) {
            centroidBonus = 1200; // Immediate walking distance / same block
          } else if (distToCentroidKm <= 3.5) {
            centroidBonus = 700;  // Same neighborhood/district
          } else if (distToCentroidKm <= 6.0) {
            centroidBonus = 250;  // Adjacent neighborhood
          } else if (distToCentroidKm > 6.0) {
            // Strict cross-town dispersion penalty to prevent 40-minute transits
            centroidBonus = -Math.min(3000, Math.round((distToCentroidKm - 6.0) * 200));
          }
        }

        // 2. Reservation Gravity Attraction:
        // If day d has a reservation or locked stop, places close to that reservation get an additional gravity boost!
        const dayReservations = currentAssignedToDay.filter((p) => !!p.customTime);
        let reservationGravityBonus = 0;
        if (dayReservations.length > 0) {
          let minResDistKm = Infinity;
          for (const res of dayReservations) {
            const rd = getDistance(place.lat, place.lng, res.lat, res.lng) / 1000;
            if (rd < minResDistKm) minResDistKm = rd;
          }
          if (minResDistKm <= 1.5) {
            reservationGravityBonus = 1000; // Immediate walking distance to reservation (< 1.5km)
          } else if (minResDistKm <= 3.5) {
            reservationGravityBonus = 500;  // Same district as reservation (< 3.5km)
          } else if (minResDistKm <= 6.0) {
            reservationGravityBonus = 150;  // Adjacent district (< 6km)
          } else if (minResDistKm > 6.0) {
            reservationGravityBonus = -Math.min(2500, Math.round((minResDistKm - 6.0) * 150));
          }
        }

        // 3. Local Nearest Neighbor Affinity:
        let minNeighborDistKm = Infinity;
        for (const existing of currentAssignedToDay) {
          const nd = getDistance(place.lat, place.lng, existing.lat, existing.lng) / 1000;
          if (nd < minNeighborDistKm) minNeighborDistKm = nd;
        }
        let neighborBonus = 0;
        if (currentAssignedToDay.length > 0 && isFinite(minNeighborDistKm)) {
          if (minNeighborDistKm <= 1.0) {
            neighborBonus = 500;
          } else if (minNeighborDistKm <= 2.5) {
            neighborBonus = 250;
          }
        }

        // 4. End-of-Day Progression (Hotel return or airport departure):
        // "Also keep in mind hotel return/flight departure at the end of the day as one of the decider ways to determine routing, lower priority than the other deciders."
        let endProgressionBonus = 0;
        if (endAnchor) {
          const distToEndKm = getDistance(place.lat, place.lng, endAnchor.lat, endAnchor.lng) / 1000;
          if (distToEndKm <= 3.0) {
            endProgressionBonus = 80;
          } else if (distToEndKm <= 6.0) {
            endProgressionBonus = 40;
          }
        }

        // 5. Category quota bonus:
        let quotaBonus = 0;
        if (isUnderMinQuota && minTarget != null) {
          const deficit = minTarget - currentCount;
          if (excessDetourKm <= 25) {
            quotaBonus = deficit * 600;
            if (hasSpecificDayOverride) {
              quotaBonus += 600;
            }
          }
        } else if (currentCount >= (minTarget ?? 2)) {
          // Discourage packing surplus places into days that already met their target
          // when other valid days might still be under quota
          quotaBonus = -currentCount * 150;
        } else if (minSpacing > 0 && currentCount > 0) {
          quotaBonus = -currentCount * 40;
        }

        // 6. Balanced Budget Score:
        const budgetScore = Math.min(80, remaining * 0.1);
        const excessDetourPenalty = excessDetourKm * 100;
        const detourPenalty = detourKm * 6;

        const score =
          budgetScore -
          excessDetourPenalty -
          detourPenalty +
          centroidBonus +
          reservationGravityBonus +
          neighborBonus +
          endProgressionBonus +
          quotaBonus;

        if (score > maxScore) {
          maxScore = score;
          bestDay = d;
        }
      }
    }

    if (bestDay !== -1) {
      place.dayIndex = bestDay;

      // Update time used
      const detourMeters = computeDayDetourMeters(place, bestDay);
      const travelMin = Math.round(estimateTime(detourMeters, travelMode) / 60);
      dayTimeUsed[bestDay] += (place.estimatedDuration ?? 60) + travelMin;
      
      // Update category counts
      if (!categoryCounts[bestDay]) categoryCounts[bestDay] = {};
      categoryCounts[bestDay][place.category] = (categoryCounts[bestDay][place.category] || 0) + 1;
    } else {
      // Starred places must be scheduled — force-assign with spatial affinity and displace non-starred if needed
      if (place.isStarred) {
        let forceBestDay = -1;
        let forceMaxScore = -Infinity;
        const hasFeasibleDay = Array.from({ length: days }).some((_, d) =>
          !exemptDays.includes(d) && isDayAllowedForPlace(place, d, days) && (!avoidClosedHours || isPlaceFeasibleOnDay(place, d))
        );
        for (let d = 0; d < days; d++) {
          if (exemptDays.includes(d)) {
            continue;
          }
          if (!isDayAllowedForPlace(place, d, days)) {
            continue;
          }
          if (avoidClosedHours && hasFeasibleDay && !isPlaceFeasibleOnDay(place, d)) {
            continue;
          }
          const detourKm = computeDayDetourMeters(place, d) / 1000;
          const excessDetourKm = Math.max(0, detourKm - minDetourKm);
          let forceScore = -excessDetourKm * 100 - detourKm * 6;

          // Check neighborhood centroid affinity to day d
          const dayCentroid = getDayCentroid(d);
          if (dayCentroid) {
            const distToCentroidKm = getDistance(place.lat, place.lng, dayCentroid.lat, dayCentroid.lng) / 1000;
            if (distToCentroidKm <= 3.5) forceScore += 500;
            else if (distToCentroidKm > 6.0) forceScore -= Math.round((distToCentroidKm - 6.0) * 150);
          }

          // If avoidClosedHours, prefer days where the place is actually open
          if (avoidClosedHours && place.openingHours && place.openingHours.length > 0) {
            const dayDate = addDays(parseISO(startDateISO), d);
            const dayHours = getPlaceDayHours(place.openingHours, dayDate);
            if (dayHours === "closed") {
              forceScore -= 10000;
            }
          }
          if (forceScore > forceMaxScore) {
            forceMaxScore = forceScore;
            forceBestDay = d;
          }
        }
        if (forceBestDay !== -1) {
          // If the day is over budget, automatically displace the lowest-priority unpinned non-starred place on that day!
          const unpinnedNonStarredOnDay = toAssign.filter(
            (p) => p.dayIndex === forceBestDay && !p.isStarred && !p.pinnedToDay && !p.customTime
          );

          place.dayIndex = forceBestDay;
          place.unfeasibleReason = undefined;

          if (dayTimeUsed[forceBestDay] + (place.estimatedDuration ?? 60) > effectiveDayBudgets[forceBestDay] && unpinnedNonStarredOnDay.length > 0) {
            unpinnedNonStarredOnDay.sort((a, b) => {
              const aDetour = computeDayDetourMeters(a, forceBestDay);
              const bDetour = computeDayDetourMeters(b, forceBestDay);
              return bDetour - aDetour; // highest detour first
            });
            const displaced = unpinnedNonStarredOnDay[0];
            displaced.dayIndex = null;
            displaced.unfeasibleReason = "Displaced to make room for must-visit starred place.";
            dayTimeUsed[forceBestDay] -= (displaced.estimatedDuration ?? 60);
            if (categoryCounts[forceBestDay]?.[displaced.category]) {
              categoryCounts[forceBestDay][displaced.category]--;
            }
          }

          const detourMeters = computeDayDetourMeters(place, forceBestDay);
          const travelMin = Math.round(estimateTime(detourMeters, travelMode) / 60);
          dayTimeUsed[forceBestDay] += (place.estimatedDuration ?? 60) + travelMin;
          if (!categoryCounts[forceBestDay]) categoryCounts[forceBestDay] = {};
          categoryCounts[forceBestDay][place.category] = (categoryCounts[forceBestDay][place.category] || 0) + 1;
        } else {
          place.dayIndex = null;
          const effectiveRange = getEffectiveAllowedDayRange(place, days);
          if (effectiveRange) {
            const badge = formatDayRangeBadge(effectiveRange, startDateISO);
            place.unfeasibleReason = `Must-visit place cannot be scheduled within allowed range (${badge.fullLabel}).`;
          } else {
            place.unfeasibleReason = "Must-visit place cannot be scheduled on any trip days.";
          }
          rejectedUnassigned.push(place);
        }
      } else {
        place.dayIndex = null;
        const effectiveRange = getEffectiveAllowedDayRange(place, days);
        let reason = "Exceeds daily time budget or category limits.";
        if (effectiveRange) {
          const badge = formatDayRangeBadge(effectiveRange, startDateISO);
          reason = `Cannot fit into schedule within allowed range (${badge.fullLabel}).`;
        } else if (avoidClosedHours && place.openingHours && place.openingHours.length > 0) {
          let allClosed = true;
          for (let d = 0; d < days; d++) {
            const dayDate = addDays(parseISO(startDateISO), d);
            const dayHours = getPlaceDayHours(place.openingHours, dayDate);
            if (dayHours !== "closed") {
              allClosed = false;
              break;
            }
          }
          if (allClosed) {
            reason = "Closed on all trip days.";
          } else {
            reason = "Cannot be scheduled during open hours or exceeds daily budget.";
          }
        }
        place.unfeasibleReason = reason;
        rejectedUnassigned.push(place);
      }
    }
  }

  const successfullyAssigned = toAssign.filter(p => p.dayIndex !== null);

  return [...pinned, ...successfullyAssigned, ...rejectedUnassigned];
}

/**
 * Retrieves custom transit duration in seconds between two points if defined,
 * checking both directions: `${fromId}->${toId}` and `${toId}->${fromId}`.
 */
export function getCustomTransitDuration(
  fromId?: string,
  toId?: string,
  customTransitTimes?: Record<string, number>,
): number | undefined {
  if (!fromId || !toId || !customTransitTimes) return undefined;
  return customTransitTimes[`${fromId}->${toId}`] ?? customTransitTimes[`${toId}->${fromId}`];
}

function evaluateRouteCost(
  points: (Hotel | Place)[],
  startMinutes: number,
  currentDate: Date,
  avoidClosedHours: boolean,
  travelMode: TravelMode,
  categoryConfigs?: Partial<Record<PlaceCategory, CategoryConfig>>,
  customTransitTimes?: Record<string, number>,
): { totalDistance: number; totalCost: number; conflicts: number; mealSpacingConflicts: number } {
  let totalDist = 0;
  let currentTime = startMinutes;
  let conflicts = 0;
  let penaltyMinutes = 0;
  let mealSpacingPenalty = 0;
  let mealSpacingConflicts = 0;
  const lastCategoryDeparture: Record<string, number> = {};

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const segDist = getDistance(from.lat, from.lng, to.lat, to.lng);
    totalDist += segDist;

    const fromId = "id" in from && from.id ? String(from.id) : (i === 0 ? "start-hotel" : undefined);
    const toId = "id" in to && to.id ? String(to.id) : (i + 1 === points.length - 1 ? "end-hotel" : undefined);
    const customSec = getCustomTransitDuration(fromId, toId, customTransitTimes);

    const travelMin = customSec !== undefined
      ? Math.round(customSec / 60)
      : Math.round(estimateTime(segDist, travelMode) / 60);
    currentTime += travelMin;

    const isPlace =
      "id" in to &&
      to.id !== "start-hotel" &&
      to.id !== "end-hotel" &&
      to.id !== "arrival" &&
      to.id !== "departure";

    if (isPlace) {
      const place = to as Place;
      const duration = place.estimatedDuration || 60;

      // First stop from hotel morning adjustment: if venue opens later, traveler departs hotel to arrive at opening
      if (i === 0 && !place.customTime) {
        if (avoidClosedHours && place.openingHours && place.openingHours.length > 0) {
          const parsed = getPlaceDayHours(place.openingHours, currentDate);
          if (parsed && typeof parsed === "object") {
            const intervals = parsed.intervals || [{ open: parsed.open, close: parsed.close }];
            const candidate = intervals.find((inv) => inv.open > currentTime);
            if (candidate && candidate.open > currentTime) {
              currentTime = candidate.open;
            }
          }
        }
        if (place.allowedTimeRange?.startTime) {
          const isExclude = place.allowedTimeRange.mode === "exclude";
          const rangeStart = parseTimeToMinutes(place.allowedTimeRange.startTime);
          let rangeEnd = place.allowedTimeRange.endTime ? parseTimeToMinutes(place.allowedTimeRange.endTime) : 0;
          if (rangeEnd === 0) rangeEnd = 24 * 60;
          else if (rangeEnd < rangeStart) rangeEnd += 24 * 60;

          if (isExclude) {
            if (currentTime >= rangeStart && currentTime < rangeEnd) {
              currentTime = rangeEnd;
            }
          } else {
            if (rangeStart > currentTime) {
              currentTime = rangeStart;
            }
          }
        }
      }

      // Advance time to reserved arrival time if stop has locked customTime
      if (place.customTime) {
        const customMin = parseTimeToMinutes(place.customTime);
        if (customMin > currentTime) {
          currentTime = customMin;
        }
      }

      if (avoidClosedHours && ((place.openingHours && place.openingHours.length > 0) || place.allowedTimeRange)) {
        const earlyMins = parseEarlyArrivalMinutes(place.reservation?.advanceTime);
        const conflict = checkTimeConflict(currentTime, duration, place.openingHours, currentDate, place.allowedTimeRange, earlyMins);
        if (conflict.hasConflict) {
          conflicts++;
        }
        if (conflict.effectiveStartTime && conflict.effectiveStartTime > currentTime) {
          currentTime = conflict.effectiveStartTime;
        } else if (conflict.waitMinutes && conflict.waitMinutes > 0) {
          currentTime += conflict.waitMinutes;
          // Arriving early before opening hours is fine: 0 distance penalty!
          // We only apply a tiny tie-breaker (0.0005m per wait min) so identical routes pick slightly less waiting
          penaltyMinutes += conflict.waitMinutes * 0.0005;
        }
      }

      // Spacing check: enforce minimum time between visits of the same category (default 150m for restaurant)
      // Quick snacks (<= 30 min duration) do not trigger a full sit-down meal gap
      const isQuickSnack = place.category === "restaurant" && (place.estimatedDuration || 60) <= 30;
      const minSpacing = isQuickSnack
        ? 0
        : (categoryConfigs?.[place.category]?.minTimeBetween ?? (place.category === "restaurant" ? 150 : 0));
      if (minSpacing > 0 && lastCategoryDeparture[place.category] !== undefined) {
        const timeSinceLast = currentTime - lastCategoryDeparture[place.category];
        if (timeSinceLast < minSpacing) {
          const shortfall = minSpacing - timeSinceLast;
          mealSpacingConflicts++;
          // Balanced penalty: prefer properly spaced meals, but never justify multi-hour suburban detours
          mealSpacingPenalty += 8000 + shortfall * 150;
        }
      }

      currentTime += duration;
      if (!isQuickSnack) {
        lastCategoryDeparture[place.category] = currentTime;
      }
    }
  }

  // End-of-day progression decider (lower priority than constraints and neighborhood cohesion):
  // Favor routes where the final leg to the end anchor (evening hotel or departure airport) is shorter.
  let endOfDayProgressionPenalty = 0;
  if (points.length >= 3) {
    const endAnchor = points[points.length - 1];
    const isEndAnchor =
      !("id" in endAnchor && endAnchor.id) ||
      endAnchor.id === "end-hotel" ||
      endAnchor.id === "departure";
    if (isEndAnchor) {
      const lastStop = points[points.length - 2];
      const returnDist = getDistance(lastStop.lat, lastStop.lng, endAnchor.lat, endAnchor.lng);
      endOfDayProgressionPenalty = returnDist * 0.15;
    }
  }

  // 1 conflict = 1,000 km penalty to guarantee avoiding closed hours over shortest distance
  const totalCost = totalDist + conflicts * 1000000 + penaltyMinutes * 1000 + mealSpacingPenalty + endOfDayProgressionPenalty;
  return { totalDistance: totalDist, totalCost, conflicts, mealSpacingConflicts };
}

// 2-Opt Algorithm for a sub-path (Start -> Stops -> End) with opening-hours and category-spacing awareness
function optimize2OptSub(
  startAnchor: Hotel | Place | null,
  endAnchor: Hotel | Place | null,
  places: Place[],
  windowStartTimeMinutes: number = 540,
  currentDate: Date = new Date(),
  avoidClosedHours: boolean = true,
  travelMode: TravelMode = "driving",
  categoryConfigs?: Partial<Record<PlaceCategory, CategoryConfig>>,
  customTransitTimes?: Record<string, number>,
): Place[] {
  if (places.length <= 1) return places;

  const getOpenMin = (p: Place) => {
    let openMin = 540;
    const hours = getPlaceDayHours(p.openingHours, currentDate);
    if (hours === "24hours") openMin = 0;
    else if (hours === "closed") openMin = 9999;
    else if (typeof hours === "object" && hours) openMin = hours.open;

    if (p.allowedTimeRange?.startTime) {
      const isExclude = p.allowedTimeRange.mode === "exclude";
      const allowedOpen = parseTimeToMinutes(p.allowedTimeRange.startTime);
      let allowedClose = p.allowedTimeRange.endTime ? parseTimeToMinutes(p.allowedTimeRange.endTime) : 0;
      if (allowedClose === 0) allowedClose = 24 * 60;
      else if (allowedClose < allowedOpen) allowedClose += 24 * 60;

      if (isExclude) {
        if (openMin >= allowedOpen && openMin < allowedClose) {
          openMin = allowedClose;
        }
      } else {
        openMin = Math.max(openMin, allowedOpen);
      }
    }
    return openMin;
  };

  // For small N (<= 6 stops), exact permutation search guarantees zero conflicts, proper meal spacing, and optimal distance
  if (places.length <= 6) {
    let bestPoints: (Hotel | Place)[] = [];
    let bestCost = Infinity;

    const sortedInput = avoidClosedHours ? [...places].sort((a, b) => getOpenMin(a) - getOpenMin(b)) : places;

    const permute = (arr: Place[], current: Place[] = []) => {
      if (arr.length === 0) {
        const candidatePoints: (Hotel | Place)[] = [];
        if (startAnchor) candidatePoints.push(startAnchor);
        candidatePoints.push(...current);
        if (endAnchor) candidatePoints.push(endAnchor);

        const { totalCost } = evaluateRouteCost(
          candidatePoints,
          windowStartTimeMinutes,
          currentDate,
          avoidClosedHours,
          travelMode,
          categoryConfigs,
          customTransitTimes,
        );

        if (totalCost < bestCost) {
          bestCost = totalCost;
          bestPoints = candidatePoints;
        }
        return;
      }

      for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        permute(rest, [...current, arr[i]]);
      }
    };

    permute(sortedInput);

    const placeStart = startAnchor ? 1 : 0;
    const placeEnd = endAnchor ? bestPoints.length - 1 : bestPoints.length;
    return bestPoints.slice(placeStart, placeEnd) as Place[];
  }

  // For N > 6:
  // 1. Initial smart sort: sort places by opening time so early-opening places come first
  let sortedPlaces = [...places];
  if (avoidClosedHours) {
    sortedPlaces.sort((a, b) => getOpenMin(a) - getOpenMin(b));
  }

  // Interleave categories with minSpacing (e.g. restaurant) so the initial order doesn't start with back-to-back meals
  const spacedCategories = new Set<string>();
  places.forEach((p) => {
    const isQuick = p.category === "restaurant" && (p.estimatedDuration || 60) <= 30;
    const spacing = isQuick ? 0 : (categoryConfigs?.[p.category]?.minTimeBetween ?? (p.category === "restaurant" ? 150 : 0));
    if (spacing > 0) spacedCategories.add(p.category);
  });

  if (spacedCategories.size > 0) {
    for (const cat of spacedCategories) {
      const catPlaces = sortedPlaces.filter((p) => p.category === cat);
      if (catPlaces.length > 1) {
        const otherPlaces = sortedPlaces.filter((p) => p.category !== cat);
        const interleaved: Place[] = [];
        const step = otherPlaces.length / (catPlaces.length + 1);
        let catIdx = 0;
        let otherIdx = 0;
        for (let pos = 0; pos < places.length; pos++) {
          if (catIdx < catPlaces.length && (otherIdx >= Math.round((catIdx + 1) * step) || otherIdx >= otherPlaces.length)) {
            interleaved.push(catPlaces[catIdx++]);
          } else if (otherIdx < otherPlaces.length) {
            interleaved.push(otherPlaces[otherIdx++]);
          } else if (catIdx < catPlaces.length) {
            interleaved.push(catPlaces[catIdx++]);
          }
        }
        sortedPlaces = interleaved;
      }
    }
  }

  let points: (Hotel | Place)[] = [];
  if (startAnchor) points.push(startAnchor);
  points.push(...sortedPlaces);
  if (endAnchor) points.push(endAnchor);

  const swapStart = startAnchor ? 1 : 0;
  const swapEnd = endAnchor ? points.length - 2 : points.length - 1;

  let { totalCost: bestCost } = evaluateRouteCost(
    points,
    windowStartTimeMinutes,
    currentDate,
    avoidClosedHours,
    travelMode,
    categoryConfigs,
    customTransitTimes,
  );

  let improved = true;
  let iterations = 0;
  const maxIterations = 50;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // 2-Opt edge swaps
    for (let i = swapStart; i <= swapEnd; i++) {
      for (let j = i + 1; j <= swapEnd; j++) {
        const newPoints = swap2Opt(points, i, j);
        const { totalCost: newCost } = evaluateRouteCost(
          newPoints,
          windowStartTimeMinutes,
          currentDate,
          avoidClosedHours,
          travelMode,
          categoryConfigs,
          customTransitTimes,
        );

        if (newCost < bestCost) {
          points = newPoints;
          bestCost = newCost;
          improved = true;
        }
      }
    }

    // 1-Opt node relocation (move stop from position i to position j)
    for (let i = swapStart; i <= swapEnd; i++) {
      for (let j = swapStart; j <= swapEnd; j++) {
        if (i === j) continue;
        const copy = [...points];
        const [moved] = copy.splice(i, 1);
        copy.splice(j, 0, moved);

        const { totalCost: newCost } = evaluateRouteCost(
          copy,
          windowStartTimeMinutes,
          currentDate,
          avoidClosedHours,
          travelMode,
          categoryConfigs,
          customTransitTimes,
        );

        if (newCost < bestCost) {
          points = copy;
          bestCost = newCost;
          improved = true;
        }
      }
    }
  }

  const placeStart = startAnchor ? 1 : 0;
  const placeEnd = endAnchor ? points.length - 1 : points.length;
  return points.slice(placeStart, placeEnd) as Place[];
}

// Algorithm for a single day's route, respecting locked custom reservation times, open hours, and meal spacing
function optimizeDayRoute(
  startHotel: Hotel | Place | null,
  endHotel: Hotel | Place | null,
  dayPlaces: Place[],
  dayStartTime: string = "09:00",
  currentDate: Date = new Date(),
  avoidClosedHours: boolean = true,
  travelMode: TravelMode = "driving",
  startMinutesOverride?: number,
  categoryConfigs?: Partial<Record<PlaceCategory, CategoryConfig>>,
  customTransitTimes?: Record<string, number>,
): Place[] {
  if (dayPlaces.length <= 1) return dayPlaces;

  const baseStartMin = startMinutesOverride ?? parseTimeToMinutes(dayStartTime);

  // Check if any places have a custom locked time (e.g. reservations)
  const lockedPlaces = dayPlaces
    .filter((p) => !!p.customTime)
    .sort((a, b) => parseTimeToMinutes(a.customTime!) - parseTimeToMinutes(b.customTime!));

  if (lockedPlaces.length === 0) {
    const optimized = optimize2OptSub(
      startHotel,
      endHotel,
      dayPlaces,
      baseStartMin,
      currentDate,
      avoidClosedHours,
      travelMode,
      categoryConfigs,
      customTransitTimes,
    );
    return optimized.map((p, idx) => ({ ...p, orderInDay: idx }));
  }

  const unlockedPlaces = dayPlaces.filter((p) => !p.customTime);

  if (unlockedPlaces.length === 0) {
    return lockedPlaces.map((p, idx) => ({ ...p, orderInDay: idx }));
  }

  // Partition into windows defined by locked reservation anchors:
  // Window 0: StartHotel -> Locked[0]
  // Window i: Locked[i-1] -> Locked[i]
  // Window N: Locked[last] -> EndHotel
  const numWindows = lockedPlaces.length + 1;
  const windowBuckets: Place[][] = Array.from({ length: numWindows }, () => []);

  const windowStartTimes: number[] = [];
  const windowEndTimes: number[] = [];

  for (let w = 0; w < numWindows; w++) {
    const wStart = w === 0
      ? baseStartMin
      : parseTimeToMinutes(lockedPlaces[w - 1].customTime!) + (lockedPlaces[w - 1].estimatedDuration || 60);
    const wEnd = w === numWindows - 1
      ? 24 * 60
      : parseTimeToMinutes(lockedPlaces[w].customTime!);
    windowStartTimes.push(wStart);
    windowEndTimes.push(wEnd);
  }

  // Distribute unlocked places to the best-fitting window
  for (const place of unlockedPlaces) {
    let bestWindow = 0;
    let minAdditionalDist = Infinity;

    for (let w = 0; w < numWindows; w++) {
      const wCapacity = windowEndTimes[w] - windowStartTimes[w];
      const duration = place.estimatedDuration || 60;
      const startAnchor = w === 0 ? startHotel : lockedPlaces[w - 1];
      const endAnchor = w === numWindows - 1 ? endHotel : lockedPlaces[w];

      let dist = 0;
      if (startAnchor && endAnchor) {
        dist = getDistance(startAnchor.lat, startAnchor.lng, place.lat, place.lng) +
               getDistance(place.lat, place.lng, endAnchor.lat, endAnchor.lng);
      } else if (startAnchor) {
        dist = getDistance(startAnchor.lat, startAnchor.lng, place.lat, place.lng);
      } else if (endAnchor) {
        dist = getDistance(place.lat, place.lng, endAnchor.lat, endAnchor.lng);
      }

      // Capacity check: prevent assigning stops into a window that precedes a locked reservation if they won't fit
      const currentBucketDuration = windowBuckets[w].reduce((sum, p) => sum + (p.estimatedDuration || 60), 0);
      let score = dist;

      if (w < numWindows - 1) {
        // Window ends at a locked reservation (e.g. Shibuya Sky at 10:00 AM)
        // Hard constraint: do not cram stops into this window if they would cause arrival past the reservation
        const estTransitPadding = (windowBuckets[w].length + 1) * 15; // ~15 min transit per leg
        const totalTimeNeeded = currentBucketDuration + duration + estTransitPadding;

        if (currentBucketDuration + duration > wCapacity) {
          // Hard overflow: Impossible to visit and still arrive on time even with 0 travel time
          score += 10000000 + (currentBucketDuration + duration - wCapacity) * 50000;
        } else if (totalTimeNeeded > wCapacity) {
          // Tight overflow: Place duration technically fits, but transit travel time would cause late arrival
          score += 3000000 + (totalTimeNeeded - wCapacity) * 20000;
        }
      } else {
        // Last window of the day (after all locked reservations)
        const isTight = currentBucketDuration + duration > wCapacity && wCapacity > 0;
        if (isTight) {
          score *= 2.5;
        }
      }

      // Penalize assigning to a window where the place is closed
      if (avoidClosedHours && place.openingHours && place.openingHours.length > 0) {
        const hours = getPlaceDayHours(place.openingHours, currentDate);
        if (hours === "closed") {
          score += 50000000;
        } else if (typeof hours === "object" && hours) {
          if (windowEndTimes[w] <= hours.open || windowStartTimes[w] >= hours.close) {
            score += 50000000;
          } else {
            const overlapStart = Math.max(windowStartTimes[w], hours.open);
            const overlapEnd = Math.min(windowEndTimes[w], hours.close);
            if (overlapEnd - overlapStart < duration) {
              score += 25000000;
            }
          }
        }
      }

      // Penalize assigning to a window violating user-defined allowedTimeRange
      if (place.allowedTimeRange?.startTime && place.allowedTimeRange?.endTime) {
        const isExclude = place.allowedTimeRange.mode === "exclude";
        const rangeStart = parseTimeToMinutes(place.allowedTimeRange.startTime);
        let rangeEnd = parseTimeToMinutes(place.allowedTimeRange.endTime);
        if (rangeEnd === 0) rangeEnd = 24 * 60;
        if (rangeEnd < rangeStart) rangeEnd += 24 * 60;

        if (isExclude) {
          if (windowStartTimes[w] >= rangeStart && windowEndTimes[w] <= rangeEnd) {
            score += 50000000;
          } else {
            const overlapStart = Math.max(windowStartTimes[w], rangeStart);
            const overlapEnd = Math.min(windowEndTimes[w], rangeEnd);
            const overlapDuration = Math.max(0, overlapEnd - overlapStart);
            const availableWindow = (windowEndTimes[w] - windowStartTimes[w]) - overlapDuration;
            if (availableWindow < duration) {
              score += 25000000;
            }
          }
        } else {
          if (windowEndTimes[w] <= rangeStart || windowStartTimes[w] >= rangeEnd) {
            score += 50000000;
          } else {
            const overlapStart = Math.max(windowStartTimes[w], rangeStart);
            const overlapEnd = Math.min(windowEndTimes[w], rangeEnd);
            if (overlapEnd - overlapStart < duration) {
              score += 25000000;
            }
          }
        }
      }

      // Penalize assigning a restaurant to a window that already has one, or is adjacent to a locked meal
      const isQuick = place.category === "restaurant" && (place.estimatedDuration || 60) <= 30;
      const minSpacing = isQuick ? 0 : (categoryConfigs?.[place.category]?.minTimeBetween ?? (place.category === "restaurant" ? 150 : 0));
      if (minSpacing > 0) {
        const hasSameCatInBucket = windowBuckets[w].some((p) => p.category === place.category && !((p.estimatedDuration || 60) <= 30));
        if (hasSameCatInBucket) {
          score += 1000000;
        }
        if (w > 0 && lockedPlaces[w - 1].category === place.category && wCapacity < minSpacing) {
          score += 500000;
        }
        if (w < lockedPlaces.length && lockedPlaces[w].category === place.category && wCapacity < minSpacing) {
          score += 500000;
        }
      }

      if (score < minAdditionalDist) {
        minAdditionalDist = score;
        bestWindow = w;
      }
    }

    windowBuckets[bestWindow].push(place);
  }

  // Optimize each window bucket using 2-Opt/permutation and assemble finalized sequence
  const finalizedPlaces: Place[] = [];

  for (let w = 0; w < numWindows; w++) {
    const startAnchor = w === 0 ? startHotel : lockedPlaces[w - 1];
    const endAnchor = w === numWindows - 1 ? endHotel : lockedPlaces[w];
    const optimizedSub = optimize2OptSub(
      startAnchor,
      endAnchor,
      windowBuckets[w],
      windowStartTimes[w],
      currentDate,
      avoidClosedHours,
      travelMode,
      categoryConfigs,
      customTransitTimes,
    );
    finalizedPlaces.push(...optimizedSub);

    if (w < lockedPlaces.length) {
      finalizedPlaces.push(lockedPlaces[w]);
    }
  }

  return finalizedPlaces.map((p, idx) => ({ ...p, orderInDay: idx }));
}

function swap2Opt(route: any[], i: number, k: number): any[] {
  return [
    ...route.slice(0, i),
    ...route.slice(i, k + 1).reverse(),
    ...route.slice(k + 1),
  ];
}

function buildDayRoute(
  dayPlaces: Place[],
  hotels: Hotel[],
  dayIndex: number,
  travelMode: TravelMode,
  arrivalLocation?: Place | null,
  departureLocation?: Place | null,
  manualOrder: boolean = false,
  manualSequence?: string[],
  dayStartTime: string = "09:00",
  startDateISO: string = new Date().toISOString(),
  avoidClosedHours: boolean = true,
  isLastDay: boolean = false,
  arrivalFlight?: FlightInfo | null,
  _departureFlight?: FlightInfo | null,
  categoryConfigs?: Partial<Record<PlaceCategory, CategoryConfig>>,
  existingSegments?: RouteSegment[],
  customTransitTimes?: Record<string, number>,
): DayRoute {
  // On the last day, travelers check out in the morning, so there is no Day End / Hotel
  const endHotelRaw = (!isLastDay && (hotels.find((h) => h.dayIndex === dayIndex) || null)) || null;
  const startHotelRaw =
    dayIndex > 0
      ? hotels.find((h) => h.dayIndex === dayIndex - 1) || null
      : (hotels.find((h) => h.dayIndex === 0) || null);

  // Sanitize locations to avoid "Null Island" (0,0) bug
  const sanitize = (loc: any) =>
    loc && loc.lat === 0 && loc.lng === 0 ? null : loc;

  const startHotel = sanitize(startHotelRaw);
  const endHotel = sanitize(endHotelRaw);
  const arrivalLoc = sanitize(arrivalLocation);
  const departureLoc = sanitize(departureLocation);

  const currentDate = addDays(parseISO(startDateISO), dayIndex);

  const effectiveStartAnchor = dayIndex === 0 && arrivalLoc ? arrivalLoc : startHotel;
  const effectiveEndAnchor = isLastDay && departureLoc ? departureLoc : (isLastDay ? null : endHotel);

  let startMinutes = parseTimeToMinutes(dayStartTime);
  if (dayIndex === 0 && arrivalFlight) {
    const arrMin = parseTimeToMinutes(arrivalFlight.time);
    startMinutes = Math.max(startMinutes, arrMin) + (arrivalFlight.buffer ?? 30);
  }

  let optimizedPlaces = manualOrder
    ? dayPlaces
    : optimizeDayRoute(
        effectiveStartAnchor,
        effectiveEndAnchor,
        dayPlaces,
        dayStartTime,
        currentDate,
        avoidClosedHours,
        travelMode,
        startMinutes,
        categoryConfigs,
        customTransitTimes,
      );

  let dayDist = 0;
  let points: (Place | Hotel)[] = [];

  const rawPoints: (Place | Hotel)[] = [];
  const ids = manualSequence && manualSequence.length > 0 
    ? (isLastDay ? manualSequence.filter(id => id !== "end-hotel") : manualSequence)
    : (() => {
        const defaultIds: string[] = [];
        if (arrivalLoc) defaultIds.push("arrival");
        if (startHotel) defaultIds.push("start-hotel");
        optimizedPlaces.forEach((p) => defaultIds.push(p.id));
        if (endHotel && !isLastDay) defaultIds.push("end-hotel");
        if (departureLoc) defaultIds.push("departure");
        return defaultIds;
      })();

  const physicalIds: string[] = [];
  ids.forEach((id) => {
    if (id.startsWith("custom-buffer-")) return;
    physicalIds.push(id);
    let loc = null;
    if (id === "arrival") loc = arrivalLoc;
    else if (id === "start-hotel") loc = startHotel;
    else if (id === "end-hotel") loc = endHotel;
    else if (id === "departure") loc = departureLoc;
    else loc = dayPlaces.find((p) => String(p.id) === String(id)) || null;
    rawPoints.push(loc);
  });

  // Two-pass fallback to ensure every point has a valid coordinate
  const processedPoints: (Place | Hotel)[] = [];
  const firstValid = rawPoints.find(p => p && !(p.lat === 0 && p.lng === 0));

  rawPoints.forEach((loc, idx) => {
    let current = loc;
    if (!current || (current.lat === 0 && current.lng === 0)) {
      if (idx > 0 && processedPoints[idx - 1]) {
        current = { ...processedPoints[idx - 1], name: "Unknown" } as any;
      } else if (firstValid) {
        current = { ...firstValid, name: "Unknown" } as any;
      } else {
        current = { name: "Unknown", lat: 0, lng: 0 } as any;
      }
    }
    processedPoints.push(current!);
  });

  points = processedPoints;

  if (manualSequence && manualSequence.length > 0) {
    optimizedPlaces = points.filter(
      (p) =>
        (p as Place).id !== undefined &&
        (p as Place).id !== "arrival" &&
        (p as Place).id !== "departure" &&
        (p as Place).id !== "start-hotel" &&
        (p as Place).id !== "end-hotel" &&
        !(p as Place).id?.startsWith("custom-buffer-"),
    ) as Place[];
  }

  const segments: RouteSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const segDist = getDistance(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng,
    );
    dayDist += segDist;

    const fromId = physicalIds[i];
    const toId = physicalIds[i + 1];

    const existing = existingSegments?.find((s) => s.fromId === fromId && s.toId === toId);

    const isWalkableDist = segDist <= 800;
    const segMode = existing?.travelMode ?? (isWalkableDist ? "walking" : travelMode);
    let segTime = estimateTime(segDist, segMode);
    let customDuration: number | undefined = undefined;
    let originalTime: number | undefined = undefined;

    const customSec = existing?.customDuration ?? getCustomTransitDuration(fromId, toId, customTransitTimes);

    if (customSec !== undefined) {
      customDuration = customSec;
      originalTime = existing?.originalTime ?? segTime;
      segTime = customSec;
    } else if (existing?.originalTime !== undefined) {
      originalTime = existing.originalTime;
    }

    segments.push({
      distance: segDist,
      time: segTime,
      travelMode: segMode,
      customTravelMode: existing?.customTravelMode,
      customDuration,
      originalTime,
      fromId,
      toId,
      isHeuristic: segMode === "transit",
      heuristicReason: segMode === "transit"
        ? (existing?.heuristicReason || "Transit time estimated geometrically (~18 km/h local / ~162 km/h express).")
        : undefined,
      transitUrl: existing?.transitUrl,
      stationFrom: existing?.stationFrom,
      stationTo: existing?.stationTo,
      transitDetails: existing?.transitDetails,
    });
  }

  const dayTravelTime = segments.reduce((sum, s) => sum + s.time, 0);
  const dayVisitTime = optimizedPlaces.reduce(
    (sum, p) => sum + (p.estimatedDuration ?? 60) * 60,
    0,
  ); // minutes to seconds

  return {
    day: dayIndex,
    startHotel,
    endHotel: isLastDay ? null : endHotel,
    stops: optimizedPlaces,
    segments,
    totalDistance: dayDist,
    totalTime: dayTravelTime,
    totalVisitTime: dayVisitTime,
    manualSequence: isLastDay && manualSequence ? manualSequence.filter(id => id !== "end-hotel") : manualSequence,
  };
}

// Strict Closed Hours Eviction:
// When avoidClosedHours is active, checks arrival times through the route's stop order.
// If any unpinned / non-customTime stop arrives during closed hours, evicts it and re-runs
// route building until zero unpinned conflicts remain.
function evictClosedHourConflicts(
  dayPlaces: Place[],
  hotels: Hotel[],
  dayIndex: number,
  travelMode: TravelMode,
  arrivalLocation?: Place | null,
  departureLocation?: Place | null,
  dayStartTime: string = "09:00",
  startDateISO: string = new Date().toISOString(),
  isLastDay: boolean = false,
  arrivalFlight?: FlightInfo | null,
  departureFlight?: FlightInfo | null,
  categoryConfigs?: Partial<Record<PlaceCategory, CategoryConfig>>,
  existingSegments?: RouteSegment[],
  customTransitTimes?: Record<string, number>,
): { route: DayRoute; evicted: { place: Place; reason: string }[]; remainingPlaces: Place[] } {
  let currentPlaces = [...dayPlaces];
  const evicted: { place: Place; reason: string }[] = [];
  const currentDate = addDays(parseISO(startDateISO), dayIndex);

  const [startH, startM] = dayStartTime.split(":").map(Number);
  let dayStartTotal = (startH || 0) * 60 + (startM || 0);
  if (dayIndex === 0 && arrivalFlight) {
    const arrTotal = parseTimeToMinutes(arrivalFlight.time);
    dayStartTotal = Math.max(dayStartTotal, arrTotal) + (arrivalFlight.buffer ?? 30);
  }

  while (true) {
    const route = buildDayRoute(
      currentPlaces,
      hotels,
      dayIndex,
      travelMode,
      dayIndex === 0 ? arrivalLocation : null,
      isLastDay ? departureLocation : null,
      false,
      undefined,
      dayStartTime,
      startDateISO,
      true,
      isLastDay,
      dayIndex === 0 ? arrivalFlight : null,
      isLastDay ? departureFlight : null,
      categoryConfigs,
      existingSegments,
      customTransitTimes,
    );

    // Compute arrival time at each stop using actual segment durations (including custom transit times)
    let currTime = dayStartTotal;
    const conflictedStops: { place: Place; reason: string }[] = [];

    for (let sIdx = 0; sIdx < route.stops.length; sIdx++) {
      const stop = route.stops[sIdx];
      const seg = route.segments[sIdx];
      const travelMin = seg ? Math.round(seg.time / 60) : 0;
      currTime += travelMin;

      // 1. First stop from hotel in the morning:
      // If the venue opens later than the earliest start time, travelers depart hotel to arrive at opening
      if (sIdx === 0 && !stop.customTime) {
        if (stop.openingHours && stop.openingHours.length > 0) {
          const parsed = getPlaceDayHours(stop.openingHours, currentDate);
          if (parsed && typeof parsed === "object") {
            const intervals = parsed.intervals || [{ open: parsed.open, close: parsed.close }];
            const candidate = intervals.find((inv) => inv.open > currTime);
            if (candidate && candidate.open > currTime) {
              currTime = candidate.open;
            }
          }
        }
        if (stop.allowedTimeRange?.startTime) {
          const isExclude = stop.allowedTimeRange.mode === "exclude";
          const rangeStart = parseTimeToMinutes(stop.allowedTimeRange.startTime);
          let rangeEnd = stop.allowedTimeRange.endTime ? parseTimeToMinutes(stop.allowedTimeRange.endTime) : 0;
          if (rangeEnd === 0) rangeEnd = 24 * 60;
          else if (rangeEnd < rangeStart) rangeEnd += 24 * 60;

          if (isExclude) {
            if (currTime >= rangeStart && currTime < rangeEnd) {
              currTime = rangeEnd;
            }
          } else {
            if (rangeStart > currTime) {
              currTime = rangeStart;
            }
          }
        }
      }

      // 2. Reserved stop with locked customTime:
      // Jump arrival time to the reserved time (same as DailySchedule.tsx and excelExportService.ts)
      if (stop.customTime) {
        const customMin = parseTimeToMinutes(stop.customTime);
        if (customMin > currTime) {
          currTime = customMin;
        }
      }

      const isPinnedOrCustom = stop.pinnedToDay || !!stop.customTime;

      const earlyMins = parseEarlyArrivalMinutes(stop.reservation?.advanceTime);
      const conflict = checkTimeConflict(
        currTime,
        stop.estimatedDuration || 60,
        stop.openingHours,
        currentDate,
        stop.allowedTimeRange,
        earlyMins,
      );

      if (!isPinnedOrCustom && conflict.hasConflict) {
        // If the conflict is purely early arrival ("Closed (opens at X)"), check if the place can be visited
        // once it opens without violating day end or overlapping subsequent locked reservations.
        const isEarlyArrivalOnly = conflict.reason?.startsWith("Closed (opens at");
        if (isEarlyArrivalOnly && conflict.effectiveStartTime) {
          const visitEnd = conflict.effectiveStartTime + (stop.estimatedDuration || 60);
          let fitsBeforeEnd = visitEnd <= 24 * 60;
          if (isLastDay && departureFlight) {
            const depTotal = parseTimeToMinutes(departureFlight.time) - (departureFlight.buffer ?? 90);
            fitsBeforeEnd = visitEnd <= depTotal;
          }
          const nextLocked = currentPlaces.find(
            (p) => p.customTime && parseTimeToMinutes(p.customTime) > currTime
          );
          let fitsBeforeLocked = true;
          if (nextLocked && nextLocked.customTime) {
            const lockedStart = parseTimeToMinutes(nextLocked.customTime);
            fitsBeforeLocked = visitEnd <= lockedStart;
          }
          if (fitsBeforeEnd && fitsBeforeLocked) {
            // Traveler can wait for opening and visit during open hours without conflict!
            currTime = visitEnd;
            continue;
          }
        }

        conflictedStops.push({
          place: stop,
          reason: conflict.reason || "Closed during visiting hours",
        });
      }

      if (conflict.waitMinutes && conflict.waitMinutes > 0) {
        currTime += conflict.waitMinutes;
      }

      currTime += stop.estimatedDuration || 60;
    }

    if (conflictedStops.length === 0) {
      return { route, evicted, remainingPlaces: currentPlaces };
    }

    // Prioritize evicting unpinned, non-starred stops to protect must-visit starred places
    const nonStarredConflicted = conflictedStops.filter((c) => !c.place.isStarred);
    let toEvict: { place: Place; reason: string };

    if (nonStarredConflicted.length > 0) {
      toEvict = nonStarredConflicted[nonStarredConflicted.length - 1];
    } else {
      // If the conflicted stops are all starred, check if there is any unpinned NON-STARRED stop on the day
      // whose removal frees up schedule time to resolve the starred stop's conflict!
      const unpinnedNonStarred = currentPlaces.filter((p) => !p.isStarred && !p.pinnedToDay && !p.customTime);
      if (unpinnedNonStarred.length > 0) {
        const placeToDrop = unpinnedNonStarred[unpinnedNonStarred.length - 1];
        toEvict = {
          place: placeToDrop,
          reason: "Displaced to allow must-visit starred place to fit within open hours.",
        };
      } else {
        toEvict = conflictedStops[conflictedStops.length - 1];
      }
    }

    evicted.push(toEvict);
    currentPlaces = currentPlaces.filter((p) => p.id !== toEvict.place.id);

    if (currentPlaces.length === 0) {
      const emptyRoute = buildDayRoute(
        [],
        hotels,
        dayIndex,
        travelMode,
        dayIndex === 0 ? arrivalLocation : null,
        isLastDay ? departureLocation : null,
        false,
        undefined,
        dayStartTime,
        startDateISO,
        true,
        isLastDay,
        dayIndex === 0 ? arrivalFlight : null,
        isLastDay ? departureFlight : null,
        categoryConfigs,
        existingSegments,
        customTransitTimes,
      );
      return { route: emptyRoute, evicted, remainingPlaces: [] };
    }
  }
}

// Fetch accurate times using Google Maps API for a finalized DayRoute
export async function fetchAccurateRouteTimes(
  route: DayRoute,
  startDateISO: string,
  dayStartTime: string, // HH:mm
  customTransitTimes?: Record<string, number>,
): Promise<DayRoute> {
  const newSegments = [...route.segments];
  let currentDistance = 0;
  let currentTime = 0;

  // Build points array for this route
  const points: { lat: number; lng: number }[] = [];
  if (route.manualSequence && route.manualSequence.length > 0) {
    route.manualSequence.forEach((id) => {
      if (id === "start-hotel" && route.startHotel) {
        points.push(route.startHotel);
      } else if (id === "end-hotel" && route.endHotel) {
        points.push(route.endHotel);
      } else {
        const stop = route.stops.find((s) => String(s.id) === String(id));
        if (stop) {
          points.push(stop);
        }
      }
    });
  } else {
    if (route.startHotel) points.push(route.startHotel);
    route.stops.forEach((s) => points.push(s));
    if (route.endHotel) points.push(route.endHotel);
  }

  // Parse start time
  const [startH, startM] = dayStartTime.split(":").map(Number);
  let baseDate = addDays(parseISO(startDateISO), route.day);
  baseDate = setMinutes(setHours(baseDate, startH), startM);

  const segmentPromises = newSegments.map(async (seg, i) => {
    const findPoint = (id?: string) => {
      if (!id) return null;
      if (id === "start-hotel" && route.startHotel) return route.startHotel;
      if (id === "end-hotel" && route.endHotel) return route.endHotel;
      const stop = route.stops.find((s) => String(s.id) === String(id));
      if (stop) return stop;
      return null;
    };

    const origin = findPoint(seg.fromId) || points[i];
    const destination = findPoint(seg.toId) || points[i + 1];

    if (!origin || !destination) return seg;

    const customSec = seg.customDuration ?? getCustomTransitDuration(seg.fromId, seg.toId, customTransitTimes);

    try {
      // Calculate departure time for this segment
      let estimatedDeparture = new Date(baseDate);
      
      // Add previous segments time and visit times
      let accumulatedSeconds = 0;
      for (let j = 0; j < i; j++) {
        accumulatedSeconds += newSegments[j].time;
        if (j > 0 && route.stops[j - 1]) {
          accumulatedSeconds += (route.stops[j - 1].estimatedDuration || 60) * 60;
        }
      }
      estimatedDeparture = new Date(estimatedDeparture.getTime() + accumulatedSeconds * 1000);

      const result = await fetchRouteSegment(
        origin,
        destination,
        seg.travelMode,
        estimatedDeparture
      );
      const accurateTime = customSec !== undefined ? customSec : result.durationS;
      const isDirectWalk = result.transitDetails
        ? (!result.transitDetails.trainMin || result.transitDetails.trainMin === 0)
        : (result.heuristicReason?.toLowerCase().includes("direct walk") || result.distanceM <= 800);
      const effectiveMode = (seg.travelMode === "transit" && isDirectWalk && !seg.customTravelMode) ? "walking" as TravelMode : seg.travelMode;

      return {
        ...seg,
        distance: result.distanceM,
        time: accurateTime,
        travelMode: effectiveMode,
        customDuration: customSec,
        originalTime: result.durationS,
        isHeuristic: effectiveMode === "transit" ? (result.isHeuristic ?? false) : false,
        heuristicReason: effectiveMode === "walking" && isDirectWalk ? undefined : result.heuristicReason,
        transitUrl: effectiveMode === "walking" ? undefined : (result.transitUrl ?? seg.transitUrl),
        stationFrom: result.stationFrom ?? seg.stationFrom,
        stationTo: result.stationTo ?? seg.stationTo,
        transitDetails: result.transitDetails ?? seg.transitDetails,
      };
    } catch (e) {
      console.warn("Failed to fetch accurate segment, using estimate", e);
      return {
        ...seg,
        time: customSec !== undefined ? customSec : seg.time,
        customDuration: customSec,
        isHeuristic: true,
        heuristicReason: seg.travelMode === "transit"
          ? (seg.heuristicReason || "Transit time estimated geometrically.")
          : undefined,
      };
    }
  });

  const resolvedSegments = await Promise.all(segmentPromises);

  resolvedSegments.forEach(seg => {
    currentDistance += seg.distance;
    currentTime += seg.time;
  });

  return {
    ...route,
    segments: resolvedSegments,
    totalDistance: currentDistance,
    totalTime: currentTime,
  };
}

// Optimize a single day's route
export async function solveSingleDay(
  dayPlaces: Place[],
  hotels: Hotel[],
  dayIndex: number,
  travelMode: TravelMode,
  arrivalLocation?: Place | null,
  departureLocation?: Place | null,
  manualOrder: boolean = false,
  manualSequence?: string[],
  startDateISO: string = new Date().toISOString(),
  dayStartTime: string = "09:00",
  avoidClosedHours: boolean = true,
  isLastDay: boolean = false,
  arrivalFlight?: FlightInfo | null,
  departureFlight?: FlightInfo | null,
  categoryConfigs?: Partial<Record<PlaceCategory, CategoryConfig>>,
  existingSegments?: RouteSegment[],
  customTransitTimes?: Record<string, number>,
): Promise<DayRoute> {
  let route: DayRoute;

  if (avoidClosedHours && !manualOrder) {
    const conflictResult = evictClosedHourConflicts(
      dayPlaces,
      hotels,
      dayIndex,
      travelMode,
      arrivalLocation,
      departureLocation,
      dayStartTime,
      startDateISO,
      isLastDay,
      arrivalFlight,
      departureFlight,
      categoryConfigs,
      existingSegments,
      customTransitTimes,
    );
    route = conflictResult.route;
  } else {
    route = buildDayRoute(
      dayPlaces,
      hotels,
      dayIndex,
      travelMode,
      arrivalLocation,
      departureLocation,
      manualOrder,
      manualSequence,
      dayStartTime,
      startDateISO,
      avoidClosedHours,
      isLastDay,
      arrivalFlight,
      departureFlight,
      categoryConfigs,
      existingSegments,
      customTransitTimes,
    );
  }

  return await fetchAccurateRouteTimes(route, startDateISO, dayStartTime, customTransitTimes);
}

export async function solveTSP(
  places: Place[],
  hotels: Hotel[],
  days: number,
  travelMode: TravelMode,
  dailyBudgets: number[],
  strictBudget: boolean = false,
  arrivalLocation?: Place | null,
  departureLocation?: Place | null,
  categoryConfigs?: Partial<Record<PlaceCategory, CategoryConfig>>,
  startDateISO: string = new Date().toISOString(),
  dayStartTime: string = "09:00",
  avoidClosedHours: boolean = true,
  arrivalFlight?: FlightInfo | null,
  departureFlight?: FlightInfo | null,
  dayEndTime: string = "21:00",
  exemptDays: number[] = [],
  existingRoutes: DayRoute[] = [],
  customTransitTimes?: Record<string, number>,
): Promise<OptimizationResult> {
  const startTime = performance.now();

  // Index all known custom transit times across existing routes and passed dictionary
  const allCustomTimes: Record<string, number> = { ...(customTransitTimes ?? {}) };
  for (const r of existingRoutes) {
    for (const s of r.segments) {
      if (s.customDuration !== undefined && s.fromId && s.toId) {
        allCustomTimes[`${s.fromId}->${s.toId}`] = s.customDuration;
      }
    }
  }

  // 1. Cluster unassigned places (time-budget-aware, respects pinnedToDay, exemptDays, and customTime)
  const clusteredPlaces = clusterPlaces(
    places,
    hotels,
    days,
    travelMode,
    dailyBudgets,
    strictBudget,
    arrivalLocation,
    departureLocation,
    categoryConfigs,
    startDateISO,
    avoidClosedHours,
    dayStartTime,
    dayEndTime,
    arrivalFlight,
    departureFlight,
    exemptDays,
    allCustomTimes,
  );

  // 2. Build initial routes for each day
  const dayRoutes: DayRoute[] = [];
  let totalTripDistance = 0;
  let totalTripTime = 0;

  for (let d = 0; d < days; d++) {
    // If day is exempt and already has a route, preserve it completely
    if (exemptDays.includes(d)) {
      const existing = existingRoutes.find((r) => r.day === d);
      if (existing) {
        dayRoutes.push(existing);
        continue;
      }
    }

    const isLastDay = d === days - 1;
    let dayPlaces = clusteredPlaces.filter((p) => p.dayIndex === d);
    let route: DayRoute;

    const existingDayRoute = existingRoutes.find((r) => r.day === d);
    const existingDaySegments = existingDayRoute?.segments;

    // A. Post-optimization Closed Hours Conflict Eviction:
    // If avoidClosedHours is active, strictly evict any unpinned places with conflicts
    if (avoidClosedHours) {
      const conflictResult = evictClosedHourConflicts(
        dayPlaces,
        hotels,
        d,
        travelMode,
        d === 0 ? arrivalLocation : null,
        isLastDay ? departureLocation : null,
        dayStartTime,
        startDateISO,
        isLastDay,
        d === 0 ? arrivalFlight : null,
        isLastDay ? departureFlight : null,
        categoryConfigs,
        existingDaySegments,
        allCustomTimes,
      );

      route = conflictResult.route;
      dayPlaces = conflictResult.remainingPlaces;

      // Update clusteredPlaces for any evicted places so they appear in unassignedPlaces
      for (const ev of conflictResult.evicted) {
        const matched = clusteredPlaces.find((p) => p.id === ev.place.id);
        if (matched) {
          matched.dayIndex = null;
          matched.orderInDay = null;
          matched.unfeasibleReason = `Closed during scheduled visiting hours (${ev.reason}).`;
        }
      }
    } else {
      route = buildDayRoute(
        dayPlaces,
        hotels,
        d,
        travelMode,
        d === 0 ? arrivalLocation : null,
        isLastDay ? departureLocation : null,
        false,
        undefined,
        dayStartTime,
        startDateISO,
        avoidClosedHours,
        isLastDay,
        d === 0 ? arrivalFlight : null,
        isLastDay ? departureFlight : null,
        categoryConfigs,
        existingDaySegments,
        allCustomTimes,
      );
    }

    const limit = dailyBudgets[d];
    
    // Force strict eviction on any day whose budget was reduced below the maximum
    // (e.g. flight departure/arrival days), regardless of the global strictBudget toggle.
    const baseBudget = Math.max(...dailyBudgets);
    const forceStrict = strictBudget || limit < baseBudget;

    if (forceStrict) {
      let totalDayMin =
        dayPlaces.reduce((sum, p) => sum + (p.estimatedDuration ?? 60), 0) +
        Math.round(route.totalTime / 60);

      // On flight-constrained days, flights are a hard physical deadline.
      // Treat all places as evictable except places with fixed reservation customTime unless strictly unavoidable.
      const flightConstrained = limit < baseBudget;

      while (dayPlaces.length > 0 && totalDayMin > limit) {
        const evictable = flightConstrained
          ? (dayPlaces.filter((p) => !p.customTime && !p.isStarred).length > 0 ? dayPlaces.filter((p) => !p.customTime && !p.isStarred) : dayPlaces.filter((p) => !p.isStarred).length > 0 ? dayPlaces.filter((p) => !p.isStarred) : dayPlaces)
          : dayPlaces.filter((p) => !p.pinnedToDay && !p.customTime && !p.isStarred);
        if (evictable.length === 0) {
          break; // only pinned places left and not a flight day
        }

        // Count places per category in this day to identify surplus vs required quota places
        const catCountsInDay: Record<string, number> = {};
        dayPlaces.forEach((p) => {
          catCountsInDay[p.category] = (catCountsInDay[p.category] || 0) + 1;
        });

        // Evict places that are not needed to fulfill category minPerDay quotas first
        const nonQuotaEvictable = evictable.filter((p) => {
          const cfg = getEffectiveCategoryConfig(categoryConfigs, p.category, d, days);
          const minRequired = cfg?.minPerDay ?? 0;
          const count = catCountsInDay[p.category] || 0;
          return count > minRequired;
        });

        const candidates = nonQuotaEvictable.length > 0 ? nonQuotaEvictable : evictable;
        // Evict the last evictable place from candidate pool (lowest priority/greedy order)
        const toEvict = candidates[candidates.length - 1];

        // Mutate original object in clusteredPlaces so it gets returned as unassigned
        const matched = clusteredPlaces.find((p) => p.id === toEvict.id);
        if (matched) {
          matched.dayIndex = null;
          matched.orderInDay = null;
          matched.unfeasibleReason = "Exceeds daily time budget.";
        }

        // Update dayPlaces local filter
        dayPlaces = dayPlaces.filter((p) => p.id !== toEvict.id);

        // Rebuild route
        if (avoidClosedHours) {
          const conflictResult = evictClosedHourConflicts(
            dayPlaces,
            hotels,
            d,
            travelMode,
            d === 0 ? arrivalLocation : null,
            isLastDay ? departureLocation : null,
            dayStartTime,
            startDateISO,
            isLastDay,
            d === 0 ? arrivalFlight : null,
            isLastDay ? departureFlight : null,
            categoryConfigs,
            existingDaySegments,
            allCustomTimes,
          );
          route = conflictResult.route;
          dayPlaces = conflictResult.remainingPlaces;
          for (const ev of conflictResult.evicted) {
            const m = clusteredPlaces.find((p) => p.id === ev.place.id);
            if (m) {
              m.dayIndex = null;
              m.orderInDay = null;
              m.unfeasibleReason = `Closed during scheduled visiting hours (${ev.reason}).`;
            }
          }
        } else {
          route = buildDayRoute(
            dayPlaces,
            hotels,
            d,
            travelMode,
            d === 0 ? arrivalLocation : null,
            isLastDay ? departureLocation : null,
            false,
            undefined,
            dayStartTime,
            startDateISO,
            avoidClosedHours,
            isLastDay,
            d === 0 ? arrivalFlight : null,
            isLastDay ? departureFlight : null,
            categoryConfigs,
            existingDaySegments,
            allCustomTimes,
          );
        }

        // Recalculate totalDayMin
        totalDayMin =
          dayPlaces.reduce((sum, p) => sum + (p.estimatedDuration ?? 60), 0) +
          Math.round(route.totalTime / 60);
      }
    }

    dayRoutes.push(route);
  }

  // 2b. Multi-Pass Day Reassignment Loop:
  // If any place (starred or non-starred) was evicted or left unassigned, systematically attempt
  // to reassign it across all other allowed candidate days that have available capacity, open hours,
  // and geographic proximity, without evicting any existing scheduled stops.
  let reassignmentPass = 0;
  const maxReassignmentPasses = 5;

  while (reassignmentPass < maxReassignmentPasses) {
    reassignmentPass++;
    let reassignedThisPass = 0;

    const unassignedPool = clusteredPlaces.filter(
      (p) => p.dayIndex === null && !p.pinnedToDay && !p.isDisabled
    );
    if (unassignedPool.length === 0) break;

    // Prioritize candidates:
    // 1. Starred places first (must-visit)
    // 2. Places whose category is under minPerDay on any allowed day
    // 3. Smaller estimated duration (easier to pack into available budget headroom)
    unassignedPool.sort((a, b) => {
      if (a.isStarred && !b.isStarred) return -1;
      if (!a.isStarred && b.isStarred) return 1;

      // Check if either place fulfills a category quota deficit on any candidate day
      let aHasDeficit = false;
      let bHasDeficit = false;
      for (let d = 0; d < days; d++) {
        if (exemptDays.includes(d)) continue;
        const route = dayRoutes.find((r) => r.day === d);
        if (!route) continue;
        if (!aHasDeficit && isDayAllowedForPlace(a, d, days)) {
          const cfgA = getEffectiveCategoryConfig(categoryConfigs, a.category, d, days);
          if (cfgA?.minPerDay != null) {
            const countA = route.stops.filter((s) => s.category === a.category).length;
            if (countA < cfgA.minPerDay) aHasDeficit = true;
          }
        }
        if (!bHasDeficit && isDayAllowedForPlace(b, d, days)) {
          const cfgB = getEffectiveCategoryConfig(categoryConfigs, b.category, d, days);
          if (cfgB?.minPerDay != null) {
            const countB = route.stops.filter((s) => s.category === b.category).length;
            if (countB < cfgB.minPerDay) bHasDeficit = true;
          }
        }
      }
      if (aHasDeficit && !bHasDeficit) return -1;
      if (!aHasDeficit && bHasDeficit) return 1;

      return (a.estimatedDuration ?? 60) - (b.estimatedDuration ?? 60);
    });

    for (const place of unassignedPool) {
      let bestDay = -1;
      let bestScore = -Infinity;
      let bestTestConflict: any = null;

      for (let targetDay = 0; targetDay < days; targetDay++) {
        if (exemptDays.includes(targetDay)) continue;
        if (!isDayAllowedForPlace(place, targetDay, days)) continue;

        const targetRoute = dayRoutes.find((r) => r.day === targetDay);
        if (!targetRoute) continue;

        // Category max limit check
        const cfg = getEffectiveCategoryConfig(categoryConfigs, place.category, targetDay, days);
        const maxCat = cfg?.maxPerDay;
        const currentCatCount = targetRoute.stops.filter((s) => s.category === place.category).length;
        if (maxCat != null && currentCatCount >= maxCat) continue;

        // Distance limit: place must be in reasonable proximity to target day's hotel (<= 45km)
        const targetHotel = hotels.find((h) => h.dayIndex === targetDay) || hotels[0];
        const distToHotel = getDistance(place.lat, place.lng, targetHotel.lat, targetHotel.lng);
        if (distToHotel > 45000) continue;

        // Day trip protection: if place is far from anchor (>= 45 km), don't put it on a day with an incompatible distant day trip
        if (distToHotel >= 45000) {
          const hasClashingDayTrip = targetRoute.stops.some((s) => {
            const sDist = getDistance(s.lat, s.lng, targetHotel.lat, targetHotel.lng);
            return sDist >= 45000 && getDistance(s.lat, s.lng, place.lat, place.lng) > 35000;
          });
          if (hasClashingDayTrip) continue;
        }

        // Restaurant evening dinner window check:
        if (place.category === "restaurant") {
          let placeIsDinnerOnly = false;
          if (place.openingHours && place.openingHours.length > 0) {
            const targetDate = addDays(parseISO(startDateISO), targetDay);
            const dh = getPlaceDayHours(place.openingHours, targetDate);
            if (typeof dh === "object" && dh !== null) {
              const invs = dh.intervals || [{ open: dh.open, close: dh.close }];
              placeIsDinnerOnly = invs.every((inv) => inv.open >= 990);
            }
          }

          if (placeIsDinnerOnly) {
            const existingDinnerCount = targetRoute.stops.filter((s) => {
              if (s.category !== "restaurant") return false;
              if ((s.estimatedDuration || 60) <= 30) return false;
              if (s.customTime) {
                return parseTimeToMinutes(s.customTime) >= 990;
              }
              if (s.openingHours && s.openingHours.length > 0) {
                const targetDate = addDays(parseISO(startDateISO), targetDay);
                const dh = getPlaceDayHours(s.openingHours, targetDate);
                if (typeof dh === "object" && dh !== null) {
                  const invs = dh.intervals || [{ open: dh.open, close: dh.close }];
                  return invs.every((inv) => inv.open >= 990);
                }
              }
              return false;
            }).length;

            if (existingDinnerCount >= 2) {
              continue;
            }
          }
        }

        // Time budget check
        const limit = dailyBudgets[targetDay];
        const baseBudget = Math.max(...dailyBudgets);
        const forceStrict = strictBudget || limit < baseBudget;
        const currentVisitMin = targetRoute.stops.reduce((sum, s) => sum + (s.estimatedDuration ?? 60), 0);
        const currentTravelMin = Math.round(targetRoute.totalTime / 60);
        const placeDuration = place.estimatedDuration ?? 60;

        if (forceStrict && currentVisitMin + currentTravelMin + placeDuration > limit) {
          continue;
        }

        // Test inserting place into target day using evictClosedHourConflicts
        const testStops = [...targetRoute.stops, { ...place, dayIndex: targetDay }];
        const testConflict = evictClosedHourConflicts(
          testStops,
          hotels,
          targetDay,
          travelMode,
          targetDay === 0 ? arrivalLocation : null,
          targetDay === days - 1 ? departureLocation : null,
          dayStartTime,
          startDateISO,
          targetDay === days - 1,
          targetDay === 0 ? arrivalFlight : null,
          targetDay === days - 1 ? departureFlight : null,
          categoryConfigs,
          existingRoutes.find((r) => r.day === targetDay)?.segments,
          allCustomTimes,
        );

        // Verify place was accommodated WITHOUT evicting any existing stops on targetDay
        if (testConflict.remainingPlaces.length === testStops.length) {
          const testVisitMin = testConflict.remainingPlaces.reduce((sum, s) => sum + (s.estimatedDuration ?? 60), 0);
          const testTravelMin = Math.round(testConflict.route.totalTime / 60);
          if (forceStrict && testVisitMin + testTravelMin > limit) {
            continue;
          }

          const addedDistKm = (testConflict.route.totalDistance - targetRoute.totalDistance) / 1000;
          let score = -addedDistKm * 10;

          // Bonus for category quota deficit on target day
          const minTarget = cfg?.minPerDay ?? 0;
          if (currentCatCount < minTarget) {
            const deficit = minTarget - currentCatCount;
            score += deficit * 500;
          }

          // Bonus if target day has plenty of budget headroom
          const remainingHeadroom = limit - (testVisitMin + testTravelMin);
          score += Math.min(100, remainingHeadroom * 0.2);

          if (score > bestScore) {
            bestScore = score;
            bestDay = targetDay;
            bestTestConflict = testConflict;
          }
        }
      }

      if (bestDay !== -1 && bestTestConflict) {
        place.dayIndex = bestDay;
        place.unfeasibleReason = undefined;

        const targetRouteIdx = dayRoutes.findIndex((r) => r.day === bestDay);
        if (targetRouteIdx !== -1) {
          dayRoutes[targetRouteIdx] = bestTestConflict.route;
        }
        reassignedThisPass++;
      }
    }

    if (reassignedThisPass === 0) break;
  }

  // 3. Post-process non-exempt routes to use accurate APIs
  const finalRoutes = await Promise.all(
    dayRoutes.map((r) => {
      if (exemptDays.includes(r.day) && existingRoutes.some((er) => er.day === r.day)) {
        return r;
      }
      return fetchAccurateRouteTimes(r, startDateISO, dayStartTime, allCustomTimes);
    })
  );

  totalTripDistance = finalRoutes.reduce((sum, r) => sum + r.totalDistance, 0);
  totalTripTime = finalRoutes.reduce((sum, r) => sum + r.totalTime, 0);

  const endTime = performance.now();
  console.log(`solveTSP completed in ${Math.round(endTime - startTime)}ms`);

  return {
    success: true,
    days: finalRoutes,
    totalDistance: totalTripDistance,
    totalTime: totalTripTime,
    unassignedPlaces: clusteredPlaces.filter((p) => p.dayIndex === null),
  };
}
