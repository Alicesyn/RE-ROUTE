import React from "react";
import {
  MapPin,
  Eye,
  EyeOff,
  Star,
  Trash2,
  Copy,
  Check,
  X,
} from "lucide-react";
import { Place } from "../../../types";
import { isAreaPlace } from "../../../utils/areaOpeningHoursUtils";

export interface PlaceItemHeaderProps {
  place: Place;
  isDuplicate?: boolean;
  isDragging?: boolean;
  onEdit?: (id: string) => void;
  onToggleStarred: () => void;
  onToggleDisabled: () => void;
  onRemovePlace: () => void;
  onDismissDuplicate: () => void;
  onRestoreDuplicate: () => void;
}

export const PlaceItemHeader: React.FC<PlaceItemHeaderProps> = ({
  place,
  isDuplicate,
  isDragging,
  onEdit,
  onToggleStarred,
  onToggleDisabled,
  onRemovePlace,
  onDismissDuplicate,
  onRestoreDuplicate,
}) => {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-start gap-1.5 min-w-0 flex-1">
        <MapPin className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3
            onClick={() => {
              if (!isDragging) onEdit?.(place.id);
            }}
            className="font-semibold text-surface-900 dark:text-white leading-snug cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            title="Click to edit place details & allowed day range"
          >
            <span className="break-words">{place.name}</span>
            {place.romanizedName &&
              place.romanizedName.toLowerCase() !== place.name.toLowerCase() && (
                <span className="text-xs font-normal text-surface-500 dark:text-surface-400 italic ml-1.5">
                  ({place.romanizedName})
                </span>
              )}
            {place.isDisabled && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-300/80 dark:border-amber-800/80 ml-1.5 align-middle shrink-0">
                <EyeOff className="w-2.5 h-2.5" /> Excluded
              </span>
            )}
            {isAreaPlace(place) && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 ml-1.5 align-middle shrink-0"
                title="Area / District location (shopping street or neighborhood)"
              >
                Area
              </span>
            )}
            {isDuplicate && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800 ml-1.5 align-middle shrink-0 shadow-2xs"
                title="Duplicate place: This location appears multiple times in your trip. Click ✕ to remove the duplicate flag."
              >
                <Copy className="w-2.5 h-2.5" />
                <span>Duplicate</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissDuplicate();
                  }}
                  className="hover:bg-rose-200/80 dark:hover:bg-rose-800/80 text-rose-600 hover:text-rose-900 dark:text-rose-400 dark:hover:text-rose-200 rounded p-0.5 ml-0.5 transition-colors cursor-pointer"
                  title="Remove duplicate flag (this place is not a duplicate)"
                  aria-label="Remove duplicate flag"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
            {place.dismissedDuplicate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestoreDuplicate();
                }}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400 border border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 ml-1.5 align-middle shrink-0 transition-colors cursor-pointer"
                title="Duplicate flag was removed. Click to re-enable duplicate checking."
              >
                <Check className="w-2.5 h-2.5 text-emerald-500" />
                <span>Not Dup</span>
              </button>
            )}
          </h3>
          <div className="relative group/addr min-w-0 inline-block max-w-full">
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 truncate cursor-help hover:text-surface-700 dark:hover:text-surface-200 transition-colors">
              {place.address}
            </p>
            {place.address && (
              <div className="absolute left-0 top-full pt-1 z-40 hidden group-hover/addr:block">
                <div className="flex items-start gap-1.5 w-max max-w-[280px] sm:max-w-xs p-2 rounded-lg bg-surface-900/95 dark:bg-surface-800/98 text-white dark:text-surface-100 text-xs shadow-xl border border-surface-700/80 backdrop-blur-sm animate-in fade-in duration-150">
                  <MapPin className="w-3.5 h-3.5 text-primary-400 shrink-0 mt-0.5" />
                  <span className="break-words font-medium leading-relaxed select-text">{place.address}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Right Actions */}
      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
        {/* Star / Must-Visit Priority Toggle Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStarred();
          }}
          className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 text-xs font-semibold ${
            place.isStarred
              ? "bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/60 shadow-sm"
              : "bg-surface-50 dark:bg-surface-800 text-surface-400 dark:text-surface-500 border-surface-200 dark:border-surface-700 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          }`}
          title={
            place.isStarred
              ? "Must-visit (Starred). Optimizer will prioritize and never leave unassigned. Click to unstar."
              : "Star as Must-Visit (optimizer prioritizes and guarantees this place into your itinerary)."
          }
          aria-label={place.isStarred ? "Unstar place" : "Star place as must-visit"}
        >
          <Star
            className={`w-3.5 h-3.5 ${
              place.isStarred ? "fill-amber-400 text-amber-500" : ""
            }`}
          />
          {place.isStarred && <span className="text-[10px]">Must-Visit</span>}
        </button>

        {/* Exclude / Include Toggle Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDisabled();
          }}
          className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 text-xs font-semibold ${
            place.isDisabled
              ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/60 shadow-sm"
              : "bg-surface-50 dark:bg-surface-800 text-surface-400 dark:text-surface-500 border-surface-200 dark:border-surface-700 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          }`}
          title={
            place.isDisabled
              ? "Excluded from routing. Click to re-enable in route."
              : "Exclude this place from route optimization (keep in list)."
          }
        >
          {place.isDisabled ? (
            <>
              <EyeOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-[10px]">Excluded</span>
            </>
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={onRemovePlace}
          className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
          aria-label="Remove place"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
