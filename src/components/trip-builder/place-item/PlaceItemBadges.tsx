import React, { useState, useRef, useEffect } from "react";
import { Timer, Clock, Coins, CalendarDays, ExternalLink, Pin, ChevronDown, Calendar } from "lucide-react";
import { Place, PlaceCategory } from "../../../types";
import {
  ALL_CATEGORIES,
  getCategoryEmoji,
  getCategoryLabel,
} from "../../../utils/categoryUtils";
import { formatMultiRangeBadge } from "../../../utils/dayRangeUtils";
import { ReservationBadge } from "../../common/ReservationBadge";
import { isJapanRestaurant, getTabelogSearchUrl, getTabelogBadgeStyle } from "../../../utils/tabelogUtils";
import { format, addDays, parseISO } from "date-fns";

const DAY_COLORS = [
  "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  "bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
  "bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
];

export const getBadgeColor = (dayIndex: number | null) => {
  if (dayIndex === null)
    return "bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400 border-surface-200 dark:border-surface-700";
  return DAY_COLORS[dayIndex % DAY_COLORS.length];
};

const formatTimeLabel = (time: string) => {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h)) return time;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${(m ?? 0).toString().padStart(2, "0")} ${ampm}`;
};

export interface PlaceItemBadgesProps {
  place: Place;
  startDate: string;
  dayTitles?: Record<number, string>;
  dayIndices: number[];
  isEditingDuration: boolean;
  durationVal: string;
  durationRef: React.RefObject<HTMLInputElement>;
  onStartEditingDuration: () => void;
  onDurationChange: (val: string) => void;
  onDurationSave: () => void;
  onDurationCancel: () => void;
  onCategoryChange: (cat: PlaceCategory) => void;
  onAssignDay: (dayIndex: number) => void;
  onUnassignDay: () => void;
  onEdit?: (id: string) => void;
}

export const PlaceItemBadges: React.FC<PlaceItemBadgesProps> = ({
  place,
  startDate,
  dayTitles,
  dayIndices,
  isEditingDuration,
  durationVal,
  durationRef,
  onStartEditingDuration,
  onDurationChange,
  onDurationSave,
  onDurationCancel,
  onCategoryChange,
  onAssignDay,
  onUnassignDay,
  onEdit,
}) => {
  const assignedDayTitle =
    place.dayIndex !== null && place.dayIndex !== undefined
      ? dayTitles?.[place.dayIndex]?.trim()
      : undefined;

  const [showFullGoogle, setShowFullGoogle] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const checkFit = () => {
      if (!rowRef.current) return;
      const containerWidth = rowRef.current.clientWidth;
      const fullViewWidth = measureRef.current?.getBoundingClientRect().width || 0;
      const dayWidth = !place.isDisabled && dayRef.current ? dayRef.current.getBoundingClientRect().width : 0;
      const priceWidth = place.priceEstimate && priceRef.current ? priceRef.current.getBoundingClientRect().width : 0;

      let count = 1;
      if (dayWidth > 0) count++;
      if (priceWidth > 0) count++;
      const gaps = (count - 1) * 6; // gap-1.5 is 6px

      const totalNeeded = dayWidth + priceWidth + fullViewWidth + gaps;
      setShowFullGoogle(containerWidth >= totalNeeded);
    };

    checkFit();

    if (typeof ResizeObserver !== "undefined" && rowRef.current) {
      const ro = new ResizeObserver(() => {
        checkFit();
      });
      ro.observe(rowRef.current);
      return () => ro.disconnect();
    }
  }, [place.dayIndex, place.pinnedToDay, assignedDayTitle, place.priceEstimate, place.isDisabled]);

  return (
    <>
      {/* Hidden measurement clone to get the exact rendered width of 'View on Google' */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="invisible fixed -left-[9999px] top-0 pointer-events-none flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 border whitespace-nowrap"
      >
        <ExternalLink className="w-3 h-3 shrink-0" />
        <span>View on Google</span>
      </span>

      {/* Row 1: Assigned Day Badge, Price Indicator, and View on Google on the SAME line */}
      <div ref={rowRef} className="flex items-center gap-1.5 mt-2 flex-wrap">
        {/* Assigned Day Badge / Dropdown */}
        {!place.isDisabled && (
          <div ref={dayRef} className="relative inline-flex items-center">
            {/* Visual badge */}
            <div
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md border shadow-2xs transition-all ${
                place.dayIndex !== null && place.dayIndex !== undefined
                  ? `${getBadgeColor(place.dayIndex)} hover:opacity-90`
                  : "bg-surface-50 dark:bg-surface-800/80 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700 hover:border-surface-300 dark:hover:border-surface-600"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              <span>
                {place.dayIndex !== null && place.dayIndex !== undefined
                  ? (() => {
                      const dayNum = place.dayIndex + 1;
                      const dateStr = startDate ? format(addDays(parseISO(startDate), place.dayIndex), "MMM d") : null;
                      if (assignedDayTitle) {
                        return `${assignedDayTitle}${dateStr ? ` (${dateStr})` : ` (Day ${dayNum})`}`;
                      }
                      return dateStr ? `${dateStr} (Day ${dayNum})` : `Day ${dayNum}`;
                    })()
                  : "+ Assign to Day"}
              </span>
              {place.dayIndex !== null && place.pinnedToDay && (
                <Pin className="w-3 h-3 opacity-70 shrink-0" />
              )}
              <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
            </div>

            {/* Native select overlay */}
            <select
              value={
                place.dayIndex !== null && place.dayIndex !== undefined
                  ? place.dayIndex
                  : "unassigned"
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === "unassigned") {
                  onUnassignDay();
                } else {
                  onAssignDay(parseInt(val, 10));
                }
              }}
              style={{ colorScheme: "dark light" }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-xs"
              title="Assign or move to day"
            >
              <option
                value="unassigned"
                className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 py-1"
              >
                Unassigned (Pool)
              </option>
              {dayIndices.map((i) => {
                const title = dayTitles?.[i]?.trim();
                const dateStr = startDate ? format(addDays(parseISO(startDate), i), "MMM d") : null;
                const label = title
                  ? (dateStr ? `${title} (${dateStr}, Day ${i + 1})` : `${title} (Day ${i + 1})`)
                  : (dateStr ? `${dateStr} (Day ${i + 1})` : `Day ${i + 1}`);
                return (
                  <option
                    key={i}
                    value={i}
                    className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 py-1"
                  >
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Price Estimate badge */}
        {place.priceEstimate && (
          <div
            ref={priceRef}
            className={`flex items-center gap-1 text-xs font-medium rounded-md px-1.5 py-0.5 border whitespace-nowrap ${
              place.priceEstimate.toLowerCase().includes("free")
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 font-semibold"
                : "bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700"
            }`}
            title={`Estimated price: ${place.priceEstimate}`}
          >
            <Coins className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{place.priceEstimate}</span>
          </div>
        )}

        {/* Tabelog (Japan Restaurants) badge */}
        {isJapanRestaurant(place) && (
          place.tabelog?.rating ? (
            (() => {
              const tbStyle = getTabelogBadgeStyle(place.tabelog.rating);
              return (
                <a
                  href={place.tabelog.url || getTabelogSearchUrl(place)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md border whitespace-nowrap transition-colors hover:opacity-85 ${tbStyle.badgeBg} ${tbStyle.textColor} ${tbStyle.borderColor}`}
                  title={`Tabelog: ★ ${place.tabelog.rating.toFixed(2)}${place.tabelog.award ? ` (${place.tabelog.award})` : ""} [${tbStyle.tierLabel}] - Click to open listing`}
                >
                  <span className="font-bold">★ {place.tabelog.rating.toFixed(2)}</span>
                  <span className="text-[10px] font-normal opacity-85">Tabelog</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-70 shrink-0" />
                </a>
              );
            })()
          ) : (
            <a
              href={getTabelogSearchUrl(place)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 rounded-md px-1.5 py-0.5 transition-colors whitespace-nowrap"
              title="Search on Tabelog (食べログ)"
            >
              <span>Tabelog ↗</span>
            </a>
          )
        )}

        {/* View on Google link */}
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-medium text-surface-600 dark:text-surface-300 hover:text-surface-900 dark:hover:text-white bg-surface-50 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700 border border-surface-200 dark:border-surface-700 rounded-md px-1.5 py-0.5 transition-all whitespace-nowrap"
          title="View on Google Maps"
        >
          <ExternalLink className="w-3 h-3 shrink-0" />
          <span>{showFullGoogle ? "View on Google" : "View"}</span>
        </a>
      </div>

      {/* Row 2: Category, Duration, and Hours picker row when place is active */}
      {!place.isDisabled && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {/* Category selector */}
          <div className="relative inline-grid items-center">
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 text-xs font-medium pl-1.5 pr-2 py-0.5 whitespace-pre pointer-events-none border border-transparent select-none"
            >
              {getCategoryEmoji(place.category)} {getCategoryLabel(place.category)}
            </span>
            <select
              value={place.category}
              onChange={(e) => onCategoryChange(e.target.value as PlaceCategory)}
              className="col-start-1 row-start-1 w-full text-xs font-medium bg-surface-50 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700/60 border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 rounded-md pl-1.5 pr-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 appearance-none cursor-pointer text-left transition-colors"
              title="Change category"
            >
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {getCategoryEmoji(cat)} {getCategoryLabel(cat)}
                </option>
              ))}
            </select>
          </div>

          {/* Duration badge */}
          {isEditingDuration ? (
            <div className="flex items-center gap-1">
              <Timer className="w-3 h-3 text-surface-400 dark:text-surface-500" />
              <input
                ref={durationRef}
                type="number"
                min="5"
                max="480"
                value={durationVal}
                onChange={(e) => onDurationChange(e.target.value)}
                onBlur={onDurationSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onDurationSave();
                  if (e.key === "Escape") onDurationCancel();
                }}
                className="w-14 text-xs font-medium bg-white dark:bg-surface-800 border border-primary-300 dark:border-primary-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 text-center text-surface-900 dark:text-white"
              />
              <span className="text-xs text-surface-500">min</span>
            </div>
          ) : (
            <button
              onClick={onStartEditingDuration}
              className="flex items-center gap-1 text-xs font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md px-1.5 py-0.5 hover:border-surface-300 dark:hover:border-surface-600 transition-colors whitespace-nowrap"
              title="Click to edit duration"
            >
              <Timer className="w-3 h-3" />
              {place.estimatedDuration ?? 60} min
            </button>
          )}

          {/* Opening Hours badge */}
          {place.openingHours && place.openingHours.length > 0 && (
            <div
              className="flex items-center gap-1 text-xs font-medium text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md px-1.5 py-0.5 cursor-help whitespace-nowrap"
              title={place.openingHours.join("\n")}
            >
              <Clock className="w-3 h-3" />
              Hours
            </div>
          )}

          {/* Added Timestamp Badge */}
          {place.addedAt && (
            <div
              className="flex items-center gap-1 text-[11px] font-medium text-surface-400 dark:text-surface-500 bg-surface-50/80 dark:bg-surface-800/80 border border-surface-200/70 dark:border-surface-700/70 rounded-md px-1.5 py-0.5 cursor-help whitespace-nowrap"
              title={`Added to trip: ${format(new Date(place.addedAt), "PPpp")}`}
            >
              <Calendar className="w-3 h-3 text-surface-400 dark:text-surface-500" />
              <span>{format(new Date(place.addedAt), "MMM d, h:mm a")}</span>
            </div>
          )}
        </div>
      )}

      {/* Row 3: Reservation badge, Date Range Restriction badge, and Time Window badge */}
      {(place.reservation || (place.allowedDayRanges && place.allowedDayRanges.length > 0) || (place.allowedTimeRange && place.allowedTimeRange.startTime && place.allowedTimeRange.endTime) || !place.isDisabled) && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {/* Reservation Requirement badge (shortened for side-by-side alignment) */}
          {place.reservation && (
            <ReservationBadge reservation={place.reservation} compact />
          )}

          {/* Allowed Day Range Badge or Add Day Range chip */}
          {place.allowedDayRanges && place.allowedDayRanges.length > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(place.id);
              }}
              className="flex items-center gap-1 text-xs font-semibold rounded-md px-1.5 py-0.5 border bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80 shadow-2xs whitespace-nowrap hover:bg-indigo-100 dark:hover:bg-indigo-900/60 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer"
              title={`Allowed schedule range: ${formatMultiRangeBadge(place.allowedDayRanges, startDate, dayTitles).fullLabel} (Click to edit)`}
            >
              <CalendarDays className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>{formatMultiRangeBadge(place.allowedDayRanges, startDate, dayTitles).fullLabel}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(place.id);
              }}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs font-medium rounded-md px-1.5 py-0.5 border border-dashed border-surface-300 dark:border-surface-600 text-surface-400 dark:text-surface-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all cursor-pointer whitespace-nowrap"
              title="Set allowed day or date range for this place"
            >
              <CalendarDays className="w-3 h-3 text-indigo-400 shrink-0" />
              <span>+ Day Range</span>
            </button>
          )}

          {/* Allowed Time Window Badge */}
          {place.allowedTimeRange && place.allowedTimeRange.startTime && place.allowedTimeRange.endTime && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(place.id);
              }}
              className="flex items-center gap-1 text-xs font-semibold rounded-md px-1.5 py-0.5 border bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/80 shadow-2xs whitespace-nowrap hover:bg-teal-100 dark:hover:bg-teal-900/60 hover:border-teal-300 dark:hover:border-teal-700 transition-colors cursor-pointer"
              title={`Allowed schedule time window: ${formatTimeLabel(place.allowedTimeRange.startTime)} – ${formatTimeLabel(place.allowedTimeRange.endTime)} (Click to edit)`}
            >
              <Clock className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>{formatTimeLabel(place.allowedTimeRange.startTime)} – {formatTimeLabel(place.allowedTimeRange.endTime)}</span>
            </button>
          )}
        </div>
      )}
    </>
  );
};
