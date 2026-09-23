import ExcelJS from "exceljs";
import { format, addDays, parseISO } from "date-fns";
import {
  ItinerarySnapshot,
  PlaceCategory,
  DayRoute,
  TravelMode,
} from "../types";
import { CATEGORY_DEFAULTS } from "../utils/categoryConstants";
import { checkTimeConflict } from "../utils/timeUtils";
import { isWalkSegment } from "../utils/distance";
import {
  enrichReservationPlace,
  EnrichedReservationPlace,
  isReservationRelevant,
} from "../utils/reservationUtils";
import { formatDayIndexLabel } from "../utils/dayRangeUtils";

const getCategoryEmoji = (cat: PlaceCategory): string =>
  CATEGORY_DEFAULTS[cat]?.emoji || "📍";

const getCategoryLabel = (cat: PlaceCategory): string =>
  CATEGORY_DEFAULTS[cat]?.label || "Other";

// Color Palette Constants (ARGB)
const COLORS = {
  NAVY_HEADER: "FF1E293B",      // Slate 800
  NAVY_SUBHEADER: "FF334155",   // Slate 700
  INDIGO_PRIMARY: "FF4F46E5",   // Indigo 600
  INDIGO_LIGHT: "FFEEF2FF",     // Indigo 50
  INDIGO_BORDER: "FFC7D2FE",    // Indigo 200
  AMBER_ACCENT: "FFD97706",     // Amber 600
  AMBER_LIGHT: "FFFEF3C7",      // Amber 100
  EMERALD_ACCENT: "FF059669",   // Emerald 600
  EMERALD_LIGHT: "FFECFDF5",    // Emerald 50
  ROSE_ACCENT: "FFE11D48",      // Rose 600
  ROSE_LIGHT: "FFFFF1F2",       // Rose 50
  ROSE_BORDER: "FFFECDD3",      // Rose 200
  PURPLE_ACCENT: "FF7C3AED",    // Purple 600
  PURPLE_LIGHT: "FFF5F3FF",     // Purple 50
  BLUE_ACCENT: "FF0284C7",      // Sky 600
  BLUE_LIGHT: "FFF0F9FF",       // Sky 50
  SLATE_ZEBRA: "FFF8FAFC",      // Slate 50
  SLATE_CARD: "FFF1F5F9",       // Slate 100
  BORDER_LIGHT: "FFE2E8F0",     // Slate 200
  BORDER_MEDIUM: "FFCBD5E1",    // Slate 300
  TEXT_MAIN: "FF0F172A",        // Slate 900
  TEXT_MUTED: "FF64748B",       // Slate 500
  TEXT_LIGHT: "FF94A3B8",       // Slate 400
  WHITE: "FFFFFFFF",
  LINK_BLUE: "FF2563EB",        // Blue 600
};

// Font family default
const FONT_FAMILY = "Segoe UI";

interface ExportOptions {
  distanceUnit?: "metric" | "imperial";
  timeFormat?: "12h" | "24h";
}

const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const formatMinutesToDisplay = (
  totalMinutes: number,
  timeFormat: "12h" | "24h" = "12h"
): string => {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.floor(totalMinutes % 60);

  if (timeFormat === "24h") {
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  }
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
};

