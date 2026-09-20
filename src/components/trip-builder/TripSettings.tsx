import React, { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Building2,
  Plane,
  Plus,
  Minus,
  PlaneTakeoff,
  PlaneLanding,
  Timer,
  Car,
  Footprints,
  Train,
  ChevronDown,
  Lock,
} from "lucide-react";
import { PlaceSearchInput } from "./PlaceSearchInput";
import { useRouteStore } from "../../store/useRouteStore";
import { TravelMode } from "../../types";
import { MOCK_HOTELS } from "../../services/mockData";
import { HotelSearchInput } from "./HotelSearchInput";

import { DatePicker } from "../ui/DatePicker";
import { format, addDays } from "date-fns";

const deriveStaysFromHotels = (hotels: any[], totalDays: number, stayBoundaries: number[]) => {
  if (totalDays === 0) return [];
  const stays: { startDay: number; endDay: number; hotel: any; id: string }[] = [];

  let currentStart = 0;
  let currentHotel = hotels.find((h) => h.dayIndex === 0) || null;

  for (let i = 1; i < totalDays; i++) {
    const dayHotel = hotels.find((h) => h.dayIndex === i) || null;

    const isSame =
      !stayBoundaries.includes(i - 1) &&
      ((!currentHotel && !dayHotel) ||
        (currentHotel &&
          dayHotel &&
          currentHotel.name === dayHotel.name &&
          currentHotel.lat === dayHotel.lat &&
          currentHotel.lng === dayHotel.lng));

    if (!isSame) {
      stays.push({
        id: `stay-${currentStart}-${i - 1}-${currentHotel?.name || "null"}`,
        startDay: currentStart,
        endDay: i - 1,
        hotel: currentHotel,
      });
      currentStart = i;
      currentHotel = dayHotel;
    }
  }

  stays.push({
    id: `stay-${currentStart}-${totalDays - 1}-${currentHotel?.name || "null"}`,
    startDay: currentStart,
    endDay: totalDays - 1,
    hotel: currentHotel,
  });

  return stays;
};

