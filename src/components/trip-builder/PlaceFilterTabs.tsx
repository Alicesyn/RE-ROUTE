import React from "react";
import { EyeOff, CheckCircle2, Ticket, Star, CalendarClock } from "lucide-react";

export type FilterTab = "active" | "unassigned" | "disabled" | "all";

interface PlaceFilterTabsProps {
  activeTab: FilterTab;
  onSelectTab: (tab: FilterTab) => void;
  activeCount: number;
  unassignedCount: number;
  disabledCount: number;
  allCount: number;
  onReenableAll: () => void;
  onOpenReservationsHub?: () => void;
  pendingReservationsCount?: number;
  reservationPlacesCount?: number;
  starredOnly?: boolean;
  onToggleStarredOnly?: () => void;
  starredCount?: number;
  reservationOnly?: boolean;
  onToggleReservationOnly?: () => void;
  recPlacesCount?: number;
}

export const PlaceFilterTabs: React.FC<PlaceFilterTabsProps> = React.memo(({
  activeTab,
  onSelectTab,
  activeCount,
  unassignedCount,
  disabledCount,
  allCount,
  onReenableAll,
  onOpenReservationsHub,
  pendingReservationsCount = 0,
  reservationPlacesCount = 0,
  starredOnly = false,
  onToggleStarredOnly,
  starredCount = 0,
  reservationOnly = false,
  onToggleReservationOnly,
  recPlacesCount = 0,
}) => {
  return (
    <>
      {/* Filter Tabs & Booking Hub Quick Action */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 mb-3">
        <div className="flex gap-1 bg-surface-100 dark:bg-surface-900/50 p-1 rounded-lg flex-1 overflow-x-auto max-w-full custom-scrollbar">
          <button
            type="button"
            onClick={() => onSelectTab("active")}
            className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "active"
                ? "bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm border border-surface-200/60 dark:border-surface-600"
                : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
            }`}
          >
            <span>Active</span>
            <span className="opacity-60 text-[11px]">({activeCount})</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("unassigned")}
            className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "unassigned"
                ? "bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm border border-surface-200/60 dark:border-surface-600"
                : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
            }`}
          >
            <span>Unassigned</span>
            {unassignedCount > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full px-1 ${
                  activeTab === "unassigned"
                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                    : "bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300"
                }`}
              >
                {unassignedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("disabled")}
            className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "disabled"
                ? "bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm border border-surface-200/60 dark:border-surface-600"
                : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
            }`}
          >
            <span>Excluded</span>
            {disabledCount > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full px-1 ${
                  activeTab === "disabled"
                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                    : "bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50"
                }`}
              >
                {disabledCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("all")}
            className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "all"
                ? "bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm border border-surface-200/60 dark:border-surface-600"
                : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
            }`}
          >
            <span>All</span>
            <span className="opacity-60 text-[11px]">({allCount})</span>
          </button>
        </div>

        {/* Quick Action & Filter Buttons: Starred, Reservation Rec, Booking Hub */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 max-w-full custom-scrollbar shrink-0">
          {/* Quick Filter: Starred Only */}
          {onToggleStarredOnly && (
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
          )}

          {/* Quick Filter: Reservation Rec Only */}
          {onToggleReservationOnly && (
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
          )}

          {/* Quick Action: Open Reservations & Booking Hub */}
          {onOpenReservationsHub && (
            <button
              type="button"
              onClick={onOpenReservationsHub}
              className="h-9 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border shrink-0 cursor-pointer bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shadow-2xs"
              title="Open Reservations & Booking Hub"
            >
              <Ticket className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Booking Hub</span>
              {pendingReservationsCount > 0 ? (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500 text-white">
                  {pendingReservationsCount}
                </span>
              ) : reservationPlacesCount > 0 ? (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                  ✓
                </span>
              ) : null}
            </button>
          )}
        </div>
      </div>

      {/* Excluded tab banner with Re-enable All action */}
      {activeTab === "disabled" && disabledCount > 0 && (
        <div className="flex items-center justify-between bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/40 rounded-lg px-3 py-2 mb-3 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <EyeOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>These places are saved in your trip but excluded from route optimization.</span>
          </div>
          <button
            type="button"
            onClick={onReenableAll}
            className="flex items-center gap-1 font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 shrink-0 ml-2 py-0.5 px-2 rounded hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Re-enable All</span>
          </button>
        </div>
      )}
    </>
  );
});
