import { Place, ReservationRequirement } from "../types";
import { parseISO, addDays, subDays, startOfDay, differenceInCalendarDays, format, isValid } from "date-fns";

/**
 * Parses natural language advance notice timing strings into number of days.
 * Examples:
 * - "Reserve 1 month in advance" -> 30
 * - "Opens 30 days prior at midnight" -> 30
 * - "Book 2-3 weeks ahead" -> 21
 * - "60 days in advance" -> 60
 * - "1 week ahead" -> 7
 * - "Same day / Day of" -> 0
 */
export function parseAdvanceNoticeDays(advanceTime?: string): number | null {
  if (!advanceTime || typeof advanceTime !== "string") return null;

  const text = advanceTime.trim().toLowerCase();

  // Same day / walk in / day of
  if (text.includes("same day") || text.includes("day of") || text.includes("walk-in")) {
    return 0;
  }

  // Months: e.g. "1 month", "2-3 months", "a month"
  const monthMatch = text.match(/(?:(\d+)\s*(?:-\s*(\d+))?|a|one)\s*month/);
  if (monthMatch) {
    if (monthMatch[1] && monthMatch[2]) {
      return Math.max(parseInt(monthMatch[1], 10), parseInt(monthMatch[2], 10)) * 30;
    }
    if (monthMatch[1]) {
      return parseInt(monthMatch[1], 10) * 30;
    }
    return 30;
  }

  // Weeks: e.g. "1 week", "2-3 weeks", "a week", "one week"
  const weekMatch = text.match(/(?:(\d+)\s*(?:-\s*(\d+))?|a|one)\s*week/);
  if (weekMatch) {
    if (weekMatch[1] && weekMatch[2]) {
      return Math.max(parseInt(weekMatch[1], 10), parseInt(weekMatch[2], 10)) * 7;
    }
    if (weekMatch[1]) {
      return parseInt(weekMatch[1], 10) * 7;
    }
    return 7;
  }

  // Days: e.g. "30 days", "3-5 days", "1 day", "14 days prior"
  const dayMatch = text.match(/(?:(\d+)\s*(?:-\s*(\d+))?|a|one)\s*day/);
  if (dayMatch) {
    if (dayMatch[1] && dayMatch[2]) {
      return Math.max(parseInt(dayMatch[1], 10), parseInt(dayMatch[2], 10));
    }
    if (dayMatch[1]) {
      return parseInt(dayMatch[1], 10);
    }
    return 1;
  }

  // Hours: e.g. "24 hours" -> 1 day, "48 hours" -> 2 days
  const hourMatch = text.match(/(\d+)\s*hour/);
  if (hourMatch && hourMatch[1]) {
    const hours = parseInt(hourMatch[1], 10);
    return Math.max(1, Math.round(hours / 24));
  }

  return null;
}

/**
 * Calculates the exact visit date if the place is assigned to a day and trip has a valid startDate.
 */
export function getVisitDate(place: Place, startDateISO?: string): Date | null {
  if (place.dayIndex === null || place.dayIndex === undefined || !startDateISO) {
    return null;
  }
  try {
    const parsed = parseISO(startDateISO);
    if (!isValid(parsed)) return null;
    return addDays(parsed, place.dayIndex);
  } catch {
    return null;
  }
}

/**
 * Calculates the target date when reservations typically open or should be booked.
 */
export function calculateTargetBookingDate(
  visitDate: Date | null,
  advanceNoticeDays: number | null
): Date | null {
  if (!visitDate || advanceNoticeDays === null || advanceNoticeDays === undefined) {
    return null;
  }
  return subDays(visitDate, advanceNoticeDays);
}

export type BookingUrgency =
  | "booked"
  | "urgent"    // Opened already or opens within 7 days
  | "soon"      // Opens in 8-30 days
  | "future"    // Opens in >30 days
  | "unknown";   // No target booking date known (unassigned or missing advance time)

/**
 * Returns urgency category for sorting and visual indicator badges.
 */
