import React, { useState } from "react";
import { Layers, X, Star, EyeOff, CheckCircle2, Trash2, CalendarDays } from "lucide-react";
import type { DayRangeConstraint } from "../../types";
import { formatDayIndexLabel } from "../../utils/dayRangeUtils";

export interface PlaceMassEditBarProps {
  showMassEditBar: boolean;
  filteredPlacesCount: number;
  searchQuery: string;
  days: number;
  dayTitles?: Record<number, string>;
  startDate?: string;
  allFilteredStarred: boolean;
  onMassStar: () => void;
  allFilteredDisabled: boolean;
  onMassDisabled: () => void;
  onApplyDayRestriction: (range: DayRangeConstraint | null) => void;
  onMassAssignDay: (targetDay: number | "unassign") => void;
  onMassDelete: () => void;
  onClose: () => void;
}

export const PlaceMassEditBar: React.FC<PlaceMassEditBarProps> = React.memo(
  ({
    showMassEditBar,
    filteredPlacesCount,
    searchQuery,
    days,
    dayTitles,
    startDate,
    allFilteredStarred,
    onMassStar,
    allFilteredDisabled,
    onMassDisabled,
    onApplyDayRestriction,
    onMassAssignDay,
    onMassDelete,
    onClose,
  }) => {
    const [showDateRangePicker, setShowDateRangePicker] = useState(false);
    const [rangeStart, setRangeStart] = useState(0);
    const [rangeEnd, setRangeEnd] = useState(Math.max(0, days - 1));

    if (!showMassEditBar) return null;

    const isSearching = searchQuery.trim().length > 0;
    const dayIndices = Array.from({ length: days }, (_, i) => i);

    const handleApplyRange = () => {
      const start = Math.min(rangeStart, rangeEnd);
      const end = Math.max(rangeStart, rangeEnd);
      onApplyDayRestriction({ startDay: start, endDay: end });
      setShowDateRangePicker(false);
    };

    const handleClearRestriction = () => {
      onApplyDayRestriction(null);
      setShowDateRangePicker(false);
    };

    const handleClose = () => {
      setShowDateRangePicker(false);
      onClose();
    };

    return (
      <div className="bg-primary-50/90 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800/80 rounded-xl p-3 mb-3 text-xs shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-primary-200/60 dark:border-primary-800/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary-100 dark:bg-primary-900/70 flex items-center justify-center text-primary-700 dark:text-primary-300 shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-surface-900 dark:text-white">
                Mass Edit {filteredPlacesCount} Result{filteredPlacesCount === 1 ? "" : "s"}
              </span>
              {isSearching && (
                <span className="text-surface-500 dark:text-surface-400">
                  matching &ldquo;
                  <span className="font-semibold text-primary-700 dark:text-primary-300">
                    {searchQuery.trim()}
                  </span>
                  &rdquo;
                </span>
              )}
              {!isSearching && (
                <span className="text-surface-500 dark:text-surface-400">
                  (in current view)
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 rounded cursor-pointer transition-colors self-end sm:self-center"
            title="Close mass edit banner"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Restrict to Date / Day Range Button */}
          <button
            type="button"
            onClick={() => setShowDateRangePicker((prev) => !prev)}
            className={`h-8 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs ${
              showDateRangePicker
                ? "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700 shadow-xs"
                : "bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700"
            }`}
            title="Restrict all results to a specific date or day range (e.g., Days 2–4)"
          >
            <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Restrict Date Range</span>
          </button>

          {/* Star All / Unstar All */}
          <button
            type="button"
            onClick={onMassStar}
            className={`h-8 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs ${
              allFilteredStarred
                ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-200/80"
                : "bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700"
            }`}
            title={
              allFilteredStarred
                ? "Remove star priority from all results"
                : "Star all results as must-visit"
            }
          >
            <Star
              className={`w-3.5 h-3.5 ${
                allFilteredStarred ? "fill-amber-500 text-amber-500" : "text-amber-500"
              }`}
            />
            <span>{allFilteredStarred ? "Unstar All" : "Star All"}</span>
          </button>

          {/* Exclude All / Include All */}
          <button
            type="button"
            onClick={onMassDisabled}
            className={`h-8 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs ${
              allFilteredDisabled
                ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100"
                : "bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700"
            }`}
            title={
              allFilteredDisabled
                ? "Re-enable all results for routing"
                : "Exclude all results from routing"
            }
          >
            {allFilteredDisabled ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Re-enable All</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Exclude All</span>
              </>
            )}
          </button>

          {/* Hard Assign to Specific Day */}
          <select
            defaultValue=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              if (val === "unassign") {
                onMassAssignDay("unassign");
              } else if (val.startsWith("day-")) {
                const d = parseInt(val.replace("day-", ""), 10);
                onMassAssignDay(d);
              }
              e.target.value = "";
            }}
            className="h-8 text-xs font-semibold bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer shadow-2xs"
            style={{ colorScheme: "dark light" }}
            title="Directly assign all results to a specific itinerary day (or unassign all)"
          >
            <option value="" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100">
              📌 Assign to Day...
            </option>
            <option value="unassign" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100">
              Unassign All
            </option>
            <optgroup
              label="Assign to Specific Day"
              className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 font-bold"
            >
              {dayIndices.map((i) => {
                const title = dayTitles?.[i]?.trim();
                return (
                  <option
                    key={i}
                    value={`day-${i}`}
                    className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 font-normal"
                  >
                    Day {i + 1}
                    {title ? `: ${title}` : ""}
                  </option>
                );
              })}
            </optgroup>
          </select>

          {/* Delete All */}
          <button
            type="button"
            onClick={onMassDelete}
            className="h-8 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 bg-white dark:bg-surface-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all cursor-pointer shadow-2xs ml-auto"
            title={`Remove all ${filteredPlacesCount} results from trip`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete All</span>
          </button>
        </div>

        {/* Dedicated Date / Day Range Restriction Panel */}
        {showDateRangePicker && (
          <div className="mt-3 pt-3 border-t border-primary-200/60 dark:border-primary-800/50 space-y-3 bg-white/60 dark:bg-surface-900/40 rounded-lg p-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div>
                <span className="font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Restrict {filteredPlacesCount} Place{filteredPlacesCount === 1 ? "" : "s"} to Date / Day Range
                </span>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 mt-0.5">
                  The optimizer will only schedule these places within your chosen start and end dates.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearRestriction}
                className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline self-start sm:self-auto cursor-pointer"
                title="Remove any date range constraints from all matching places"
              >
                Clear Day Restriction
              </button>
            </div>

            {/* Date Range Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider block mb-1">
                  From (Start Date / Day)
                </label>
                <select
                  value={rangeStart}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setRangeStart(val);
                    if (val > rangeEnd) setRangeEnd(val);
                  }}
                  className="w-full h-8 text-xs font-semibold bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer shadow-2xs"
                  style={{ colorScheme: "dark light" }}
                >
                  {dayIndices.map((i) => (
                    <option
                      key={i}
                      value={i}
                      className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100"
                    >
                      {formatDayIndexLabel(i, startDate, dayTitles)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider block mb-1">
                  To (End Date / Day)
                </label>
                <select
                  value={rangeEnd}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setRangeEnd(val);
                    if (val < rangeStart) setRangeStart(val);
                  }}
                  className="w-full h-8 text-xs font-semibold bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer shadow-2xs"
                  style={{ colorScheme: "dark light" }}
                >
                  {dayIndices.map((i) => (
                    <option
                      key={i}
                      value={i}
                      className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100"
                    >
                      {formatDayIndexLabel(i, startDate, dayTitles)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Range Presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">
                Presets:
              </span>
              <button
                type="button"
                onClick={() => {
                  setRangeStart(0);
                  setRangeEnd(days - 1);
                }}
                className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-100 hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer border border-surface-200 dark:border-surface-700"
              >
                Full Trip
              </button>
              {days > 2 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRangeStart(0);
                      setRangeEnd(Math.ceil(days / 2) - 1);
                    }}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-100 hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer border border-surface-200 dark:border-surface-700"
                  >
                    First Half (Days 1–{Math.ceil(days / 2)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRangeStart(Math.ceil(days / 2));
                      setRangeEnd(days - 1);
                    }}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-100 hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer border border-surface-200 dark:border-surface-700"
                  >
                    Second Half (Days {Math.ceil(days / 2) + 1}–{days})
                  </button>
                </>
              )}
              {dayIndices.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setRangeStart(i);
                    setRangeEnd(i);
                  }}
                  className={`text-[11px] font-medium px-1.5 py-0.5 rounded transition-colors cursor-pointer border ${
                    rangeStart === i && rangeEnd === i
                      ? "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700 font-bold"
                      : "bg-surface-50 hover:bg-surface-100 dark:bg-surface-800/80 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700"
                  }`}
                >
                  Day {i + 1}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1 border-t border-surface-200/50 dark:border-surface-700/50">
              <button
                type="button"
                onClick={handleApplyRange}
                className="h-7 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer transition-colors shadow-2xs"
              >
                Apply Date Range
              </button>
              <button
                type="button"
                onClick={() => setShowDateRangePicker(false)}
                className="h-7 px-2.5 rounded-lg bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600 font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);

PlaceMassEditBar.displayName = "PlaceMassEditBar";
