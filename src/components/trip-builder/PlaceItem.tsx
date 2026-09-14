import React, { useState, useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, MapPin, Pin, Clock, Timer, AlertCircle, Sparkles, Loader2, ExternalLink, Eye, EyeOff, Coins, Star, Copy, X, Check } from "lucide-react";
import { Place, PlaceCategory } from "../../types";
import { useRouteStore } from "../../store/useRouteStore";
import { toast } from "../../services/toastService";
import {
  getCategoryEmoji,
  getCategoryLabel,
  getDefaultDuration,
  ALL_CATEGORIES,
  getActivePhotoUrl,
} from "../../utils/categoryUtils";
import { summarizePlace } from "../../services/aiService";
import { PlaceHighlightBadge } from "../common/PlaceHighlightBadge";
import { ReservationBadge } from "../common/ReservationBadge";
import {
  getSpecificMockHighlight,
  getSpecificMockPrice,
  getSpecificMockDescription,
  getSpecificMockReservation,
} from "../../utils/mockAiUtils";

// Day badge colors (static)
const DAY_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-purple-50 text-purple-700 border-purple-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-cyan-50 text-cyan-700 border-cyan-200",
  "bg-orange-50 text-orange-700 border-orange-200",
];

const getBadgeColor = (dayIndex: number | null) => {
  if (dayIndex === null)
    return "bg-surface-100 text-surface-500 border-surface-200";
  return DAY_COLORS[dayIndex % DAY_COLORS.length];
};

interface PlaceItemProps {
  place: Place;
  isDuplicate?: boolean;
}