export function getBookingUrgency(
  targetBookingDate: Date | null,
  isBooked?: boolean
): BookingUrgency {
  if (isBooked) return "booked";
  if (!targetBookingDate) return "unknown";

  const today = startOfDay(new Date());
  const bookingDay = startOfDay(targetBookingDate);
  const diffDays = differenceInCalendarDays(bookingDay, today);

  if (diffDays <= 7) return "urgent";
  if (diffDays <= 30) return "soon";
  return "future";
}

/**
 * Formats a user-friendly countdown or status badge for booking opening.
 */
export function formatBookingCountdown(
  targetBookingDate: Date | null,
  isBooked?: boolean
): { label: string; urgency: BookingUrgency } {
  if (isBooked) {
    return { label: "Booked & Confirmed", urgency: "booked" };
  }

  if (!targetBookingDate) {
    return { label: "TBD / Flexible", urgency: "unknown" };
  }

  const today = startOfDay(new Date());
  const bookingDay = startOfDay(targetBookingDate);
  const diffDays = differenceInCalendarDays(bookingDay, today);

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return {
      label: abs === 1 ? "Opened yesterday (Book now)" : `Opened ${abs} days ago (Book now)`,
      urgency: "urgent",
    };
  }
  if (diffDays === 0) {
    return { label: "Opens TODAY!", urgency: "urgent" };
  }
  if (diffDays === 1) {
    return { label: "Opens TOMORROW!", urgency: "urgent" };
  }
  if (diffDays <= 7) {
    return { label: `Opens in ${diffDays} days`, urgency: "urgent" };
  }
  if (diffDays <= 30) {
    return { label: `Opens in ${diffDays} days`, urgency: "soon" };
  }

  return { label: `Opens in ${diffDays} days (${format(targetBookingDate, "MMM d")})`, urgency: "future" };
}

/**
 * Determines whether a place is relevant to the reservation & booking manager.
 */
export function isReservationRelevant(place: Place): boolean {
  const req = place.reservation?.requirement;
  const hasReservationReq = req === "required" || req === "recommended";
  const hasBookingInfo = Boolean(
    place.reservation?.isBooked ||
    place.reservation?.bookingUrl ||
    place.reservation?.confirmationNumber ||
    place.reservation?.advanceTime ||
    place.reservation?.notes
  );
  const hasLockedCustomTime = Boolean(place.customTime);

  return hasReservationReq || hasBookingInfo || hasLockedCustomTime;
}

export interface EnrichedReservationPlace {
  place: Place;
  visitDate: Date | null;
  advanceDays: number | null;
  targetBookingDate: Date | null;
  urgency: BookingUrgency;
  countdownLabel: string;
  isBooked: boolean;
  requirement: ReservationRequirement;
}

/**
 * Enriches places with calculated booking dates and urgency levels for easy listing and sorting.
 */
export function enrichReservationPlace(
  place: Place,
  startDateISO?: string
): EnrichedReservationPlace {
  const isBooked = Boolean(place.reservation?.isBooked);
  const requirement: ReservationRequirement = place.reservation?.requirement || (place.customTime ? "recommended" : "not_needed");
  const visitDate = getVisitDate(place, startDateISO);
  const advanceDays = parseAdvanceNoticeDays(place.reservation?.advanceTime);
  const targetBookingDate = calculateTargetBookingDate(visitDate, advanceDays);
  const urgency = getBookingUrgency(targetBookingDate, isBooked);
  const { label: countdownLabel } = formatBookingCountdown(targetBookingDate, isBooked);

  return {
    place,
    visitDate,
    advanceDays,
    targetBookingDate,
    urgency,
    countdownLabel,
    isBooked,
    requirement,
  };
}

/**
 * Generates a clean Markdown checklist that travelers can copy to notes/reminders.
 */
