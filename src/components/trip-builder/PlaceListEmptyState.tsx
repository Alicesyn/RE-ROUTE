import React from "react";
import type { FilterTab } from "./PlaceFilterTabs";

export interface PlaceListEmptyStateProps {
  searchQuery: string;
  duplicatesOnly: boolean;
  starredOnly: boolean;
  reservationOnly: boolean;
  dayFilter: number | "all" | "unassigned";
  dayTitles?: Record<number, string>;
  activeTab: FilterTab;
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
  }) => {
    let message: string;

    if (searchQuery.trim()) {
      message = `No places matching "${searchQuery}". Try searching by a different name, dish/highlight, or keyword.`;
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
      </div>
    );
  }
);

PlaceListEmptyState.displayName = "PlaceListEmptyState";
