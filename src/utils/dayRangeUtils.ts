import { Place, DayRangeConstraint } from "../types";
import { parseISO, addDays, format, isValid } from "date-fns";

/**
 * Returns the effective [startDay, endDay] (inclusive, 0-indexed) allowed for a place.
 * Returns null if the place is completely unconstrained across the trip.
 *
 * UNIFIES:
 * 1. Hard single-day pinning (pinnedToDay or fixed reservation customTime) -> [dayIndex, dayIndex]
 * 2. Range constraints (allowedDayRange) -> [startDay, endDay]
 * 3. Both combined (intersection of pin and range)
 */
export function getEffectiveAllowedDayRange(
  place: Place,
  totalDays?: number
): DayRangeConstraint | null {
  const maxDay = totalDays !== undefined && totalDays > 0 ? totalDays - 1 : Infinity;

  const isPinned =
    (place.pinnedToDay || !!place.customTime) &&
    place.dayIndex !== null &&
    place.dayIndex !== undefined;
  const pinDay = isPinned ? place.dayIndex! : null;

  if (pinDay !== null && place.allowedDayRange) {
    const start = Math.max(pinDay, place.allowedDayRange.startDay, 0);
    const end = Math.min(pinDay, place.allowedDayRange.endDay, maxDay);
    if (start > end) {
      // Conflict: pinned day is outside allowed range; pin takes precedence
      return { startDay: Math.max(0, pinDay), endDay: Math.min(pinDay, maxDay) };
    }
    return { startDay: start, endDay: end };
  }

  if (pinDay !== null) {
    return { startDay: Math.max(0, pinDay), endDay: Math.min(pinDay, maxDay) };
  }

  if (place.allowedDayRange) {
    const start = Math.max(0, place.allowedDayRange.startDay);
    const end = Math.min(place.allowedDayRange.endDay, maxDay);
    return { startDay: start, endDay: end };
  }

  return null;
}

/**
 * Checks if a specific 0-indexed dayIndex is allowed for this place.
 * Highly reusable across TSP clustering, manual reordering, and day assignment.
 */
export function isDayAllowedForPlace(
  place: Place,
  dayIndex: number,
  totalDays?: number
): boolean {
  const range = getEffectiveAllowedDayRange(place, totalDays);
  if (!range) return true;
  return dayIndex >= range.startDay && dayIndex <= range.endDay;
}

/**
 * Formats a single day index into a readable string (e.g. "Day 1: Tokyo Arrival (Fri, Oct 3)" or "Day 1 (Fri, Oct 3)" or "Day 1").
 */
export function formatDayIndexLabel(
  dayIndex: number,
  startDateISO?: string,
  dayTitles?: Record<number, string>
): string {
  const dayNum = dayIndex + 1;
  const customTitle = dayTitles?.[dayIndex]?.trim();
  const titlePrefix = customTitle ? `: ${customTitle}` : "";

  if (startDateISO) {
    try {
      const parsed = parseISO(startDateISO);
      if (isValid(parsed)) {
        const d = addDays(parsed, dayIndex);
        return `Day ${dayNum}${titlePrefix} (${format(d, "EEE, MMM d")})`;
      }
    } catch {
      // fallback
    }
  }
  return `Day ${dayNum}${titlePrefix}`;
}

/**
 * Formats a day range constraint into a clean badge structure:
 * - Single day: { dateText: "Oct 3", dayText: "Day 1", fullLabel: "Oct 3 (Day 1)" or "Kyoto Day 1! (Oct 3)" }
 * - Multi-day range: { dateText: "Oct 3 – Oct 9", dayText: "Days 1–7", fullLabel: "Oct 3 – Oct 9 (Days 1–7)" }
 */
export function formatDayRangeBadge(
  range: DayRangeConstraint,
  startDateISO?: string,
  dayTitles?: Record<number, string>
): { dateText: string; dayText: string; fullLabel: string } {
  const startDayNum = range.startDay + 1;
  const endDayNum = range.endDay + 1;
  const isSingleDay = range.startDay === range.endDay;
  const startTitle = dayTitles?.[range.startDay]?.trim();
  const endTitle = dayTitles?.[range.endDay]?.trim();

  let dayText = isSingleDay
    ? (startTitle || `Day ${startDayNum}`)
    : (startTitle || endTitle)
      ? `${startTitle || `D${startDayNum}`} – ${endTitle || `D${endDayNum}`}`
      : `Days ${startDayNum}–${endDayNum}`;

  if (startDateISO) {
    try {
      const parsed = parseISO(startDateISO);
      if (isValid(parsed)) {
        const startDate = addDays(parsed, range.startDay);
        const endDate = addDays(parsed, range.endDay);

        if (isSingleDay) {
          const dateText = format(startDate, "MMM d");
          return {
            dateText,
            dayText,
            fullLabel: startTitle ? `${startTitle} (${dateText})` : `${dateText} (Day ${startDayNum})`,
          };
        }

        const dateText = `${format(startDate, "MMM d")} – ${format(endDate, "MMM d")}`;
        return {
          dateText,
          dayText,
          fullLabel: (startTitle || endTitle)
            ? `${dayText} (${dateText})`
            : `${dateText} (Days ${startDayNum}–${endDayNum})`,
        };
      }
    } catch {
      // fallback
    }
  }

  return {
    dateText: "",
    dayText,
    fullLabel: isSingleDay && startTitle ? `${startTitle} (Day ${startDayNum})` : dayText,
  };
}
