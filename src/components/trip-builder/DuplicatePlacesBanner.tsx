import React from "react";
import { AlertTriangle } from "lucide-react";

interface DuplicatePlacesBannerProps {
  duplicateCount: number;
  duplicatesOnly: boolean;
  onToggleDuplicatesOnly: () => void;
  onRemoveDuplicates: () => void;
}

export const DuplicatePlacesBanner: React.FC<DuplicatePlacesBannerProps> = React.memo(({
  duplicateCount,
  duplicatesOnly,
  onToggleDuplicatesOnly,
  onRemoveDuplicates,
}) => {
  if (duplicateCount === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 rounded-xl p-3 mb-3 text-xs shadow-2xs animate-in fade-in duration-200">
      <div className="flex items-start sm:items-center gap-2.5 text-amber-900 dark:text-amber-200 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <div className="font-bold flex items-center gap-1.5">
            <span>Possible Duplicate Places Detected</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200/80 dark:bg-amber-800/80 text-amber-900 dark:text-amber-100">
              {duplicateCount} {duplicateCount === 1 ? "place" : "places"}
            </span>
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
            Some locations appear multiple times in your trip. Review them or remove redundant duplicates.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button
          type="button"
          onClick={onToggleDuplicatesOnly}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
            duplicatesOnly
              ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
              : "bg-white dark:bg-surface-800 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
          }`}
        >
          {duplicatesOnly ? "Show All Places" : "View Duplicates Only"}
        </button>
        <button
          type="button"
          onClick={onRemoveDuplicates}
          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-2xs cursor-pointer"
          title="Keep one copy of each place and remove redundant duplicates"
        >
          Remove Duplicates
        </button>
      </div>
    </div>
  );
});
