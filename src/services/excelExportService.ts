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
  };
  googleMapsUrl?: string;
}

function computeDaySchedule(
  trip: ItinerarySnapshot,
  route: DayRoute,
  dayIndex: number
): { items: ComputedScheduleItem[]; totalVisitMin: number; totalTravelMin: number } {
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

  // Determine item sequence
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
    }
    if (trip.showFlights && isLastDay && trip.departureFlight && !ids.includes("departure")) {
      ids.push("departure");
    }
  }

  if (isLastDay) {
    ids = ids.filter((id) => id !== "end-hotel");
  }

  const items: ComputedScheduleItem[] = [];
  let physicalSegmentIdx = 0;
  let currentDate: Date | null = null;
  if (trip.dateMode === "fixed" && trip.startDate) {
    currentDate = addDays(parseISO(trip.startDate), dayIndex);
  }

  ids.forEach((itemId) => {
    if (itemId === "arrival" && trip.arrivalFlight) {
      const arrMin = parseTimeToMinutes(trip.arrivalFlight.time);
      const arrBuffer = trip.arrivalFlight.buffer ?? 30;
      const startT = arrMin;
      const endT = arrMin + arrBuffer;
      items.push({
        id: "arrival",
        type: "flight-arrival",
        name: trip.arrivalFlight.location?.name
          ? `Flight Arrival (${trip.arrivalFlight.location.name})`
          : "Flight Arrival",
        startTime: startT,
        duration: arrBuffer,
        endTime: endT,
        highlight: "Clear customs, baggage claim & ground transfer",
        address: trip.arrivalFlight.location?.address || "",
        googleMapsUrl: trip.arrivalFlight.location?.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.arrivalFlight.location.name + " " + trip.arrivalFlight.location.address)}`
          : undefined,
      });
      currentTime = Math.max(currentTime, endT);
    } else if (itemId === "departure" && trip.departureFlight) {
      const depMin = parseTimeToMinutes(trip.departureFlight.time);
      const depBuffer = trip.departureFlight.buffer ?? 90;
      const startT = depMin - depBuffer;
      items.push({
        id: "departure",
        type: "flight-departure",
        name: trip.departureFlight.location?.name
          ? `Flight Departure (${trip.departureFlight.location.name})`
          : "Flight Departure",
        startTime: startT,
        duration: depBuffer,
        endTime: depMin,
        highlight: "Airport check-in, security screening & boarding",
        address: trip.departureFlight.location?.address || "",
        googleMapsUrl: trip.departureFlight.location?.address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.departureFlight.location.name + " " + trip.departureFlight.location.address)}`
          : undefined,
      });
    } else if (itemId === "start-hotel" && route.startHotel) {
      items.push({
        id: "start-hotel",
        type: "hotel-start",
        name: `Depart ${route.startHotel.name}`,
        startTime: currentTime,
        duration: 0,
        endTime: currentTime,
        address: route.startHotel.address,
        highlight: "Start day from hotel",
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(route.startHotel.name + " " + route.startHotel.address)}`,
      });
    } else if (itemId === "end-hotel" && route.endHotel && !isLastDay) {
      items.push({
        id: "end-hotel",
        type: "hotel-end",
        name: `Arrive at ${route.endHotel.name}`,
        startTime: currentTime,
        duration: 0,
        endTime: currentTime,
        address: route.endHotel.address,
        highlight: "Nightly rest & recharge",
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(route.endHotel.name + " " + route.endHotel.address)}`,
      });
    } else if (itemId.startsWith("custom-buffer-")) {
      const customBuf = customBuffers.find((b) => b.id === itemId);
      if (customBuf) {
        items.push({
          id: customBuf.id,
          type: "buffer",
          name: customBuf.label || "Custom Break",
          startTime: currentTime,
          duration: customBuf.duration,
          endTime: currentTime + customBuf.duration,
          highlight: "Scheduled leisure / buffer time",
        });
        currentTime += customBuf.duration;
      }
    } else {
      const stop = route.stops.find((s) => s.id === itemId);
      if (stop) {
        // Check custom time or wait times
        if (stop.customTime) {
          const customMin = parseTimeToMinutes(stop.customTime);
          if (customMin > currentTime) {
            const waitTime = customMin - currentTime;
            items.push({
              id: `wait-${stop.id}`,
              type: "buffer",
              name: `Free Time before ${stop.name}`,
              startTime: currentTime,
              duration: waitTime,
              endTime: customMin,
              highlight: "Waiting buffer before reserved time slot",
            });
            currentTime = customMin;
          }
        } else if (currentDate && stop.openingHours) {
          const tc = checkTimeConflict(
            currentTime,
            stop.estimatedDuration || 60,
            stop.openingHours,
            currentDate
          );
          if (tc.waitMinutes && tc.waitMinutes > 0) {
            items.push({
              id: `wait-opening-${stop.id}`,
              type: "buffer",
              name: `Wait for Opening (${stop.name})`,
              startTime: currentTime,
              duration: tc.waitMinutes,
              endTime: currentTime + tc.waitMinutes,
              highlight: "Place opens later; brief buffer/walk around area",
            });
            currentTime += tc.waitMinutes;
          }
        }

        const duration = stop.estimatedDuration || 60;
        const stopStart = currentTime;
        const stopEnd = stopStart + duration;
        currentTime = stopEnd;

        let transitInfo: ComputedScheduleItem["transitToNext"] = undefined;
        if (physicalSegmentIdx < route.segments.length) {
          const seg = route.segments[physicalSegmentIdx];
          transitInfo = {
            mode: seg.travelMode,
            time: seg.time,
            distance: seg.distance,
          };
          physicalSegmentIdx++;
          currentTime += Math.round(seg.time / 60);
        }

        let reservationDesc = "";
        if (stop.reservation) {
          if (stop.reservation.requirement === "required") {
            reservationDesc = "Required";
          } else if (stop.reservation.requirement === "recommended") {
            reservationDesc = "Recommended";
          } else if (stop.reservation.requirement === "walk_ins_only") {
            reservationDesc = "Walk-ins Only";
          }
          if (stop.reservation.advanceTime) {
            reservationDesc += ` (${stop.reservation.advanceTime})`;
          }
        }

        items.push({
          id: stop.id,
          type: "place",
          category: stop.category,
          name: stop.name,
          romanizedName: stop.romanizedName,
          startTime: stopStart,
          duration,
          endTime: stopEnd,
          highlight: stop.highlight?.text || stop.description || "",
          reservation: reservationDesc || undefined,
          price: stop.priceEstimate || undefined,
          address: stop.address || "",
          notes: stop.notes || undefined,
          openingHours: stop.openingHours ? stop.openingHours.join(" | ") : undefined,
          transitToNext: transitInfo,
          googleMapsUrl: stop.address
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name + " " + stop.address)}`
            : undefined,
        });
      }
    }
  });

  const totalVisitMin = route.stops.reduce((acc, s) => acc + (s.estimatedDuration || 0), 0);
  const totalTravelMin = Math.round(route.totalTime / 60);

  return { items, totalVisitMin, totalTravelMin };
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

  const kpiData = [
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
      "Total Planned Time",
      formatDuration(Math.round((totalTravelSec + totalVisitSec) / 60)),
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
    const durationStr = `${formatDuration(Math.round(route.totalVisitTime / 60))} visit + ${formatDuration(Math.round(route.totalTime / 60))} travel`;

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
      const { items, totalVisitMin, totalTravelMin } = computeDaySchedule(trip, route, dayIdx);

      let dayTitle = `DAY ${dayIdx + 1}`;
      if (trip.dateMode === "fixed" && trip.startDate) {
        const d = addDays(parseISO(trip.startDate), dayIdx);
        dayTitle = `DAY ${dayIdx + 1} — ${format(d, "EEEE, MMMM d, yyyy").toUpperCase()}`;
      }

      // Hotel accommodation indicator
      const hotelInfo = route.startHotel ? `🏨 Base: ${route.startHotel.name}` : "";
      const statsInfo = `📍 ${route.stops.length} Stops  •  ⏱️ ${formatDuration(totalVisitMin)} visit + ${formatDuration(totalTravelMin)} travel  •  📏 ${formatDistance(route.totalDistance, distanceUnit)}`;

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
          transitStr = `${modeIcon} ${formatDuration(Math.round(item.transitToNext.time / 60))} (${formatDistance(item.transitToNext.distance, distanceUnit)})`;
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
      const subtotalRow = sheet.addRow([
        `End of Day ${dayIdx + 1} Summary`,
        "",
        "",
        "",
        formatDuration(totalVisitMin),
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
