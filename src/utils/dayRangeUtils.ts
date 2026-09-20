import { Place, DayRangeConstraint } from "../types";
import { parseISO, addDays, format, isValid } from "date-fns";

// ────────────────────────────────────────────────
// Multi-Range Normalization & Merge
// ────────────────────────────────────────────────

/** Max allowed disjoint ranges per place */
export const MAX_DAY_RANGES = 8;

/**
 * Returns the place's allowed day ranges, or empty array if unconstrained.
 */
export function getAllowedDayRanges(place: Place): DayRangeConstraint[] {
  return place.allowedDayRanges && place.allowedDayRanges.length > 0
    ? place.allowedDayRanges
    : [];
}

/**
 * Merges overlapping or adjacent ranges and sorts them.
 * E.g. [0–3, 2–5, 7–9] → [0–5, 7–9]
 */
export function mergeOverlappingRanges(
  ranges: DayRangeConstraint[]
): DayRangeConstraint[] {
  if (ranges.length <= 1) return ranges;

  const sorted = [...ranges].sort((a, b) =>
    a.startDay !== b.startDay ? a.startDay - b.startDay : a.endDay - b.endDay
  );

  const merged: DayRangeConstraint[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    // Overlapping or adjacent (endDay + 1 >= next startDay)
    if (current.startDay <= last.endDay + 1) {
      last.endDay = Math.max(last.endDay, current.endDay);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

// ────────────────────────────────────────────────
// Effective Range (Pinning + Multi-Range)
// ────────────────────────────────────────────────

/**
 * Returns the effective allowed day ranges for a place, incorporating pinning.
 * Returns null if the place is completely unconstrained.
 *
 * UNIFIES:
 * 1. Hard single-day pinning (pinnedToDay) -> [{dayIndex, dayIndex}]
 * 2. Range constraints (allowedDayRanges) -> [{startDay, endDay}, ...]
 * 3. Both combined (pin day takes precedence)
 */
export function getEffectiveAllowedDayRanges(
  place: Place,
  totalDays?: number
): DayRangeConstraint[] | null {
  const maxDay = totalDays !== undefined && totalDays > 0 ? totalDays - 1 : Infinity;

  const isPinned =
    !!place.pinnedToDay &&
    place.dayIndex !== null &&
    place.dayIndex !== undefined;
  const pinDay = isPinned ? place.dayIndex! : null;

  const ranges = getAllowedDayRanges(place);

  if (pinDay !== null) {
    // Pin takes precedence over ranges
    return [{ startDay: Math.max(0, pinDay), endDay: Math.min(pinDay, maxDay) }];
  }

  if (ranges.length > 0) {
    return ranges.map((r) => ({
      startDay: Math.max(0, r.startDay),
      endDay: Math.min(r.endDay, maxDay),
    }));
  }

  return null;
}

/**
 * Legacy wrapper — returns a single bounding-box range across all ranges.
 * Used by code that only needs a single DayRangeConstraint (error messages, etc.).
 */
export function getEffectiveAllowedDayRange(
  place: Place,
  totalDays?: number
): DayRangeConstraint | null {
  const ranges = getEffectiveAllowedDayRanges(place, totalDays);
  if (!ranges || ranges.length === 0) return null;

  return {
    startDay: Math.min(...ranges.map((r) => r.startDay)),
    endDay: Math.max(...ranges.map((r) => r.endDay)),
  };
}

/**
 * Checks if a specific 0-indexed dayIndex is allowed for this place.
 * Returns true if dayIndex falls within ANY of the allowed ranges.
 */
export function isDayAllowedForPlace(
  place: Place,
  dayIndex: number,
  totalDays?: number
): boolean {
  const ranges = getEffectiveAllowedDayRanges(place, totalDays);
  if (!ranges || ranges.length === 0) return true;
  return ranges.some((r) => dayIndex >= r.startDay && dayIndex <= r.endDay);
}

// ────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────

/**
 * Formats a single day index into a readable string.
 * E.g. "Day 1: Tokyo Arrival (Fri, Oct 3)" or "Day 1".
 */
export function formatDayIndexLabel(
  dayIndex: number,
  startDateISO?: string,
  dayTitles?: Record<number, string>
): string {
  const dayNum = dayIndex + 1;
  const customTitle = dayTitles?.[dayIndex]?.trim();

  if (startDateISO) {
    try {
      const parsed = parseISO(startDateISO);
      if (isValid(parsed)) {
        const d = addDays(parsed, dayIndex);
        const dateStr = format(d, "MMM d");
        if (customTitle) {
          return `${customTitle} (${dateStr}, Day ${dayNum})`;
        }
        return `${dateStr} (Day ${dayNum})`;
      }
    } catch {
      // fallback
    }
  }
  return customTitle ? `${customTitle} (Day ${dayNum})` : `Day ${dayNum}`;
}

/**
 * Formats a single day range constraint into a clean badge structure.
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

/**
 * Formats multiple day range constraints into a combined label.
 * E.g. "Oct 3–6, Oct 9–12" or "Days 1–4, Days 7–10"
 */
export function formatMultiRangeBadge(
  ranges: DayRangeConstraint[],
  startDateISO?: string,
  dayTitles?: Record<number, string>
): { fullLabel: string; rangeCount: number } {
  if (ranges.length === 0) {
    return { fullLabel: "No restriction", rangeCount: 0 };
  }
  if (ranges.length === 1) {
    return {
      fullLabel: formatDayRangeBadge(ranges[0], startDateISO, dayTitles).fullLabel,
      rangeCount: 1,
    };
  }

  const labels = ranges.map(
    (r) => formatDayRangeBadge(r, startDateISO, dayTitles).fullLabel
  );
  return {
    fullLabel: labels.join(", "),
    rangeCount: ranges.length,
  };
}
