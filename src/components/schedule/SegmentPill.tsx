import React, { useState, useRef, useEffect } from "react";
import { useRouteStore } from "../../store/useRouteStore";
import { Footprints, Train, Car, ChevronDown, Pencil, RotateCcw, X, Clock } from "lucide-react";
import { RouteSegment, TravelMode } from "../../types";
import { toast } from "../../services/toastService";

export interface SegmentPillProps {
  segment: RouteSegment;
  dayIndex: number;
  segmentIndex: number;
}

export const SegmentPill: React.FC<SegmentPillProps> = React.memo(
  ({ segment, dayIndex, segmentIndex }) => {
    const updateSegmentTravelMode = useRouteStore((s) => s.updateSegmentTravelMode);
    const updateSegmentTransitTime = useRouteStore((s) => s.updateSegmentTransitTime);
    const distanceUnit = useRouteStore((s) => s.distanceUnit);

    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const activeMinutes = Math.round(segment.time / 60);
    const [customMinutesInput, setCustomMinutesInput] = useState(activeMinutes);
    const popoverRef = useRef<HTMLDivElement>(null);

    const isCustom = segment.customDuration !== undefined;
    const estimatedMinutes = Math.round((segment.originalTime ?? segment.time) / 60);
    const isHeuristicTransit = segment.travelMode === "transit" && segment.isHeuristic !== false;

    // Synchronize local input state whenever popover opens or segment changes
    useEffect(() => {
      setCustomMinutesInput(activeMinutes);
    }, [activeMinutes, isPopoverOpen]);

    // Handle click outside and Escape key to close popover
    useEffect(() => {
      if (!isPopoverOpen) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          setIsPopoverOpen(false);
        }
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsPopoverOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [isPopoverOpen]);

    const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateSegmentTravelMode(
        dayIndex,
        segmentIndex,
        e.target.value as TravelMode,
      );
    };

    const handleApplyCustomTime = () => {
      const validMin = Math.max(1, Math.min(480, Number(customMinutesInput) || 1));
      updateSegmentTransitTime(dayIndex, segmentIndex, validMin);
      toast.success(`Transit time set to ${validMin} min.`);
      setIsPopoverOpen(false);
    };

    const handleResetToEstimate = () => {
      updateSegmentTransitTime(dayIndex, segmentIndex, null);
      toast.success(`Transit time reset to estimated ${estimatedMinutes} min.`);
      setIsPopoverOpen(false);
    };

    const getModeIcon = () => {
      switch (segment.travelMode) {
        case "walking":
          return <Footprints className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
        case "transit":
          return <Train className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />;
        case "driving":
        default:
          return <Car className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />;
      }
    };

    const formattedDistance = (() => {
      const dist = segment.distance;
      if (distanceUnit === "imperial") {
        const ft = dist * 3.28084;
        if (ft >= 100) {
          const mi = ft / 5280;
          return `${mi < 0.1 ? mi.toFixed(2) : mi.toFixed(1)} mi`;
        }
        return `${Math.round(ft)} ft`;
      } else {
        if (dist >= 30) {
          const km = dist / 1000;
          return `${km < 0.1 ? km.toFixed(2) : km.toFixed(1)} km`;
        }
        return `${Math.round(dist)} m`;
      }
    })();

    const PRESETS = [5, 10, 15, 20, 30, 45, 60, 90];

    return (
      <div className="pt-0 pb-3 pl-12 relative group">
        {/* Line connector segment - vertical timeline path */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-surface-200 dark:bg-surface-700/50" />

        <div className="relative inline-block">
          {/* Main Segment Pill */}
          <div
            className={`travel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all shadow-2xs ${
              isCustom
                ? "bg-indigo-50/95 dark:bg-indigo-950/70 border border-indigo-300 dark:border-indigo-600/80 text-indigo-900 dark:text-indigo-200"
                : isHeuristicTransit
                ? "bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-600/70 text-amber-900 dark:text-amber-200"
                : "bg-surface-50 dark:bg-surface-700/90 border border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-100"
            }`}
          >
            {/* Travel Mode Dropdown */}
            <div
              className="relative flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              title="Change travel mode (Driving, Transit, Walking)"
            >
              {getModeIcon()}
              <ChevronDown className="w-3 h-3 text-surface-400 dark:text-surface-400" />
              <select
                value={segment.travelMode || "driving"}
                onChange={handleModeChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-white dark:bg-surface-800 text-surface-900 dark:text-white"
                title="Change travel mode"
                style={{ colorScheme: "dark light" }}
              >
                <option value="driving" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white">
                  🚗 Driving
                </option>
                <option value="transit" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white">
                  🚆 Transit
                </option>
                <option value="walking" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white">
                  🚶 Walking
                </option>
              </select>
            </div>

            <span className="text-surface-300 dark:text-surface-500">•</span>

            {/* Clickable Custom Transit Time Trigger */}
            <button
              type="button"
              onClick={() => setIsPopoverOpen((prev) => !prev)}
              className={`group/time flex items-center gap-1 font-semibold rounded px-1 -mx-0.5 transition-colors cursor-pointer ${
                isCustom
                  ? "text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                  : "text-surface-900 dark:text-surface-100 hover:bg-surface-200/70 dark:hover:bg-surface-600/70"
              }`}
              title={
                isCustom
                  ? `Custom transit time: ${activeMinutes} min (Estimated: ${estimatedMinutes} min) • Click to edit or reset`
                  : `Estimated transit time: ${activeMinutes} min • Click to customize`
              }
            >
              <span>{activeMinutes} min</span>
              {isCustom && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-indigo-200/90 dark:bg-indigo-800/90 text-indigo-900 dark:text-indigo-100 leading-none uppercase tracking-wider">
                  custom
                </span>
              )}
              <Pencil className="w-2.5 h-2.5 opacity-40 group-hover/time:opacity-100 transition-opacity ml-0.5 text-surface-500 dark:text-surface-400" />
            </button>

            <span className="text-surface-300 dark:text-surface-500">•</span>

            {/* Distance Display */}
            <span className="text-surface-600 dark:text-surface-300">
              {formattedDistance}
            </span>
          </div>

          {/* Customize Transit Time Popover */}
          {isPopoverOpen && (
            <div
              ref={popoverRef}
              className="absolute left-0 top-full mt-2 z-50 w-72 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-2xl p-3.5 animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between pb-2 border-b border-surface-100 dark:border-surface-700 mb-3">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="text-xs font-bold text-surface-900 dark:text-white">
                    Customize Transit Time
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPopoverOpen(false)}
                  className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 p-1 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Leg Details Note */}
              <div className="text-[11px] text-surface-500 dark:text-surface-400 mb-3 flex items-center justify-between">
                <span>
                  {segment.travelMode === "transit" ? "🚆 Transit" : segment.travelMode === "walking" ? "🚶 Walking" : "🚗 Driving"} • {formattedDistance}
                </span>
                <span className="text-surface-400">
                  Est: <strong className="text-surface-700 dark:text-surface-300">{estimatedMinutes}m</strong>
                </span>
              </div>

              {/* Duration Stepper Input */}
              <div className="space-y-2 mb-3">
                <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider block">
                  Transit Duration:
                </label>
                <div className="flex items-center border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-surface-50 dark:bg-surface-900 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setCustomMinutesInput((m) => Math.max(1, m - 5))}
                    className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors cursor-pointer"
                    title="-5 minutes"
                  >
                    -5
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="480"
                    step="1"
                    value={customMinutesInput}
                    onChange={(e) => setCustomMinutesInput(Math.max(1, parseInt(e.target.value) || 1))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyCustomTime();
                    }}
                    className="flex-1 min-w-0 bg-transparent text-center text-xs font-bold text-surface-900 dark:text-white py-1 focus:outline-none"
                    autoFocus
                  />
                  <span className="text-[11px] text-surface-400 dark:text-surface-500 pr-2 font-medium">
                    min
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomMinutesInput((m) => Math.min(480, m + 5))}
                    className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors cursor-pointer"
                    title="+5 minutes"
                  >
                    +5
                  </button>
                </div>
              </div>

              {/* Quick Preset Chips */}
              <div className="space-y-1 mb-4">
                <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider block">
                  Quick Presets:
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustomMinutesInput(preset)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        customMinutesInput === preset
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-surface-100 dark:bg-surface-700/80 text-surface-700 dark:text-surface-300 border-surface-200 dark:border-surface-600 hover:border-indigo-400"
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Popover Actions */}
              <div className="flex items-center justify-between pt-2.5 border-t border-surface-100 dark:border-surface-700">
                {isCustom ? (
                  <button
                    type="button"
                    onClick={handleResetToEstimate}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:underline cursor-pointer"
                    title="Revert back to calculated duration"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                ) : (
                  <span className="text-[11px] text-surface-400 italic">
                    Original: {estimatedMinutes}m
                  </span>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsPopoverOpen(false)}
                    className="px-2.5 py-1 text-xs font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyCustomTime}
                    className="px-3 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
