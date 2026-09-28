import { formatMinutesTo12h, parseOpeningHoursString, parseTimeToMinutes } from "./timeUtils";

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type WeekdayName = (typeof WEEKDAYS)[number];

export interface DayHoursEntry {
  day: WeekdayName;
  mode: "open" | "closed" | "24hours";
  openTime: string; // "HH:mm" (24h)
  closeTime: string; // "HH:mm" (24h)
  hasSplitShift: boolean;
  openTime2?: string; // "HH:mm" (24h)
  closeTime2?: string; // "HH:mm" (24h)
}

function minutesToHHMM(minutes: number): string {
  const norm = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Parses an existing openingHours string array into structured DayHoursEntry items for Mon-Sun.
 */
export function parseOpeningHoursArrayToEntries(openingHours?: string[]): DayHoursEntry[] {
  const cleanHours = Array.isArray(openingHours) ? openingHours.filter(Boolean) : [];

  return WEEKDAYS.map((dayName) => {
    const dayLower = dayName.toLowerCase();
    const dayShort = dayLower.slice(0, 3);

    // 1. Try finding specific weekday line
    let matchedLine = cleanHours.find((line) => {
      const lower = line.trim().toLowerCase();
      return lower.startsWith(dayLower) || lower.startsWith(dayShort);
    });

    // 2. Try generic daily entries if no weekday line found
    if (!matchedLine) {
      matchedLine = cleanHours.find((line) => {
        const lower = line.trim().toLowerCase();
        return lower.startsWith("daily") || lower.startsWith("every day") || lower.startsWith("everyday");
      });
    }

    // 3. Fallback for single entry
    if (!matchedLine && cleanHours.length === 1) {
      matchedLine = cleanHours[0];
    }

    // Default entry if nothing found
    if (!matchedLine) {
      return {
        day: dayName,
        mode: "open",
        openTime: "10:00",
        closeTime: "20:00",
        hasSplitShift: false,
        openTime2: "17:00",
        closeTime2: "22:00",
      };
    }

    const lower = matchedLine.toLowerCase();

    // Check closed
    if (lower.includes("closed")) {
      return {
        day: dayName,
        mode: "closed",
        openTime: "10:00",
        closeTime: "20:00",
        hasSplitShift: false,
        openTime2: "17:00",
        closeTime2: "22:00",
      };
    }

    // Check 24 hours
    if (lower.includes("24 hours") || lower.includes("open 24")) {
      return {
        day: dayName,
        mode: "24hours",
        openTime: "00:00",
        closeTime: "23:59",
        hasSplitShift: false,
        openTime2: "17:00",
        closeTime2: "22:00",
      };
    }

    // Parse intervals
    const parsed = parseOpeningHoursString(matchedLine);
    if (!parsed || parsed === "closed" || parsed === "24hours" || !parsed.intervals || parsed.intervals.length === 0) {
      return {
        day: dayName,
        mode: "open",
        openTime: "10:00",
        closeTime: "20:00",
        hasSplitShift: false,
        openTime2: "17:00",
        closeTime2: "22:00",
      };
    }

    const int1 = parsed.intervals[0];
    const hasSplit = parsed.intervals.length > 1;
    const int2 = hasSplit ? parsed.intervals[1] : undefined;

    let close1 = int1.close;
    if (close1 === int1.open && int1.open > 0 && int1.open <= 12 * 60) {
      close1 += 12 * 60;
    }

    return {
      day: dayName,
      mode: "open",
      openTime: minutesToHHMM(int1.open),
      closeTime: minutesToHHMM(close1),
      hasSplitShift: hasSplit,
      openTime2: int2 ? minutesToHHMM(int2.open) : "17:00",
      closeTime2: int2 ? minutesToHHMM(int2.close) : "22:00",
    };
  });
}

/**
 * Formats a single day entry into the standard opening hours string.
 * e.g. "Monday: 10:00 AM – 8:00 PM"
 */
export function formatDayHoursEntry(entry: DayHoursEntry): string {
  if (entry.mode === "closed") {
    return `${entry.day}: Closed`;
  }
  if (entry.mode === "24hours") {
    return `${entry.day}: Open 24 hours`;
  }

  let openMin1 = parseTimeToMinutes(entry.openTime);
  let closeMin1 = parseTimeToMinutes(entry.closeTime);

  // Safeguard: if user entered 10:00 to 10:00 (or 11:00 to 10:00) thinking 12-hour clock in 24-hour inputs
  if (closeMin1 <= openMin1 && openMin1 >= 7 * 60 && openMin1 <= 12 * 60 && closeMin1 >= 7 * 60 && closeMin1 <= 12 * 60) {
    closeMin1 += 12 * 60;
  }

  const shift1Str = `${formatMinutesTo12h(openMin1)} – ${formatMinutesTo12h(closeMin1)}`;

  if (entry.hasSplitShift && entry.openTime2 && entry.closeTime2) {
    let openMin2 = parseTimeToMinutes(entry.openTime2);
    let closeMin2 = parseTimeToMinutes(entry.closeTime2);
    if (closeMin2 <= openMin2 && openMin2 >= 7 * 60 && openMin2 <= 12 * 60 && closeMin2 >= 7 * 60 && closeMin2 <= 12 * 60) {
      closeMin2 += 12 * 60;
    }
    const shift2Str = `${formatMinutesTo12h(openMin2)} – ${formatMinutesTo12h(closeMin2)}`;
    return `${entry.day}: ${shift1Str}, ${shift2Str}`;
  }

  return `${entry.day}: ${shift1Str}`;
}

/**
 * Converts DayHoursEntry items into standard openingHours array.
 */
export function formatDayHoursEntriesToArray(entries: DayHoursEntry[]): string[] {
  return entries.map(formatDayHoursEntry);
}

/**
 * Formats DayHoursEntry items into a human-readable multi-line string.
 */
export function formatDayHoursEntriesToRawText(entries: DayHoursEntry[]): string {
  return formatDayHoursEntriesToArray(entries).join("\n");
}

/**
 * Parses raw text lines (from textarea or pasted) into DayHoursEntry items.
 */
export function parseRawTextToDayHoursEntries(text: string): DayHoursEntry[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return parseOpeningHoursArrayToEntries(lines);
}
