import React, { useState } from "react";
import { Layers, X, Star, EyeOff, CheckCircle2, Trash2, CalendarDays, Plus } from "lucide-react";
import type { DayRangeConstraint } from "../../types";
import { formatDayIndexLabel, mergeOverlappingRanges, MAX_DAY_RANGES } from "../../utils/dayRangeUtils";

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
  onApplyDayRestriction: (ranges: DayRangeConstraint[] | null) => void;
  onMassAssignDay: (targetDay: number | "unassign") => void;
  onMassDelete: () => void;
  onClose: () => void;
}

interface RangeRow {
  startDay: number;
  endDay: number;
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
    const [rangeRows, setRangeRows] = useState<RangeRow[]>([
      { startDay: 0, endDay: Math.max(0, days - 1) },
    ]);

    if (!showMassEditBar) return null;

    const isSearching = searchQuery.trim().length > 0;
    const dayIndices = Array.from({ length: days }, (_, i) => i);

    const handleAddRange = () => {
      if (rangeRows.length >= MAX_DAY_RANGES) return;
      setRangeRows((prev) => [...prev, { startDay: 0, endDay: Math.max(0, days - 1) }]);
    };

    const handleRemoveRange = (idx: number) => {
      setRangeRows((prev) => {
        if (prev.length <= 1) return prev; // keep at least one
        return prev.filter((_, i) => i !== idx);
      });
    };

    const handleUpdateRange = (
      idx: number,
      field: "startDay" | "endDay",
      value: number
    ) => {
      setRangeRows((prev) =>
        prev.map((row, i) => {
          if (i !== idx) return row;
          const updated = { ...row, [field]: value };
          // Auto-fix: start must not exceed end
          if (field === "startDay" && value > row.endDay) {
            updated.endDay = value;
          } else if (field === "endDay" && value < row.startDay) {
            updated.startDay = value;
          }
          return updated;
        })
      );
    };

    const handleApplyRanges = () => {
      const constraints: DayRangeConstraint[] = rangeRows.map((r) => ({
        startDay: Math.min(r.startDay, r.endDay),
        endDay: Math.max(r.startDay, r.endDay),
      }));
      const merged = mergeOverlappingRanges(constraints);
      onApplyDayRestriction(merged);
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
                <span className="text-surface-500 dark:text-surface-400">(in current view)</span>
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
          {/* Restrict Date Range Button */}
          <button
            type="button"
            onClick={() => setShowDateRangePicker((prev) => !prev)}
            className={`h-8 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs ${
              showDateRangePicker
                ? "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700 shadow-xs"
                : "bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700"
            }`}
            title="Restrict all results to specific date or day ranges"
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
            title={allFilteredStarred ? "Remove star priority from all results" : "Star all results as must-visit"}
          >
            <Star className={`w-3.5 h-3.5 ${allFilteredStarred ? "fill-amber-500 text-amber-500" : "text-amber-500"}`} />
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
            title={allFilteredDisabled ? "Re-enable all results for routing" : "Exclude all results from routing"}
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

          {/* Assign to Day */}
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
            title="Assign all results directly to a day or unassign all"
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
                    Day {i + 1}{title ? `: ${title}` : ""}
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

        {/* Multi-Range Date Restriction Panel */}
        {showDateRangePicker && (
          <div className="mt-3 pt-3 border-t border-primary-200/60 dark:border-primary-800/50 space-y-3 bg-white/60 dark:bg-surface-900/40 rounded-lg p-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div>
                <span className="font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Restrict {filteredPlacesCount} Place{filteredPlacesCount === 1 ? "" : "s"} to Date Ranges
                </span>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 mt-0.5">
                  Add one or more date ranges. The optimizer will schedule these places within any of the specified windows.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearRestriction}
                className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline self-start sm:self-auto cursor-pointer shrink-0"
                title="Remove all date range constraints"
              >
                Clear All Restrictions
              </button>
            </div>

            {/* Range Rows */}
            <div className="space-y-2">
              {rangeRows.map((row, idx) => (
                <div
                  key={idx}
                  className="flex items-end gap-2 p-2 rounded-lg bg-surface-50/80 dark:bg-surface-800/60 border border-surface-200/80 dark:border-surface-700/60 animate-in fade-in duration-100"
                >
                  <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 shrink-0 self-center">
                    <span className="w-5 h-5 rounded bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-black text-[10px]">
                      {idx + 1}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <label className="text-[10px] font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider block mb-0.5">
                      From
                    </label>
                    <select
                      value={row.startDay}
                      onChange={(e) => handleUpdateRange(idx, "startDay", parseInt(e.target.value, 10))}
                      className="w-full h-7 text-xs font-semibold bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md px-2 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      style={{ colorScheme: "dark light" }}
                    >
                      {dayIndices.map((i) => (
                        <option key={i} value={i} className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100">
                          {formatDayIndexLabel(i, startDate, dayTitles)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-surface-400 dark:text-surface-500 text-xs font-bold self-center pb-0.5">→</span>

                  <div className="flex-1 min-w-0">
                    <label className="text-[10px] font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider block mb-0.5">
                      To
                    </label>
                    <select
                      value={row.endDay}
                      onChange={(e) => handleUpdateRange(idx, "endDay", parseInt(e.target.value, 10))}
                      className="w-full h-7 text-xs font-semibold bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md px-2 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      style={{ colorScheme: "dark light" }}
                    >
                      {dayIndices.map((i) => (
                        <option key={i} value={i} className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100">
                          {formatDayIndexLabel(i, startDate, dayTitles)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Remove button (only if more than 1 range) */}
                  {rangeRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRange(idx)}
                      className="p-1 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer self-center"
                      title="Remove this range"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add Another Range */}
            {rangeRows.length < MAX_DAY_RANGES && (
              <button
                type="button"
                onClick={handleAddRange}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-2.5 py-1.5 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add another date range ({rangeRows.length}/{MAX_DAY_RANGES})</span>
              </button>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1 border-t border-surface-200/50 dark:border-surface-700/50">
              <button
                type="button"
                onClick={handleApplyRanges}
                className="h-7 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer transition-colors shadow-2xs"
              >
                Apply {rangeRows.length > 1 ? `${rangeRows.length} Ranges` : "Range"}
              </button>
              <button
                type="button"
                onClick={() => setShowDateRangePicker(false)}
                className="h-7 px-2.5 rounded-lg bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600 font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              {rangeRows.length > 1 && (
                <span className="text-[10px] text-surface-400 dark:text-surface-500 ml-auto">
                  Overlapping ranges will be merged automatically
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

PlaceMassEditBar.displayName = "PlaceMassEditBar";
