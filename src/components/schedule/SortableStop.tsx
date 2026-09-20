import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  Utensils,
  Pin,
  X,
  Lock,
  Timer,
  Coins,
  CalendarDays,
  Clock,
  GripVertical,
} from "lucide-react";
import { toast } from "../../services/toastService";
import { useRouteStore } from "../../store/useRouteStore";
import { getCategoryEmoji } from "../../utils/categoryUtils";
import { formatMultiRangeBadge } from "../../utils/dayRangeUtils";
import { checkTimeConflict } from "../../utils/timeUtils";
import { PlaceHighlightBadge } from "../common/PlaceHighlightBadge";
import { ReservationBadge } from "../common/ReservationBadge";
import { ExpandableDescription } from "./ExpandableDescription";
import {
  formatMinutesTo24h,
  formatTime,
  formatTimeString,
  parseTimeToMinutes,
} from "./scheduleTimeUtils";

export interface SortableStopProps {
  stop: any;
  stopArrivalTime: number;
  isFirst: boolean;
  isLast: boolean;
  unassignPlace: (id: string) => void;
  updatePlace: (id: string, updates: any) => void;
  dayIndex: number;
  dateMode: "fixed" | "duration";
  currentDate: Date;
  onEdit: (id: string) => void;
  mealGapAlert?: { gap: number; minGap: number } | null;
}

export const areSortableStopPropsEqual = (
  prev: SortableStopProps,
  next: SortableStopProps,
) => {
  return (
    prev.stop === next.stop &&
    prev.stopArrivalTime === next.stopArrivalTime &&
    prev.isFirst === next.isFirst &&
    prev.isLast === next.isLast &&
    prev.dayIndex === next.dayIndex &&
    prev.dateMode === next.dateMode &&
    prev.currentDate?.getTime() === next.currentDate?.getTime() &&
    prev.unassignPlace === next.unassignPlace &&
    prev.updatePlace === next.updatePlace &&
    prev.onEdit === next.onEdit &&
    prev.mealGapAlert?.gap === next.mealGapAlert?.gap &&
    prev.mealGapAlert?.minGap === next.mealGapAlert?.minGap
  );
};

