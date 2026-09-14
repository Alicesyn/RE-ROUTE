import React from "react";
import { Utensils, Camera, Sparkles, ShoppingBag, Lightbulb, Sun, Pencil } from "lucide-react";
import { PlaceHighlight, PlaceCategory } from "../../types";

interface PlaceHighlightBadgeProps {
  highlight?: PlaceHighlight | null;
  category?: PlaceCategory;
  className?: string;
  compact?: boolean;
  onEdit?: () => void;
}

export const PlaceHighlightBadge: React.FC<PlaceHighlightBadgeProps> = ({
  highlight,
  category,
  className = "",
  compact = false,
  onEdit,
}) => {
  if (!highlight || !highlight.text?.trim()) return null;

  const labelLower = (highlight.label || "").toLowerCase();
  
  // Select icon based on label keywords or category
  const renderIcon = () => {
    const iconClass = compact ? "w-3 h-3 shrink-0" : "w-3.5 h-3.5 shrink-0";
    if (labelLower.includes("try") || labelLower.includes("order") || labelLower.includes("dish") || category === "restaurant") {
      return <Utensils className={`${iconClass} text-amber-600 dark:text-amber-400`} />;
    }
    if (labelLower.includes("photo") || labelLower.includes("view") || labelLower.includes("spot") || labelLower.includes("camera")) {
      return <Camera className={`${iconClass} text-rose-500 dark:text-rose-400`} />;
    }
    if (labelLower.includes("time") || labelLower.includes("hour") || labelLower.includes("day") || labelLower.includes("sunset")) {
      return <Sun className={`${iconClass} text-amber-500 dark:text-amber-300`} />;
    }
    if (labelLower.includes("buy") || labelLower.includes("shop") || category === "shopping") {
      return <ShoppingBag className={`${iconClass} text-emerald-600 dark:text-emerald-400`} />;
    }
    if (labelLower.includes("tip") || labelLower.includes("advice") || labelLower.includes("etiquette")) {
      return <Lightbulb className={`${iconClass} text-amber-500 dark:text-amber-400`} />;
    }
    return <Sparkles className={`${iconClass} text-purple-500 dark:text-purple-400`} />;
  };

  const label = highlight.label?.trim() || "Highlight";

  return (
    <div
      onClick={onEdit}
      title={onEdit ? `Click to edit ${label}` : undefined}
      className={`flex items-start gap-1.5 rounded-lg border transition-colors ${
        onEdit ? "cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-100/70 dark:hover:bg-amber-900/40 group/badge" : ""
      } ${
        compact
          ? "px-2 py-1 text-[11px] bg-amber-50/80 dark:bg-amber-950/25 border-amber-200/60 dark:border-amber-800/40 text-amber-950 dark:text-amber-100"
          : "px-2.5 py-1.5 text-xs bg-amber-50/90 dark:bg-amber-950/30 border-amber-200/70 dark:border-amber-800/50 text-amber-950 dark:text-amber-100 shadow-sm"
      } ${className}`}
    >
      <div className="mt-0.5">{renderIcon()}</div>
      <div className="min-w-0 flex-1 leading-snug break-words">
        <span className="font-extrabold uppercase tracking-wider text-[10px] text-amber-700 dark:text-amber-400 mr-1.5 inline-block">
          {label}:
        </span>
        <span className="font-medium text-surface-800 dark:text-surface-200">
          {highlight.text}
        </span>
      </div>
      {onEdit && (
        <Pencil className="w-3 h-3 text-amber-600 dark:text-amber-400 opacity-0 group-hover/badge:opacity-100 transition-opacity shrink-0 mt-0.5 ml-0.5" />
      )}
    </div>
  );
};
