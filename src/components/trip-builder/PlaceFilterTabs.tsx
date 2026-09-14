import React from "react";
import { EyeOff, CheckCircle2 } from "lucide-react";

export type FilterTab = "active" | "unassigned" | "disabled" | "all";

interface PlaceFilterTabsProps {
  activeTab: FilterTab;
  onSelectTab: (tab: FilterTab) => void;
  activeCount: number;
  unassignedCount: number;
  disabledCount: number;
  allCount: number;
  onReenableAll: () => void;
}

export const PlaceFilterTabs: React.FC<PlaceFilterTabsProps> = React.memo(({
  activeTab,
  onSelectTab,
  activeCount,
  unassignedCount,
  disabledCount,
  allCount,
  onReenableAll,
}) => {
  return (
    <>
      {/* Filter Tabs */}
      <div className="flex gap-1 mb-3 bg-surface-100 dark:bg-surface-900/50 p-1 rounded-lg">
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