const formatDuration = (minutes: number): string => {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const formatDistance = (
  meters: number,
  distanceUnit: "metric" | "imperial" = "metric"
): string => {
  if (!meters || meters <= 0) return "0 m";
  if (distanceUnit === "imperial") {
    const miles = meters * 0.000621371;
    return miles < 0.1
      ? `${Math.round(meters * 3.28084)} ft`
      : `${miles.toFixed(1)} mi`;
  }
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
};

const getTravelModeIcon = (mode: TravelMode): string => {
  switch (mode) {
    case "walking":
      return "🚶 Walking";
    case "driving":
      return "🚗 Driving";
    case "transit":
    default:
      return "🚇 Public Transit";
  }
};

interface ComputedScheduleItem {
  id: string;
  type: "flight-arrival" | "flight-departure" | "hotel-start" | "hotel-end" | "buffer" | "place";
  category?: PlaceCategory;
  name: string;
  romanizedName?: string;
  startTime: number; // in minutes
  duration: number; // in minutes
  endTime: number; // in minutes
  highlight?: string;
  reservation?: string;
  price?: string;
  address?: string;
  notes?: string;
  openingHours?: string;
  transitToNext?: {
    mode: TravelMode;
    time: number; // seconds
    distance: number; // meters
    isCustom?: boolean;
  };
  googleMapsUrl?: string;
}

function computeDaySchedule(
  trip: ItinerarySnapshot,
  route: DayRoute,
  dayIndex: number
): { items: ComputedScheduleItem[]; totalVisitMin: number; totalTravelMin: number; totalBufferMin: number } {
  const isFirstDay = dayIndex === 0;
  const isLastDay = dayIndex === trip.days - 1;
  const dayStartTime = trip.dayStartTime || "09:00";
  const customBuffers = trip.customBuffers || [];

  const [startH, startM] = dayStartTime.split(":").map(Number);
  let currentTime = startH * 60 + startM;

  if (trip.showFlights && isFirstDay && trip.arrivalFlight) {
    const [arrH, arrM] = trip.arrivalFlight.time.split(":").map(Number);
    const arrivalTotal = arrH * 60 + arrM;
    currentTime = Math.max(currentTime, arrivalTotal);
  }

  // Determine item sequence — matches DailySchedule.tsx getDayItemSequence exactly
  let ids: string[] = route.manualSequence ? [...route.manualSequence] : [];
  const dayCustoms = customBuffers.filter((b) => b.dayIndex === dayIndex);

  if (!route.manualSequence) {
    if (trip.showFlights && isFirstDay && trip.arrivalFlight) ids.push("arrival");
    if (route.startHotel) ids.push("start-hotel");
    route.stops.forEach((s) => ids.push(s.id));
    dayCustoms.forEach((b) => ids.push(b.id));
    if (route.endHotel && !isLastDay) ids.push("end-hotel");
    if (trip.showFlights && isLastDay && trip.departureFlight) ids.push("departure");
  } else {
    dayCustoms.forEach((b) => {
      if (!ids.includes(b.id)) {
        const endIdx = ids.findIndex((id) => id === "end-hotel" || id === "departure");
        if (endIdx >= 0) {
          ids.splice(endIdx, 0, b.id);
        } else {
          ids.push(b.id);
        }
      }
    });
    ids = ids.filter((id) => {
      if (id.startsWith("custom-buffer-")) {
        return dayCustoms.some((b) => b.id === id);
      }
      return true;
    });
    if (trip.showFlights && isFirstDay && trip.arrivalFlight && !ids.includes("arrival")) {
      ids.unshift("arrival");
    } else if (!trip.showFlights) {
      ids = ids.filter((id) => id !== "arrival" && id !== "departure");
    }
    if (trip.showFlights && isLastDay && trip.departureFlight && !ids.includes("departure")) {
      ids.push("departure");
    }
  }

  if (isLastDay) {
    ids = ids.filter((id) => id !== "end-hotel");
  }

  const items: ComputedScheduleItem[] = [];
  let simSegIdx = 0;
  let currentDate: Date | null = null;
  if (trip.dateMode === "fixed" && trip.startDate) {
    currentDate = addDays(parseISO(trip.startDate), dayIndex);
  }

  let simTime = currentTime;
  let autoWaitBufferMin = 0;

  ids.forEach((itemId, idx) => {
    let preWaitMin = 0;
    let preWaitType: "reservation" | "wait" | undefined = undefined;
    let itemDuration = 0;
    let createdItem: ComputedScheduleItem | null = null;

    const stop = route.stops.find((s) => s.id === itemId);

    if (itemId === "arrival" && trip.arrivalFlight) {
      itemDuration = trip.arrivalFlight.buffer ?? 30;
      const startT = simTime;
      const endT = simTime + itemDuration;
      createdItem = {
        id: "arrival",
        type: "flight-arrival",
        name: trip.arrivalFlight.location?.name
          ? `Flight Arrival (${trip.arrivalFlight.location.name})`
          : "Flight Arrival",
        startTime: startT,
        duration: itemDuration,
        endTime: endT,
        highlight: "Clear customs, baggage claim & ground transfer",
        address: trip.arrivalFlight.location?.address || "",
        googleMapsUrl: trip.arrivalFlight.location?.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.arrivalFlight.location.name + " " + trip.arrivalFlight.location.address)}`
          : undefined,
      };
      simTime = endT;
    } else if (itemId === "departure" && trip.departureFlight) {
      itemDuration = trip.departureFlight.buffer ?? 90;
      const depMin = parseTimeToMinutes(trip.departureFlight.time);
      const startT = Math.max(simTime, depMin - itemDuration);
      const endT = depMin;
      createdItem = {
        id: "departure",
        type: "flight-departure",
        name: trip.departureFlight.location?.name
          ? `Flight Departure (${trip.departureFlight.location.name})`
          : "Flight Departure",
        startTime: startT,
        duration: itemDuration,
        endTime: endT,
        highlight: "Airport check-in, security screening & boarding",
        address: trip.departureFlight.location?.address || "",
        googleMapsUrl: trip.departureFlight.location?.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.departureFlight.location.name + " " + trip.departureFlight.location.address)}`
          : undefined,
      };
      simTime = endT;
    } else if (itemId === "start-hotel" && route.startHotel) {
      itemDuration = 0;
      createdItem = {
        id: "start-hotel",
        type: "hotel-start",
        name: `Depart ${route.startHotel.name}`,
        startTime: simTime,
        duration: 0,
        endTime: simTime,
        address: route.startHotel.address,
        highlight: "Start day from hotel",
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(route.startHotel.name + " " + route.startHotel.address)}`,
      };
    } else if (itemId === "end-hotel" && route.endHotel && !isLastDay) {
      itemDuration = 0;
      createdItem = {
        id: "end-hotel",
        type: "hotel-end",
        name: `Arrive at ${route.endHotel.name}`,
        startTime: simTime,
        duration: 0,
        endTime: simTime,
        address: route.endHotel.address,
        highlight: "Nightly rest & recharge",
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(route.endHotel.name + " " + route.endHotel.address)}`,
      };
    } else if (itemId.startsWith("custom-buffer-")) {
      const customBuf = customBuffers.find((b) => b.id === itemId);
      if (customBuf) {
        itemDuration = customBuf.duration;
        createdItem = {
          id: customBuf.id,
          type: "buffer",
          name: customBuf.label || "Custom Break",
          startTime: simTime,
          duration: customBuf.duration,
          endTime: simTime + customBuf.duration,
          highlight: "Scheduled leisure / buffer time",
        };
        simTime += customBuf.duration;
      }
    } else if (stop) {
      // Check pre-wait time: custom locked time or opening hours
      if (stop.customTime) {
        const customMin = parseTimeToMinutes(stop.customTime);
        if (customMin > simTime) {
          preWaitMin = customMin - simTime;
          preWaitType = "reservation";
          simTime = customMin;
        }
      } else if (currentDate && (stop.openingHours || stop.allowedTimeRange)) {
        const tc = checkTimeConflict(
          simTime,
          stop.estimatedDuration || 60,
          stop.openingHours,
          currentDate,
          stop.allowedTimeRange
        );
        if (tc.waitMinutes && tc.waitMinutes > 0) {
          preWaitMin = tc.waitMinutes;
          preWaitType = "wait";
          simTime += tc.waitMinutes;
        }
      }

      autoWaitBufferMin += preWaitMin;

      // If there was a wait buffer, emit the buffer item immediately before the stop
      if (preWaitMin > 0) {
        const isRes = preWaitType === "reservation";
        const waitStart = simTime - preWaitMin;
        const waitEnd = simTime;
        items.push({
          id: isRes ? `wait-${stop.id}` : `wait-opening-${stop.id}`,
          type: "buffer",
          name: isRes
            ? `Buffer: Free time before ${stop.name}`
            : `Buffer: Wait until opening (${stop.name})`,
          startTime: waitStart,
          duration: preWaitMin,
          endTime: waitEnd,
          highlight: isRes
            ? `Leisure / buffer before locked reservation at ${formatMinutesToDisplay(simTime, "12h")}`
            : `Place opens at ${formatMinutesToDisplay(simTime, "12h")}; leisure / walk around area`,
        });
      }

      itemDuration = stop.estimatedDuration || 60;
      const stopStart = simTime;
      const stopEnd = stopStart + itemDuration;
      simTime = stopEnd;

      let reservationDesc = "";
      if (stop.reservation) {
        if (stop.reservation.requirement === "required") {
          reservationDesc = "🔴 Required";
        } else if (stop.reservation.requirement === "recommended") {
          reservationDesc = "🟡 Recommended";
        } else if (stop.reservation.requirement === "walk_ins_only") {
          reservationDesc = "🔵 Walk-ins Only";
        }
        if (stop.reservation.advanceTime) {
          reservationDesc += ` • ${stop.reservation.advanceTime}`;
        }
        if (stop.reservation.isBooked) {
          reservationDesc = "✅ Booked & Confirmed" + (stop.reservation.confirmationNumber ? ` (${stop.reservation.confirmationNumber})` : "");
        }
      }

      createdItem = {
        id: stop.id,
        type: "place",
        category: stop.category,
        name: stop.name,
        romanizedName: stop.romanizedName,
        startTime: stopStart,
        duration: itemDuration,
        endTime: stopEnd,
        highlight: stop.highlight?.text || stop.description || "",
        reservation: reservationDesc || undefined,
        price: stop.priceEstimate || undefined,
        address: stop.address || "",
        notes: stop.reservation?.notes || stop.notes || undefined,
        openingHours: stop.openingHours ? stop.openingHours.join(" | ") : undefined,
        googleMapsUrl: stop.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name + " " + stop.address)}`
          : undefined,
      };
    }

    // Segment calculation (segment renders right before the next physical stop)
    // Exactly matches DailySchedule.tsx lines 581-592
    const nextPhysicalIdx = ids.slice(idx + 1).findIndex((id) => !id.startsWith("custom-buffer-"));
    const hasPrevPhysical = ids.slice(0, idx + 1).some((id) => !id.startsWith("custom-buffer-"));

    if (createdItem) {
      if (hasPrevPhysical && nextPhysicalIdx === 0 && simSegIdx < route.segments.length) {
        const seg = route.segments[simSegIdx];
        simSegIdx++;
        const segTimeMin = Math.round(seg.time / 60);
        createdItem.transitToNext = {
          mode: isWalkSegment(seg) ? "walking" : seg.travelMode,
          time: seg.time,
          distance: seg.distance,
          isCustom: seg.customDuration !== undefined,
        };
        simTime += segTimeMin;
      }
      items.push(createdItem);
    }
  });

  const totalVisitMin = route.stops.reduce((acc, s) => acc + (s.estimatedDuration || 0), 0);
  const dayCustomBuffers = customBuffers.filter((b) => b.dayIndex === dayIndex);
  const customBufferMin = dayCustomBuffers.reduce((acc, b) => acc + (b.duration || 0), 0);
  const arrivalFlightBuffer = trip.showFlights && isFirstDay && trip.arrivalFlight ? (trip.arrivalFlight.buffer ?? 30) : 0;
  const departureFlightBuffer = trip.showFlights && isLastDay && trip.departureFlight ? (trip.departureFlight.buffer ?? 90) : 0;
  const totalBufferMin = customBufferMin + autoWaitBufferMin + arrivalFlightBuffer + departureFlightBuffer;
  const totalTravelMin = Math.round(route.totalTime / 60);

  return { items, totalVisitMin, totalTravelMin, totalBufferMin };
}

export async function exportTripToExcel(
  trip: ItinerarySnapshot,
  options: ExportOptions = {}
): Promise<void> {
  const distanceUnit = options.distanceUnit || "metric";
  const timeFormat = options.timeFormat || "12h";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RE-ROUTE Intelligent Travel Planner";
  workbook.lastModifiedBy = "RE-ROUTE";
  workbook.created = new Date();
  workbook.modified = new Date();

  // -------------------------------------------------------------------------
  // SHEET 1: ✈️ TRIP OVERVIEW
  // -------------------------------------------------------------------------
  const overviewSheet = workbook.addWorksheet("✈️ Trip Overview", {
    properties: { tabColor: { argb: COLORS.NAVY_HEADER } },
    views: [{ showGridLines: true }],
  });

  // Set column widths for overview
  overviewSheet.columns = [
    { width: 5 },   // A: Spacing
    { width: 24 },  // B: Key / Metric Label
    { width: 34 },  // C: Value / Name
    { width: 22 },  // D: Metric 2 / Detail
    { width: 38 },  // E: Description / Address
    { width: 18 },  // F: Status / Extra
    { width: 5 },   // G: Right margin
  ];

  // Title Banner
  overviewSheet.addRow([]);
  const titleRow = overviewSheet.addRow([
    "",
    `RE-ROUTE ITINERARY: ${trip.title.toUpperCase()}`,
  ]);
  overviewSheet.mergeCells("B2:F2");
  titleRow.getCell(2).font = {
    name: FONT_FAMILY,
    size: 16,
    bold: true,
    color: { argb: COLORS.WHITE },
  };
  titleRow.getCell(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.NAVY_HEADER },
  };
  titleRow.getCell(2).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleRow.height = 34;

  // Subtitle info row
  const dateRangeStr =
    trip.dateMode === "fixed" && trip.startDate && trip.endDate
      ? `${trip.startDate} to ${trip.endDate} (${trip.days} Days)`
      : `${trip.days} Day Trip`;
  const exportTimestampStr = `Exported on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`;
  const subRow = overviewSheet.addRow([
    "",
    `📅 ${dateRangeStr}   •   ⏱️ Daily Window: ${trip.dayStartTime || "09:00"} - ${trip.dayEndTime || "22:00"}   •   ${exportTimestampStr}`,
  ]);
  overviewSheet.mergeCells("B3:F3");
  subRow.getCell(2).font = {
    name: FONT_FAMILY,
    size: 9.5,
    italic: true,
    color: { argb: COLORS.TEXT_MUTED },
  };
  subRow.getCell(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.SLATE_CARD },
  };
  subRow.getCell(2).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  subRow.height = 22;

  overviewSheet.addRow([]); // Blank spacing

  // Section: Executive Summary KPI Card
  const kpiHeaderRow = overviewSheet.addRow(["", "TRIP SUMMARY & METRICS"]);
  overviewSheet.mergeCells(`B5:F5`);
  kpiHeaderRow.getCell(2).font = {
    name: FONT_FAMILY,
    size: 11,
    bold: true,
    color: { argb: COLORS.WHITE },
  };
  kpiHeaderRow.getCell(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.INDIGO_PRIMARY },
  };
  kpiHeaderRow.getCell(2).alignment = { vertical: "middle", indent: 1 };
  kpiHeaderRow.height = 24;

  const totalDistanceMeters = trip.optimizedRoutes.reduce(
    (acc, r) => acc + (r.totalDistance || 0),
    0
  );
  const totalTravelSec = trip.optimizedRoutes.reduce(
    (acc, r) => acc + (r.totalTime || 0),
    0
  );
  const totalVisitSec = trip.optimizedRoutes.reduce(
    (acc, r) => acc + (r.totalVisitTime || 0),
    0
  );
  const assignedPlacesCount = trip.places.filter((p) => p.dayIndex !== null).length;
  const unassignedPlacesCount = trip.places.filter(
    (p) => p.dayIndex === null && !p.isDisabled
  ).length;

  let totalBufferMinAcrossTrip = 0;
  trip.optimizedRoutes.forEach((r, i) => {
    const { totalBufferMin } = computeDaySchedule(trip, r, i);
    totalBufferMinAcrossTrip += totalBufferMin;
  });
  const totalPlannedMin =
    Math.round((totalTravelSec + totalVisitSec) / 60) + totalBufferMinAcrossTrip;

  const kpiData: [string, string, string, string][] = [
    ["Total Duration", `${trip.days} Days`, "Primary Travel Mode", getTravelModeIcon(trip.travelMode)],
    ["Scheduled Sights", `${assignedPlacesCount} Places`, "Reserve / Unassigned", `${unassignedPlacesCount} Places`],
    [
      "Total Route Distance",
      formatDistance(totalDistanceMeters, distanceUnit),
      "Estimated Travel Time",
      formatDuration(Math.round(totalTravelSec / 60)),
    ],
    [
      "Total Activity Time",
      formatDuration(Math.round(totalVisitSec / 60)),
      "Total Buffers / Breaks",
      formatDuration(totalBufferMinAcrossTrip),
    ],
    [
      "Total Planned Time",
      formatDuration(totalPlannedMin),
      "Buffer Accounting",
      totalBufferMinAcrossTrip > 0 ? "Includes custom & wait buffers" : "Direct transit & visits only",
    ],
  ];

  kpiData.forEach((row, idx) => {
    const kpiR = overviewSheet.addRow(["", row[0], row[1], row[2], row[3]]);
    overviewSheet.mergeCells(`E${kpiR.number}:F${kpiR.number}`);
    kpiR.height = 22;
    const isEven = idx % 2 === 0;
    const bg = isEven ? COLORS.SLATE_ZEBRA : COLORS.WHITE;

    [2, 3, 4, 5].forEach((colIdx) => {
      const cell = kpiR.getCell(colIdx);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        left: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        right: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
      };
      if (colIdx === 2 || colIdx === 4) {
        cell.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: COLORS.TEXT_MUTED } };
      } else {
        cell.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.TEXT_MAIN } };
      }
    });
  });

  overviewSheet.addRow([]); // Blank spacing

  // Flight schedule table (if flights enabled)
  if (trip.showFlights && (trip.arrivalFlight || trip.departureFlight)) {
    const flightHeaderRow = overviewSheet.addRow(["", "FLIGHT DETAILS"]);
    overviewSheet.mergeCells(`B${flightHeaderRow.number}:F${flightHeaderRow.number}`);
    flightHeaderRow.getCell(2).font = {
      name: FONT_FAMILY,
      size: 11,
      bold: true,
      color: { argb: COLORS.WHITE },
    };
    flightHeaderRow.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.PURPLE_ACCENT },
    };
    flightHeaderRow.getCell(2).alignment = { vertical: "middle", indent: 1 };
    flightHeaderRow.height = 24;

    const flightSub = overviewSheet.addRow([
      "",
      "Type",
      "Scheduled Time",
      "Airport / Location",
      "Buffer / Ground Window",
      "Details",
    ]);
    flightSub.height = 20;
    [2, 3, 4, 5, 6].forEach((c) => {
      const cell = flightSub.getCell(c);
      cell.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: COLORS.NAVY_SUBHEADER } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.PURPLE_LIGHT } };
    });

    if (trip.arrivalFlight) {
      const arr = trip.arrivalFlight;
      const r = overviewSheet.addRow([
        "",
        "✈️ Inbound Arrival",
        formatMinutesToDisplay(parseTimeToMinutes(arr.time), timeFormat),
        arr.location?.name || "Arrival Airport",
        `${arr.buffer ?? 30} mins customs & ground transfer`,
        arr.location?.address || "",
      ]);
      r.height = 22;
      [2, 3, 4, 5, 6].forEach((c) => {
        r.getCell(c).font = { name: FONT_FAMILY, size: 9.5 };
        r.getCell(c).border = { bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } } };
      });
    }

    if (trip.departureFlight) {
      const dep = trip.departureFlight;
      const r = overviewSheet.addRow([
        "",
        "🛫 Outbound Departure",
        formatMinutesToDisplay(parseTimeToMinutes(dep.time), timeFormat),
        dep.location?.name || "Departure Airport",
        `${dep.buffer ?? 90} mins airport arrival & check-in`,
        dep.location?.address || "",
      ]);
      r.height = 22;
      [2, 3, 4, 5, 6].forEach((c) => {
        r.getCell(c).font = { name: FONT_FAMILY, size: 9.5 };
        r.getCell(c).border = { bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } } };
      });
    }

    overviewSheet.addRow([]); // Blank spacing
  }

  // Accommodations table
  if (trip.hotels && trip.hotels.length > 0) {
    const hotelHeaderRow = overviewSheet.addRow(["", "ACCOMMODATIONS & HOTELS"]);
    overviewSheet.mergeCells(`B${hotelHeaderRow.number}:F${hotelHeaderRow.number}`);
    hotelHeaderRow.getCell(2).font = {
      name: FONT_FAMILY,
      size: 11,
      bold: true,
      color: { argb: COLORS.WHITE },
    };
    hotelHeaderRow.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.AMBER_ACCENT },
    };
    hotelHeaderRow.getCell(2).alignment = { vertical: "middle", indent: 1 };
    hotelHeaderRow.height = 24;

    const hotelSub = overviewSheet.addRow([
      "",
      "Day",
      "Hotel Name",
      "Address",
      "Map Search",
      "Notes",
    ]);
    hotelSub.height = 20;
    [2, 3, 4, 5, 6].forEach((c) => {
      const cell = hotelSub.getCell(c);
      cell.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: COLORS.NAVY_SUBHEADER } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.AMBER_LIGHT } };
    });

    trip.hotels.forEach((hotel) => {
      const r = overviewSheet.addRow([
        "",
        `Day ${hotel.dayIndex + 1}`,
        hotel.name,
        hotel.address,
        {
          text: "Open Map ↗",
          hyperlink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel.name + " " + hotel.address)}`,
        },
        "Primary stay accommodation",
      ]);
      r.height = 22;
      [2, 3, 4, 5, 6].forEach((c) => {
        const cell = r.getCell(c);
        cell.font = { name: FONT_FAMILY, size: 9.5 };
        cell.border = { bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } } };
      });
      r.getCell(5).font = { name: FONT_FAMILY, size: 9.5, color: { argb: COLORS.LINK_BLUE }, underline: true };
    });

    overviewSheet.addRow([]); // Blank spacing
  }

  // Day-by-Day Quick Matrix
  const matrixHeaderRow = overviewSheet.addRow(["", "DAY-BY-DAY ITINERARY AT A GLANCE"]);
  overviewSheet.mergeCells(`B${matrixHeaderRow.number}:F${matrixHeaderRow.number}`);
  matrixHeaderRow.getCell(2).font = {
    name: FONT_FAMILY,
    size: 11,
    bold: true,
    color: { argb: COLORS.WHITE },
  };
  matrixHeaderRow.getCell(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.NAVY_HEADER },
  };
  matrixHeaderRow.getCell(2).alignment = { vertical: "middle", indent: 1 };
  matrixHeaderRow.height = 24;

  const matrixCols = overviewSheet.addRow([
    "",
    "Day # & Date",
    "Stops Summary",
    "Stop Count",
    "Transit Distance",
    "Est. Schedule Time",
  ]);
  matrixCols.height = 20;
  [2, 3, 4, 5, 6].forEach((c) => {
    const cell = matrixCols.getCell(c);
    cell.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: COLORS.NAVY_SUBHEADER } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.SLATE_CARD } };
  });

  trip.optimizedRoutes.forEach((route, i) => {
    const customTitle = route.title || trip.dayTitles?.[i];
    let dayDateLabel = customTitle ? `${customTitle} (Day ${i + 1})` : `Day ${i + 1}`;
    if (trip.dateMode === "fixed" && trip.startDate) {
      const d = addDays(parseISO(trip.startDate), i);
      dayDateLabel = customTitle
        ? `${customTitle} • Day ${i + 1} (${format(d, "EEE, MMM d")})`
        : `Day ${i + 1} (${format(d, "EEE, MMM d")})`;
    }
    const stopsList = route.stops.map((s) => s.name).join(" → ");
    const distanceStr = formatDistance(route.totalDistance, distanceUnit);
    const { totalBufferMin } = computeDaySchedule(trip, route, i);
    const bufferStr = totalBufferMin > 0 ? ` + ${formatDuration(totalBufferMin)} buffer` : "";
    const durationStr = `${formatDuration(Math.round(route.totalVisitTime / 60))} visit + ${formatDuration(Math.round(route.totalTime / 60))} travel${bufferStr}`;

    const r = overviewSheet.addRow([
      "",
      dayDateLabel,
      stopsList || "Free Day / Rest",
      `${route.stops.length} stops`,
      distanceStr,
      durationStr,
    ]);
    r.height = 24;
    const isEven = i % 2 === 0;
    const bg = isEven ? COLORS.SLATE_ZEBRA : COLORS.WHITE;
    [2, 3, 4, 5, 6].forEach((c) => {
      const cell = r.getCell(c);
      cell.font = { name: FONT_FAMILY, size: 9.5 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = { bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } } };
    });
    r.getCell(2).font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: COLORS.TEXT_MAIN } };
    r.getCell(4).alignment = { horizontal: "center" };
  });

  overviewSheet.addRow([]); // Blank spacing

  // Category Breakdown Table
  const catHeaderRow = overviewSheet.addRow(["", "ACTIVITY & CATEGORY BREAKDOWN"]);
  overviewSheet.mergeCells(`B${catHeaderRow.number}:F${catHeaderRow.number}`);
  catHeaderRow.getCell(2).font = {
    name: FONT_FAMILY,
    size: 11,
    bold: true,
    color: { argb: COLORS.WHITE },
  };
  catHeaderRow.getCell(2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.EMERALD_ACCENT },
  };
  catHeaderRow.getCell(2).alignment = { vertical: "middle", indent: 1 };
  catHeaderRow.height = 24;

  const catCols = overviewSheet.addRow([
    "",
    "Category",
    "Places Count",
    "Estimated Time",
    "Share of Activities",
    "Common Activities",
  ]);
  catCols.height = 20;
  [2, 3, 4, 5, 6].forEach((c) => {
    const cell = catCols.getCell(c);
    cell.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: COLORS.NAVY_SUBHEADER } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.EMERALD_LIGHT } };
  });

  // Count categories
  const catStats: Record<string, { count: number; duration: number }> = {};
  trip.places.forEach((p) => {
    if (!catStats[p.category]) {
      catStats[p.category] = { count: 0, duration: 0 };
    }
    catStats[p.category].count += 1;
    catStats[p.category].duration += p.estimatedDuration || 60;
  });

  const totalPlaceCount = trip.places.length || 1;
  Object.entries(catStats)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([cat, stats], idx) => {
      const emoji = getCategoryEmoji(cat as PlaceCategory);
      const label = getCategoryLabel(cat as PlaceCategory);
      const pct = Math.round((stats.count / totalPlaceCount) * 100);

      const r = overviewSheet.addRow([
        "",
        `${emoji} ${label}`,
        `${stats.count} places`,
        formatDuration(stats.duration),
        `${pct}%`,
        "",
      ]);
      r.height = 20;
      const isEven = idx % 2 === 0;
      const bg = isEven ? COLORS.SLATE_ZEBRA : COLORS.WHITE;
      [2, 3, 4, 5, 6].forEach((c) => {
        const cell = r.getCell(c);
        cell.font = { name: FONT_FAMILY, size: 9.5 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.border = { bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } } };
      });
      r.getCell(3).alignment = { horizontal: "center" };
      r.getCell(5).alignment = { horizontal: "center" };
    });

  // -------------------------------------------------------------------------
  // HELPER: Build detailed schedule rows into any target worksheet
  // -------------------------------------------------------------------------
  const buildScheduleTable = (
    sheet: ExcelJS.Worksheet,
    routesToInclude: { route: DayRoute; dayIdx: number }[]
  ) => {
    // Configure columns
    sheet.columns = [
      { width: 14 }, // A: Time Window
      { width: 18 }, // B: Category / Type
      { width: 28 }, // C: Place Name
      { width: 22 }, // D: Romanized / Local
      { width: 12 }, // E: Duration
      { width: 34 }, // F: Highlight / Must-Try
      { width: 22 }, // G: Reservation / Booking
      { width: 14 }, // H: Est. Price
      { width: 22 }, // I: Transit to Next
      { width: 34 }, // J: Address
      { width: 16 }, // K: Google Maps
      { width: 28 }, // L: Notes & Tips
    ];

    routesToInclude.forEach(({ route, dayIdx }) => {
      const { items, totalVisitMin, totalTravelMin, totalBufferMin } = computeDaySchedule(trip, route, dayIdx);

      let dayTitle = `DAY ${dayIdx + 1}`;
      if (trip.dateMode === "fixed" && trip.startDate) {
        const d = addDays(parseISO(trip.startDate), dayIdx);
        dayTitle = `DAY ${dayIdx + 1} — ${format(d, "EEEE, MMMM d, yyyy").toUpperCase()}`;
      }

      // Hotel accommodation indicator
      const hotelInfo = route.startHotel ? `🏨 Base: ${route.startHotel.name}` : "";
      const bufferStats = totalBufferMin > 0 ? ` + ${formatDuration(totalBufferMin)} buffer` : "";
      const statsInfo = `📍 ${route.stops.length} Stops  •  ⏱️ ${formatDuration(totalVisitMin)} visit + ${formatDuration(totalTravelMin)} travel${bufferStats}  •  📏 ${formatDistance(route.totalDistance, distanceUnit)}`;

      // Day Header Banner Row
      const dayHeaderRow = sheet.addRow([`${dayTitle}   ${hotelInfo ? "  |  " + hotelInfo : ""}`]);
      sheet.mergeCells(`A${dayHeaderRow.number}:L${dayHeaderRow.number}`);
      dayHeaderRow.getCell(1).font = {
        name: FONT_FAMILY,
        size: 12,
        bold: true,
        color: { argb: COLORS.WHITE },
      };
      dayHeaderRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.NAVY_HEADER },
      };
      dayHeaderRow.getCell(1).alignment = { vertical: "middle", indent: 1 };
      dayHeaderRow.height = 28;

      // Day stats subtitle row
      const dayStatsRow = sheet.addRow([statsInfo]);
      sheet.mergeCells(`A${dayStatsRow.number}:L${dayStatsRow.number}`);
      dayStatsRow.getCell(1).font = {
        name: FONT_FAMILY,
        size: 9.5,
        bold: true,
        color: { argb: COLORS.NAVY_SUBHEADER },
      };
      dayStatsRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.INDIGO_LIGHT },
      };
      dayStatsRow.getCell(1).alignment = { vertical: "middle", indent: 1 };
      dayStatsRow.height = 20;

      // Table Header Row
      const colHeaders = [
        "Time Window",
        "Type / Category",
        "Place Name",
        "Romanized / Local",
        "Duration",
        "Must-Try Highlight",
        "Reservation / Tickets",
        "Est. Price",
        "Transit to Next",
        "Address",
        "Google Maps",
        "Notes & Tips",
      ];
      const headerRow = sheet.addRow(colHeaders);
      headerRow.height = 22;
      for (let c = 1; c <= 12; c++) {
        const cell = headerRow.getCell(c);
        cell.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: COLORS.NAVY_SUBHEADER } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.SLATE_CARD } };
        cell.border = {
          top: { style: "thin", color: { argb: COLORS.BORDER_MEDIUM } },
          bottom: { style: "medium", color: { argb: COLORS.NAVY_SUBHEADER } },
          left: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
          right: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        };
        cell.alignment = { vertical: "middle", horizontal: c === 1 || c === 5 || c === 8 ? "center" : "left" };
      }

      // Render items
      items.forEach((item, itemIdx) => {
        const isEven = itemIdx % 2 === 0;
        let bg = isEven ? COLORS.SLATE_ZEBRA : COLORS.WHITE;

        // Custom styling per item type
        let typeLabel = "Attraction";
        if (item.type === "flight-arrival") {
          typeLabel = "✈️ Flight Arrival";
          bg = COLORS.PURPLE_LIGHT;
        } else if (item.type === "flight-departure") {
          typeLabel = "🛫 Flight Departure";
          bg = COLORS.PURPLE_LIGHT;
        } else if (item.type === "hotel-start") {
          typeLabel = "🏨 Hotel Start";
          bg = COLORS.AMBER_LIGHT;
        } else if (item.type === "hotel-end") {
          typeLabel = "🏨 Hotel End";
          bg = COLORS.AMBER_LIGHT;
        } else if (item.type === "buffer") {
          typeLabel = "☕ Break / Buffer";
          bg = COLORS.BLUE_LIGHT;
        } else if (item.category) {
          typeLabel = `${getCategoryEmoji(item.category)} ${getCategoryLabel(item.category)}`;
        }

        const timeStr =
          item.duration > 0
            ? `${formatMinutesToDisplay(item.startTime, timeFormat)} - ${formatMinutesToDisplay(item.endTime, timeFormat)}`
            : formatMinutesToDisplay(item.startTime, timeFormat);

        let transitStr = "";
        if (item.transitToNext) {
          const modeIcon =
            item.transitToNext.mode === "walking"
              ? "🚶"
              : item.transitToNext.mode === "driving"
                ? "🚗"
                : "🚇";
          const customTag = item.transitToNext.isCustom ? " [Custom]" : "";
          transitStr = `${modeIcon} ${formatDuration(Math.round(item.transitToNext.time / 60))}${customTag} (${formatDistance(item.transitToNext.distance, distanceUnit)})`;
        }

        const r = sheet.addRow([
          timeStr,
          typeLabel,
          item.name,
          item.romanizedName || "-",
          item.duration > 0 ? formatDuration(item.duration) : "-",
          item.highlight || "-",
          item.reservation || "Not needed",
          item.price || "-",
          transitStr || "-",
          item.address || "-",
          item.googleMapsUrl
            ? { text: "Open Map ↗", hyperlink: item.googleMapsUrl }
            : "-",
          item.notes || "-",
        ]);

        r.height = 24;
        for (let c = 1; c <= 12; c++) {
          const cell = r.getCell(c);
          cell.font = { name: FONT_FAMILY, size: 9.5, color: { argb: COLORS.TEXT_MAIN } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
          cell.border = {
            top: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
            bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
            left: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
            right: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
          };
          cell.alignment = {
            vertical: "middle",
            horizontal: c === 1 || c === 5 ? "center" : "left",
            wrapText: c === 6 || c === 10 || c === 12,
          };
        }

        // Emphasis on place name
        r.getCell(3).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: COLORS.TEXT_MAIN } };

        // Link style
        if (item.googleMapsUrl) {
          r.getCell(11).font = {
            name: FONT_FAMILY,
            size: 9.5,
            color: { argb: COLORS.LINK_BLUE },
            underline: true,
          };
        }

        // Must-try highlight styling
        if (item.highlight && item.type === "place") {
          r.getCell(6).font = {
            name: FONT_FAMILY,
            size: 9,
            italic: true,
            color: { argb: COLORS.TEXT_MAIN },
          };
        }
      });

      // Day subtotal row
      const bufferCol = totalBufferMin > 0 ? `${formatDuration(totalVisitMin)} (+${formatDuration(totalBufferMin)} buf)` : formatDuration(totalVisitMin);
      const subtotalRow = sheet.addRow([
        `End of Day ${dayIdx + 1} Summary`,
        "",
        "",
        "",
        bufferCol,
        "",
        "",
        "",
        formatDuration(totalTravelMin),
        "",
        "",
        `Total Distance: ${formatDistance(route.totalDistance, distanceUnit)}`,
      ]);
      sheet.mergeCells(`A${subtotalRow.number}:D${subtotalRow.number}`);
      subtotalRow.height = 22;
      for (let c = 1; c <= 12; c++) {
        const cell = subtotalRow.getCell(c);
        cell.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: COLORS.NAVY_SUBHEADER } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.SLATE_CARD } };
        cell.border = {
          top: { style: "thin", color: { argb: COLORS.BORDER_MEDIUM } },
          bottom: { style: "medium", color: { argb: COLORS.NAVY_HEADER } },
        };
      }
      subtotalRow.getCell(5).alignment = { horizontal: "center" };
      subtotalRow.getCell(9).alignment = { horizontal: "left" };

      // Blank spacing between days
      sheet.addRow([]);
    });
  };

  // -------------------------------------------------------------------------
  // SHEET 2: 🗓️ FULL ITINERARY (All Days Unified)
  // -------------------------------------------------------------------------
  const fullItinerarySheet = workbook.addWorksheet("🗓️ Full Itinerary", {
    properties: { tabColor: { argb: COLORS.INDIGO_PRIMARY } },
    views: [{ state: "frozen", ySplit: 2, showGridLines: true }],
  });

  buildScheduleTable(
    fullItinerarySheet,
    trip.optimizedRoutes.map((route, dayIdx) => ({ route, dayIdx }))
  );

  // -------------------------------------------------------------------------
  // SHEETS 3..N: 📍 DAY 1, DAY 2... (Individual Daily Pages)
  // -------------------------------------------------------------------------
  trip.optimizedRoutes.forEach((route, dayIdx) => {
    const customTitle = route.title || trip.dayTitles?.[dayIdx];
    let tabName = customTitle ? `📍 ${customTitle.slice(0, 22)}` : `📍 Day ${dayIdx + 1}`;
    if (!customTitle && trip.dateMode === "fixed" && trip.startDate) {
      const d = addDays(parseISO(trip.startDate), dayIdx);
      tabName = `📍 Day ${dayIdx + 1} (${format(d, "MMM d")})`;
    }

    const daySheet = workbook.addWorksheet(tabName, {
      properties: { tabColor: { argb: COLORS.BLUE_ACCENT } },
      views: [{ state: "frozen", ySplit: 2, showGridLines: true }],
    });

    buildScheduleTable(daySheet, [{ route, dayIdx }]);
  });

  // -------------------------------------------------------------------------
  // FINAL SHEET: 📋 PLACES CATALOG (Master Directory)
  // -------------------------------------------------------------------------
  const catalogSheet = workbook.addWorksheet("📋 Places Catalog", {
    properties: { tabColor: { argb: COLORS.EMERALD_ACCENT } },
    views: [{ state: "frozen", ySplit: 2, showGridLines: true }],
  });

  catalogSheet.columns = [
    { width: 14 }, // A: Status
    { width: 8 },  // B: Starred
    { width: 28 }, // C: Place Name
    { width: 22 }, // D: Romanized Name
    { width: 18 }, // E: Category
    { width: 14 }, // F: Duration
    { width: 16 }, // G: Price Estimate
    { width: 20 }, // H: Reservation
    { width: 24 }, // I: Booking Window
    { width: 34 }, // J: Highlight
    { width: 36 }, // K: Description
    { width: 34 }, // L: Address
    { width: 16 }, // M: Google Maps
    { width: 26 }, // N: Notes
  ];

  // Header Banner
  const catTitleRow = catalogSheet.addRow(["ALL PLACES TO VISIT (MASTER CATALOG & DATABASE)"]);
  catalogSheet.mergeCells("A1:N1");
  catTitleRow.getCell(1).font = {
    name: FONT_FAMILY,
    size: 13,
    bold: true,
    color: { argb: COLORS.WHITE },
  };
  catTitleRow.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.NAVY_HEADER },
  };
  catTitleRow.getCell(1).alignment = { vertical: "middle", indent: 1 };
  catTitleRow.height = 30;

  // Table Column Headers
  const catHeaders = [
    "Schedule Status",
    "Must Visit",
    "Place Name",
    "Romanized Name",
    "Category",
    "Est. Duration",
    "Price Estimate",
    "Reservation Req.",
    "Booking Window",
    "Must-Try Highlight",
    "Description",
    "Address",
    "Google Maps Link",
    "Personal Notes",
  ];
  const catHeaderRowCells = catalogSheet.addRow(catHeaders);
  catHeaderRowCells.height = 24;

  for (let c = 1; c <= 14; c++) {
    const cell = catHeaderRowCells.getCell(c);
    cell.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: COLORS.NAVY_SUBHEADER } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.EMERALD_LIGHT } };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.BORDER_MEDIUM } },
      bottom: { style: "medium", color: { argb: COLORS.EMERALD_ACCENT } },
      left: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
      right: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
    };
    cell.alignment = { vertical: "middle", horizontal: c === 1 || c === 2 || c === 6 ? "center" : "left" };
  }

  // Populate all places
  trip.places.forEach((place, pIdx) => {
    const isEven = pIdx % 2 === 0;
    const bg = isEven ? COLORS.SLATE_ZEBRA : COLORS.WHITE;

    let statusStr = "Unassigned";
    if (place.isDisabled) {
      statusStr = "Excluded";
    } else if (place.dayIndex !== null) {
      statusStr = `Day ${place.dayIndex + 1}`;
    }

    const emoji = getCategoryEmoji(place.category);
    const catLabel = getCategoryLabel(place.category);
    const mapsLink = place.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address)}`
      : undefined;

    const r = catalogSheet.addRow([
      statusStr,
      place.isStarred ? "⭐ Yes" : "-",
      place.name,
      place.romanizedName || "-",
      `${emoji} ${catLabel}`,
      formatDuration(place.estimatedDuration || 60),
      place.priceEstimate || "-",
      place.reservation?.requirement
        ? place.reservation.requirement === "required"
          ? "Required"
          : place.reservation.requirement === "recommended"
            ? "Recommended"
            : "Walk-ins only"
        : "Not needed",
      place.reservation?.advanceTime || "-",
      place.highlight?.text || "-",
      place.description || "-",
      place.address || "-",
      mapsLink ? { text: "Open Map ↗", hyperlink: mapsLink } : "-",
      place.notes || "-",
    ]);

    r.height = 24;
    for (let c = 1; c <= 14; c++) {
      const cell = r.getCell(c);
      cell.font = { name: FONT_FAMILY, size: 9.5, color: { argb: COLORS.TEXT_MAIN } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        left: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        right: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: c === 1 || c === 2 || c === 6 ? "center" : "left",
        wrapText: c === 10 || c === 11 || c === 12 || c === 14,
      };
    }

    r.getCell(3).font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: COLORS.TEXT_MAIN } };

    if (mapsLink) {
      r.getCell(13).font = {
        name: FONT_FAMILY,
        size: 9.5,
        color: { argb: COLORS.LINK_BLUE },
        underline: true,
      };
    }
  });

  // Enable AutoFilter on Catalog
  catalogSheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: catalogSheet.rowCount, column: 14 },
  };

  // -------------------------------------------------------------------------
  // DOWNLOAD WORKBOOK IN BROWSER
  // -------------------------------------------------------------------------
  const buffer = await workbook.xlsx.writeBuffer();
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const sanitizedTitle = (trip.title || "Trip")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateStr = format(new Date(), "yyyy-MM-dd");
    a.download = `RE-ROUTE_Itinerary_${sanitizedTitle}_${dateStr}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return buffer as any;
}

