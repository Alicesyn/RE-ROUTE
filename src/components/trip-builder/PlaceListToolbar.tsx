import React from "react";
import { Search, ArrowUpDown, CalendarClock, Star, X, Layers, Ticket } from "lucide-react";
import { PlaceCategory } from "../../types";
import { ALL_CATEGORIES, getCategoryLabel, getCategoryEmoji } from "../../utils/categoryUtils";
import { useRouteStore } from "../../store/useRouteStore";
import { format, addDays, parseISO } from "date-fns";

export type SortOption =
  | "default"
  | "starred"
  | "reservation-rec"
  | "reservation-none"
  | "name-asc"
  | "name-desc"
  | "duration-desc"
  | "duration-asc";

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
  starredOnly: boolean;
  onToggleStarredOnly: () => void;
  starredCount: number;
  reservationOnly: boolean;
  onToggleReservationOnly: () => void;
  recPlacesCount: number;
  isMassEditOpen: boolean;
  onToggleMassEdit: () => void;
  filteredPlacesCount: number;
  duplicatesOnly: boolean;
  onResetFilters: () => void;
  onOpenReservationsHub?: () => void;
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
  starredOnly,
  onToggleStarredOnly,
  starredCount,
  reservationOnly,
  onToggleReservationOnly,
  recPlacesCount,
  isMassEditOpen,
  onToggleMassEdit,
  filteredPlacesCount,
  duplicatesOnly,
  onResetFilters,
  onOpenReservationsHub,
}) => {
  const startDate = useRouteStore((s) => s.startDate);
  const dayIndices = React.useMemo(() => Array.from({ length: days }, (_, i) => i), [days]);
  const isSearching = searchQuery.trim().length > 0;

  const getSortLabel = (sort: SortOption) => {
    switch (sort) {
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
    categoryFilter !== "all";

  return (
    <>
      {/* PTV Search & Filter */}
      <div className="flex flex-col lg:flex-row gap-2 mb-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 w-3.5 h-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search places by name, highlights, or description..."
            className="w-full h-9 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg pl-8 pr-8 text-surface-900 dark:text-white placeholder:text-surface-400 dark:placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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

        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
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
            <ArrowUpDown className="w-3.5 h-3.5 text-surface-400 dark:text-surface-500 absolute left-2.5 pointer-events-none z-10" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="h-9 shrink-0 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg pl-7 pr-3 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer font-medium"
              title="Sort Places to Visit"
            >
              <option value="default">Sort: Default Order</option>
              <option value="starred">Sort: Starred (Must-Visit first)</option>
              <option value="reservation-rec">Sort: Reservation Rec (Yes first)</option>
              <option value="reservation-none">Sort: Reservation Rec (No first)</option>
              <option value="name-asc">Sort: Name (A-Z)</option>
              <option value="duration-desc">Sort: Duration (High to Low)</option>
              <option value="duration-asc">Sort: Duration (Low to High)</option>
            </select>
          </div>

          {/* Quick Filter: Starred Only */}
          <button
            type="button"
            onClick={onToggleStarredOnly}
            className={`h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer ${
              starredOnly
                ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-2xs"
                : "bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700"
            }`}
            title={starredOnly ? "Show all places" : "Filter to only starred must-visit places"}
          >
            <Star className={`w-3.5 h-3.5 shrink-0 ${starredOnly ? "fill-amber-500 text-amber-500" : "text-amber-500"}`} />
            <span className="hidden sm:inline">Starred</span>
            {starredCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${starredOnly
                  ? "bg-amber-200/90 dark:bg-amber-800/90 text-amber-900 dark:text-amber-100"
                  : "bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300"
                }`}>
                {starredCount}
              </span>
            )}
          </button>

          {/* Quick Filter: Reservation Rec Only */}
          <button
            type="button"
            onClick={onToggleReservationOnly}
            className={`h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer ${
              reservationOnly
                ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-2xs"
                : "bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700"
            }`}
            title={reservationOnly ? "Show all places" : "Filter to only places with reservation recommendations"}
          >
            <CalendarClock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Reservation Rec</span>
            <span className="sm:hidden">Rec</span>
            {recPlacesCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${reservationOnly
                  ? "bg-amber-200/90 dark:bg-amber-800/90 text-amber-900 dark:text-amber-100"
                  : "bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300"
                }`}>
                {recPlacesCount}
              </span>
            )}
          </button>

          {/* Quick Action: Open Reservations & Booking Hub */}
          {onOpenReservationsHub && (
            <button
              type="button"
              onClick={onOpenReservationsHub}
              className="h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shadow-2xs"
              title="Open Reservations & Booking Hub"
            >
              <Ticket className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="hidden sm:inline">Booking Hub</span>
              <span className="sm:hidden">Hub</span>
            </button>
          )}

          {/* Quick Toggle: Mass Edit */}
          <button
            type="button"
            onClick={onToggleMassEdit}
            className={`h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer ${
              isMassEditOpen || (isSearching && filteredPlacesCount > 0)
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
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  isMassEditOpen || (isSearching && filteredPlacesCount > 0)
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
