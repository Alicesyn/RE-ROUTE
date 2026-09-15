import React, { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Place } from "../../../types";
import { PlaceHighlightBadge } from "../../common/PlaceHighlightBadge";

export interface PlaceHighlightEditorProps {
  place: Place;
  onSaveHighlight: (label: string, text: string) => void;
  onRemoveHighlight: () => void;
}

const PRESET_LABELS = [
  "Must-Try",
  "Best Photo Spot",
  "Pro Tip",
  "Best Time to Go",
  "What to Buy",
];

export const PlaceHighlightEditor: React.FC<PlaceHighlightEditorProps> = ({
  place,
  onSaveHighlight,
  onRemoveHighlight,
}) => {
  const [isEditingHighlight, setIsEditingHighlight] = useState(false);
  const [highlightLabelVal, setHighlightLabelVal] = useState(
    place.highlight?.label || (place.category === "restaurant" ? "Must-Try" : "Pro Tip")
  );
  const [highlightTextVal, setHighlightTextVal] = useState(place.highlight?.text || "");

  useEffect(() => {
    if (!isEditingHighlight) {
      setHighlightLabelVal(
        place.highlight?.label || (place.category === "restaurant" ? "Must-Try" : "Pro Tip")
      );
      setHighlightTextVal(place.highlight?.text || "");
    }
  }, [place.highlight, place.category, isEditingHighlight]);

  const handleSave = () => {
    onSaveHighlight(highlightLabelVal, highlightTextVal);
    setIsEditingHighlight(false);
  };

  const handleCancel = () => {
    setIsEditingHighlight(false);
    setHighlightTextVal(place.highlight?.text || "");
  };

  const handleRemove = () => {
    onRemoveHighlight();
    setIsEditingHighlight(false);
    setHighlightTextVal("");
  };

  if (isEditingHighlight) {
    return (
      <div className="mt-2 p-2.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 space-y-2 text-xs animate-in fade-in duration-150">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <select
              value={PRESET_LABELS.includes(highlightLabelVal) ? highlightLabelVal : "Custom"}
              onChange={(e) => {
                if (e.target.value !== "Custom") {
                  setHighlightLabelVal(e.target.value);
                }
              }}
              className="text-[11px] font-bold bg-white dark:bg-surface-800 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5 text-amber-900 dark:text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              {PRESET_LABELS.map((lbl) => (
                <option key={lbl} value={lbl}>
                  {lbl}
                </option>
              ))}
              <option value="Custom">Custom Label...</option>
            </select>
            {!PRESET_LABELS.includes(highlightLabelVal) && (
              <input
                type="text"
                value={highlightLabelVal}
                onChange={(e) => setHighlightLabelVal(e.target.value)}
                placeholder="Label"
                className="text-[11px] font-bold bg-white dark:bg-surface-800 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5 text-amber-900 dark:text-amber-200 w-24 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            )}
          </div>
          {place.highlight?.text && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-[10px] text-red-600 dark:text-red-400 hover:underline cursor-pointer"
            >
              Delete
            </button>
          )}
        </div>
        <textarea
          value={highlightTextVal}
          onChange={(e) => setHighlightTextVal(e.target.value)}
          placeholder={
            place.category === "restaurant"
              ? "e.g. Signature ramen dipping broth & gyoza"
              : "e.g. Sunset viewing spot from garden"
          }
          rows={2}
          autoFocus
          className="w-full text-xs font-medium bg-white dark:bg-surface-900 border border-amber-300 dark:border-amber-700 rounded-md p-1.5 text-surface-900 dark:text-white placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") {
              handleCancel();
            }
          }}
        />
        <div className="flex items-center justify-end gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={handleCancel}
            className="px-2 py-1 text-xs text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white rounded hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-2.5 py-1 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors shadow-2xs cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  if (place.highlight && place.highlight.text) {
    return (
      <div className="mt-2">
        <PlaceHighlightBadge
          highlight={place.highlight}
          category={place.category}
          onEdit={() => setIsEditingHighlight(true)}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setHighlightLabelVal(place.category === "restaurant" ? "Must-Try" : "Pro Tip");
        setIsEditingHighlight(true);
      }}
      className="mt-1.5 text-[11px] font-medium text-amber-700/80 dark:text-amber-400/80 hover:text-amber-800 dark:hover:text-amber-300 flex items-center gap-1 opacity-0 group-hover:opacity-100 hover:bg-amber-50/80 dark:hover:bg-amber-950/30 px-1.5 py-0.5 rounded transition-all cursor-pointer"
      title={`Add ${place.category === "restaurant" ? "Must-Try" : "highlight"}`}
    >
      <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
      <span>+ Add {place.category === "restaurant" ? "Must-Try" : "Highlight"}</span>
    </button>
  );
};
