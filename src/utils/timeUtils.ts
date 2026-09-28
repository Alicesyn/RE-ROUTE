import type { TimeRangeConstraint } from "../types";

const WEEKDAYS_LONG = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAYS_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface ParsedOpeningHours {
  open: number;
  close: number;
  intervals: { open: number; close: number }[];
}

/**
 * Formats minutes from midnight into 12-hour format string (e.g. 780 -> "1:00 PM")
 */
export const formatMinutesTo12h = (minutes: number): string => {
  const norm = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  const displayM = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${displayM} ${period}`;
};

/**
 * Parses an opening hours string like "Monday: 9:00 AM – 5:00 PM", "Monday: 1:00 – 7:00 PM",
 * or "Monday: 13:00 – 19:00".
 * Returns the open and close times in minutes from midnight, along with all active intervals.
 * Handles "Closed" and "Open 24 hours".
 */
export const parseOpeningHoursString = (
  hoursStr: string
): ParsedOpeningHours | "closed" | "24hours" | null => {
  if (!hoursStr || typeof hoursStr !== "string") return null;

  // Normalize unicode spaces, non-breaking spaces, dashes, and tildes
  const normalized = hoursStr
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f]/g, " ")
    .replace(/[\u2010-\u2015\u2212～~]/g, "-")
    .trim();

  const lower = normalized.toLowerCase();
  if (lower.includes("closed")) return "closed";
  if (
    lower.includes("24 hours") ||
    lower.includes("24hours") ||
    lower.includes("open 24") ||
    lower.includes("24 hrs") ||
    lower.includes("24hrs") ||
    lower.includes("24/7") ||
    lower.includes("all day") ||
    lower.includes("24 hour") ||
    lower.includes("24-hour")
  ) {
    return "24hours";
  }

  const intervals: { open: number; close: number }[] = [];

  // Pattern 1: 12-hour format with optional first period, e.g. "1:00 PM - 7:00 PM", "1:00 - 7:00 PM", "9 AM - 5 PM"
  const time12Regex = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi;
  for (const match of normalized.matchAll(time12Regex)) {
    const [, openH, openM, openP, closeH, closeM, closeP] = match;
    const endPeriod = closeP.toUpperCase();
    let startPeriod = openP ? openP.toUpperCase() : undefined;

    const oH = parseInt(openH, 10);
    const cH = parseInt(closeH, 10);

    if (!startPeriod) {
      if (endPeriod === "PM") {
        if (oH === 12) {
          startPeriod = "PM"; // e.g. 12:00 - 2:30 PM -> 12:00 PM (noon)
        } else if (cH === 12) {
          startPeriod = "AM"; // e.g. 10:00 - 12:00 PM -> 10:00 AM to 12:00 PM
        } else if (oH === cH) {
          startPeriod = "AM"; // e.g. 10:00 - 10:00 PM -> 10:00 AM to 10:00 PM (never 10 PM to 10 PM)
        } else if (oH >= 7 && oH <= 11 && cH >= 7 && cH <= 11) {
          startPeriod = "AM"; // e.g. 9:00 - 10:00 PM, 10:00 - 11:00 PM -> morning to night
        } else {
          // e.g. 1:00 - 7:00 PM -> start is PM. But 9:00 - 5:00 PM -> start is AM.
          startPeriod = oH <= cH ? "PM" : "AM";
        }
      } else {
        // e.g. 9:00 - 2:00 AM -> overnight spot starts at 9:00 PM (oH > cH and post-midnight close)
        // but 7:00 - 10:00 AM -> morning shift 7:00 AM to 10:00 AM (oH < cH)
        if (oH > cH && oH >= 4 && oH <= 11 && cH <= 8) {
          startPeriod = "PM";
        } else {
          startPeriod = "AM";
        }
      }
    }

    let openMinutes = (oH % 12) * 60 + (openM ? parseInt(openM, 10) : 0);
    if (startPeriod === "PM") openMinutes += 12 * 60;

    let closeMinutes = (cH % 12) * 60 + (closeM ? parseInt(closeM, 10) : 0);
    if (endPeriod === "PM") closeMinutes += 12 * 60;

    // 12:00 AM to 12:00 AM represents open 24 hours
    if (openMinutes === 0 && closeMinutes === 0 && oH === 12 && cH === 12) {
      return "24hours";
    }

    if (closeMinutes < openMinutes) {
      closeMinutes += 24 * 60;
    }

    intervals.push({ open: openMinutes, close: closeMinutes });
  }

  // Pattern 2: 24-hour format, e.g. "13:00 - 19:00", "09:00 - 18:30"
  if (intervals.length === 0) {
    const time24Regex = /(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})/gi;
    for (const match of normalized.matchAll(time24Regex)) {
      const [, oH, oM, cH, cM] = match;
      const openMinutes = parseInt(oH, 10) * 60 + parseInt(oM, 10);
      let closeMinutes = parseInt(cH, 10) * 60 + parseInt(cM, 10);
      // 00:00 to 00:00 or 00:00 to 24:00 represents 24 hours
      if (openMinutes === 0 && (closeMinutes === 0 || closeMinutes >= 24 * 60)) {
        return "24hours";
      }
      if (closeMinutes < openMinutes) closeMinutes += 24 * 60;
      intervals.push({ open: openMinutes, close: closeMinutes });
    }
  }

  if (intervals.length === 0) return null;

  const earliestOpen = Math.min(...intervals.map((i) => i.open));
  const latestClose = Math.max(...intervals.map((i) => i.close));

  return { open: earliestOpen, close: latestClose, intervals };
};

/**
 * Retrieves the parsed opening hours for a specific calendar date.
 */
export const getPlaceDayHours = (
  openingHours: string[] | undefined,
  date: Date
): ParsedOpeningHours | "closed" | "24hours" | null => {
  if (!openingHours || !Array.isArray(openingHours) || openingHours.length === 0) return null;
  if (!date || isNaN(new Date(date).getTime())) return null;

  try {
    const targetDate = date instanceof Date ? date : new Date(date);
    const dayIdx = targetDate.getDay();
    const dayOfWeekLong = WEEKDAYS_LONG[dayIdx];
    const dayOfWeekShort = WEEKDAYS_SHORT[dayIdx];

    // 1. Try finding by matching weekday name (full or 3-letter abbreviation)
    let todaysHours = openingHours.find((h) => {
      if (typeof h !== "string") return false;
      const clean = h.trim().toLowerCase();
      return clean.startsWith(dayOfWeekLong) || clean.startsWith(dayOfWeekShort);
    });

    // 2. If not found by day, check for generic daily entries e.g. "Daily: 9 AM - 5 PM", "Every day", or 24-hour entries
    if (!todaysHours) {
      todaysHours = openingHours.find((h) => {
        if (typeof h !== "string") return false;
        const clean = h.trim().toLowerCase();
        return (
          clean.startsWith("daily") ||
          clean.startsWith("every day") ||
          clean.startsWith("everyday") ||
          clean.includes("24 hours") ||
          clean.includes("24hours") ||
          clean.includes("open 24") ||
          clean.includes("24 hrs") ||
          clean.includes("24hrs") ||
          clean.includes("24/7") ||
          clean.includes("all day")
        );
      });
    }

    // 3. Fallback: if openingHours has plain time without day prefix, test first entry
    if (!todaysHours && openingHours.length > 0 && typeof openingHours[0] === "string") {
      todaysHours = openingHours[0];
    }

    if (!todaysHours || typeof todaysHours !== "string") return null;
    return parseOpeningHoursString(todaysHours);
  } catch {
    return null;
  }
};


/**
 * Parses "HH:MM" (24h) or "H:MM AM/PM" string into minutes from midnight
 */
export const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim();
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (match12 && match12[3]) {
    let h = parseInt(match12[1], 10);
    const m = match12[2] ? parseInt(match12[2], 10) : 0;
    const isPm = match12[3].toLowerCase() === "pm";
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return h * 60 + m;
  }
  const [hours, minutes] = trimmed.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

export interface TimeConflictResult {
  hasConflict: boolean;
  reason?: string;
  waitMinutes?: number;
  effectiveStartTime?: number;
}

/**
 * Checks if a given arrival time and duration fit within the opening hours and/or allowedTimeRange.
 * If arriving up to 30 minutes before opening, treats it as an acceptable arrival wait.
 * If arriving more than 30 minutes before opening (minus any intentional queue buffer for walk-in places),
 * flags it as a conflict (Closed).
 *
 * @param earlyArrivalMinutes - Queue buffer for walk-in places (from parseEarlyArrivalMinutes).
 *   Extends the grace window so "line forms 20 min before opening" is treated as acceptable.
 */
export const checkTimeConflict = (
  arrivalTimeMinutes: number,
  durationMinutes: number,
  openingHours: string[] | undefined,
  date: Date,
  allowedTimeRange?: TimeRangeConstraint,
  earlyArrivalMinutes: number = 0,
): TimeConflictResult => {
  let hasConflict = false;
  let reason: string | undefined;
  let waitMinutes = 0;
  let effectiveStartTime = arrivalTimeMinutes;

  // 1. Check user-defined preferred time window constraint (allowedTimeRange)
  if (allowedTimeRange && allowedTimeRange.startTime && allowedTimeRange.endTime) {
    const isExclude = allowedTimeRange.mode === "exclude";
    const rangeStart = parseTimeToMinutes(allowedTimeRange.startTime);
    let rangeEnd = parseTimeToMinutes(allowedTimeRange.endTime);
    // If rangeEnd is 0 (e.g. "00:00" / 12:00 AM) or wraps past midnight (rangeEnd < rangeStart),
    // treat midnight as the end of the day (1440 min) or overnight window (+1440 min)
    if (rangeEnd === 0) {
      rangeEnd = 24 * 60;
    } else if (rangeEnd < rangeStart) {
      rangeEnd += 24 * 60;
    }
    const depTime = arrivalTimeMinutes + durationMinutes;

    if (isExclude) {
      // Exclude / NOT mode: conflict if the visit overlaps the forbidden window
      if (arrivalTimeMinutes < rangeEnd && depTime > rangeStart) {
        hasConflict = true;
        reason = `Within excluded hours (NOT ${formatMinutesTo12h(rangeStart)} – ${formatMinutesTo12h(rangeEnd)})`;
        if (arrivalTimeMinutes >= rangeStart && arrivalTimeMinutes < rangeEnd) {
          effectiveStartTime = Math.max(effectiveStartTime, rangeEnd);
        }
      }
    } else {
      // Allow mode (default): visit must fall entirely within [rangeStart, rangeEnd]
      if (arrivalTimeMinutes < rangeStart) {
        const wait = rangeStart - arrivalTimeMinutes;
        waitMinutes = Math.max(waitMinutes, wait);
        effectiveStartTime = Math.max(effectiveStartTime, rangeStart);
        if (wait > 30) {
          hasConflict = true;
          reason = `Outside preferred hours (opens at ${formatMinutesTo12h(rangeStart)})`;
        }
      } else if (depTime > rangeEnd || arrivalTimeMinutes >= rangeEnd) {
        hasConflict = true;
        reason = `Outside preferred hours (closes at ${formatMinutesTo12h(rangeEnd)})`;
      }
    }
  }

  // 2. Check venue official opening hours
  if (openingHours && Array.isArray(openingHours) && openingHours.length > 0 && date && !isNaN(new Date(date).getTime())) {
    try {
      const parsed = getPlaceDayHours(openingHours, date);

      if (parsed === "closed") {
        return { hasConflict: true, reason: "Closed today", waitMinutes: 0, effectiveStartTime: arrivalTimeMinutes };
      }

      if (parsed && typeof parsed === "object") {
        const intervals = (parsed.intervals || [{ open: parsed.open, close: parsed.close }])
          .slice()
          .sort((a, b) => a.open - b.open);

        const departureTimeMinutes = arrivalTimeMinutes + durationMinutes;

        // Fits completely in an open interval without waiting?
        const fitsInAnyInterval = intervals.some(
          (inv) => arrivalTimeMinutes >= inv.open && departureTimeMinutes <= inv.close
        );

        if (!fitsInAnyInterval) {
          // Check if arriving before an interval opens
          const candidateInterval = intervals.find(
            (inv) => arrivalTimeMinutes < inv.open && inv.open + durationMinutes <= inv.close
          );

          if (candidateInterval) {
            const wait = candidateInterval.open - arrivalTimeMinutes;
            waitMinutes = Math.max(waitMinutes, wait);
            effectiveStartTime = Math.max(effectiveStartTime, candidateInterval.open);
            // Grace window: 30 min hardcoded + walk-in queue buffer from AI's advanceTime
            if (wait > 30 + earlyArrivalMinutes) {
              hasConflict = true;
              const openTimeFormatted = formatMinutesTo12h(candidateInterval.open);
              reason = `Closed (opens at ${openTimeFormatted})`;
            }
          } else {
            // Arrived after latest closing or exceeds close
            const latestClose = Math.max(...intervals.map((i) => i.close));
            if (departureTimeMinutes > latestClose || arrivalTimeMinutes >= latestClose) {
              hasConflict = true;
              const closeTimeFormatted = formatMinutesTo12h(latestClose);
              reason = `Closed (closes at ${closeTimeFormatted})`;
            } else {
              hasConflict = true;
              reason = "Closed during scheduled visiting hours";
            }
          }
        }
      }
    } catch {
      // Ignored
    }
  }

  return {
    hasConflict,
    reason,
    waitMinutes,
    effectiveStartTime,
  };
};

