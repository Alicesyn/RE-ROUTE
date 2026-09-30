import React, { useState } from "react";
import { Search, X, Layers } from "lucide-react";
import { PlaceCategory } from "../../types";
import { ALL_CATEGORIES, getCategoryLabel, getCategoryEmoji } from "../../utils/categoryUtils";
import { useRouteStore } from "../../store/useRouteStore";
import { format, addDays, parseISO } from "date-fns";
import { formatTimeString } from "../schedule/scheduleTimeUtils";

export type SortOption =
  | "default"
  | "date-newest"
  | "date-oldest"
  | "starred"
  | "reservation-rec"
  | "reservation-none"
  | "name-asc"
  | "name-desc"
  | "duration-desc"
  | "duration-asc"
  | "area-places";

interface PlaceListToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  dayFilter: number | "all" | "unassigned";
  onDayFilterChange: (df: number | "all" | "unassigned") => void;
  days: number;
  dayTitles?: Record<number, string>;
  categoryFilter: PlaceCategory | "all";
  onCategoryFilterChange: (cat: PlaceCategory | "all") => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  starredOnly?: boolean;
  starredCount?: number;
  reservationOnly?: boolean;
  recPlacesCount?: number;
  isMassEditOpen: boolean;
  onToggleMassEdit: () => void;
  filteredPlacesCount: number;
  duplicatesOnly: boolean;
  openBeforeTime: string | null;
  onOpenBeforeTimeChange: (time: string | null) => void;
  openBeforeCount?: number;
  onResetFilters: () => void;
}

