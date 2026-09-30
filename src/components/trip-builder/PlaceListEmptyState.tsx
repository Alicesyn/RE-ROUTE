import React from "react";
import type { FilterTab } from "./PlaceFilterTabs";
import { formatTimeString } from "../schedule/scheduleTimeUtils";

export interface PlaceListEmptyStateProps {
  searchQuery: string;
  duplicatesOnly: boolean;
  starredOnly: boolean;
  reservationOnly: boolean;
  dayFilter: number | "all" | "unassigned";
  dayTitles?: Record<number, string>;
  activeTab: FilterTab;
  openBeforeTime?: string | null;
  onClearHoursFilter?: () => void;
}

export const PlaceListEmptyState: React.FC<PlaceListEmptyStateProps> = React.memo(
  ({
    searchQuery,
    duplicatesOnly,
    starredOnly,
    reservationOnly,
    dayFilter,
    dayTitles,
    activeTab,
    openBeforeTime,
    onClearHoursFilter,
  }) => {
    let message: string;

    if (searchQuery.trim()) {
      message = `No places matching "${searchQuery}". Try searching by a different name, dish/highlight, or keyword.`;
    } else if (openBeforeTime) {
      message = `No places found open before ${formatTimeString(openBeforeTime)}. Try selecting a later time or clearing the hours filter.`;
    } else if (duplicatesOnly) {
      message = "No duplicate places found.";
    } else if (starredOnly) {
      message = "No starred must-visit places found. Click the star icon on any place card to star it.";
    } else if (reservationOnly) {
      message = "No places with reservation recommendations found.";
    } else if (dayFilter !== "all") {
      message = `No places found for ${
        typeof dayFilter === "number"
          ? `Day ${dayFilter + 1}${dayTitles?.[dayFilter] ? `: ${dayTitles[dayFilter]}` : ""}`
          : "Unassigned"
      }.`;
    } else if (activeTab === "disabled") {
      message =
        "No places are currently excluded. You can exclude any place using the toggle button on its card to keep it in reserve without routing it.";
    } else if (activeTab === "unassigned") {
      message = "All active places are assigned to a day!";
    } else if (activeTab === "active") {
      message =
        "No active places found. Check the Excluded tab to re-enable saved places, or search above to add new ones.";
    } else {
      message = "No places match this filter.";
    }

    return (
      <div className="text-center py-8 px-4 bg-white dark:bg-surface-800 border border-dashed border-surface-300 dark:border-surface-600 rounded-xl">
        <p className="text-surface-500 dark:text-surface-400 text-sm">
          {message}
        </p>
        {openBeforeTime && onClearHoursFilter && (
          <button
            type="button"
            onClick={onClearHoursFilter}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors cursor-pointer"
          >
            Clear Hours Filter
          </button>
        )}
      </div>
    );
  }
);

PlaceListEmptyState.displayName = "PlaceListEmptyState";

