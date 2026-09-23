import React, { useState, useRef, useEffect, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, AlertCircle, Sparkles, Loader2, X } from "lucide-react";
import { Place, PlaceCategory } from "../../types";
import { useRouteStore } from "../../store/useRouteStore";
import { toast } from "../../services/toastService";
import { getDefaultDuration, getActivePhotoUrl } from "../../utils/categoryUtils";
import { summarizePlace } from "../../services/aiService";
import {
  getSpecificMockHighlight,
  getSpecificMockPrice,
  getSpecificMockDescription,
  getSpecificMockReservation,
} from "../../utils/mockAiUtils";
import { PlaceItemHeader } from "./place-item/PlaceItemHeader";
import { PlaceItemBadges } from "./place-item/PlaceItemBadges";
import { PlaceHighlightEditor } from "./place-item/PlaceHighlightEditor";

interface PlaceItemProps {
  place: Place;
  isDuplicate?: boolean;
  onEdit?: (id: string) => void;
}

export const PlaceItem: React.FC<PlaceItemProps> = React.memo(({ place, isDuplicate, onEdit }) => {
  const updatePlace = useRouteStore((s) => s.updatePlace);
  const removePlace = useRouteStore((s) => s.removePlace);
  const togglePlaceDisabled = useRouteStore((s) => s.togglePlaceDisabled);
  const startDate = useRouteStore((s) => s.startDate);
  const dayTitles = useRouteStore((s) => s.dayTitles);
  const days = useRouteStore((s) => s.days);
  const assignPlaceToDay = useRouteStore((s) => s.assignPlaceToDay);
  const unassignPlace = useRouteStore((s) => s.unassignPlace);
  const dayIndices = useMemo(() => Array.from({ length: days }, (_, i) => i), [days]);
  const appMode = useRouteStore((s) => s.appMode);
  const showImages = useRouteStore((s) => s.showImages);
  const hasOptimizedSchedule = useRouteStore((s) => s.optimizedRoutes.length > 0);

  const [isEditing, setIsEditing] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [desc, setDesc] = useState(place.description || "");
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [durationVal, setDurationVal] = useState(
    (place.estimatedDuration ?? 60).toString(),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const durationRef = useRef<HTMLInputElement>(null);

  // Sync local state if the place is updated externally
  useEffect(() => {
    if (!isEditing) setDesc(place.description || "");
    if (!isEditingDuration) setDurationVal((place.estimatedDuration ?? 60).toString());
  }, [place.description, place.estimatedDuration, isEditing, isEditingDuration]);

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

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditingDuration && durationRef.current) {
      durationRef.current.focus();
      durationRef.current.select();
    }
  }, [isEditingDuration]);

  const handleSaveDescription = () => {
    setIsEditing(false);
    if (desc !== place.description) {
      updatePlace(place.id, { description: desc, descriptionSource: "user" });
    }
  };

  const handleGenerateAI = async (e: React.MouseEvent) => {
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
      const finalDesc =
        place.areaNote && !aiData.description.includes(place.areaNote)
          ? `${aiData.description}\n\n${place.areaNote}`
          : aiData.description;
      updatePlace(place.id, {
        description: finalDesc,
        category: aiData.category,
        estimatedDuration: aiData.estimatedDuration,
        descriptionSource: "ai",
        ...(aiData.romanizedName ? { romanizedName: aiData.romanizedName } : {}),
        ...(aiData.highlight ? { highlight: aiData.highlight } : {}),
        ...(aiData.priceEstimate ? { priceEstimate: aiData.priceEstimate } : {}),
        ...(aiData.reservation ? { reservation: aiData.reservation } : {}),
      });
      setDesc(finalDesc);
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
      handleSaveDescription();
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

  const handleCategoryChange = (newCat: PlaceCategory) => {
    updatePlace(place.id, {
      category: newCat,
      estimatedDuration: getDefaultDuration(newCat),
    });
    setDurationVal(getDefaultDuration(newCat).toString());
  };

  const handleSaveHighlight = (label: string, text: string) => {
    if (text.trim()) {
      updatePlace(place.id, {
        highlight: {
          label: label.trim() || (place.category === "restaurant" ? "Must-Try" : "Highlight"),
          text: text.trim(),
        },
      });
      toast.success(`Updated ${label.trim() || "Must-Try"} for ${place.name}.`, "Highlight Saved");
    } else {
      updatePlace(place.id, { highlight: undefined });
      toast.info(`Removed highlight from ${place.name}.`, "Highlight Removed");
    }
  };

  const handleRemoveHighlight = () => {
    updatePlace(place.id, { highlight: undefined });
    toast.info(`Removed highlight from ${place.name}.`, "Highlight Removed");
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

          {/* Place Item Header (Name, badges, actions) */}
          <PlaceItemHeader
            place={place}
            isDuplicate={isDuplicate}
            isDragging={isDragging}
            onEdit={onEdit}
            onToggleStarred={() => updatePlace(place.id, { isStarred: !place.isStarred })}
            onToggleDisabled={() => togglePlaceDisabled(place.id)}
            onRemovePlace={() => removePlace(place.id)}
            onDismissDuplicate={() => {
              updatePlace(place.id, { dismissedDuplicate: true });
              toast.info(`Removed duplicate flag from "${place.name}".`, "Duplicate Dismissed");
            }}
            onRestoreDuplicate={() => {
              updatePlace(place.id, { dismissedDuplicate: false });
              toast.info(`Restored duplicate check for "${place.name}".`, "Duplicate Flag Restored");
            }}
          />

          {/* Badges: Assigned Day & Price & Google link on same line, Category & Duration, Reservation & Allowed Day Range */}
          <PlaceItemBadges
            place={place}
            startDate={startDate}
            dayTitles={dayTitles}
            dayIndices={dayIndices}
            onAssignDay={(dayIndex) => assignPlaceToDay(place.id, dayIndex)}
            onUnassignDay={() => {
              unassignPlace(place.id);
              toast.info(`Unassigned "${place.name}".`, "Day Assignment Updated");
            }}
            isEditingDuration={isEditingDuration}
            durationVal={durationVal}
            durationRef={durationRef}
            onStartEditingDuration={() => setIsEditingDuration(true)}
            onDurationChange={(val) => setDurationVal(val)}
            onDurationSave={handleDurationSave}
            onDurationCancel={() => {
              setIsEditingDuration(false);
              setDurationVal((place.estimatedDuration ?? 60).toString());
            }}
            onCategoryChange={handleCategoryChange}
            onEdit={onEdit}
          />

          {/* Inline Editable Description */}
          <div className="mt-1">
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={handleSaveDescription}
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
                  onClick={handleGenerateAI}
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

          {/* Area Opening Hours Note (for neighborhood/district places) */}
          {place.areaNote && (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-2.5 py-1.5">
              <span className="text-amber-500 dark:text-amber-400 text-xs mt-0.5 shrink-0">🕐</span>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">{place.areaNote}</p>
            </div>
          )}

          {/* Contextual Highlight (Must-Try, Photo Spot, etc.) */}
          <PlaceHighlightEditor
            place={place}
            onSaveHighlight={handleSaveHighlight}
            onRemoveHighlight={handleRemoveHighlight}
          />
        </div>
      </div>

      {hasOptimizedSchedule && place.unfeasibleReason && place.dayIndex === null && (
        <div className="bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/20 px-4 py-2.5 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[10px] font-medium text-red-700 dark:text-red-400 leading-tight">
              <span className="font-bold">Unfeasible:</span> {place.unfeasibleReason}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              updatePlace(place.id, { unfeasibleReason: undefined });
            }}
            className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-0.5 rounded transition-colors shrink-0 cursor-pointer"
            title="Dismiss unfeasible warning"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});