export const SortableStop: React.FC<SortableStopProps> = React.memo(
  ({
    stop,
    stopArrivalTime,
    isFirst,
    isLast,
    unassignPlace,
    updatePlace,
    dayIndex,
    dateMode,
    currentDate,
    onEdit,
    mealGapAlert,
  }) => {
    const startDate = useRouteStore((s) => s.startDate);
    const timeConflict =
      dateMode === "fixed"
        ? checkTimeConflict(stopArrivalTime, stop.estimatedDuration || 60, stop.openingHours, currentDate)
        : { hasConflict: false };

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: stop.id });

    const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
    const [tempTime, setTempTime] = useState(
      stop.customTime || formatMinutesTo24h(stopArrivalTime)
    );
    const [tempPinnedToDay, setTempPinnedToDay] = useState(stop.pinnedToDay ?? false);

    const isCustomTime = !!stop.customTime;
    const customTimeMinutes = isCustomTime ? parseTimeToMinutes(stop.customTime) : null;
    const isLate = isCustomTime && stopArrivalTime > (customTimeMinutes ?? 0);
    const lateMinutes = isLate ? stopArrivalTime - (customTimeMinutes ?? 0) : 0;

    const openUpward = isLast && !isFirst;

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 60 : isTimeModalOpen ? 50 : 1,
      position: "relative" as const,
      opacity: isDragging ? 0.3 : 1,
      scale: isDragging ? 1.02 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`relative group ${isDragging ? "cursor-grabbing" : ""} ${isTimeModalOpen ? "z-50" : ""}`}
      >
        {/* Visual Drop Indicator */}
        {isDragging && (
          <div className="absolute inset-x-0 -top-2 h-1 bg-primary-500/50 rounded-full blur-[1px] animate-pulse" />
        )}

        {/* Line connector */}
        <div
          className={`absolute left-5 w-0.5 bg-surface-200 dark:bg-surface-700/50 ${isFirst ? "top-5" : "top-0"} ${isLast ? "h-5" : "bottom-0"}`}
        />

        <div className="flex gap-4 relative z-10">
          <div className="relative z-20">
            <button
              onClick={() => onEdit(stop.id)}
              className="w-10 h-10 rounded-full bg-white dark:bg-surface-800 border-2 border-surface-100 dark:border-surface-700 flex items-center justify-center shrink-0 shadow-sm hover:border-primary-500 group-hover:border-primary-500 transition-colors"
              title="Edit Place Details"
            >
              <span className="text-sm">{getCategoryEmoji(stop.category)}</span>
            </button>

            {/* Drag Handle */}
            <div
              {...attributes}
              {...listeners}
              className="absolute -left-6 top-5 -translate-y-1/2 p-1.5 text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:hover:text-surface-200 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 hover:opacity-100 transition-opacity touch-none"
              title="Drag to reorder"
            >
              <GripVertical className="w-4 h-4" />
            </div>
          </div>

          <div className="flex-1 min-w-0 pt-0.5 pb-4">
            <div className="flex items-center justify-between gap-2 relative">
              <button
                onClick={() => onEdit(stop.id)}
                className="text-sm font-bold text-surface-900 dark:text-white truncate hover:text-primary-600 group-hover:text-primary-600 transition-colors text-left outline-none focus:ring-2 focus:ring-primary-500 rounded flex-1 min-w-0"
                title="Edit Place Details"
              >
                <span className="truncate block">
                  {stop.name}
                  {stop.romanizedName && stop.romanizedName.toLowerCase() !== stop.name.toLowerCase() && (
                    <span className="ml-1.5 text-xs font-normal text-surface-500 dark:text-surface-400 italic">
                      ({stop.romanizedName})
                    </span>
                  )}
                </span>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {timeConflict.hasConflict && (
                  <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold border border-red-200 dark:border-red-800"
                    title={timeConflict.reason}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span className="hidden sm:inline">Closed</span>
                  </div>
                )}
                {/* Pin Toggle Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePlace(stop.id, { pinnedToDay: !stop.pinnedToDay });
                  }}
                  className={`p-1 rounded transition-colors ${stop.pinnedToDay
                    ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                    : "text-surface-300 dark:text-surface-600 hover:text-amber-600 dark:hover:text-amber-400 opacity-0 group-hover:opacity-100 hover:bg-surface-100 dark:hover:bg-surface-700"
                    }`}
                  title={stop.pinnedToDay ? "Pinned to this day (click to unpin)" : "Pin to this day (prevent optimizer from moving)"}
                  aria-label={stop.pinnedToDay ? "Unpin stop from this day" : "Pin stop to this day"}
                >
                  <Pin className={`w-3.5 h-3.5 ${stop.pinnedToDay ? "fill-current" : ""}`} />
                </button>
                {/* Remove from day Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    unassignPlace(stop.id);
                  }}
                  className="p-1 text-surface-300 dark:text-surface-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove from day"
                  aria-label="Remove stop from day"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Arrival Time Badge / Custom Time Lock Button */}
                <div className="relative inline-block ml-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTempTime(stop.customTime || formatMinutesTo24h(stopArrivalTime));
                      setTempPinnedToDay(stop.pinnedToDay ?? false);
                      setIsTimeModalOpen((prev) => !prev);
                    }}
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded flex items-center gap-1 transition-all border shadow-2xs ${isCustomTime
                      ? "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700/80 hover:bg-purple-200/80 dark:hover:bg-purple-900/60"
                      : "bg-surface-100 dark:bg-surface-800 text-surface-800 dark:text-surface-100 border-surface-200 dark:border-surface-700 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-300"
                      }`}
                    title={
                      isCustomTime
                        ? `Locked reservation time at ${formatTimeString(stop.customTime)}. Click to edit or unlock.`
                        : "Calculated arrival time. Click to lock custom reservation time."
                    }
                  >
                    {isCustomTime && <Lock className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400 shrink-0" />}
                    <span>{isCustomTime ? formatTimeString(stop.customTime) : formatTime(stopArrivalTime)}</span>
                    {isCustomTime && <span className="text-[9px] font-semibold opacity-75 uppercase">Locked</span>}
                  </button>

                  {/* Time Lock Popover */}
                  {isTimeModalOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40 bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTimeModalOpen(false);
                        }}
                      />
                      <div
                        className={`absolute right-0 ${openUpward ? "bottom-full mb-2" : "top-full mt-2"
                          } z-50 w-72 bg-white dark:bg-surface-850 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 p-3.5 text-surface-900 dark:text-white ring-1 ring-black/10 dark:ring-white/10`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-surface-100 dark:border-surface-700 mb-2.5">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-surface-900 dark:text-white">
                            <Lock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            Locked Reservation Time
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsTimeModalOpen(false)}
                            className="p-1 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <p className="text-[11px] text-surface-600 dark:text-surface-300 mb-3 leading-snug">
                          Fix this place to an exact arrival time. The optimizer will schedule other stops around it.
                        </p>

                        <div className="flex items-center gap-2 mb-2.5">
                          <label className="text-xs font-bold text-surface-600 dark:text-surface-300 uppercase shrink-0">Time:</label>
                          <input
                            type="time"
                            value={tempTime}
                            onChange={(e) => setTempTime(e.target.value)}
                            className="flex-1 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>

                        <label className="flex items-center gap-2 mb-3 cursor-pointer text-xs select-none">
                          <input
                            type="checkbox"
                            checked={tempPinnedToDay}
                            onChange={(e) => setTempPinnedToDay(e.target.checked)}
                            className="rounded text-purple-600 focus:ring-purple-500 border-surface-300 dark:border-surface-600 dark:bg-surface-700"
                          />
                          <span className="font-semibold text-surface-700 dark:text-surface-200">
                            Also pin to Day {dayIndex + 1}
                          </span>
                        </label>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
                          {isCustomTime ? (
                            <button
                              type="button"
                              onClick={async () => {
                                updatePlace(stop.id, { customTime: undefined });
                                setIsTimeModalOpen(false);
                                toast.info(`Removed locked time for ${stop.name}.`);
                                try {
                                  await useRouteStore.getState().optimizeDay(dayIndex);
                                } catch (e) {
                                  console.error("Failed to re-optimize day after unlocking time", e);
                                }
                              }}
                              className="text-xs font-bold text-red-500 hover:text-red-700 hover:underline"
                            >
                              Unlock
                            </button>
                          ) : <span />}

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsTimeModalOpen(false)}
                              className="px-2.5 py-1 text-xs font-semibold text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (tempTime) {
                                  updatePlace(stop.id, { customTime: tempTime, pinnedToDay: tempPinnedToDay });
                                  setIsTimeModalOpen(false);
                                  toast.success(
                                    tempPinnedToDay
                                      ? `Locked ${stop.name} to Day ${dayIndex + 1} at ${formatTimeString(tempTime)}.`
                                      : `Locked ${stop.name} arrival time to ${formatTimeString(tempTime)}.`
                                  );
                                  try {
                                    await useRouteStore.getState().optimizeDay(dayIndex);
                                  } catch (e) {
                                    console.error("Failed to re-optimize day after setting custom time", e);
                                  }
                                }
                              }}
                              className="px-3 py-1 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-md shadow-2xs transition-colors"
                            >
                              Lock Time
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap relative">
              {/* Late Arrival Warning */}
              {isLate && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80"
                  title={`Reservation is locked at ${formatTimeString(stop.customTime)}, but estimated arrival from previous stops is ${formatTime(stopArrivalTime)}`}
                >
                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Late by {lateMinutes}m</span>
                </span>
              )}

              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-tight flex items-center gap-1">
                <Timer className="w-2.5 h-2.5" />
                {stop.estimatedDuration || 60}m visit
              </span>
              {stop.priceEstimate && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border ${stop.priceEstimate.toLowerCase().includes("free")
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                    : "bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700"
                    }`}
                  title={`Estimated price: ${stop.priceEstimate}`}
                >
                  <Coins className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                  {stop.priceEstimate}
                </span>
              )}
              {stop.allowedDayRanges && stop.allowedDayRanges.length > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80 shadow-2xs"
                  title={`Constrained by user to ${formatMultiRangeBadge(stop.allowedDayRanges, startDate).fullLabel}`}
                >
                  <CalendarDays className="w-2.5 h-2.5 text-indigo-500" />
                </span>
              )}
              {stop.reservation && (
                <ReservationBadge reservation={stop.reservation} compact />
              )}
            </div>

            {(stop.description || (Array.isArray(stop.openingHours) && stop.openingHours.length > 0)) && (
              <div className="mt-1 space-y-1">
                {stop.description && <ExpandableDescription text={stop.description} />}
                {Array.isArray(stop.openingHours) && stop.openingHours.length > 0 && (
                  <div
                    className="inline-flex items-center gap-1 text-[10px] text-surface-400 dark:text-surface-500 cursor-help"
                    title={stop.openingHours.filter((h: any) => typeof h === "string").join("\n")}
                  >
                    <Clock className="w-3 h-3" />
                    <span>View Hours</span>
                  </div>
                )}
              </div>
            )}
            {mealGapAlert && (
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[10px] font-bold border border-amber-200 dark:border-amber-800"
                title={`Only ${mealGapAlert.gap}m since previous meal (minimum recommended: ${mealGapAlert.minGap}m)`}
              >
                <Utensils className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">{mealGapAlert.gap}m meal gap</span>
              </div>
            )}

            {/* Contextual Highlight (Must-Try, Photo Spot, etc.) - Always visible, never cut off */}
            {stop.highlight && stop.highlight.text && (
              <div className="mt-2">
                <PlaceHighlightBadge
                  highlight={stop.highlight}
                  category={stop.category}
                  compact
                  onEdit={() => onEdit(stop.id)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
  areSortableStopPropsEqual
);
