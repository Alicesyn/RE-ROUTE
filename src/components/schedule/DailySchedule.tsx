import React, { useState } from "react";
import { useRouteStore } from "../../store/useRouteStore";
import {
  Clock,
  Wand2,
  X,
  Timer,
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Coffee,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toast } from "../../services/toastService";
import { RouteSegment, CustomBuffer, Place } from "../../types";
import { format, addDays, parseISO } from "date-fns";
import { checkTimeConflict } from "../../utils/timeUtils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { BufferPill } from "./BufferPill";
import { SortableCustomBuffer } from "./SortableCustomBuffer";
import { SortableStop } from "./SortableStop";
import { SortableAnchor } from "./SortableAnchor";
import { SegmentPill } from "./SegmentPill";
import {
  parseTimeToMinutes,
  formatTime,
  formatTimeString,
} from "./scheduleTimeUtils";

const EditPlaceModal = React.lazy(() =>
  import("./EditPlaceModal").then((m) => ({ default: m.EditPlaceModal }))
);

export const DailySchedule: React.FC = () => {
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [optimizingDayIndex, setOptimizingDayIndex] = useState<number | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [addBufferDayIndex, setAddBufferDayIndex] = useState<number | null>(null);
  const [newBufferDuration, setNewBufferDuration] = useState<number>(30);
  const [newBufferLabel, setNewBufferLabel] = useState<string>("Rest Break");

  const optimizedRoutes = useRouteStore((s) => s.optimizedRoutes);
  const optimizeDay = useRouteStore((s) => s.optimizeDay);
  const clearOptimizedSchedule = useRouteStore((s) => s.clearOptimizedSchedule);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const unassignPlace = useRouteStore((s) => s.unassignPlace);
  const updatePlace = useRouteStore((s) => s.updatePlace);
  const reorderDayStops = useRouteStore((s) => s.reorderDayStops);
  const customBuffers = useRouteStore((s) => s.customBuffers);
  const addCustomBuffer = useRouteStore((s) => s.addCustomBuffer);
  const updateCustomBuffer = useRouteStore((s) => s.updateCustomBuffer);
  const deleteCustomBuffer = useRouteStore((s) => s.deleteCustomBuffer);
  const startDate = useRouteStore((s) => s.startDate);
  const dateMode = useRouteStore((s) => s.dateMode);
  const dayStartTime = useRouteStore((s) => s.dayStartTime);
  const dayEndTime = useRouteStore((s) => s.dayEndTime);
  const showFlights = useRouteStore((s) => s.showFlights);
  const arrivalFlight = useRouteStore((s) => s.arrivalFlight);
  const setArrivalFlight = useRouteStore((s) => s.setArrivalFlight);
  const departureFlight = useRouteStore((s) => s.departureFlight);
  const setDepartureFlight = useRouteStore((s) => s.setDepartureFlight);
  const distanceUnit = useRouteStore((s) => s.distanceUnit);
  const categoryConfigs = useRouteStore((s) => s.categoryConfigs);
  const dayTitles = useRouteStore((s) => s.dayTitles);
  const setDayTitle = useRouteStore((s) => s.setDayTitle);

  const [editingDayTitleIndex, setEditingDayTitleIndex] = useState<number | null>(null);
  const [editingDayTitleText, setEditingDayTitleText] = useState<string>("");
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  const startEditingDayTitle = (dayIndex: number, currentTitle?: string) => {
    setEditingDayTitleIndex(dayIndex);
    setEditingDayTitleText(currentTitle || "");
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 50);
  };

  const handleSaveDayTitle = (dayIndex: number) => {
    const trimmed = editingDayTitleText.trim();
    setDayTitle(dayIndex, trimmed);
    setEditingDayTitleIndex(null);
    if (trimmed) {
      toast.success(`Day ${dayIndex + 1} named "${trimmed}"!`, "Day Renamed");
    } else {
      toast.info(`Day ${dayIndex + 1} reset to default title.`);
    }
  };

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Day expansion states (allows seeing entire day without inner scrolling)
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  const isAllExpanded =
    optimizedRoutes.length > 0 && expandedDays.size === optimizedRoutes.length;

  const toggleDayExpanded = (dayIndex: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayIndex)) {
        next.delete(dayIndex);
      } else {
        next.add(dayIndex);
      }
      return next;
    });
  };

  const toggleAllExpanded = () => {
    if (isAllExpanded) {
      setExpandedDays(new Set());
    } else {
      setExpandedDays(new Set(optimizedRoutes.map((_, idx) => idx)));
    }
  };

  // Drag-and-drop auto-scroll mechanism
  const [activeDragDay, setActiveDragDay] = useState<number | null>(null);
  const dayScrollRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());
  const lastPointerYRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (activeDragDay === null) return;

    const container = dayScrollRefs.current.get(activeDragDay);

    let animId: number;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if ("touches" in e && e.touches.length > 0) {
        lastPointerYRef.current = e.touches[0].clientY;
      } else if ("clientY" in e) {
        lastPointerYRef.current = (e as MouseEvent).clientY;
      }
    };

    const handleEnd = () => {
      lastPointerYRef.current = null;
    };

    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    window.addEventListener("touchmove", handlePointerMove, { passive: true });
    window.addEventListener("mouseup", handleEnd, { passive: true });
    window.addEventListener("touchend", handleEnd, { passive: true });
    window.addEventListener("pointerup", handleEnd, { passive: true });
    window.addEventListener("pointercancel", handleEnd, { passive: true });

    const scrollLoop = () => {
      if (lastPointerYRef.current !== null) {
        const pointerY = lastPointerYRef.current;

        // 1. Inner day card container auto-scroll (for collapsed scrollable cards)
        if (container && container.scrollHeight > container.clientHeight) {
          const rect = container.getBoundingClientRect();
          const topThreshold = 90;
          const topBoundary = rect.top + topThreshold;
          // Extend ceiling into day header area so holding above top boundary still scrolls up smoothly
          const topCeiling = rect.top - 160;

          const bottomThreshold = 90;
          const bottomBoundary = rect.bottom - bottomThreshold;
          const bottomFloor = rect.bottom + 120;

          if (pointerY <= topBoundary && pointerY >= topCeiling) {
            const intensity = Math.min(1, Math.max(0.1, (topBoundary - pointerY) / topThreshold));
            const speed = Math.round(5 + intensity * 25);
            container.scrollTop = Math.max(0, container.scrollTop - speed);
          } else if (pointerY >= bottomBoundary && pointerY <= bottomFloor) {
            const intensity = Math.min(1, Math.max(0.1, (pointerY - bottomBoundary) / bottomThreshold));
            const speed = Math.round(5 + intensity * 25);
            container.scrollTop = Math.min(
              container.scrollHeight - container.clientHeight,
              container.scrollTop + speed
            );
          }
        }

        // 2. Window viewport auto-scroll (active especially in expanded full-day mode)
        if (pointerY < 70) {
          const intensity = Math.min(1, Math.max(0.1, (70 - pointerY) / 70));
          window.scrollBy({ top: -Math.round(6 + intensity * 24), behavior: "auto" });
        } else if (pointerY > window.innerHeight - 70) {
          const intensity = Math.min(1, Math.max(0.1, (pointerY - (window.innerHeight - 70)) / 70));
          window.scrollBy({ top: Math.round(6 + intensity * 24), behavior: "auto" });
        }
      }
      animId = requestAnimationFrame(scrollLoop);
    };

    animId = requestAnimationFrame(scrollLoop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchend", handleEnd);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      lastPointerYRef.current = null;
    };
  }, [activeDragDay]);

  const handleEditPlace = React.useCallback((id: string) => {
    setEditingPlaceId(id);
  }, []);

  // Prevent mouse wheel controls from scrolling the horizontal schedule;
  // it can now only be moved by dragging/clicking the horizontal scrollbar or using Jump-to buttons.
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent horizontal wheel events (e.g. mouse tilt/thumb wheel, Shift + wheel)
      // from scrolling this container horizontally so only the scrollbar moves it.
      if (e.deltaX !== 0 || e.shiftKey) {
        e.preventDefault();
      }
      // Standard vertical mouse wheel (e.deltaY) is not intercepted,
      // allowing it to scroll the page or inner stops list naturally.
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const hasHeuristicTransit = optimizedRoutes.some((r) =>
    r.segments.some((s) => s.travelMode === "transit" && s.isHeuristic !== false)
  );

  const handleOptimizeSingleDay = async (dayIndex: number) => {
    if (optimizingDayIndex !== null) return;
    setOptimizingDayIndex(dayIndex);
    try {
      await optimizeDay(dayIndex);
      toast.success(`Day ${dayIndex + 1} route re-optimized!`, "Day Optimized");
    } catch (err: any) {
      toast.error(err?.message || `Failed to optimize Day ${dayIndex + 1}`, "Optimization Error");
    } finally {
      setOptimizingDayIndex(null);
    }
  };

  const handleClearSchedule = () => {
    clearOptimizedSchedule();
    setShowClearConfirm(false);
    toast.info("Optimized schedule cleared. All places returned to unassigned pool.", "Schedule Cleared");
  };

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (optimizedRoutes.length === 0) return null;

  // Calculate day total in minutes
  const [startH, startM] = dayStartTime.split(":").map(Number);
  const [endH, endM] = dayEndTime.split(":").map(Number);
  let baseDayMinutes = endH * 60 + endM - (startH * 60 + startM);
  if (baseDayMinutes < 0) baseDayMinutes += 24 * 60; // Handle overnight

  const jumpScrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollJumpLeft, setCanScrollJumpLeft] = useState(false);
  const [canScrollJumpRight, setCanScrollJumpRight] = useState(false);
  const [hasJumpOverflow, setHasJumpOverflow] = useState(false);

  const checkJumpScroll = React.useCallback(() => {
    const el = jumpScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 2;
    setHasJumpOverflow(overflow);
    setCanScrollJumpLeft(scrollLeft > 2);
    setCanScrollJumpRight(scrollLeft < scrollWidth - clientWidth - 2);
  }, []);

  React.useEffect(() => {
    const el = jumpScrollRef.current;
    if (!el) return;

    checkJumpScroll();

    el.addEventListener("scroll", checkJumpScroll, { passive: true });
    const ro = new ResizeObserver(() => checkJumpScroll());
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", checkJumpScroll);
      ro.disconnect();
    };
  }, [checkJumpScroll, optimizedRoutes.length, dayTitles]);

  const scrollJump = (direction: "left" | "right") => {
    if (jumpScrollRef.current) {
      const scrollAmount = Math.max(160, jumpScrollRef.current.clientWidth * 0.6);
      jumpScrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const scrollToDay = (dayIndex: number) => {
    const element = document.getElementById(`schedule-day-${dayIndex}`);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
    const btn = jumpScrollRef.current?.children[dayIndex] as HTMLElement | undefined;
    if (btn) {
      btn.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  };

  return (
    <>
      <div className="schedule-container">
        <div className="px-6 py-3 border-b border-surface-100 dark:border-surface-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-50 dark:bg-surface-800 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-surface-900 dark:text-white">
              Optimized Schedule
            </h2>

            {hasHeuristicTransit && (
              <button
                onClick={() => setIsBannerDismissed((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${!isBannerDismissed
                  ? "bg-amber-100/90 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700/80 shadow-2xs hover:bg-amber-200/80 dark:hover:bg-amber-900/70"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/80 hover:bg-amber-100/80 dark:hover:bg-amber-900/60 shadow-2xs"
                  }`}
                title={
                  isBannerDismissed
                    ? "Click to view notice: Why are transit times orange & estimated?"
                    : "Click to hide transit notice"
                }
                aria-label="Toggle orange transit notice"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Orange Transit = Estimated</span>
                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-200/70 dark:bg-amber-900/70 px-1.5 py-0.5 rounded-full">
                  {!isBannerDismissed ? "Hide Notice" : "Why?"}
                </span>
              </button>
            )}

            {/* Global Expand All / Compact View toggle */}
            <button
              type="button"
              onClick={toggleAllExpanded}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all shadow-2xs cursor-pointer ${isAllExpanded
                ? "bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700 hover:bg-primary-100/80 dark:hover:bg-primary-900/60"
                : "bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-300 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700"
                }`}
              title={isAllExpanded ? "Collapse all days to compact scrollable cards" : "Expand all days to see full itineraries without scrolling"}
              aria-label={isAllExpanded ? "Collapse all days" : "Expand all days"}
            >
              {isAllExpanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                  <span>Compact View</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-surface-500 dark:text-surface-400" />
                  <span>Expand All Days</span>
                </>
              )}
            </button>

            {showClearConfirm ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 rounded-lg animate-in fade-in zoom-in-95 duration-150">
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">Clear all days?</span>
                <button
                  type="button"
                  onClick={handleClearSchedule}
                  className="px-2 py-0.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded transition-colors shadow-2xs cursor-pointer"
                >
                  Yes, Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="px-2 py-0.5 text-xs font-medium text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 hover:bg-red-100/90 dark:bg-red-950/40 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/60 transition-all shadow-2xs cursor-pointer"
                title="Clear optimized schedule and return places to unassigned pool"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Schedule</span>
              </button>
            )}
          </div>

          {/* Day Quick Navigation */}
          <div className="flex items-center gap-1.5 overflow-hidden min-w-0 flex-1 sm:justify-end">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-surface-400 uppercase tracking-wider whitespace-nowrap">
                Jump to:
              </span>

              {optimizedRoutes.length > 18 && (
                <input
                  type="number"
                  placeholder="Day #"
                  min={1}
                  max={optimizedRoutes.length}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) scrollToDay(val - 1);
                  }}
                  className="w-20 bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 rounded-md px-2 py-0.5 text-xs font-bold text-primary-600 outline-none focus:ring-1 focus:ring-primary-500 text-center"
                />
              )}
            </div>

            {hasJumpOverflow && (
              <button
                type="button"
                onClick={() => scrollJump("left")}
                disabled={!canScrollJumpLeft}
                aria-label="Scroll left in jump list"
                title="Scroll left"
                className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                  !canScrollJumpLeft
                    ? "opacity-30 cursor-not-allowed border-surface-200/50 dark:border-surface-700/50 text-surface-300 dark:text-surface-600"
                    : "bg-white dark:bg-surface-700 border-surface-200 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:border-primary-500 hover:text-primary-600 shadow-2xs cursor-pointer"
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}

            <div
              ref={jumpScrollRef}
              className="flex gap-2 overflow-x-auto no-scrollbar pb-1 min-w-0"
            >
              {optimizedRoutes.map((route, i) => {
                const btnDate = addDays(parseISO(startDate), i);
                const customName = route.title || dayTitles[i];
                return (
                  <button
                    key={i}
                    onClick={() => scrollToDay(i)}
                    title={customName ? `${customName} (Day ${i + 1})` : `Day ${i + 1}`}
                    className={`px-3 py-1.5 rounded-lg bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 font-bold text-surface-600 dark:text-surface-300 hover:border-primary-500 hover:text-primary-600 transition-all whitespace-nowrap flex flex-col items-center justify-center min-w-[60px] max-w-[120px] ${dateMode === "fixed" ? "text-[10px]" : "text-xs"}`}
                  >
                    {customName ? (
                      <>
                        <span className="truncate w-full font-black text-primary-600 dark:text-primary-400 text-center">{customName}</span>
                        <span className="text-[9px] opacity-60">D{i + 1}{dateMode === "fixed" ? ` • ${format(btnDate, "MMM d")}` : ""}</span>
                      </>
                    ) : (
                      dateMode === "fixed" ? (
                        <>
                          <span className="opacity-50">D{i + 1}</span>
                          <span>{format(btnDate, "MMM d")}</span>
                        </>
                      ) : (
                        <span>Day {i + 1}</span>
                      )
                    )}
                  </button>
                );
              })}
            </div>

            {hasJumpOverflow && (
              <button
                type="button"
                onClick={() => scrollJump("right")}
                disabled={!canScrollJumpRight}
                aria-label="Scroll right in jump list"
                title="Scroll right"
                className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                  !canScrollJumpRight
                    ? "opacity-30 cursor-not-allowed border-surface-200/50 dark:border-surface-700/50 text-surface-300 dark:text-surface-600"
                    : "bg-white dark:bg-surface-700 border-surface-200 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:border-primary-500 hover:text-primary-600 shadow-2xs cursor-pointer"
                }`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Heuristic Transit Inaccurate Times Warning Banner */}
        {hasHeuristicTransit && !isBannerDismissed && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 rounded-2xl border border-amber-300 dark:border-amber-700/80 bg-gradient-to-r from-amber-50 to-orange-50/60 dark:from-amber-950/50 dark:to-orange-950/30 text-amber-950 dark:text-amber-200 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-200/80 dark:bg-amber-900/60 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-100">
                  ⚠ Transit times are estimated — actual durations may differ significantly.
                </p>
              </div>
              <button
                onClick={() => setIsBannerDismissed(true)}
                className="p-1.5 rounded-xl text-amber-700 dark:text-amber-400 hover:bg-amber-200/60 dark:hover:bg-amber-900/60 transition-colors shrink-0"
                title="Dismiss notice"
                aria-label="Dismiss heuristic transit notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <details className="mt-2">
              <summary className="text-[11px] sm:text-xs font-bold text-amber-800 dark:text-amber-300 cursor-pointer hover:text-amber-950 dark:hover:text-amber-100 transition-colors select-none">
                Why this happens
              </summary>
              <p className="mt-1.5 text-[11px] sm:text-xs text-amber-900/80 dark:text-amber-300/80 leading-relaxed pl-1">
                Google Maps developer APIs return <code className="font-mono text-[10px] bg-amber-200/70 dark:bg-amber-900/70 px-1 py-0.5 rounded font-bold">ZERO_RESULTS</code> for Japan transit due to commercial licensing. Times are approximated geometrically (~{distanceUnit === "imperial" ? "11 mph local / ~101 mph express" : "18 km/h local / ~162 km/h express"}) without real timetables, departure intervals, or megastation transfer walks. Cross-check with local transit apps (NAVITIME, Jorudan) on your travel day.{" "}
                <button
                  onClick={() => { window.location.hash = "#about-limitations"; }}
                  className="inline font-bold text-amber-950 dark:text-amber-100 underline underline-offset-2 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  More details →
                </button>
              </p>
            </details>
          </div>
        )}


        <div
          ref={scrollContainerRef}
          className="p-6 overflow-x-auto overflow-y-hidden custom-scrollbar flex gap-6 snap-x snap-proximity overscroll-x-contain items-start"
        >
          {optimizedRoutes.map((route, i) => {
            const currentDate = addDays(parseISO(startDate), i);
            const isFirstDay = i === 0;
            const isLastDay = i === optimizedRoutes.length - 1;

            // Calculate base day start time in minutes
            const [startH, startM] = dayStartTime.split(":").map(Number);
            let currentTime = startH * 60 + startM;

            // Calculate available time for this day
            let dayAvailableMinutes = baseDayMinutes;
            if (showFlights) {
              if (isFirstDay && arrivalFlight) {
                const [arrH, arrM] = arrivalFlight.time.split(":").map(Number);
                const arrivalTotal = arrH * 60 + arrM;
                const dayStartTotal = startH * 60 + startM;
                const effectiveStart = Math.max(dayStartTotal, arrivalTotal);
                currentTime = effectiveStart; // Day starts after flight

                let available = endH * 60 + endM - effectiveStart;
                if (available < 0) available += 24 * 60;
                dayAvailableMinutes = available;
              }
              if (isLastDay && departureFlight) {
                const [depH, depM] = departureFlight.time.split(":").map(Number);
                const depTotal = depH * 60 + depM;
                // Handle overnight: if dayEndTime is "00:00" (midnight), treat as 1440
                const rawDayEnd = endH * 60 + endM;
                const dayEndTotal = rawDayEnd === 0 ? 24 * 60 : rawDayEnd;
                const effectiveEnd = Math.min(dayEndTotal, depTotal - (departureFlight.buffer ?? 90));

                let available = effectiveEnd - (startH * 60 + startM);
                if (available < 0) available += 24 * 60;
                dayAvailableMinutes = available;
              }
            }

            const getDayItemSequence = (dayRoute: typeof route, dayIdx: number) => {
              let ids = dayRoute.manualSequence ? [...dayRoute.manualSequence] : [];
              const dayCustoms = customBuffers.filter((b) => b.dayIndex === dayIdx);
              const isFirst = dayIdx === 0;
              const isLast = dayIdx === optimizedRoutes.length - 1;

              if (!dayRoute.manualSequence) {
                if (showFlights && isFirst && arrivalFlight) ids.push("arrival");
                if (dayRoute.startHotel) ids.push("start-hotel");
                dayRoute.stops.forEach((s) => ids.push(s.id));
                dayCustoms.forEach((b) => ids.push(b.id));
                if (dayRoute.endHotel && !isLast) ids.push("end-hotel");
                if (showFlights && isLast && departureFlight) ids.push("departure");
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
                if (showFlights && isFirst && arrivalFlight && !ids.includes("arrival")) {
                  ids.unshift("arrival");
                } else if (!showFlights) {
                  ids = ids.filter((id) => id !== "arrival" && id !== "departure");
                }
                if (showFlights && isLast && departureFlight && !ids.includes("departure")) {
                  ids.push("departure");
                }
              }
              if (isLast) {
                ids = ids.filter((id) => id !== "end-hotel");
              }
              return ids;
            };

            const dayItems = getDayItemSequence(route, i);

            // Unified day timeline simulation: calculate exact start times, wait buffers, durations, and segments
            let simTime = currentTime;
            let simSegIdx = 0;
            let autoWaitBufferMin = 0;

            const itemScheduleList = dayItems.map((itemId, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === dayItems.length - 1;
              let preWaitMin = 0;
              let preWaitType: "reservation" | "wait" | undefined = undefined;
              let itemDuration = 0;
              let customBuf: CustomBuffer | null = null;
              let stop: Place | null = null;

              if (itemId === "arrival" && arrivalFlight) {
                itemDuration = arrivalFlight.buffer ?? 30;
              } else if (itemId === "departure" && departureFlight) {
                itemDuration = departureFlight.buffer ?? 90;
              } else if (itemId === "start-hotel" && route.startHotel) {
                itemDuration = 0;
              } else if (itemId === "end-hotel" && route.endHotel && !isLastDay) {
                itemDuration = 0;
              } else if (itemId.startsWith("custom-buffer-")) {
                customBuf = customBuffers.find((b) => b.id === itemId) || null;
                itemDuration = customBuf ? customBuf.duration : 0;
              } else {
                stop = route.stops.find((s) => s.id === itemId) || null;
                if (stop) {
                  if (stop.customTime) {
                    const customMin = parseTimeToMinutes(stop.customTime);
                    if (customMin > simTime) {
                      preWaitMin = customMin - simTime;
                      preWaitType = "reservation";
                      simTime = customMin;
                    }
                  } else if (dateMode === "fixed") {
                    const tc = checkTimeConflict(
                      simTime,
                      stop.estimatedDuration || 60,
                      stop.openingHours,
                      currentDate
                    );
                    if (tc.waitMinutes && tc.waitMinutes > 0) {
                      preWaitMin = tc.waitMinutes;
                      preWaitType = "wait";
                      simTime += tc.waitMinutes;
                    }
                  }
                  itemDuration = stop.estimatedDuration || 0;
                }
              }

              const stopArrivalTime = simTime;
              const itemStartTime = simTime;
              simTime += itemDuration;
              autoWaitBufferMin += preWaitMin;

              // Segment calculation (segment renders right before the next physical stop)
              const nextPhysicalIdx = dayItems.slice(idx + 1).findIndex((id) => !id.startsWith("custom-buffer-"));
              const hasPrevPhysical = dayItems.slice(0, idx + 1).some((id) => !id.startsWith("custom-buffer-"));

              let segmentData: { seg: RouteSegment; segIdx: number; segTimeMin: number } | null = null;
              if (hasPrevPhysical && nextPhysicalIdx === 0 && simSegIdx < route.segments.length) {
                const seg = route.segments[simSegIdx];
                const segIdx = simSegIdx;
                simSegIdx++;
                const segTimeMin = Math.round(seg.time / 60);
                simTime += segTimeMin;
                segmentData = { seg, segIdx, segTimeMin };
              }

              return {
                itemId,
                idx,
                isFirst,
                isLast,
                preWaitMin,
                preWaitType,
                preWaitStartTime: stopArrivalTime - preWaitMin,
                startTime: itemStartTime,
                stopArrivalTime,
                itemDuration,
                segmentData,
                customBuf,
                stop,
              };
            });

            const visitMin = route.stops.reduce(
              (acc, s) => acc + (s.estimatedDuration || 0),
              0,
            );
            const dayCustomBuffers = customBuffers.filter((b) => b.dayIndex === i);
            const customBufferMin = dayCustomBuffers.reduce((acc, b) => acc + (b.duration || 0), 0);
            const arrivalFlightBuffer = showFlights && isFirstDay && arrivalFlight ? (arrivalFlight.buffer ?? 30) : 0;
            const bufferMin = customBufferMin + autoWaitBufferMin + arrivalFlightBuffer;
            const travelMin = Math.round(route.totalTime / 60);
            const totalDayMin = visitMin + travelMin + bufferMin;
            const remainingTime = Math.max(0, dayAvailableMinutes - totalDayMin);
            const isOverBudget = totalDayMin > dayAvailableMinutes;
            const budgetPct = Math.min(
              100,
              Math.round((totalDayMin / dayAvailableMinutes) * 100),
            );

            const isExpanded = expandedDays.has(i);

            return (
              <div
                key={i}
                id={`schedule-day-${i}`}
                className={`flex-shrink-0 w-80 md:w-96 snap-start ${i >= 3 && !isExpanded ? "content-auto-day" : ""}`}
              >
                <div
                  className={`bg-white dark:bg-surface-800 rounded-2xl border border-surface-100 dark:border-surface-700 shadow-xl overflow-hidden flex flex-col ${isExpanded ? "h-auto max-h-none" : "h-full max-h-[600px]"
                    }`}
                >
                  <div className="p-4 border-b border-surface-100 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1 min-w-0 pr-2">
                        {editingDayTitleIndex === i ? (
                          <div className="flex items-center gap-1.5 w-full">
                            <input
                              ref={titleInputRef}
                              type="text"
                              value={editingDayTitleText}
                              onChange={(e) => setEditingDayTitleText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveDayTitle(i);
                                if (e.key === "Escape") setEditingDayTitleIndex(null);
                              }}
                              placeholder="e.g. Kyoto Day 1!"
                              maxLength={40}
                              className="w-full max-w-[200px] bg-white dark:bg-surface-900 border border-primary-500 rounded-lg px-2 py-1 text-sm font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveDayTitle(i)}
                              className="p-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors cursor-pointer shadow-2xs shrink-0"
                              title="Save day name"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDayTitleIndex(null)}
                              className="p-1.5 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors cursor-pointer shrink-0"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          (() => {
                            const customName = route.title || dayTitles[i];
                            return (
                              <div className="flex flex-col min-w-0">
                                <div
                                  onClick={() => startEditingDayTitle(i, customName)}
                                  className="group/title flex items-center gap-1.5 cursor-pointer max-w-full"
                                  title="Click to rename this day (e.g. Kyoto Day 1!)"
                                >
                                  <h3 className="text-lg font-black text-surface-900 dark:text-white leading-tight truncate group-hover/title:text-primary-600 dark:group-hover/title:text-primary-400 transition-colors">
                                    {customName || `Day ${i + 1}`}
                                  </h3>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingDayTitle(i, customName);
                                    }}
                                    className="opacity-0 group-hover/title:opacity-100 p-1 text-surface-400 hover:text-primary-600 dark:hover:text-primary-400 rounded transition-all cursor-pointer shrink-0"
                                    title="Rename day"
                                    aria-label="Rename day"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-surface-500 dark:text-surface-400">
                                  {customName ? (
                                    <>
                                      <span>Day {i + 1}</span>
                                      {dateMode === "fixed" && (
                                        <>
                                          <span>•</span>
                                          <span className="text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                                            {format(currentDate, "MMM d (EEE)")}
                                          </span>
                                        </>
                                      )}
                                    </>
                                  ) : (
                                    dateMode === "fixed" && (
                                      <span className="text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                                        {format(currentDate, "MMM d (EEE)")}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                      <div className="flex items-center gap-2 relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (addBufferDayIndex === i) {
                              setAddBufferDayIndex(null);
                            } else {
                              setAddBufferDayIndex(i);
                              setNewBufferDuration(30);
                              setNewBufferLabel("Rest Break");
                            }
                          }}
                          className={`p-1.5 px-2.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${addBufferDayIndex === i
                            ? "bg-amber-600 text-white border-amber-600 shadow-amber-500/20"
                            : "bg-white dark:bg-surface-700 border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-200 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            }`}
                          title="Add custom buffer or break to this day"
                        >
                          <Plus className="w-3.5 h-3.5 text-amber-500" />
                          <span>Buffer</span>
                        </button>

                        {/* Add Buffer Popover */}
                        {addBufferDayIndex === i && (
                          <div className="absolute top-10 right-0 z-50 w-72 bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150 text-left">
                            <div className="flex items-center justify-between pb-1 border-b border-surface-100 dark:border-surface-700">
                              <span className="text-xs font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                                <Coffee className="w-3.5 h-3.5 text-amber-500" />
                                Add Day {i + 1} Buffer
                              </span>
                              <button
                                type="button"
                                onClick={() => setAddBufferDayIndex(null)}
                                className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 p-0.5"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Label input */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-surface-500 uppercase">
                                Activity / Label:
                              </label>
                              <input
                                type="text"
                                value={newBufferLabel}
                                onChange={(e) => setNewBufferLabel(e.target.value)}
                                placeholder="e.g. Lunch Break, Coffee Stop..."
                                className="w-full bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                              />
                              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                {["Rest Break", "Coffee / Snack", "Lunch Break", "Buffer Time"].map((chip) => (
                                  <button
                                    key={chip}
                                    type="button"
                                    onClick={() => setNewBufferLabel(chip)}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-600 hover:border-amber-400 transition-colors"
                                  >
                                    {chip}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Duration input */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-surface-500 uppercase">
                                Duration:
                              </label>
                              <div className="flex items-center border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-surface-50 dark:bg-surface-900">
                                <button
                                  type="button"
                                  onClick={() => setNewBufferDuration((m) => Math.max(5, m - 15))}
                                  className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors"
                                >
                                  -15
                                </button>
                                <input
                                  type="number"
                                  min="5"
                                  max="480"
                                  step="5"
                                  value={newBufferDuration}
                                  onChange={(e) => setNewBufferDuration(Math.max(5, parseInt(e.target.value) || 5))}
                                  className="flex-1 min-w-0 bg-transparent text-center text-xs font-bold text-surface-900 dark:text-white py-1 focus:outline-none"
                                />
                                <span className="text-[10px] text-surface-400 dark:text-surface-500 pr-2 font-medium">
                                  min
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setNewBufferDuration((m) => m + 15)}
                                  className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors"
                                >
                                  +15
                                </button>
                              </div>
                              <div className="flex items-center gap-1 flex-wrap">
                                {[15, 30, 45, 60, 90].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setNewBufferDuration(preset)}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${newBufferDuration === preset
                                      ? "bg-amber-600 text-white border-amber-600"
                                      : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-600"
                                      }`}
                                  >
                                    {preset}m
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
                              <button
                                type="button"
                                onClick={() => setAddBufferDayIndex(null)}
                                className="px-2.5 py-1 text-xs font-semibold text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  addCustomBuffer(i, newBufferDuration, newBufferLabel || "Custom Buffer");
                                  toast.success(`Added ${newBufferDuration}m buffer to Day ${i + 1}`);
                                  setAddBufferDayIndex(null);
                                }}
                                className="px-3 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-md shadow-2xs transition-colors"
                              >
                                Add Buffer
                              </button>
                            </div>
                          </div>
                        )}

                        {route.stops.length > 1 && (
                          <button
                            onClick={() => handleOptimizeSingleDay(i)}
                            disabled={optimizingDayIndex !== null}
                            className="p-1.5 rounded-lg bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-all disabled:opacity-50 cursor-pointer"
                            title="Optimize this day's route"
                            aria-label="Optimize route"
                          >
                            {optimizingDayIndex === i ? (
                              <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                            ) : (
                              <Wand2 className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleDayExpanded(i)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${isExpanded
                            ? "bg-primary-50 dark:bg-primary-900/40 border-primary-300 dark:border-primary-600 text-primary-600 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/60"
                            : "bg-white dark:bg-surface-700 border-surface-200 dark:border-surface-600 text-surface-500 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-600"
                            }`}
                          title={isExpanded ? "Collapse to compact scrollable card" : "Expand to view entire day without scrolling"}
                          aria-label={isExpanded ? `Collapse Day ${i + 1}` : `Expand Day ${i + 1}`}
                        >
                          {isExpanded ? (
                            <Minimize2 className="w-4 h-4" />
                          ) : (
                            <Maximize2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-tight flex-wrap">
                        <span className="flex items-center gap-1.5 bg-surface-100 dark:bg-surface-700/50 px-2 py-0.5 rounded-full">
                          <Timer className="w-3 h-3 text-primary-500" />
                          <span className="text-surface-400">Visit:</span>
                          <span className="text-surface-600 dark:text-surface-300">
                            {visitMin > 60
                              ? `${Math.floor(visitMin / 60)}h ${visitMin % 60}m`
                              : `${visitMin}m`}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5 bg-surface-100 dark:bg-surface-700/50 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3 text-primary-500" />
                          <span className="text-surface-400">Travel:</span>
                          <span className="text-surface-600 dark:text-surface-300">
                            {travelMin > 60
                              ? `${Math.floor(travelMin / 60)}h ${travelMin % 60}m`
                              : `${travelMin}m`}
                          </span>
                        </span>
                        {bufferMin > 0 && (
                          <span className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50">
                            <Coffee className="w-3 h-3 text-amber-500" />
                            <span className="text-surface-400 dark:text-amber-400/70">Buffer:</span>
                            <span>
                              {bufferMin > 60
                                ? `${Math.floor(bufferMin / 60)}h ${bufferMin % 60}m`
                                : `${bufferMin}m`}
                            </span>
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded ${isOverBudget ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}
                      >
                        {isOverBudget
                          ? "OVER BUDGET"
                          : remainingTime >= 60
                            ? `${Math.floor(remainingTime / 60)}h ${remainingTime % 60}m left`
                            : `${remainingTime}m left`}
                      </div>
                    </div>

                    {/* Budget bar */}
                    <div className="w-full bg-surface-100 dark:bg-surface-700 rounded-full h-1 mt-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOverBudget ? "bg-red-500" : "bg-primary-500"}`}
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                  </div>

                  <div
                    ref={(el) => {
                      if (el) dayScrollRefs.current.set(i, el);
                      else dayScrollRefs.current.delete(i);
                    }}
                    className={`flex-1 overflow-x-hidden pl-8 pr-4 py-4 space-y-0 relative smooth-scroll-container ${isExpanded ? "overflow-visible" : "overflow-y-auto custom-scrollbar"
                      }`}
                  >
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      autoScroll={false}
                      onDragStart={() => setActiveDragDay(i)}
                      onDragEnd={(event) => {
                        setActiveDragDay(null);
                        const { active, over } = event;
                        if (over && active.id !== over.id) {
                          reorderDayStops(
                            i,
                            active.id as string,
                            over.id as string,
                          );
                        }
                      }}
                      onDragCancel={() => setActiveDragDay(null)}
                    >
                      <SortableContext
                        items={dayItems}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="flex flex-col relative">
                          {(() => {
                            let lastMealDepartureTime: number | null = null;

                            return itemScheduleList.map((item) => {
                              const {
                                itemId,
                                isFirst,
                                isLast,
                                preWaitMin,
                                preWaitType,
                                preWaitStartTime,
                                startTime,
                                stopArrivalTime,
                                segmentData,
                                customBuf,
                                stop,
                              } = item;

                              let element = null;
                              let preBufferPill = null;

                              if (preWaitMin > 0 && stop) {
                                const isRes = preWaitType === "reservation";
                                const openTimeFormatted = formatTime(stopArrivalTime);
                                preBufferPill = (
                                  <BufferPill
                                    key={isRes ? `buffer-${stop.id}` : `wait-buffer-${stop.id}`}
                                    minutes={preWaitMin}
                                    startTime={preWaitStartTime}
                                    label={
                                      isRes
                                        ? `Buffer: ${preWaitMin} min free time before reservation`
                                        : `Buffer: ${preWaitMin} min wait until opening (${openTimeFormatted})`
                                    }
                                    isReservation={isRes}
                                    showLine={!isFirst}
                                    type={isRes ? "reservation" : "wait"}
                                    stopName={stop.name}
                                    reservationTime={stop.customTime}
                                    onSaveReservationTime={
                                      isRes
                                        ? async (newTime) => {
                                          updatePlace(stop.id, { customTime: newTime });
                                          toast.success(`Updated ${stop.name} reservation to ${formatTimeString(newTime)}`);
                                          try {
                                            await useRouteStore.getState().optimizeDay(i);
                                          } catch (e) {
                                            console.error("Failed to re-optimize day after setting custom time", e);
                                          }
                                        }
                                        : undefined
                                    }
                                  />
                                );
                              }

                              if (itemId === "arrival" && arrivalFlight) {
                                const arrMin = parseTimeToMinutes(arrivalFlight.time);
                                const arrBuffer = arrivalFlight.buffer ?? 30;
                                element = (
                                  <SortableAnchor
                                    key="arrival"
                                    id="arrival"
                                    type="arrival"
                                    name={
                                      arrivalFlight.location
                                        ? arrivalFlight.location.name
                                        : "Flight Arrival"
                                    }
                                    time={arrivalFlight.time}
                                    buffer={arrBuffer}
                                    bufferStartTime={arrMin}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                    onUpdateBuffer={(newBuffer) => {
                                      setArrivalFlight({ ...arrivalFlight, buffer: newBuffer });
                                      toast.success(`Arrival buffer updated to ${newBuffer}m.`);
                                    }}
                                  />
                                );
                              } else if (
                                itemId === "departure" &&
                                departureFlight
                              ) {
                                const depMin = parseTimeToMinutes(departureFlight.time);
                                const depBuffer = departureFlight.buffer ?? 90;
                                const depBufferStart = depMin - depBuffer;
                                element = (
                                  <SortableAnchor
                                    key="departure"
                                    id="departure"
                                    type="departure"
                                    name={
                                      departureFlight.location
                                        ? departureFlight.location.name
                                        : "Flight Departure"
                                    }
                                    time={departureFlight.time}
                                    buffer={depBuffer}
                                    bufferStartTime={depBufferStart}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                    onUpdateBuffer={(newBuffer) => {
                                      setDepartureFlight({ ...departureFlight, buffer: newBuffer });
                                      toast.success(`Departure buffer updated to ${newBuffer}m.`);
                                    }}
                                  />
                                );
                              } else if (
                                itemId === "start-hotel" &&
                                route.startHotel
                              ) {
                                element = (
                                  <SortableAnchor
                                    key="start-hotel"
                                    id="start-hotel"
                                    name={route.startHotel.name}
                                    type="start-hotel"
                                    calculatedTime={startTime}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                  />
                                );
                              } else if (
                                itemId === "end-hotel" &&
                                route.endHotel &&
                                !isLastDay
                              ) {
                                element = (
                                  <SortableAnchor
                                    key="end-hotel"
                                    id="end-hotel"
                                    name={route.endHotel.name}
                                    type="end-hotel"
                                    calculatedTime={startTime}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                  />
                                );
                              } else if (itemId.startsWith("custom-buffer-") && customBuf) {
                                element = (
                                  <SortableCustomBuffer
                                    key={customBuf.id}
                                    buffer={customBuf}
                                    startTime={startTime}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                    onUpdate={(updates) => updateCustomBuffer(customBuf.id, updates)}
                                    onDelete={() => {
                                      deleteCustomBuffer(customBuf.id);
                                      toast.success("Buffer removed");
                                    }}
                                  />
                                );
                              } else if (stop) {
                                let mealGapAlert: { gap: number; minGap: number } | null = null;
                                const minSpacing = categoryConfigs?.[stop.category]?.minTimeBetween ?? (stop.category === "restaurant" ? 180 : 0);
                                if (minSpacing > 0 && stop.category === "restaurant") {
                                  if (lastMealDepartureTime !== null) {
                                    const gap = stopArrivalTime - lastMealDepartureTime;
                                    if (gap < minSpacing) {
                                      mealGapAlert = { gap, minGap: minSpacing };
                                    }
                                  }
                                }

                                element = (
                                  <SortableStop
                                    key={stop.id}
                                    stop={stop}
                                    stopArrivalTime={stopArrivalTime}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                    unassignPlace={unassignPlace}
                                    updatePlace={updatePlace}
                                    dayIndex={i}
                                    dateMode={dateMode}
                                    currentDate={currentDate}
                                    onEdit={handleEditPlace}
                                    mealGapAlert={mealGapAlert}
                                  />
                                );
                                if (stop.category === "restaurant") {
                                  lastMealDepartureTime = stopArrivalTime + (stop.estimatedDuration || 60);
                                }
                              }

                              if (!element) return null;

                              let segmentElement = null;
                              if (segmentData) {
                                segmentElement = (
                                  <div
                                    className="mt-[-4px]"
                                    key={`seg-${itemId}-${segmentData.segIdx}`}
                                  >
                                    <SegmentPill
                                      segment={segmentData.seg}
                                      dayIndex={i}
                                      segmentIndex={segmentData.segIdx}
                                    />
                                  </div>
                                );
                              }

                              return (
                                <React.Fragment key={`group-${itemId}`}>
                                  {preBufferPill}
                                  {element}
                                  {segmentElement}
                                </React.Fragment>
                              );
                            });
                          })()}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {editingPlaceId && (
        <React.Suspense fallback={null}>
          <EditPlaceModal
            placeId={editingPlaceId}
            onClose={() => setEditingPlaceId(null)}
          />
        </React.Suspense>
      )}
    </>
  );
};
