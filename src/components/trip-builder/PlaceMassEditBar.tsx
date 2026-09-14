import React, { useState } from "react";
import { Layers, X, Star, EyeOff, CheckCircle2, Trash2 } from "lucide-react";
import type { DayRangeConstraint } from "../../types";

export interface PlaceMassEditBarProps {
  showMassEditBar: boolean;
  filteredPlacesCount: number;
  searchQuery: string;
  days: number;
  dayTitles?: Record<number, string>;
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
    allFilteredStarred,
    onMassStar,
    allFilteredDisabled,
    onMassDisabled,
    onApplyDayRestriction,
    onMassAssignDay,
    onMassDelete,
    onClose,
  }) => {
    const [showCustomRangePicker, setShowCustomRangePicker] = useState(false);
    const [customRangeStart, setCustomRangeStart] = useState(0);
    const [customRangeEnd, setCustomRangeEnd] = useState(Math.max(0, days - 1));

    if (!showMassEditBar) return null;

    const isSearching = searchQuery.trim().length > 0;
    const dayIndices = Array.from({ length: days }, (_, i) => i);

    const handleApplyCustomRange = () => {
      const start = Math.min(customRangeStart, customRangeEnd);
      const end = Math.max(customRangeStart, customRangeEnd);
      onApplyDayRestriction({ startDay: start, endDay: end });
      setShowCustomRangePicker(false);
    };

    const handleClose = () => {
      setShowCustomRangePicker(false);
      onClose();
    };

    return (
      <div className="bg-primary-50/90 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800/80 rounded-xl p-3 mb-3 text-xs shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150">
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

        <div className="flex items-center gap-2 flex-wrap">
          {/* Day Restriction Selector */}
          <select
            defaultValue=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              if (val === "clear") {
                onApplyDayRestriction(null);
              } else if (val === "first-half") {
                const halfEnd = Math.ceil(days / 2) - 1;
                onApplyDayRestriction({ startDay: 0, endDay: Math.max(0, halfEnd) });
              } else if (val === "second-half") {
                const halfStart = Math.ceil(days / 2);
                onApplyDayRestriction({
                  startDay: Math.min(days - 1, halfStart),
                  endDay: days - 1,
                });
              } else if (val === "custom") {
                setShowCustomRangePicker(true);
              } else if (val.startsWith("day-")) {
                const dayIdx = parseInt(val.replace("day-", ""), 10);
                onApplyDayRestriction({ startDay: dayIdx, endDay: dayIdx });
              }
              e.target.value = "";
            }}
            className="h-8 text-xs font-semibold bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer shadow-2xs"
            style={{ colorScheme: "dark light" }}
            title="Restrict all results to specific days"
          >
            <option value="" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100">
              📅 Restrict to Days...
            </option>
            <option value="clear" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100">
              ❌ Clear Day Restriction
            </option>
            <optgroup
              label="Single Day Only"
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
            {days > 2 && (
              <optgroup
                label="Multi-Day Ranges"
                className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 font-bold"
              >
                <option
                  value="first-half"
                  className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 font-normal"
                >
                  Days 1–{Math.ceil(days / 2)} (First Half)
                </option>
                <option
                  value="second-half"
                  className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 font-normal"
                >
                  Days {Math.ceil(days / 2) + 1}–{days} (Second Half)
                </option>
              </optgroup>
            )}
            <option value="custom" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100">
              ⚙️ Custom Day Range...
            </option>
          </select>

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
              label="Assign to Day"
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

        {/* Custom Day Range Inline Picker */}
        {showCustomRangePicker && (
          <div className="mt-2.5 pt-2.5 border-t border-primary-200/60 dark:border-primary-800/50 flex flex-wrap items-center gap-2 text-xs animate-in fade-in duration-150">
            <span className="font-semibold text-surface-700 dark:text-surface-300">
              Custom Day Range:
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-surface-500">From</span>
              <select
                value={customRangeStart}
                onChange={(e) => setCustomRangeStart(parseInt(e.target.value, 10))}
                className="h-7 text-xs bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded px-2 text-surface-800 dark:text-surface-200"
                style={{ colorScheme: "dark light" }}
              >
                {dayIndices.map((i) => (
                  <option key={i} value={i} className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100">
                    Day {i + 1}
                    {dayTitles?.[i]?.trim() ? `: ${dayTitles[i]}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-surface-500">To</span>
              <select
                value={customRangeEnd}
                onChange={(e) => setCustomRangeEnd(parseInt(e.target.value, 10))}
                className="h-7 text-xs bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded px-2 text-surface-800 dark:text-surface-200"
                style={{ colorScheme: "dark light" }}
              >
                {dayIndices.map((i) => (
                  <option key={i} value={i} className="bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100">
                    Day {i + 1}
                    {dayTitles?.[i]?.trim() ? `: ${dayTitles[i]}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleApplyCustomRange}
              className="h-7 px-3 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-bold cursor-pointer transition-colors shadow-2xs"
            >
              Apply Range
            </button>
            <button
              type="button"
              onClick={() => setShowCustomRangePicker(false)}
              className="h-7 px-2.5 rounded-md bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600 font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }
);

PlaceMassEditBar.displayName = "PlaceMassEditBar";