// ---------------------------------------------------------------------------
// RESERVATIONS & BOOKING CHECKLIST EXCEL EXPORT
// ---------------------------------------------------------------------------

export interface ExportReservationsOptions extends ExportOptions {
  enrichedPlaces?: EnrichedReservationPlace[];
}

export async function exportReservationsChecklistToExcel(
  trip: ItinerarySnapshot,
  options: ExportReservationsOptions = {}
): Promise<number> {
  const timeFormat = options.timeFormat || "12h";

  // 1. Gather all reservation places
  const allEnriched: EnrichedReservationPlace[] =
    options.enrichedPlaces && options.enrichedPlaces.length > 0
      ? options.enrichedPlaces
      : trip.places
          .filter((p) => !p.isDisabled && isReservationRelevant(p))
          .map((p) => enrichReservationPlace(p, trip.startDate));

  // Filter specifically for required / recommended or booked / active voucher places
  const reservationItems = allEnriched.filter(
    (item) =>
      item.requirement === "required" ||
      item.requirement === "recommended" ||
      item.isBooked ||
      Boolean(item.place.reservation?.confirmationNumber)
  );

  if (reservationItems.length === 0) {
    return 0;
  }

  // 2. Map scheduled visit times from optimized routes
  const placeScheduleTimes = new Map<
    string,
    { startTime: number; endTime: number; dayIndex: number }
  >();
  if (trip.optimizedRoutes && trip.optimizedRoutes.length > 0) {
    trip.optimizedRoutes.forEach((route, dIdx) => {
      const schedule = computeDaySchedule(trip, route, dIdx);
      schedule.items.forEach((item) => {
        if (item.type === "place") {
          placeScheduleTimes.set(item.id, {
            startTime: item.startTime,
            endTime: item.endTime,
            dayIndex: dIdx,
          });
        }
      });
    });
  }

  // 3. Sort items: Action Needed (urgent) -> Soon -> Other unbooked -> Confirmed Booked
  reservationItems.sort((a, b) => {
    // Unbooked before booked
    if (a.isBooked !== b.isBooked) {
      return a.isBooked ? 1 : -1;
    }

    // Among unbooked, sort by urgency: urgent -> soon -> future -> unknown
    if (!a.isBooked && !b.isBooked) {
      const urgencyRank: Record<string, number> = {
        urgent: 1,
        soon: 2,
        future: 3,
        unknown: 4,
        booked: 5,
      };
      const rankDiff =
        (urgencyRank[a.urgency] || 99) - (urgencyRank[b.urgency] || 99);
      if (rankDiff !== 0) return rankDiff;

      // Within same urgency, sort by targetBookingDate ascending
      if (a.targetBookingDate && b.targetBookingDate) {
        const timeDiff =
          a.targetBookingDate.getTime() - b.targetBookingDate.getTime();
        if (timeDiff !== 0) return timeDiff;
      }
    }

    // Then by scheduled day & order
    const dayA = a.place.dayIndex ?? 999;
    const dayB = b.place.dayIndex ?? 999;
    if (dayA !== dayB) return dayA - dayB;

    const schedA = placeScheduleTimes.get(a.place.id);
    const schedB = placeScheduleTimes.get(b.place.id);
    if (schedA && schedB) {
      return schedA.startTime - schedB.startTime;
    }

    return a.place.name.localeCompare(b.place.name);
  });

  // Key KPI metrics
  const totalCount = reservationItems.length;
  const bookedCount = reservationItems.filter((i) => i.isBooked).length;
  const pendingCount = reservationItems.filter((i) => !i.isBooked).length;
  const urgentCount = reservationItems.filter(
    (i) => !i.isBooked && i.urgency === "urgent"
  ).length;
  const requiredCount = reservationItems.filter(
    (i) => i.requirement === "required"
  ).length;
  const recommendedCount = reservationItems.filter(
    (i) => i.requirement === "recommended"
  ).length;
  const readinessPct =
    totalCount > 0 ? Math.round((bookedCount / totalCount) * 100) : 0;

  // 4. Initialize Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RE-ROUTE Trip Planner";
  workbook.lastModifiedBy = "RE-ROUTE Trip Planner";
  workbook.created = new Date();
  workbook.modified = new Date();

  // -------------------------------------------------------------------------
  // SHEET 1: Reservations Checklist
  // -------------------------------------------------------------------------
  const checklistSheet = workbook.addWorksheet("Reservations Checklist", {
    views: [{ state: "frozen", ySplit: 8, xSplit: 0, showGridLines: true }],
    properties: { tabColor: { argb: COLORS.EMERALD_ACCENT } },
  });

  checklistSheet.columns = [
    { key: "status", width: 18 },        // 1: Status
    { key: "requirement", width: 16 },   // 2: Requirement
    { key: "name", width: 34 },          // 3: Place Name
    { key: "romanized", width: 24 },     // 4: Romanized / Native
    { key: "category", width: 20 },      // 5: Category
    { key: "visitDay", width: 28 },      // 6: Scheduled Day & Date
    { key: "visitTime", width: 18 },     // 7: Visit Time
    { key: "advanceNotice", width: 30 }, // 8: Booking Window / Notice
    { key: "targetDate", width: 20 },    // 9: Target Booking Date
    { key: "countdown", width: 28 },     // 10: Countdown / Urgency
    { key: "confirmNum", width: 22 },    // 11: Confirmation Code
    { key: "bookingLink", width: 20 },   // 12: Direct Booking Link
    { key: "notes", width: 42 },         // 13: Notes & Instructions
    { key: "address", width: 34 },       // 14: Address
    { key: "viewOnGoogle", width: 20 },  // 15: View on Google
  ];

  // Row 1: Margin
  checklistSheet.addRow([]);

  // Row 2: Title Block
  const titleRow = checklistSheet.addRow([
    "RE-ROUTE  •  RESERVATIONS & BOOKING CHECKLIST",
  ]);
  checklistSheet.mergeCells("A2:O2");
  const titleCell = checklistSheet.getCell("A2");
  titleCell.font = {
    name: FONT_FAMILY,
    size: 15,
    bold: true,
    color: { argb: COLORS.WHITE },
  };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.NAVY_HEADER },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleRow.height = 36;

  // Row 3: Subtitle / Metadata
  let datesStr = "Flexible Dates";
  if (trip.startDate) {
    try {
      const parsedStart = parseISO(trip.startDate);
      const parsedEnd = trip.endDate
        ? parseISO(trip.endDate)
        : addDays(parsedStart, trip.days - 1);
      datesStr = `${format(parsedStart, "MMM d, yyyy")} – ${format(parsedEnd, "MMM d, yyyy")}`;
    } catch {
      // ignore
    }
  }

  const subtitleRow = checklistSheet.addRow([
    `Trip: ${trip.title || "My Trip"}  |  ${datesStr}  |  Required: ${requiredCount}  •  Recommended: ${recommendedCount}  |  Exported: ${format(new Date(), "yyyy-MM-dd HH:mm")}`,
  ]);
  checklistSheet.mergeCells("A3:O3");
  const subtitleCell = checklistSheet.getCell("A3");
  subtitleCell.font = {
    name: FONT_FAMILY,
    size: 9.5,
    color: { argb: COLORS.TEXT_MUTED },
  };
  subtitleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.SLATE_CARD },
  };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  subtitleRow.height = 22;

  // Row 4: Spacer
  checklistSheet.addRow([]);

  // Rows 5-6: KPI Cards
  // Total (Cols A-C), Urgent (Cols D-F), Pending (Cols G-I), Booked (Cols J-L), Readiness (Cols M-O)
  checklistSheet.mergeCells("A5:C5");
  checklistSheet.mergeCells("A6:C6");
  checklistSheet.mergeCells("D5:F5");
  checklistSheet.mergeCells("D6:F6");
  checklistSheet.mergeCells("G5:I5");
  checklistSheet.mergeCells("G6:I6");
  checklistSheet.mergeCells("J5:L5");
  checklistSheet.mergeCells("J6:L6");
  checklistSheet.mergeCells("M5:O5");
  checklistSheet.mergeCells("M6:O6");

  const kpiValRow = checklistSheet.getRow(5);
  const kpiLblRow = checklistSheet.getRow(6);
  kpiValRow.height = 28;
  kpiLblRow.height = 18;

  const cardBorder = {
    top: { style: "thin" as const, color: { argb: COLORS.BORDER_LIGHT } },
    bottom: { style: "thin" as const, color: { argb: COLORS.BORDER_LIGHT } },
    left: { style: "thin" as const, color: { argb: COLORS.BORDER_LIGHT } },
    right: { style: "thin" as const, color: { argb: COLORS.BORDER_LIGHT } },
  };

  const styleCard = (
    valCol: string,
    lblCol: string,
    valText: string,
    lblText: string,
    valColor: string,
    bgColor: string
  ) => {
    const valCell = checklistSheet.getCell(`${valCol}5`);
    valCell.value = valText;
    valCell.font = {
      name: FONT_FAMILY,
      size: 16,
      bold: true,
      color: { argb: valColor },
    };
    valCell.alignment = { vertical: "middle", horizontal: "center" };
    valCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgColor },
    };
    valCell.border = cardBorder;

    const lblCell = checklistSheet.getCell(`${lblCol}6`);
    lblCell.value = lblText;
    lblCell.font = {
      name: FONT_FAMILY,
      size: 8.5,
      bold: true,
      color: { argb: COLORS.TEXT_MUTED },
    };
    lblCell.alignment = { vertical: "middle", horizontal: "center" };
    lblCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgColor },
    };
    lblCell.border = cardBorder;
  };

  styleCard(
    "A",
    "A",
    `${totalCount}`,
    "📋 TOTAL RESERVATIONS",
    COLORS.INDIGO_PRIMARY,
    COLORS.INDIGO_LIGHT
  );
  styleCard(
    "D",
    "D",
    `${urgentCount}`,
    "🚨 ACTION NEEDED (< 7 DAYS)",
    urgentCount > 0 ? COLORS.ROSE_ACCENT : COLORS.TEXT_MUTED,
    urgentCount > 0 ? COLORS.ROSE_LIGHT : COLORS.SLATE_CARD
  );
  styleCard(
    "G",
    "G",
    `${pendingCount}`,
    "⏰ PENDING ACTION",
    COLORS.AMBER_ACCENT,
    COLORS.AMBER_LIGHT
  );
  styleCard(
    "J",
    "J",
    `${bookedCount}`,
    "✅ CONFIRMED & BOOKED",
    COLORS.EMERALD_ACCENT,
    COLORS.EMERALD_LIGHT
  );
  styleCard(
    "M",
    "M",
    `${readinessPct}%`,
    "🎯 TRIP READINESS",
    COLORS.INDIGO_PRIMARY,
    COLORS.INDIGO_LIGHT
  );

  // Row 7: Spacer
  checklistSheet.addRow([]);

  // Row 8: Table Header
  const headers = [
    "Status",
    "Requirement",
    "Place Name",
    "Romanized / Subtitle",
    "Category",
    "Scheduled Day & Date",
    "Visit Time",
    "Booking Window / Timing",
    "Target Booking Date",
    "Booking Status / Countdown",
    "Confirmation #",
    "Booking Link",
    "Reservation Notes & Instructions",
    "Address",
    "View on Google",
  ];
  const headerRow = checklistSheet.addRow(headers);
  headerRow.height = 26;

  for (let c = 1; c <= 15; c++) {
    const cell = headerRow.getCell(c);
    cell.font = {
      name: FONT_FAMILY,
      size: 9.5,
      bold: true,
      color: { argb: COLORS.WHITE },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.NAVY_HEADER },
    };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.NAVY_HEADER } },
      bottom: { style: "medium", color: { argb: COLORS.INDIGO_PRIMARY } },
      left: { style: "thin", color: { argb: COLORS.NAVY_SUBHEADER } },
      right: { style: "thin", color: { argb: COLORS.NAVY_SUBHEADER } },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal:
        c === 1 ||
        c === 2 ||
        c === 5 ||
        c === 6 ||
        c === 7 ||
        c === 9 ||
        c === 11 ||
        c === 12 ||
        c === 15
          ? "center"
          : "left",
    };
  }

  // Row 9+: Data Rows
  reservationItems.forEach((item, idx) => {
    const {
      place,
      targetBookingDate,
      countdownLabel,
      isBooked,
      requirement,
      urgency,
    } = item;
    const isEven = idx % 2 === 0;
    const baseBg = isEven ? COLORS.SLATE_ZEBRA : COLORS.WHITE;

    // Status Label & Styling
    let statusText = "[ ] Pending";
    let statusBg = COLORS.SLATE_CARD;
    let statusColor = COLORS.TEXT_MUTED;

    if (isBooked) {
      statusText = "[X] Confirmed";
      statusBg = COLORS.EMERALD_LIGHT;
      statusColor = COLORS.EMERALD_ACCENT;
    } else if (urgency === "urgent") {
      statusText = "[ ] Action Needed";
      statusBg = COLORS.ROSE_LIGHT;
      statusColor = COLORS.ROSE_ACCENT;
    } else if (urgency === "soon") {
      statusText = "[ ] Opens Soon";
      statusBg = COLORS.AMBER_LIGHT;
      statusColor = COLORS.AMBER_ACCENT;
    }

    // Requirement Text & Styling
    const reqText =
      requirement === "required"
        ? "🔴 Required"
        : requirement === "recommended"
          ? "🟡 Recommended"
          : "Walk-in";
    const reqBg =
      requirement === "required"
        ? COLORS.ROSE_LIGHT
        : requirement === "recommended"
          ? COLORS.AMBER_LIGHT
          : baseBg;
    const reqColor =
      requirement === "required"
        ? COLORS.ROSE_ACCENT
        : requirement === "recommended"
          ? COLORS.AMBER_ACCENT
          : COLORS.TEXT_MUTED;

    // Scheduled Day & Date
    const dayText =
      place.dayIndex !== null && place.dayIndex !== undefined
        ? formatDayIndexLabel(place.dayIndex, trip.startDate, trip.dayTitles)
        : "Unassigned (Reserve List)";

    // Scheduled Visit Time
    let timeText = "Flexible / TBD";
    const sched = placeScheduleTimes.get(place.id);
    if (place.customTime) {
      timeText = `${formatMinutesToDisplay(parseTimeToMinutes(place.customTime), timeFormat)} (Locked)`;
    } else if (sched) {
      timeText = `~${formatMinutesToDisplay(sched.startTime, timeFormat)} (${formatDuration(sched.endTime - sched.startTime)})`;
    }

    const emoji = getCategoryEmoji(place.category);
    const catLabel = getCategoryLabel(place.category);

    const targetDateText = targetBookingDate
      ? format(targetBookingDate, "yyyy-MM-dd (EEE)")
      : "-";

    const bookingUrl = place.reservation?.bookingUrl;
    const mapsUrl = place.address?.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address.trim())}`
      : place.lat && place.lng
        ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`;

    const row = checklistSheet.addRow([
      statusText,
      reqText,
      place.name,
      place.romanizedName || "-",
      `${emoji} ${catLabel}`,
      dayText,
      timeText,
      place.reservation?.advanceTime || "-",
      targetDateText,
      countdownLabel,
      place.reservation?.confirmationNumber || "-",
      bookingUrl ? { text: "Book Online ↗", hyperlink: bookingUrl } : "-",
      place.reservation?.notes || place.notes || "-",
      place.address || "-",
      mapsUrl ? { text: "View on Google ↗", hyperlink: mapsUrl } : "-",
    ]);

    row.height = 24;

    for (let c = 1; c <= 15; c++) {
      const cell = row.getCell(c);
      cell.font = {
        name: FONT_FAMILY,
        size: 9.5,
        color: { argb: COLORS.TEXT_MAIN },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: baseBg },
      };
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        left: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        right: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal:
          c === 1 ||
          c === 2 ||
          c === 5 ||
          c === 6 ||
          c === 7 ||
          c === 9 ||
          c === 11 ||
          c === 12 ||
          c === 15
            ? "center"
            : "left",
        wrapText: c === 8 || c === 10 || c === 13 || c === 14,
      };
    }

    // Specific highlight styling for Status
    const statusCell = row.getCell(1);
    statusCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: statusBg },
    };
    statusCell.font = {
      name: FONT_FAMILY,
      size: 9.5,
      bold: true,
      color: { argb: statusColor },
    };

    // Specific highlight styling for Requirement
    const reqCell = row.getCell(2);
    reqCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: reqBg },
    };
    reqCell.font = {
      name: FONT_FAMILY,
      size: 9.5,
      bold: true,
      color: { argb: reqColor },
    };

    // Place Name Bold
    row.getCell(3).font = {
      name: FONT_FAMILY,
      size: 9.5,
      bold: true,
      color: { argb: COLORS.TEXT_MAIN },
    };

    // Romanized muted
    row.getCell(4).font = {
      name: FONT_FAMILY,
      size: 9,
      color: { argb: COLORS.TEXT_MUTED },
    };

    // Hyperlinks
    if (bookingUrl) {
      row.getCell(12).font = {
        name: FONT_FAMILY,
        size: 9.5,
        color: { argb: COLORS.LINK_BLUE },
        underline: true,
      };
    }
    if (mapsUrl) {
      row.getCell(15).font = {
        name: FONT_FAMILY,
        size: 9.5,
        color: { argb: COLORS.LINK_BLUE },
        underline: true,
      };
    }
  });

  // Enable AutoFilter on Table
  checklistSheet.autoFilter = {
    from: { row: 8, column: 1 },
    to: { row: 8 + reservationItems.length, column: 15 },
  };

  // -------------------------------------------------------------------------
  // SHEET 2: Confirmed Bookings (Offline Voucher Reference)
  // Only created if there is at least one confirmed booking
  // -------------------------------------------------------------------------
  const confirmedItems = reservationItems.filter((i) => i.isBooked);
  if (confirmedItems.length > 0) {
    const voucherSheet = workbook.addWorksheet("Confirmed Vouchers", {
      views: [{ state: "frozen", ySplit: 4, xSplit: 0, showGridLines: true }],
      properties: { tabColor: { argb: COLORS.EMERALD_ACCENT } },
    });

    voucherSheet.columns = [
      { key: "confirmNum", width: 22 },    // 1: Confirmation #
      { key: "name", width: 34 },          // 2: Place Name
      { key: "category", width: 20 },      // 3: Category
      { key: "visitDay", width: 28 },      // 4: Scheduled Day & Date
      { key: "visitTime", width: 18 },     // 5: Visit Time
      { key: "bookingLink", width: 20 },   // 6: Direct Booking Link
      { key: "notes", width: 42 },         // 7: Notes & Instructions
      { key: "address", width: 34 },       // 8: Address
      { key: "viewOnGoogle", width: 20 },  // 9: View on Google
    ];

    voucherSheet.addRow([]);
    const vTitleRow = voucherSheet.addRow([
      "RE-ROUTE  •  CONFIRMED BOOKINGS & VOUCHERS",
    ]);
    voucherSheet.mergeCells("A2:I2");
    const vTitleCell = voucherSheet.getCell("A2");
    vTitleCell.font = {
      name: FONT_FAMILY,
      size: 14,
      bold: true,
      color: { argb: COLORS.WHITE },
    };
    vTitleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.EMERALD_ACCENT },
    };
    vTitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    vTitleRow.height = 32;

    voucherSheet.addRow([]);

    const vHeaders = [
      "Confirmation #",
      "Place Name",
      "Category",
      "Scheduled Day & Date",
      "Visit Time",
      "Booking Link",
      "Reservation Notes & Instructions",
      "Address",
      "View on Google",
    ];
    const vHeaderRow = voucherSheet.addRow(vHeaders);
    vHeaderRow.height = 24;

    for (let c = 1; c <= 9; c++) {
      const cell = vHeaderRow.getCell(c);
      cell.font = {
        name: FONT_FAMILY,
        size: 9.5,
        bold: true,
        color: { argb: COLORS.WHITE },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.NAVY_HEADER },
      };
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.NAVY_HEADER } },
        bottom: { style: "medium", color: { argb: COLORS.EMERALD_ACCENT } },
        left: { style: "thin", color: { argb: COLORS.NAVY_SUBHEADER } },
        right: { style: "thin", color: { argb: COLORS.NAVY_SUBHEADER } },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal:
          c === 1 || c === 3 || c === 4 || c === 5 || c === 6 || c === 9
            ? "center"
            : "left",
      };
    }

    confirmedItems.forEach((item, idx) => {
      const { place } = item;
      const isEven = idx % 2 === 0;
      const baseBg = isEven ? COLORS.SLATE_ZEBRA : COLORS.WHITE;

      const dayText =
        place.dayIndex !== null && place.dayIndex !== undefined
          ? formatDayIndexLabel(place.dayIndex, trip.startDate, trip.dayTitles)
          : "Unassigned";

      let timeText = "Flexible / TBD";
      const sched = placeScheduleTimes.get(place.id);
      if (place.customTime) {
        timeText = `${formatMinutesToDisplay(parseTimeToMinutes(place.customTime), timeFormat)} (Locked)`;
      } else if (sched) {
        timeText = `~${formatMinutesToDisplay(sched.startTime, timeFormat)}`;
      }

      const emoji = getCategoryEmoji(place.category);
      const catLabel = getCategoryLabel(place.category);
      const bookingUrl = place.reservation?.bookingUrl;
      const mapsUrl = place.address?.trim()
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address.trim())}`
        : place.lat && place.lng
          ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`;

      const vRow = voucherSheet.addRow([
        place.reservation?.confirmationNumber || "-",
        place.name,
        `${emoji} ${catLabel}`,
        dayText,
        timeText,
        bookingUrl ? { text: "Open Booking ↗", hyperlink: bookingUrl } : "-",
        place.reservation?.notes || place.notes || "-",
        place.address || "-",
        mapsUrl ? { text: "View on Google ↗", hyperlink: mapsUrl } : "-",
      ]);

      vRow.height = 24;

      for (let c = 1; c <= 9; c++) {
        const cell = vRow.getCell(c);
        cell.font = {
          name: FONT_FAMILY,
          size: 9.5,
          color: { argb: COLORS.TEXT_MAIN },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: baseBg },
        };
        cell.border = {
          top: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
          bottom: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
          left: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
          right: { style: "thin", color: { argb: COLORS.BORDER_LIGHT } },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal:
            c === 1 || c === 3 || c === 4 || c === 5 || c === 6 || c === 9
              ? "center"
              : "left",
          wrapText: c === 7 || c === 8,
        };
      }

      // Confirmation # bold highlight
      vRow.getCell(1).font = {
        name: FONT_FAMILY,
        size: 9.5,
        bold: true,
        color: { argb: COLORS.EMERALD_ACCENT },
      };
      vRow.getCell(2).font = {
        name: FONT_FAMILY,
        size: 9.5,
        bold: true,
        color: { argb: COLORS.TEXT_MAIN },
      };

      if (bookingUrl) {
        vRow.getCell(6).font = {
          name: FONT_FAMILY,
          size: 9.5,
          color: { argb: COLORS.LINK_BLUE },
          underline: true,
        };
      }
      if (mapsUrl) {
        vRow.getCell(9).font = {
          name: FONT_FAMILY,
          size: 9.5,
          color: { argb: COLORS.LINK_BLUE },
          underline: true,
        };
      }
    });

    voucherSheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + confirmedItems.length, column: 9 },
    };
  }

  // -------------------------------------------------------------------------
  // DOWNLOAD WORKBOOK IN BROWSER
  // -------------------------------------------------------------------------
  const buffer = await workbook.xlsx.writeBuffer();
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const sanitizedTitle = (trip.title || "Trip")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateStr = format(new Date(), "yyyy-MM-dd");
    a.download = `RE-ROUTE_Reservations_Checklist_${sanitizedTitle}_${dateStr}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return reservationItems.length;
}