export const PlaceListToolbar: React.FC<PlaceListToolbarProps> = React.memo(({
  searchQuery,
  onSearchChange,
  dayFilter,
  onDayFilterChange,
  days,
  dayTitles,
  categoryFilter,
  onCategoryFilterChange,
  sortBy,
  onSortChange,
  starredOnly = false,
  starredCount = 0,
  reservationOnly = false,
  recPlacesCount = 0,
  isMassEditOpen,
  onToggleMassEdit,
  filteredPlacesCount,
  duplicatesOnly,
  openBeforeTime,
  onOpenBeforeTimeChange,
  openBeforeCount,
  onResetFilters,
}) => {
  const startDate = useRouteStore((s) => s.startDate);
  const dayIndices = React.useMemo(() => Array.from({ length: days }, (_, i) => i), [days]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const STANDARD_PRESETS = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
  const isCustom = Boolean(openBeforeTime && !STANDARD_PRESETS.includes(openBeforeTime)) || showCustomInput;

  const getSortLabel = (sort: SortOption) => {
    switch (sort) {
      case "date-newest":
        return "Recently Added (Newest First)";
      case "date-oldest":
        return "First Added (Oldest First)";
      case "starred":
        return "Starred (Must-Visit First)";
      case "reservation-rec":
        return "Reservation: Recommended First";
      case "reservation-none":
        return "Reservation: Not Needed First";
      case "name-asc":
        return "Name (A-Z)";
      case "name-desc":
        return "Name (Z-A)";
      case "duration-desc":
        return "Duration (High to Low)";
      case "duration-asc":
        return "Duration (Low to High)";
      case "area-places":
        return "Area Places (Districts/Streets First)";
      default:
        return "Default Order";
    }
  };

  const isAnyFilterActive =
    sortBy !== "default" ||
    reservationOnly ||
    starredOnly ||
    duplicatesOnly ||
    dayFilter !== "all" ||
    categoryFilter !== "all" ||
    Boolean(openBeforeTime);

  return (
    <>
      {/* PTV Search & Filter */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px] w-full lg:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 w-3.5 h-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search places by name, highlights, or description..."
            className="w-full h-9 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg pl-8 pr-8 text-surface-900 dark:text-white placeholder:text-surface-400 dark:placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all truncate"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 rounded cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 min-w-0 pr-1 custom-scrollbar">
          {/* Day Filter Dropdown */}
          <select
            value={dayFilter}
            onChange={(e) => {
              const val = e.target.value;
              const nextVal = val === "all" || val === "unassigned" ? val : parseInt(val, 10);
              onDayFilterChange(nextVal);
            }}
            className="h-9 shrink-0 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg px-2 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer font-medium"
            title="Filter places by assigned day"
          >
            <option value="all">All Days</option>
            <option value="unassigned">Unassigned Only</option>
            {dayIndices.map((i) => {
              const title = dayTitles?.[i]?.trim();
              const dateStr = startDate ? format(addDays(parseISO(startDate), i), "MMM d") : null;
              const label = title
                ? (dateStr ? `${title} (${dateStr}, Day ${i + 1})` : `${title} (Day ${i + 1})`)
                : (dateStr ? `${dateStr} (Day ${i + 1})` : `Day ${i + 1}`);
              return (
                <option key={i} value={i}>
                  {label}
                </option>
              );
            })}
          </select>

          {/* Category Filter Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value as PlaceCategory | "all")}
            className="h-9 shrink-0 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg px-2 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
          >
            <option value="all">All Categories</option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {getCategoryEmoji(cat)} {getCategoryLabel(cat)}
              </option>
            ))}
          </select>

          {/* Sort By Dropdown */}
          <div className="relative shrink-0 flex items-center">
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="h-9 shrink-0 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg pl-7 pr-3 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer font-medium"
              title="Sort Places to Visit"
            >
              <option value="default">Sort: Default Order</option>
              <option value="date-newest">Sort: Recently Added (Newest first)</option>
              <option value="date-oldest">Sort: First Added (Oldest first)</option>
              <option value="starred">Sort: Starred (Must-Visit first)</option>
              <option value="reservation-rec">Sort: Reservation Rec (Yes first)</option>
              <option value="reservation-none">Sort: Reservation Rec (No first)</option>
              <option value="name-asc">Sort: Name (A-Z)</option>
              <option value="duration-desc">Sort: Duration (High to Low)</option>
              <option value="duration-asc">Sort: Duration (Low to High)</option>
              <option value="area-places">Sort: Area Places First</option>
            </select>
          </div>


          {/* Quick Filter: Open Before X Time */}
          <div className="relative shrink-0 flex items-center">
            <select
              value={
                !openBeforeTime
                  ? "all"
                  : ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"].includes(openBeforeTime)
                  ? openBeforeTime
                  : "custom"
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === "all") {
                  onOpenBeforeTimeChange(null);
                  setShowCustomInput(false);
                } else if (val === "custom") {
                  setShowCustomInput(true);
                  if (!openBeforeTime) {
                    onOpenBeforeTimeChange("09:00");
                  }
                } else {
                  setShowCustomInput(false);
                  onOpenBeforeTimeChange(val);
                }
              }}
              className={`h-9 shrink-0 text-xs rounded-lg px-2.5 font-medium transition-all cursor-pointer border ${
                openBeforeTime
                  ? "bg-teal-100 dark:bg-teal-900/50 text-teal-900 dark:text-teal-200 border-teal-300 dark:border-teal-700 shadow-2xs font-semibold"
                  : "bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700"
              }`}
              title={
                openBeforeTime
                  ? `Filtered to places open before ${formatTimeString(openBeforeTime)}`
                  : "Filter by places that are open before a specific time"
              }
            >
              <option value="all">Hours: All Times</option>
              <option value="07:00">Open before 7:00 AM</option>
              <option value="08:00">Open before 8:00 AM</option>
              <option value="09:00">Open before 9:00 AM</option>
              <option value="10:00">Open before 10:00 AM</option>
              <option value="11:00">Open before 11:00 AM</option>
              <option value="12:00">Open before 12:00 PM</option>
              <option value="13:00">Open before 1:00 PM</option>
              <option value="14:00">Open before 2:00 PM</option>
              <option value="custom">
                {openBeforeTime && !["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"].includes(openBeforeTime)
                  ? `Custom: ${formatTimeString(openBeforeTime)}`
                  : "Custom time..."}
              </option>
            </select>

            {/* Custom Time Picker Inline Input */}
            {isCustom && (
              <div className="flex items-center gap-1 ml-1.5 shrink-0 animate-in fade-in duration-150">
                <input
                  type="time"
                  value={openBeforeTime || "09:00"}
                  onChange={(e) => onOpenBeforeTimeChange(e.target.value)}
                  className="h-9 w-24 px-1.5 text-xs bg-surface-50 dark:bg-surface-900 border border-teal-300 dark:border-teal-700 rounded-lg text-teal-900 dark:text-teal-100 font-mono focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-2xs text-center"
                  title="Choose exact time"
                />
              </div>
            )}

            {/* Clear Button & Count Badge */}
            {openBeforeTime && (
              <div className="flex items-center gap-1 ml-1 shrink-0">
                {openBeforeCount !== undefined && openBeforeCount > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-200/90 dark:bg-teal-800/90 text-teal-900 dark:text-teal-100 shrink-0"
                    title={`${openBeforeCount} places open before ${formatTimeString(openBeforeTime)}`}
                  >
                    {openBeforeCount}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onOpenBeforeTimeChange(null);
                    setShowCustomInput(false);
                  }}
                  className="p-1 text-surface-400 hover:text-red-500 rounded cursor-pointer shrink-0"
                  title="Clear hours filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Quick Toggle: Mass Edit */}
          <button
            type="button"
            onClick={onToggleMassEdit}
            className={`h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer ${
              isMassEditOpen
                ? "bg-primary-100 dark:bg-primary-900/50 text-primary-900 dark:text-primary-200 border-primary-300 dark:border-primary-700 shadow-2xs"
                : "bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700"
            }`}
            title={isMassEditOpen ? "Close mass edit toolbar" : "Open mass edit toolbar for current results"}
          >
            <Layers className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 shrink-0" />
            <span className="hidden sm:inline">Mass Edit</span>
            <span className="sm:hidden">Mass</span>
            {filteredPlacesCount > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                  isMassEditOpen
                    ? "bg-primary-200/90 dark:bg-primary-800/90 text-primary-900 dark:text-primary-100"
                    : "bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300"
                }`}
              >
                {filteredPlacesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Notice when custom sort or quick filters are active */}
      {isAnyFilterActive && (
        <div className="flex items-center justify-between text-[11px] bg-surface-100/80 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700/80 rounded-lg px-3 py-1.5 mb-3 text-surface-600 dark:text-surface-300 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 flex-wrap">
            {sortBy !== "default" && (
              <span>
                Sorted by <strong className="text-surface-900 dark:text-white">{getSortLabel(sortBy)}</strong>. Manual reordering is locked.
              </span>
            )}
            {dayFilter !== "all" && (
              <span>
                Filter: <strong className="text-primary-700 dark:text-primary-300">
                  {dayFilter === "unassigned"
                    ? "Unassigned"
                    : (() => {
                        const idx = dayFilter as number;
                        const title = dayTitles?.[idx]?.trim();
                        const dateStr = startDate ? format(addDays(parseISO(startDate), idx), "MMM d") : null;
                        if (title) return `${title} (${dateStr ? `${dateStr}, ` : ""}Day ${idx + 1})`;
                        return dateStr ? `${dateStr} (Day ${idx + 1})` : `Day ${idx + 1}`;
                      })()
                  } ({filteredPlacesCount})
                </strong>
              </span>
            )}
            {categoryFilter !== "all" && (
              <span>
                Category: <strong className="text-primary-700 dark:text-primary-300">{getCategoryLabel(categoryFilter)}</strong>
              </span>
            )}
            {duplicatesOnly && (
              <span>
                Filter: <strong className="text-amber-700 dark:text-amber-300">Duplicates ({filteredPlacesCount})</strong>
              </span>
            )}
            {starredOnly && (
              <span>
                Filter: <strong className="text-amber-700 dark:text-amber-300">Starred ({starredCount})</strong>
              </span>
            )}
            {reservationOnly && (
              <span>
                Filter: <strong className="text-amber-700 dark:text-amber-300">Reservation Recommendations ({recPlacesCount})</strong>
              </span>
            )}
            {openBeforeTime && (
              <span>
                Filter: <strong className="text-teal-700 dark:text-teal-300">Open Before {formatTimeString(openBeforeTime)} ({openBeforeCount ?? filteredPlacesCount})</strong>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onResetFilters}
            className="text-primary-600 dark:text-primary-400 font-bold hover:underline shrink-0 ml-2 cursor-pointer"
          >
            Reset
          </button>
        </div>
      )}
    </>
  );
});