export const PlaceItem: React.FC<PlaceItemProps> = React.memo(({ place, isDuplicate }) => {
  const updatePlace = useRouteStore((s) => s.updatePlace);
  const removePlace = useRouteStore((s) => s.removePlace);
  const assignPlaceToDay = useRouteStore((s) => s.assignPlaceToDay);
  const unassignPlace = useRouteStore((s) => s.unassignPlace);
  const togglePlaceDisabled = useRouteStore((s) => s.togglePlaceDisabled);
  const days = useRouteStore((s) => s.days);
  const appMode = useRouteStore((s) => s.appMode);
  const showImages = useRouteStore((s) => s.showImages);

  const [isEditing, setIsEditing] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [desc, setDesc] = useState(place.description || "");
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [durationVal, setDurationVal] = useState(
    (place.estimatedDuration ?? 60).toString(),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const durationRef = useRef<HTMLInputElement>(null);

  const [isEditingHighlight, setIsEditingHighlight] = useState(false);
  const [highlightLabelVal, setHighlightLabelVal] = useState(
    place.highlight?.label || (place.category === "restaurant" ? "Must-Try" : "Pro Tip"),
  );
  const [highlightTextVal, setHighlightTextVal] = useState(place.highlight?.text || "");

  // Sync local state if the place is updated externally (e.g. by AI generation)
  useEffect(() => {
    if (!isEditing) setDesc(place.description || "");
    if (!isEditingDuration) setDurationVal((place.estimatedDuration ?? 60).toString());
    if (!isEditingHighlight) {
      setHighlightLabelVal(
        place.highlight?.label || (place.category === "restaurant" ? "Must-Try" : "Pro Tip"),
      );
      setHighlightTextVal(place.highlight?.text || "");
    }
  }, [place.description, place.estimatedDuration, place.highlight, place.category, isEditing, isEditingDuration, isEditingHighlight]);

  const handleSaveHighlight = () => {
    if (highlightTextVal.trim()) {
      updatePlace(place.id, {
        highlight: {
          label: highlightLabelVal.trim() || (place.category === "restaurant" ? "Must-Try" : "Highlight"),
          text: highlightTextVal.trim(),
        },
      });
      toast.success(`Updated ${highlightLabelVal.trim() || "Must-Try"} for ${place.name}.`, "Highlight Saved");
    } else {
      updatePlace(place.id, { highlight: undefined });
      toast.info(`Removed highlight from ${place.name}.`, "Highlight Removed");
    }
    setIsEditingHighlight(false);
  };

  const handleRemoveHighlight = () => {
    updatePlace(place.id, { highlight: undefined });
    setHighlightTextVal("");
    setIsEditingHighlight(false);
    toast.info(`Removed highlight from ${place.name}.`, "Highlight Removed");
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: place.id });

  const style = transform
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  const dayIndices = React.useMemo(() => Array.from({ length: days }, (_, i) => i), [days]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditingDuration && durationRef.current) {
      durationRef.current.focus();
      durationRef.current.select();
    }
  }, [isEditingDuration]);

  const handleSave = () => {
    setIsEditing(false);
    if (desc !== place.description) {
      updatePlace(place.id, { description: desc, descriptionSource: "user" });
    }
  };

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGeneratingAI(true);
    try {
      let aiData;
      if (appMode === "real") {
        aiData = await summarizePlace(
          place.name,
          place.address,
          (place as any).types || [],
        );
      } else {
        const mockHighlight = getSpecificMockHighlight(place);
        const mockPrice = getSpecificMockPrice(place);
        const mockReservation = getSpecificMockReservation(place);

        aiData = {
          description: getSpecificMockDescription(place),
          category: place.category,
          estimatedDuration: place.estimatedDuration,
          highlight: mockHighlight,
          priceEstimate: mockPrice,
          reservation: mockReservation,
        };
      }
      updatePlace(place.id, {
        description: aiData.description,
        category: aiData.category,
        estimatedDuration: aiData.estimatedDuration,
        descriptionSource: "ai",
        ...(aiData.romanizedName ? { romanizedName: aiData.romanizedName } : {}),
        ...(aiData.highlight ? { highlight: aiData.highlight } : {}),
        ...(aiData.priceEstimate ? { priceEstimate: aiData.priceEstimate } : {}),
        ...(aiData.reservation ? { reservation: aiData.reservation } : {}),
      });
      setDesc(aiData.description);
    } catch (err) {
      console.error(err);
      if (place.editorialSummary) {
        updatePlace(place.id, {
          description: place.editorialSummary,
          descriptionSource: "ai",
        });
        setDesc(place.editorialSummary);
      }
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setIsEditing(false);
      setDesc(place.description || "");
    }
  };

  const handleDurationSave = () => {
    setIsEditingDuration(false);
    const parsed = parseInt(durationVal);
    if (!isNaN(parsed) && parsed > 0 && parsed !== place.estimatedDuration) {
      updatePlace(place.id, { estimatedDuration: parsed });
    } else {
      setDurationVal((place.estimatedDuration ?? 60).toString());
    }
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "") {
      unassignPlace(place.id);
    } else {
      assignPlaceToDay(place.id, parseInt(val));
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCat = e.target.value as PlaceCategory;
    updatePlace(place.id, {
      category: newCat,
      estimatedDuration: getDefaultDuration(newCat),
    });
    setDurationVal(getDefaultDuration(newCat).toString());
  };

  const activePhotoUrl = getActivePhotoUrl(place.photoUrl);
  const hasImage = showImages && !!activePhotoUrl;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group card-place transition-colors duration-150 ${
        place.isDisabled
          ? "opacity-80 bg-surface-50/80 dark:bg-surface-850/60 border-dashed border-amber-200 dark:border-amber-900/40"
          : ""
      } ${isDragging ? "opacity-50 border-primary-500 shadow-md scale-[1.02]" : ""}`}
    >
      <div className="flex items-start p-4 gap-3">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="mt-1 text-surface-400 hover:text-surface-600 cursor-grab active:cursor-grabbing p-1 -ml-1 rounded"
        >
          <GripVertical className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          {hasImage && (
            <div className="w-full h-24 mb-3 rounded-lg overflow-hidden relative shrink-0 bg-surface-100 dark:bg-surface-800">
              <img 
                src={activePhotoUrl!} 
                alt={place.name} 
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.parentElement!.style.display = "none";
                }}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/10 pointer-events-none" />
            </div>
          )}
          {/* Header Row: Title & Address on Left, Actions on Right */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-1.5 min-w-0 flex-1">
              <MapPin className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-surface-900 dark:text-white leading-snug">
                  <span className="break-words">{place.name}</span>
                  {place.romanizedName && place.romanizedName.toLowerCase() !== place.name.toLowerCase() && (
                    <span className="text-xs font-normal text-surface-500 dark:text-surface-400 italic ml-1.5">
                      ({place.romanizedName})
                    </span>
                  )}
                  {place.isDisabled && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-300/80 dark:border-amber-800/80 ml-1.5 align-middle shrink-0">
                      <EyeOff className="w-2.5 h-2.5" /> Excluded
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
                          updatePlace(place.id, { dismissedDuplicate: true });
                          toast.info(`Removed duplicate flag from "${place.name}".`, "Duplicate Dismissed");
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
                        updatePlace(place.id, { dismissedDuplicate: false });
                        toast.info(`Restored duplicate check for "${place.name}".`, "Duplicate Flag Restored");
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400 border border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 ml-1.5 align-middle shrink-0 transition-colors cursor-pointer"
                      title="Duplicate flag was removed. Click to re-enable duplicate checking."
                    >
                      <Check className="w-2.5 h-2.5 text-emerald-500" />
                      <span>Not Dup</span>
                    </button>
                  )}
                </h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 truncate">
                  {place.address}
                </p>
              </div>
            </div>

            {/* Top Right Actions */}
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
              {/* Star / Must-Visit Priority Toggle Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updatePlace(place.id, { isStarred: !place.isStarred });
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
                  togglePlaceDisabled(place.id);
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

              {/* Day assignment dropdown (only when active) */}
              {!place.isDisabled && (
                <div className="relative">
                  <select
                    value={place.dayIndex !== null ? place.dayIndex : ""}
                    onChange={handleDayChange}
                    className={`text-xs font-bold border rounded-md pl-1.5 pr-4 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 appearance-none cursor-pointer text-center tracking-wide ${place.dayIndex === null ? "bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400 border-surface-200 dark:border-surface-700" : getBadgeColor(place.dayIndex)}`}
                    title="Assign to day"
                  >
                    <option value="">-</option>
                    {dayIndices.map((i) => (
                      <option key={i} value={i}>
                        D{i + 1}
                      </option>
                    ))}
                  </select>
                  {place.pinnedToDay && (
                    <Pin className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-current opacity-60 pointer-events-none" />
                  )}
                </div>
              )}

              <button
                onClick={() => removePlace(place.id)}
                className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                aria-label="Remove place"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Full-width Info Badges Row: Category, Duration, Hours, Price, View on Google */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {/* Category selector (dynamically fits selected category text length) */}
            <div className="relative inline-grid items-center">
              <span
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 text-xs font-medium pl-1.5 pr-2 py-0.5 whitespace-pre pointer-events-none border border-transparent select-none"
              >
                {getCategoryEmoji(place.category)} {getCategoryLabel(place.category)}
              </span>
              <select
                value={place.category}
                onChange={handleCategoryChange}
                className="col-start-1 row-start-1 w-full text-xs font-medium bg-surface-50 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700/60 border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 rounded-md pl-1.5 pr-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 appearance-none cursor-pointer text-left transition-colors"
                title="Change category"
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {getCategoryEmoji(cat)} {getCategoryLabel(cat)}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration badge (click to edit) */}
            {isEditingDuration ? (
              <div className="flex items-center gap-1">
                <Timer className="w-3 h-3 text-surface-400 dark:text-surface-500" />
                <input
                  ref={durationRef}
                  type="number"
                  min="5"
                  max="480"
                  value={durationVal}
                  onChange={(e) => setDurationVal(e.target.value)}
                  onBlur={handleDurationSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleDurationSave();
                    if (e.key === "Escape") {
                      setIsEditingDuration(false);
                      setDurationVal(
                        (place.estimatedDuration ?? 60).toString(),
                      );
                    }
                  }}
                  className="w-14 text-xs font-medium bg-white dark:bg-surface-800 border border-primary-300 dark:border-primary-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 text-center text-surface-900 dark:text-white"
                />
                <span className="text-xs text-surface-500">min</span>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingDuration(true)}
                className="flex items-center gap-1 text-xs font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md px-1.5 py-0.5 hover:border-surface-300 dark:hover:border-surface-600 transition-colors whitespace-nowrap"
                title="Click to edit duration"
              >
                <Timer className="w-3 h-3" />
                {place.estimatedDuration ?? 60} min
              </button>
            )}

            {/* Opening Hours badge */}
            {place.openingHours && place.openingHours.length > 0 && (
              <div
                className="flex items-center gap-1 text-xs font-medium text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md px-1.5 py-0.5 cursor-help whitespace-nowrap"
                title={place.openingHours.join("\n")}
              >
                <Clock className="w-3 h-3" />
                Hours
              </div>
            )}

            {/* Price Estimate badge */}
            {place.priceEstimate && (
              <div
                className={`flex items-center gap-1 text-xs font-medium rounded-md px-1.5 py-0.5 border whitespace-nowrap ${
                  place.priceEstimate.toLowerCase().includes("free")
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 font-semibold"
                    : "bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700"
                }`}
                title={`Estimated price: ${place.priceEstimate}`}
              >
                <Coins className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{place.priceEstimate}</span>
              </div>
            )}

            {/* Reservation Requirement badge */}
            {place.reservation && (
              <ReservationBadge reservation={place.reservation} compact />
            )}

            {/* View on Google link */}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-surface-600 dark:text-surface-300 hover:text-surface-900 dark:hover:text-white bg-surface-50 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700 border border-surface-200 dark:border-surface-700 rounded-md px-1.5 py-0.5 transition-all whitespace-nowrap"
              title="View on Google Maps"
            >
              <ExternalLink className="w-3 h-3" />
              View on Google
            </a>
          </div>

          {/* Inline Editable Description */}
          <div className="mt-1">
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="w-full text-sm text-surface-700 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 border border-primary-200 dark:border-primary-700 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none overflow-hidden"
                rows={1}
              />
            ) : (
              <div className="group/desc flex items-start justify-between gap-2 p-2 -mx-2 rounded-lg border border-transparent hover:border-surface-200 dark:hover:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
                <p
                  onClick={() => {
                    if (!isDragging) {
                      setDesc(place.description || "");
                      setIsEditing(true);
                    }
                  }}
                  className="text-sm text-surface-600 dark:text-surface-300 cursor-text line-clamp-2 flex-1"
                  title="Click to edit"
                >
                  {place.description || (
                    <span className="text-surface-400 dark:text-surface-500 italic">
                      Click to add description...
                    </span>
                  )}
                </p>
                
                <button
                  onClick={handleGenerate}
                  disabled={isGeneratingAI}
                  className={`shrink-0 p-1 rounded transition-colors ${
                    place.descriptionSource === "ai"
                      ? "text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/30"
                      : "text-surface-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/30 opacity-0 group-hover/desc:opacity-100"
                  } disabled:opacity-50`}
                  title="Generate AI Description"
                >
                  {isGeneratingAI ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Contextual Highlight (Must-Try, Photo Spot, etc.) */}
          {isEditingHighlight ? (
            <div className="mt-2 p-2.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 space-y-2 text-xs animate-in fade-in duration-150">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <select
                    value={
                      ["Must-Try", "Best Photo Spot", "Pro Tip", "Best Time to Go", "What to Buy"].includes(highlightLabelVal)
                        ? highlightLabelVal
                        : "Custom"
                    }
                    onChange={(e) => {
                      if (e.target.value !== "Custom") {
                        setHighlightLabelVal(e.target.value);
                      }
                    }}
                    className="text-[11px] font-bold bg-white dark:bg-surface-800 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5 text-amber-900 dark:text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="Must-Try">Must-Try</option>
                    <option value="Best Photo Spot">Best Photo Spot</option>
                    <option value="Pro Tip">Pro Tip</option>
                    <option value="Best Time to Go">Best Time to Go</option>
                    <option value="What to Buy">What to Buy</option>
                    <option value="Custom">Custom Label...</option>
                  </select>
                  {!["Must-Try", "Best Photo Spot", "Pro Tip", "Best Time to Go", "What to Buy"].includes(highlightLabelVal) && (
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
                    onClick={handleRemoveHighlight}
                    className="text-[10px] text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>
              <textarea
                value={highlightTextVal}
                onChange={(e) => setHighlightTextVal(e.target.value)}
                placeholder={place.category === "restaurant" ? "e.g. Signature ramen dipping broth & gyoza" : "e.g. Sunset viewing spot from garden"}
                rows={2}
                autoFocus
                className="w-full text-xs font-medium bg-white dark:bg-surface-900 border border-amber-300 dark:border-amber-700 rounded-md p-1.5 text-surface-900 dark:text-white placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveHighlight();
                  }
                  if (e.key === "Escape") {
                    setIsEditingHighlight(false);
                    setHighlightTextVal(place.highlight?.text || "");
                  }
                }}
              />
              <div className="flex items-center justify-end gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingHighlight(false);
                    setHighlightTextVal(place.highlight?.text || "");
                  }}
                  className="px-2 py-1 text-xs text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white rounded hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveHighlight}
                  className="px-2.5 py-1 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors shadow-2xs cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          ) : place.highlight && place.highlight.text ? (
            <div className="mt-2">
              <PlaceHighlightBadge
                highlight={place.highlight}
                category={place.category}
                onEdit={() => setIsEditingHighlight(true)}
              />
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {place.unfeasibleReason && place.dayIndex === null && (
        <div className="bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/20 px-4 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[10px] font-medium text-red-700 dark:text-red-400 leading-tight">
            <span className="font-bold">Unfeasible:</span> {place.unfeasibleReason}
          </p>
        </div>
      )}
    </div>
  );
});