export const TripSettings: React.FC = React.memo(() => {
  const {
    days,
    setDays,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dateMode,
    setDateMode,
    dayStartTime,
    dayEndTime,
    setDayTimes,
    showFlights,
    setShowFlights,
    arrivalFlight,
    setArrivalFlight,
    departureFlight,
    setDepartureFlight,
    travelMode,
    setTravelMode,
    strictBudget,
    setStrictBudget,
    avoidClosedHours,
    setAvoidClosedHours,
    hotels,
    setHotelRange,
    appMode,
    exemptDays,
    toggleDayExemption,
    dayTitles,
  } = useRouteStore();

  const [daysInput, setDaysInput] = useState(days.toString());
  const [openPicker, setOpenPicker] = useState<"start" | "end" | null>(null);
  const [stayBoundaries, setStayBoundaries] = useState<number[]>([]);
  const [arrBufInput, setArrBufInput] = useState(String(arrivalFlight?.buffer ?? 30));
  const [depBufInput, setDepBufInput] = useState(String(departureFlight?.buffer ?? 90));


  // Sync internal input state with store days
  useEffect(() => {
    setDaysInput(days.toString());
  }, [days]);


  const handleDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDaysInput(e.target.value);
  };

  const handleDaysBlur = () => {
    const val = parseInt(daysInput);
    if (!isNaN(val) && val >= 1 && val <= 999) {
      setDays(val);
    } else {
      setDaysInput(days.toString());
    }
  };

  const handleArrivalChange = (
    updates: Partial<{ time: string; buffer: number; location: any }>,
  ) => {
    const current = arrivalFlight || {
      time: "12:00",
      buffer: 30,
      location: null,
    };
    setArrivalFlight({ ...current, ...updates });
  };

  const handleDepartureChange = (
    updates: Partial<{ time: string; buffer: number; location: any }>,
  ) => {
    const current = departureFlight || {
      time: "12:00",
      buffer: 90,
      location: null,
    };
    setDepartureFlight({ ...current, ...updates });
  };

  const handleHotelRangeChange = (startDay: number, endDay: number, hotelData: any) => {
    let hotel = null;

    if (hotelData) {
      if (appMode !== "real") {
        const mockHotel =
          typeof hotelData === "string"
            ? MOCK_HOTELS[parseInt(hotelData)]
            : hotelData;
        if (mockHotel) {
          hotel = { ...mockHotel };
        }
      } else {
        hotel = {
          name: hotelData.name,
          address: hotelData.address,
          lat: hotelData.lat,
          lng: hotelData.lng,
        };
      }
    }

    setHotelRange(startDay, endDay, hotel);
  };

  const stays = useMemo(
    () => deriveStaysFromHotels(hotels, days, stayBoundaries),
    [hotels, days, stayBoundaries],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 transition-colors">
      {/* Left Column: Itinerary Basics & Routine */}
      <div className="space-y-6">
        {/* Travel Mode */}
        <div>
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white uppercase tracking-wider mb-3">
            Global Travel Mode
          </h3>
          <div className="flex flex-wrap bg-surface-100 dark:bg-surface-900/50 p-1 rounded-lg gap-1">
            {(["walking", "transit", "driving"] as TravelMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setTravelMode(mode)}
                className={`flex-1 min-w-[80px] flex items-center justify-center gap-1 sm:gap-2 py-2 px-2 rounded-md text-xs sm:text-sm font-medium capitalize transition-all ${travelMode === mode
                  ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-300 shadow-sm border border-surface-200/60 dark:border-surface-600"
                  : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
                  }`}
              >
                {mode === "walking" && (
                  <Footprints className="w-4 h-4 shrink-0" />
                )}
                {mode === "transit" && <Train className="w-4 h-4 shrink-0" />}
                {mode === "driving" && <Car className="w-4 h-4 shrink-0" />}
                <span className="truncate">{mode}</span>
              </button>
            ))}
          </div>
        </div>

        <hr className="border-surface-100 dark:border-surface-700" />

        {/* Date Options */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white uppercase tracking-wider">
              Dates & Duration
            </h3>
            <div className="flex bg-surface-100 dark:bg-surface-900/80 p-0.5 rounded-md">
              <button
                onClick={() => setDateMode("duration")}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded transition-all ${dateMode === "duration"
                  ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-300 shadow-sm"
                  : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
                  }`}
              >
                Duration
              </button>
              <button
                onClick={() => setDateMode("fixed")}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded transition-all ${dateMode === "fixed"
                  ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-300 shadow-sm"
                  : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
                  }`}
              >
                Exact Dates
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {dateMode === "duration" ? (
              <div>
                <label className="block text-xs font-bold text-surface-500 uppercase mb-2">
                  Trip Duration
                </label>
                <div
                  className="flex items-center justify-between text-sm text-surface-900 dark:text-white bg-white dark:bg-surface-800 px-3 py-2.5 rounded-xl border border-surface-200 dark:border-surface-700 shadow-sm focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500 transition-all cursor-pointer group"
                  onClick={(e) => {
                    const input = e.currentTarget.querySelector("input");
                    if (input) input.focus();
                  }}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={daysInput}
                      onChange={handleDaysChange}
                      onBlur={handleDaysBlur}
                      className="w-12 bg-transparent font-bold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-surface-500 font-bold uppercase text-[10px] tracking-widest border-l border-surface-100 dark:border-surface-700 pl-3">
                      Total Days
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDays(Math.max(1, days - 1));
                        setDaysInput(String(Math.max(1, days - 1)));
                      }}
                      className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-primary-600 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDays(days + 1);
                        setDaysInput(String(days + 1));
                      }}
                      className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 hover:text-primary-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DatePicker
                    label="Start Date"
                    value={startDate}
                    onChange={(val) => {
                      setStartDate(val);
                      // Auto-switch to end date picker
                      setOpenPicker("end");
                    }}
                    isOpen={openPicker === "start"}
                    onOpenChange={(open) => setOpenPicker(open ? "start" : null)}
                  />
                  <DatePicker
                    label="End Date"
                    value={endDate}
                    min={startDate}
                    onChange={(val) => {
                      setEndDate(val);
                      setOpenPicker(null);
                    }}
                    isOpen={openPicker === "end"}
                    onOpenChange={(open) => setOpenPicker(open ? "end" : null)}
                    highlight={openPicker === "end"}
                  />
                </div>
                <p className="mt-2 text-[10px] font-bold text-surface-400 uppercase text-right">
                  Total: <span className="text-primary-600">{days} days</span>
                </p>
              </>
            )}
          </div>
        </div>

        <hr className="border-surface-100 dark:border-surface-700" />

        {/* Daily Routine */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white uppercase tracking-wider">
              Daily Routine
            </h3>
            <p className="text-[10px] text-surface-400 font-medium italic">
              Local time
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="time"
                value={dayStartTime}
                onChange={(e) => setDayTimes(e.target.value, dayEndTime)}
                className="w-full bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white text-sm rounded-lg pl-10 p-2.5 outline-none"
              />
            </div>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="time"
                value={dayEndTime}
                onChange={(e) => setDayTimes(dayStartTime, e.target.value)}
                className="w-full bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white text-sm rounded-lg pl-10 p-2.5 outline-none"
              />
            </div>
          </div>

          {/* Strict Budget Toggle */}
          <div className="mt-4 flex flex-col gap-1.5 p-3 bg-surface-100 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700/50">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-surface-900 dark:text-white flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-primary-500" />
                Enforce Time Budget
              </h4>
              <button
                type="button"
                role="switch"
                aria-checked={strictBudget}
                onClick={() => setStrictBudget(!strictBudget)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${strictBudget ? "bg-primary-500" : "bg-surface-300 dark:bg-surface-600"}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform`}
                  style={{ transform: strictBudget ? "translateX(18px)" : "translateX(4px)" }}
                />
              </button>
            </div>
            <p className="text-[10px] text-surface-500 dark:text-surface-400 pr-8">
              If ON, the auto-scheduler will leave places Unassigned if they exceed your daily hours. If OFF, it will fit everything in.
            </p>
          </div>

          {/* Avoid Closed Hours Toggle */}
          <div className="mt-3 flex flex-col gap-1.5 p-3 bg-surface-100 dark:bg-surface-800/50 rounded-xl border border-surface-200 dark:border-surface-700/50">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-surface-900 dark:text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary-500" />
                Avoid Closed Hours
              </h4>
              <button
                type="button"
                role="switch"
                aria-checked={avoidClosedHours}
                onClick={() => setAvoidClosedHours(!avoidClosedHours)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${avoidClosedHours ? "bg-primary-500" : "bg-surface-300 dark:bg-surface-600"}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform`}
                  style={{ transform: avoidClosedHours ? "translateX(18px)" : "translateX(4px)" }}
                />
              </button>
            </div>
            <p className="text-[10px] text-surface-500 dark:text-surface-400 pr-8">
              If ON, Optimize Route schedules places during their open hours and avoids days when places are closed.
            </p>
          </div>

          {/* Exempt Days From Route Optimization */}
          <div className="pt-2 border-t border-surface-100 dark:border-surface-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-surface-900 dark:text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                Exempt Days from Optimization
              </h4>
              {exemptDays.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                  {exemptDays.length} {exemptDays.length === 1 ? "day" : "days"} exempt
                </span>
              )}
            </div>
            <p className="text-[10px] text-surface-500 dark:text-surface-400">
              Select days to lock so the global "Optimize Route" button never alters or moves their places.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Array.from({ length: days }).map((_, idx) => {
                const isExempt = exemptDays.includes(idx);
                const title = dayTitles?.[idx]?.trim();
                const dateStr = startDate ? format(addDays(new Date(startDate + "T12:00:00"), idx), "MMM d") : null;
                const label = title
                  ? (dateStr ? `${title} (${dateStr})` : `D${idx + 1}: ${title}`)
                  : (dateStr ? `${dateStr}` : `Day ${idx + 1}`);
                const fullTooltip = `Day ${idx + 1}${dateStr ? ` • ${dateStr}` : ""}${title ? ` (${title})` : ""}`;
                return (
                  <button
                    key={idx}
                    type="button"
                    title={fullTooltip}
                    onClick={() => toggleDayExemption(idx)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      isExempt
                        ? "bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 shadow-2xs"
                        : "bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700"
                    }`}
                  >
                    {isExempt && <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Right Column: Accommodations & Logistics */}
      <div className="space-y-6">
        {/* Lodging */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-surface-900 dark:text-white uppercase tracking-wider">
                Stay & Lodging
              </h3>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 border border-surface-200 dark:border-surface-700">
                {stays.length} {stays.length === 1 ? "stay" : "stays"}
              </span>
            </div>
          </div>

          <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
            {stays.map((stay, idx) => (
              <div
                key={stay.id}
                className="relative flex flex-col gap-2 bg-surface-50 dark:bg-surface-800/40 p-2.5 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 transition-colors"
              >
                {/* Compact horizontal distribution: Stay badge, Day range, Nights count, and Merge button */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface-200/80 dark:bg-surface-700 text-surface-700 dark:text-surface-300 shrink-0">
                      Stay {idx + 1}
                    </span>

                    {/* Horizontal Day selection pill */}
                    <div className="inline-flex items-center gap-1 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-md px-2 py-0.5 text-xs shadow-2xs">
                      <span className="font-semibold text-surface-800 dark:text-surface-200 whitespace-nowrap">
                        {dateMode === "fixed" && startDate
                          ? format(
                            addDays(new Date(startDate + "T12:00:00"), stay.startDay),
                            "MMM d",
                          )
                          : `Day ${stay.startDay + 1}`}
                      </span>
                      <span className="text-surface-400 font-normal">→</span>
                      <div className="relative inline-flex items-center">
                        <select
                          value={stay.endDay}
                          onChange={(e) => {
                            const newEndDay = parseInt(e.target.value);
                            if (newEndDay > stay.endDay) {
                              setHotelRange(stay.startDay, newEndDay, stay.hotel);
                              setStayBoundaries((b) => [
                                ...b.filter((x) => x < stay.startDay || x >= newEndDay),
                                newEndDay,
                              ]);
                            } else if (newEndDay < stay.endDay) {
                              setHotelRange(newEndDay + 1, stay.endDay, null);
                              setStayBoundaries((b) => [...b, newEndDay]);
                            }
                          }}
                          className="font-semibold text-primary-600 dark:text-primary-400 bg-transparent pr-3.5 focus:outline-none cursor-pointer appearance-none text-xs"
                          title="Change stay end day"
                        >
                          {Array.from({ length: days - stay.startDay }).map((_, i) => {
                            const val = stay.startDay + i;
                            return (
                              <option
                                key={val}
                                value={val}
                                className="text-surface-900 dark:text-white bg-white dark:bg-surface-900"
                              >
                                {dateMode === "fixed" && startDate
                                  ? format(
                                    addDays(new Date(startDate + "T12:00:00"), val),
                                    "MMM d",
                                  )
                                  : `Day ${val + 1}`}
                              </option>
                            );
                          })}
                        </select>
                        <ChevronDown className="w-3 h-3 text-surface-400 dark:text-surface-500 absolute right-0 pointer-events-none" />
                      </div>
                    </div>

                    <span className="text-[11px] font-medium text-surface-500 dark:text-surface-400 whitespace-nowrap">
                      ({stay.endDay - stay.startDay + 1} {(stay.endDay - stay.startDay + 1) === 1 ? "night" : "nights"})
                    </span>
                  </div>

                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setHotelRange(stay.startDay, stay.endDay, stays[idx - 1].hotel);
                        setStayBoundaries((b) => b.filter((x) => x !== stay.startDay - 1));
                      }}
                      className="text-[11px] text-primary-600 hover:text-primary-700 dark:text-primary-400 hover:underline font-semibold shrink-0 transition-colors"
                      title="Merge with previous stay"
                    >
                      Merge
                    </button>
                  )}
                </div>

                {/* Hotel Input */}
                <div className="relative flex items-center">
                  {appMode === "dropdown-mock" ? (
                    <>
                      <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500" />
                      <select
                        value={stay.hotel ? MOCK_HOTELS.findIndex((h) => h.name === stay.hotel.name) : ""}
                        onChange={(e) => handleHotelRangeChange(stay.startDay, stay.endDay, e.target.value)}
                        className="w-full bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white text-xs rounded-md focus:ring-primary-500 focus:border-primary-500 block pl-8 pr-3 py-1.5 appearance-none cursor-pointer"
                      >
                        <option value="" disabled>Select hotel...</option>
                        {MOCK_HOTELS.map((h, i) => (
                          <option key={i} value={i}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <HotelSearchInput
                      onSelect={(h) => handleHotelRangeChange(stay.startDay, stay.endDay, h)}
                      placeholder={`Search hotel for Days ${stay.startDay + 1}–${stay.endDay + 1}...`}
                      currentValue={stay.hotel?.name || ""}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <hr className="border-surface-100 dark:border-surface-700" />

        {/* Flight & Travel Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-bold text-surface-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Plane className="w-3.5 h-3.5" />
                Flight & Buffer Times
              </h3>
              <p className="text-[10px] text-surface-500">
                Configure airport transit & schedule buffer times
              </p>
            </div>
            <button
              onClick={() => setShowFlights(!showFlights)}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-all duration-300 focus:outline-none ring-2 ring-offset-2 ring-offset-white dark:ring-offset-surface-800 ring-transparent focus:ring-primary-500/50 ${showFlights ? "bg-primary-500 shadow-[0_0_10px_rgba(var(--primary-500-rgb),0.4)]" : "bg-surface-300 dark:bg-surface-600"}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${showFlights ? "translate-x-5" : "translate-x-1"}`}
              />
            </button>
          </div>

          {!showFlights && (
            <div className="p-3 rounded-xl border border-dashed border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-900/30 text-[11px] text-surface-500 flex items-center justify-between gap-2">
              <span>Flight & airport buffer times are currently disabled.</span>
              <button
                type="button"
                onClick={() => setShowFlights(true)}
                className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline shrink-0"
              >
                Enable
              </button>
            </div>
          )}

          {showFlights && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="bg-primary-50/50 dark:bg-primary-900/10 rounded-xl p-3 border border-primary-100/50 dark:border-primary-900/20">
                <h4 className="text-[10px] font-bold text-primary-700 dark:text-primary-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <PlaneTakeoff className="w-3 h-3" />
                  Arrival Journey (Day 1)
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-surface-400 uppercase mb-1 ml-0.5">
                      Arrival Airport/Station{" "}
                      <span className="text-[9px] lowercase font-medium opacity-60">
                        (optional)
                      </span>
                    </label>
                    <PlaceSearchInput
                      icon="airport"
                      placeholder="Search for airport or station..."
                      currentValue={arrivalFlight?.location?.name}
                      onSelect={(loc) => handleArrivalChange({ location: loc })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-surface-400 uppercase mb-1 ml-0.5">
                        Land Time
                      </label>
                      <div className="relative">
                        <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                        <input
                          type="time"
                          value={arrivalFlight?.time || "12:00"}
                          onChange={(e) =>
                            handleArrivalChange({ time: e.target.value })
                          }
                          className="w-full bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg py-2 pl-8 pr-3 text-xs font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1 ml-0.5">
                        <label className="text-[10px] font-bold text-surface-400 uppercase">
                          Post-Landing Buffer
                        </label>
                        <span className="text-[9px] text-surface-400">Customs & exit</span>
                      </div>
                      <div className="relative flex items-center border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-white dark:bg-surface-800">
                        <button
                          type="button"
                          onClick={() => {
                            handleArrivalChange({
                              buffer: Math.max(0, (arrivalFlight?.buffer ?? 30) - 15),
                            });
                            setArrBufInput(String(Math.max(0, (arrivalFlight?.buffer ?? 30) - 15)));
                          }}
                          className="px-2.5 py-2 hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors shrink-0"
                          title="-15 minutes"
                        >
                          -15
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={arrBufInput}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            setArrBufInput(v);
                            if (v !== '') {
                              handleArrivalChange({ buffer: Math.min(480, Math.max(0, parseInt(v))) });
                            }
                          }}
                          onBlur={() => {
                            const num = Math.min(480, Math.max(0, parseInt(arrBufInput) || 0));
                            handleArrivalChange({ buffer: num });
                            setArrBufInput(String(num));
                          }}
                          className="w-full bg-transparent text-center text-xs font-bold text-surface-900 dark:text-white py-2 focus:outline-none"
                        />
                        <span className="text-[10px] text-surface-400 dark:text-surface-500 font-medium pr-1 shrink-0">
                          min
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            handleArrivalChange({
                              buffer: (arrivalFlight?.buffer ?? 30) + 15,
                            });
                            setArrBufInput(String((arrivalFlight?.buffer ?? 30) + 15));
                          }}
                          className="px-2.5 py-2 hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors shrink-0"
                          title="+15 minutes"
                        >
                          +15
                        </button>
                      </div>
                      {/* Presets */}
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {[15, 30, 45, 60, 90, 120].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => { handleArrivalChange({ buffer: preset }); setArrBufInput(String(preset)); }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${(arrivalFlight?.buffer ?? 30) === preset
                              ? "bg-primary-600 text-white border-primary-600 shadow-2xs"
                              : "bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700 hover:bg-surface-200 dark:hover:bg-surface-700"
                              }`}
                          >
                            {preset}m
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-red-50/50 dark:bg-red-900/10 rounded-xl p-3 border border-red-100/50 dark:border-red-900/20">
                <h4 className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <PlaneLanding className="w-3 h-3" />
                  Departure Journey (Day {days})
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-surface-400 uppercase mb-1 ml-0.5">
                      Departure Airport/Station{" "}
                      <span className="text-[9px] lowercase font-medium opacity-60">
                        (optional)
                      </span>
                    </label>
                    <PlaceSearchInput
                      icon="airport"
                      placeholder="Search for airport or station..."
                      currentValue={departureFlight?.location?.name}
                      onSelect={(loc) => handleDepartureChange({ location: loc })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-surface-400 uppercase mb-1 ml-0.5">
                        Takeoff Time
                      </label>
                      <div className="relative">
                        <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                        <input
                          type="time"
                          value={departureFlight?.time || "12:00"}
                          onChange={(e) =>
                            handleDepartureChange({ time: e.target.value })
                          }
                          className="w-full bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg py-2 pl-8 pr-3 text-xs font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1 ml-0.5">
                        <label className="text-[10px] font-bold text-surface-400 uppercase">
                          Pre-Flight Buffer
                        </label>
                        <span className="text-[9px] text-surface-400">Security & gates</span>
                      </div>
                      <div className="relative flex items-center border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-white dark:bg-surface-800">
                        <button
                          type="button"
                          onClick={() => {
                            handleDepartureChange({
                              buffer: Math.max(0, (departureFlight?.buffer ?? 90) - 15),
                            });
                            setDepBufInput(String(Math.max(0, (departureFlight?.buffer ?? 90) - 15)));
                          }}
                          className="px-2.5 py-2 hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 text-xs font-bold transition-colors shrink-0"
                          title="-15 minutes"
                        >
                          -15
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={depBufInput}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            setDepBufInput(v);
                            if (v !== '') {
                              handleDepartureChange({ buffer: Math.min(480, Math.max(0, parseInt(v))) });
                            }
                          }}
                          onBlur={() => {
                            const num = Math.min(480, Math.max(0, parseInt(depBufInput) || 0));
                            handleDepartureChange({ buffer: num });
                            setDepBufInput(String(num));
                          }}
                          className="w-full bg-transparent text-center text-xs font-bold text-surface-900 dark:text-white py-2 focus:outline-none"
                        />
                        <span className="text-[10px] text-surface-400 dark:text-surface-500 font-medium pr-1 shrink-0">
                          min
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            handleDepartureChange({
                              buffer: (departureFlight?.buffer ?? 90) + 15,
                            });
                            setDepBufInput(String((departureFlight?.buffer ?? 90) + 15));
                          }}
                          className="px-2.5 py-2 hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 text-xs font-bold transition-colors shrink-0"
                          title="+15 minutes"
                        >
                          +15
                        </button>
                      </div>
                      {/* Presets */}
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {[30, 45, 60, 90, 120, 180].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => { handleDepartureChange({ buffer: preset }); setDepBufInput(String(preset)); }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${(departureFlight?.buffer ?? 90) === preset
                              ? "bg-red-600 text-white border-red-600 shadow-2xs"
                              : "bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700 hover:bg-surface-200 dark:hover:bg-surface-700"
                              }`}
                          >
                            {preset}m
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
});

