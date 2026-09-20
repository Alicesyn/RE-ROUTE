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
  const dayOverride = customOverride ?? (isFirstDay ? base.firstDayOverride : isLastDay ? base.lastDayOverride : undefined);

  if (!dayOverride) return base;

  const effectiveMin = dayOverride.minPerDay !== undefined && dayOverride.minPerDay !== null
    ? dayOverride.minPerDay
    : base.minPerDay;

  let effectiveMax = dayOverride.maxPerDay !== undefined && dayOverride.maxPerDay !== null
    ? dayOverride.maxPerDay
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
function clusterPlaces(
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
): Place[] {
  const isExempt = (dayIdx: number | null) => dayIdx !== null && exemptDays.includes(dayIdx);
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
      dStart = Math.max(baseDayStartMin, arrMin);
    }
    if (d === days - 1 && departureFlight) {
      const depMin = parseTimeToMinutes(departureFlight.time) - (departureFlight.buffer ?? 90);
      dEnd = Math.min(baseDayEndMin, depMin);
    }
    dayWindows.push({ start: dStart, end: dEnd });
  }

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

  // Greedy assignment: put each place on the day with the most remaining budget
  for (const place of toAssign) {
    let bestDay = -1;
    let maxScore = -Infinity;

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
      const minSpacing = catConfig?.minTimeBetween ?? (place.category === "restaurant" ? 180 : 0);
      const isUnderMinQuota = minTarget != null && currentCount < minTarget;

      if (minSpacing > 0 && currentCount > 0) {
        const duration = place.estimatedDuration || 60;
        const dayWindow = dayWindows[d] || { start: baseDayStartMin, end: baseDayEndMin };
        const availableWindow = dayWindow.end - dayWindow.start;
        // If fulfilling a user-configured minimum quota, adapt spacing so we don't arbitrarily reject required meals
        const effectiveSpacing = isUnderMinQuota
          ? Math.max(30, Math.min(minSpacing, Math.floor((availableWindow - (currentCount + 1) * duration) / currentCount)))
          : minSpacing;
        const totalMealSpan = (currentCount + 1) * duration + currentCount * effectiveSpacing;
        if (totalMealSpan > availableWindow) {
          continue; // Day window physically cannot fit another visit even with reduced spacing
        }
      }

      // 2. Strict Avoid Closed Hours Check:
      // If avoidClosedHours is on, NEVER assign unpinned places to days they are closed,
      // or to days where open hours have zero/insufficient overlap with active day window.
      if (avoidClosedHours && place.openingHours && place.openingHours.length > 0) {
        const dayDate = addDays(parseISO(startDateISO), d);
        const dayHours = getPlaceDayHours(place.openingHours, dayDate);
        if (dayHours === "closed") {
          continue; // Place is closed all day on day d
        }
        if (typeof dayHours === "object" && dayHours !== null) {
          const duration = place.estimatedDuration || 60;
          const intervals = dayHours.intervals || [{ open: dayHours.open, close: dayHours.close }];
          const window = dayWindows[d] || { start: baseDayStartMin, end: baseDayEndMin };
          const hasFeasibleOverlap = intervals.some((inv) => {
            const overlapStart = Math.max(inv.open, window.start);
            const overlapEnd = Math.min(inv.close, window.end);
            return overlapEnd - overlapStart >= duration;
          });
          if (!hasFeasibleOverlap) {
            continue; // Place operating hours cannot fit the visit duration on day d
          }
        }
      }

      // Estimate travel time to this place from the day's hotel
      const hotel = hotels.find((h) => h.dayIndex === d);
      let travelMin = 0;
      if (hotel) {
        const dist = getDistance(place.lat, place.lng, hotel.lat, hotel.lng);
        travelMin = estimateTime(dist, travelMode) / 60; // seconds to minutes
      }

      const totalIfAdded =
        dayTimeUsed[d] + (place.estimatedDuration ?? 60) + travelMin;
      const remaining = dailyBudgets[d] - totalIfAdded;

      // Force strict if this day has a reduced budget (e.g. due to a flight cutoff)
      const baseBudget = dailyBudgets.length > 0 ? Math.max(...dailyBudgets) : dailyBudgets[d];
      const dayIsConstrained = dailyBudgets[d] < baseBudget;
      const forceStrict = strictBudget || dayIsConstrained;

      // If this day is below the user's min target, prioritize fulfilling it!
      // Allow slight budget flexibility for required minimums (e.g. remaining >= -45)
      const canConsiderDay = !forceStrict || remaining >= 0 || (isUnderMinQuota && remaining >= -45);

      if (canConsiderDay) {
        let score = remaining;

        // Apply min limit boost if this day is below the minimum
        if (isUnderMinQuota && minTarget != null) {
          const deficit = minTarget - currentCount;
          // Scale heavily by deficit so days needing 2 restaurants win over days needing 1!
          score += deficit * 50000;
          // Bonus for explicit day-specific override (e.g. user specifically configured First Day override)
          if (hasSpecificDayOverride) {
            score += 15000;
          }
        } else if (minSpacing > 0 && currentCount > 0) {
          // Encourage balanced distribution ONLY after minimum quotas are already satisfied
          score -= currentCount * 2000;
        }

        if (score > maxScore) {
          maxScore = score;
          bestDay = d;
        }
      }
    }

    if (bestDay !== -1) {
      place.dayIndex = bestDay;

      // Update time used
      const hotel = hotels.find((h) => h.dayIndex === bestDay);
      let travelMin = 0;
      if (hotel) {
        const dist = getDistance(place.lat, place.lng, hotel.lat, hotel.lng);
        travelMin = estimateTime(dist, travelMode) / 60;
      }
      dayTimeUsed[bestDay] += (place.estimatedDuration ?? 60) + travelMin;
      
      // Update category counts
      if (!categoryCounts[bestDay]) categoryCounts[bestDay] = {};
      categoryCounts[bestDay][place.category] = (categoryCounts[bestDay][place.category] || 0) + 1;
    } else {
      // Starred places must be scheduled — force-assign to the day with the most remaining budget
      if (place.isStarred) {
        let forceBestDay = -1;
        let forceMaxRemaining = -Infinity;
        for (let d = 0; d < days; d++) {
          if (!isDayAllowedForPlace(place, d, days)) {
            continue;
          }
          const remaining = dailyBudgets[d] - dayTimeUsed[d];
          // If avoidClosedHours, prefer days where the place is actually open
          if (avoidClosedHours && place.openingHours && place.openingHours.length > 0) {
            const dayDate = addDays(parseISO(startDateISO), d);
            const dayHours = getPlaceDayHours(place.openingHours, dayDate);
            if (dayHours === "closed") {
              // Only skip closed days if there are open alternatives
              if (remaining <= forceMaxRemaining) continue;
              // Still consider closed days as last resort below
            }
          }
          if (remaining > forceMaxRemaining) {
            forceMaxRemaining = remaining;
            forceBestDay = d;
          }
        }
        if (forceBestDay !== -1) {
          place.dayIndex = forceBestDay;
          place.unfeasibleReason = undefined;
          const hotel = hotels.find((h) => h.dayIndex === forceBestDay);
          let travelMin = 0;
          if (hotel) {
            const dist = getDistance(place.lat, place.lng, hotel.lat, hotel.lng);
            travelMin = estimateTime(dist, travelMode) / 60;
          }
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

      if (avoidClosedHours && place.openingHours && place.openingHours.length > 0) {
        const conflict = checkTimeConflict(currentTime, duration, place.openingHours, currentDate);
        if (conflict.hasConflict) {
          conflicts++;
          penaltyMinutes += 60;
        } else if (conflict.waitMinutes && conflict.waitMinutes > 0) {
          currentTime += conflict.waitMinutes;
          penaltyMinutes += conflict.waitMinutes;
        }
      }

      // Spacing check: enforce minimum time between visits of the same category (default 180m for restaurant)
      const minSpacing = categoryConfigs?.[place.category]?.minTimeBetween ?? (place.category === "restaurant" ? 180 : 0);
      if (minSpacing > 0 && lastCategoryDeparture[place.category] !== undefined) {
        const timeSinceLast = currentTime - lastCategoryDeparture[place.category];
        if (timeSinceLast < minSpacing) {
          const shortfall = minSpacing - timeSinceLast;
          mealSpacingConflicts++;
          mealSpacingPenalty += 500000 + shortfall * 5000;
        }
      }

      currentTime += duration;
      lastCategoryDeparture[place.category] = currentTime;
    }
  }

  // 1 conflict = 1,000 km penalty to guarantee avoiding closed hours over shortest distance
  const totalCost = totalDist + conflicts * 1000000 + penaltyMinutes * 1000 + mealSpacingPenalty;
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

  // For small N (<= 6 stops), exact permutation search guarantees zero conflicts, proper meal spacing, and optimal distance
  if (places.length <= 6) {
    let bestPoints: (Hotel | Place)[] = [];
    let bestCost = Infinity;

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

    permute(places);

    const placeStart = startAnchor ? 1 : 0;
    const placeEnd = endAnchor ? bestPoints.length - 1 : bestPoints.length;
    return bestPoints.slice(placeStart, placeEnd) as Place[];
  }

  // For N > 6:
  // 1. Initial smart sort: sort places by opening time so early-opening places come first
  let sortedPlaces = [...places];
  if (avoidClosedHours) {
    sortedPlaces.sort((a, b) => {
      const aHours = getPlaceDayHours(a.openingHours, currentDate);
      const bHours = getPlaceDayHours(b.openingHours, currentDate);
      const aOpen = typeof aHours === "object" && aHours ? aHours.open : 720;
      const bOpen = typeof bHours === "object" && bHours ? bHours.open : 720;
      return aOpen - bOpen;
    });
  }

  // Interleave categories with minSpacing (e.g. restaurant) so the initial order doesn't start with back-to-back meals
  const spacedCategories = new Set<string>();
  places.forEach((p) => {
    const spacing = categoryConfigs?.[p.category]?.minTimeBetween ?? (p.category === "restaurant" ? 180 : 0);
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
        if (typeof hours === "object" && hours) {
          if (windowEndTimes[w] <= hours.open || windowStartTimes[w] >= hours.close) {
            score += 1000000;
          }
        }
      }

      // Penalize assigning a restaurant to a window that already has one, or is adjacent to a locked meal
      const minSpacing = categoryConfigs?.[place.category]?.minTimeBetween ?? (place.category === "restaurant" ? 180 : 0);
      if (minSpacing > 0) {
        const hasSameCatInBucket = windowBuckets[w].some((p) => p.category === place.category);
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

    let segMode = existing?.travelMode ?? travelMode;
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
      customDuration,
      originalTime,
      fromId,
      toId,
      isHeuristic: true,
      heuristicReason: segMode === "transit"
        ? "Transit time estimated geometrically (~18 km/h local / ~162 km/h express)."
        : undefined,
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

      const isPinnedOrCustom = stop.pinnedToDay || !!stop.customTime || !!stop.isStarred;

      const conflict = checkTimeConflict(
        currTime,
        stop.estimatedDuration || 60,
        stop.openingHours,
        currentDate,
      );

      if (!isPinnedOrCustom && conflict.hasConflict) {
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

    // Evict the last unpinned conflicted stop
    const toEvict = conflictedStops[conflictedStops.length - 1];
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
    if (!points[i] || !points[i + 1]) return seg;

    const customSec = seg.customDuration ?? getCustomTransitDuration(seg.fromId, seg.toId, customTransitTimes);
    if (customSec !== undefined) {
      return {
        ...seg,
        time: customSec,
        customDuration: customSec,
        originalTime: seg.originalTime ?? seg.time,
      };
    }

    try {
      // Calculate departure time for this segment
      // (baseDate + accumulated time so far + visit time of stops)
      // Since we fetch in parallel, we don't know exact departure time easily unless we do it sequentially.
      // But transit is the only one that needs it. Let's just pass baseDate for now to avoid sequential blocking,
      // or we can calculate estimated departure time based on previous estimates.
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
        points[i],
        points[i + 1],
        seg.travelMode,
        estimatedDeparture
      );
      const accurateTime = seg.customDuration !== undefined ? seg.customDuration : result.durationS;
      return {
        ...seg,
        distance: result.distanceM,
        time: accurateTime,
        originalTime: result.durationS,
        isHeuristic: result.isHeuristic ?? false,
        heuristicReason: result.heuristicReason,
      };
    } catch (e) {
      console.warn("Failed to fetch accurate segment, using estimate", e);
      return {
        ...seg,
        time: seg.customDuration !== undefined ? seg.customDuration : seg.time,
        isHeuristic: true,
        heuristicReason: seg.travelMode === "transit"
          ? "Live route unavailable; estimated geometrically."
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