export function generateBookingChecklist(
  enrichedPlaces: EnrichedReservationPlace[],
  startDateISO?: string,
  dayTitles?: Record<number, string>
): string {
  if (enrichedPlaces.length === 0) {
    return "# RE-ROUTE Booking Checklist\n\nNo reservations currently scheduled.";
  }

  const lines: string[] = ["# RE-ROUTE Booking & Reservation Checklist\n"];

  if (startDateISO) {
    try {
      const parsed = parseISO(startDateISO);
      if (isValid(parsed)) {
        lines.push(`Trip Starting: ${format(parsed, "MMMM d, yyyy")}\n`);
      }
    } catch {
      // ignore
    }
  }

  const pending = enrichedPlaces.filter((p) => !p.isBooked);
  const booked = enrichedPlaces.filter((p) => p.isBooked);

  if (pending.length > 0) {
    lines.push(`## ⏳ Pending Reservations (${pending.length})\n`);
    for (const item of pending) {
      const { place, visitDate, targetBookingDate, countdownLabel } = item;
      const dayLabel = place.dayIndex !== null && place.dayIndex !== undefined
        ? `Day ${place.dayIndex + 1}${dayTitles?.[place.dayIndex] ? ` (${dayTitles[place.dayIndex]})` : ""}`
        : "Unassigned";

      const visitText = visitDate
        ? `${format(visitDate, "EEE, MMM d")}${place.customTime ? ` at ${place.customTime}` : ""}`
        : place.customTime ? `At ${place.customTime}` : "Flexible";

      const targetText = targetBookingDate
        ? `Book around: ${format(targetBookingDate, "MMM d, yyyy")} (${countdownLabel})`
        : place.reservation?.advanceTime
        ? `Timing: ${place.reservation.advanceTime}`
        : "Book when ready";

      lines.push(`- [ ] **${place.name}** [${place.reservation?.requirement || "custom time"}]`);
      lines.push(`  - Visit: ${dayLabel} — ${visitText}`);
      lines.push(`  - Booking Window: ${targetText}`);
      if (place.reservation?.bookingUrl) {
        lines.push(`  - Link: ${place.reservation.bookingUrl}`);
      }
      if (place.reservation?.notes) {
        lines.push(`  - Notes: ${place.reservation.notes}`);
      }
      lines.push("");
    }
  }

  if (booked.length > 0) {
    lines.push(`## ✅ Confirmed Bookings (${booked.length})\n`);
    for (const item of booked) {
      const { place, visitDate } = item;
      const dayLabel = place.dayIndex !== null && place.dayIndex !== undefined
        ? `Day ${place.dayIndex + 1}`
        : "Unassigned";

      const visitText = visitDate
        ? `${format(visitDate, "EEE, MMM d")}${place.customTime ? ` at ${place.customTime}` : ""}`
        : place.customTime ? `At ${place.customTime}` : "Flexible";

      lines.push(`- [x] **${place.name}**`);
      lines.push(`  - Scheduled: ${dayLabel} — ${visitText}`);
      if (place.reservation?.confirmationNumber) {
        lines.push(`  - Confirmation #: ${place.reservation.confirmationNumber}`);
      }
      if (place.reservation?.bookingUrl) {
        lines.push(`  - Link: ${place.reservation.bookingUrl}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Parses early-arrival queue recommendations from advanceTime strings.
 * Used by the optimizer to extend the early-arrival grace window for walk-in
 * places that have known queue times.
 *
 * Examples:
 * - "Walk-ins only; arrive 15–20 min before opening to queue" → 20
 * - "Walk-ins only; line forms 15m before opening"           → 15
 * - "Arrive 30 minutes early"                                → 30
 * - "Reserve 2 weeks in advance"                             → 0 (not a queue)
 */
export function parseEarlyArrivalMinutes(advanceTime?: string): number {
  if (!advanceTime || typeof advanceTime !== "string") return 0;
  const text = advanceTime.toLowerCase();

  // Match patterns like "15–20 min", "15-20 min", "30 min", "15m"
  // Prefer the higher end of a range (e.g. "15–20" → 20)
  const rangeMatch = text.match(
    /(\d+)\s*[-–]\s*(\d+)\s*(?:min(?:utes?)?|m)\s*(?:before|early|ahead|prior|to queue|queue)/i
  );
  if (rangeMatch) return parseInt(rangeMatch[2], 10);

  const singleMatch = text.match(
    /(\d+)\s*(?:min(?:utes?)?|m)\s*(?:before|early|ahead|prior|to queue|queue)/i
  );
  if (singleMatch) return parseInt(singleMatch[1], 10);

  return 0;
}
