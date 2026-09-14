import React, { useState, useMemo } from "react";
import { Search, EyeOff, CheckCircle2, ArrowUpDown, CalendarClock, AlertTriangle, Star, ChevronUp, ChevronDown, X, Layers, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { PlaceItem } from "./PlaceItem";
import { useRouteStore } from "../../store/useRouteStore";

const EditPlaceModal = React.lazy(() =>
  import("../schedule/EditPlaceModal").then((m) => ({ default: m.EditPlaceModal }))
);
import { ALL_CATEGORIES, getCategoryLabel, getCategoryEmoji } from "../../utils/categoryUtils";
import { Place, PlaceCategory, DayRangeConstraint } from "../../types";
import { findDuplicatePlaceIds, getDuplicatePlaceIdsToRemove } from "../../utils/duplicateUtils";
import { formatDayRangeBadge } from "../../utils/dayRangeUtils";
import { toast } from "../../services/toastService";

interface PlaceListProps {
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

type FilterTab = "active" | "unassigned" | "disabled" | "all";
type SortOption =
  | "default"
  | "starred"
  | "reservation-rec"
  | "reservation-none"
  | "name-asc"
  | "name-desc"
  | "duration-desc"
  | "duration-asc";

const getReservationRank = (p: Place): number => {
  const req = p.reservation?.requirement;
  if (req === "required") return 3;
  if (req === "recommended") return 2;
  if (req === "walk_ins_only") return 1;
  return 0; // "not_needed" or no reservation info
};

export const PlaceList: React.FC<PlaceListProps> = React.memo(({ isExpanded: controlledIsExpanded, onToggleExpanded }) => {
  const places = useRouteStore((s) => s.places);
  const reorderPlaces = useRouteStore((s) => s.reorderPlaces);
  const removePlace = useRouteStore((s) => s.removePlace);
  const updatePlacesBulk = useRouteStore((s) => s.updatePlacesBulk);
  const setAllPlacesDisabled = useRouteStore((s) => s.setAllPlacesDisabled);
  const days = useRouteStore((s) => s.days);
  const dayTitles = useRouteStore((s) => s.dayTitles);
  const startDate = useRouteStore((s) => s.startDate);
  const dayIndices = useMemo(() => Array.from({ length: days }, (_, i) => i), [days]);
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);
  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalIsExpanded;
  const toggleExpanded = () => {
    if (onToggleExpanded) {
      onToggleExpanded();
    } else {
      setInternalIsExpanded((prev) => !prev);
    }
  };

  const [activeTab, setActiveTab] = useState<FilterTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<PlaceCategory | "all">("all");
  const [dayFilter, setDayFilter] = useState<number | "all" | "unassigned">("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [reservationOnly, setReservationOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);

  // Mass Edit State
  const [isMassEditOpen, setIsMassEditOpen] = useState(false);
  const [showCustomRangePicker, setShowCustomRangePicker] = useState(false);
  const [customRangeStart, setCustomRangeStart] = useState(0);
  const [customRangeEnd, setCustomRangeEnd] = useState(Math.max(0, days - 1));

  const duplicatePlaceIds = useMemo(() => findDuplicatePlaceIds(places), [places]);

  const handleRemoveDuplicates = () => {
    const idsToRemove = getDuplicatePlaceIdsToRemove(places);
    if (idsToRemove.length === 0) return;

    if (
      window.confirm(
        `Remove ${idsToRemove.length} duplicate place(s) from your trip? Assigned and starred places will be preserved.`
      )
    ) {
      idsToRemove.forEach((id) => removePlace(id));
      toast.success(`Removed ${idsToRemove.length} duplicate place(s).`, "Trip Deduplicated");
      setDuplicatesOnly(false);
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      if (sortBy !== "default") {
        setSortBy("default");
      }
      const oldIndex = places.findIndex((p) => p.id === active.id);
      const newIndex = places.findIndex((p) => p.id === over.id);
      reorderPlaces(arrayMove(places, oldIndex, newIndex));
    }
  };

  const baseFilteredPlaces = useMemo(() => {
    let list = places;
    const query = searchQuery.trim().toLowerCase();

    if (query) {
      const words = query.split(/\s+/).filter(Boolean);
      const matchField = (field?: string | null) => {
        if (!field) return false;
        const lower = field.toLowerCase();
        if (lower.includes(query)) return true;
        if (words.length > 1 && words.every((w) => lower.includes(w))) return true;
        return false;
      };

      const scored: { place: Place; rank: number; originalIndex: number }[] = [];

      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const isNameMatch =
          matchField(p.name) ||
          matchField(p.romanizedName);

        const isHighlightMatch =
          matchField(p.highlight?.text) ||
          matchField(p.highlight?.label);

        const isDescMatch =
          matchField(p.description) ||
          matchField(p.editorialSummary) ||
          matchField(p.notes);

        const isAddressMatch = matchField(p.address);

        if (isNameMatch) {
          scored.push({ place: p, rank: 0, originalIndex: i });
        } else if (isHighlightMatch) {
          scored.push({ place: p, rank: 1, originalIndex: i });
        } else if (isDescMatch) {
          scored.push({ place: p, rank: 2, originalIndex: i });
        } else if (isAddressMatch) {
          scored.push({ place: p, rank: 3, originalIndex: i });
        }
      }

      scored.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.originalIndex - b.originalIndex;
      });

      list = scored.map((item) => item.place);
    }

    if (categoryFilter !== "all") {
      list = list.filter((p) => p.category === categoryFilter);
    }
    return list;
  }, [places, searchQuery, categoryFilter]);

  const { activeCount, unassignedCount, disabledCount, allCount } = useMemo(() => {
    let active = 0;
    let unassigned = 0;
    let disabled = 0;
    for (let i = 0; i < baseFilteredPlaces.length; i++) {
      const p = baseFilteredPlaces[i];
      if (p.isDisabled) {
        disabled++;
      } else {
        active++;
        if (p.dayIndex === null) {
          unassigned++;
        }
      }
    }
    return {
      activeCount: active,
      unassignedCount: unassigned,
      disabledCount: disabled,
      allCount: baseFilteredPlaces.length,
    };
  }, [baseFilteredPlaces]);

  const recPlacesCount = useMemo(() => {
    return baseFilteredPlaces.filter(
      (p) =>
        p.reservation?.requirement === "recommended" ||
        p.reservation?.requirement === "required",
    ).length;
  }, [baseFilteredPlaces]);

  const starredCount = useMemo(() => {
    return baseFilteredPlaces.filter((p) => p.isStarred).length;
  }, [baseFilteredPlaces]);

  const filteredPlaces = useMemo(() => {
    let list: Place[];
    switch (activeTab) {
      case "active":
        list = baseFilteredPlaces.filter((p) => !p.isDisabled);
        break;
      case "unassigned":
        list = baseFilteredPlaces.filter((p) => !p.isDisabled && p.dayIndex === null);
        break;
      case "disabled":
        list = baseFilteredPlaces.filter((p) => p.isDisabled);
        break;
      case "all":
      default:
        list = baseFilteredPlaces;
        break;
    }

    if (dayFilter === "unassigned") {
      list = list.filter((p) => p.dayIndex === null);
    } else if (typeof dayFilter === "number") {
      list = list.filter((p) => p.dayIndex === dayFilter);
    }

    if (starredOnly) {
      list = list.filter((p) => p.isStarred);
    }

    if (reservationOnly) {
      list = list.filter(
        (p) =>
          p.reservation?.requirement === "recommended" ||
          p.reservation?.requirement === "required",
      );
    }

    if (duplicatesOnly) {
      list = list.filter((p) => duplicatePlaceIds.has(p.id));
      if (sortBy === "default") {
        const sortedDups = [...list];
        sortedDups.sort((a, b) => {
          const normA = a.name.toLowerCase().trim();
          const normB = b.name.toLowerCase().trim();
          const comp = normA.localeCompare(normB);
          if (comp !== 0) return comp;
          return (a.dayIndex ?? 999) - (b.dayIndex ?? 999);
        });
        return sortedDups;
      }
    }

    if (sortBy === "default") {
      return list;
    }

    const query = searchQuery.trim().toLowerCase();
    const isDirectNameMatch = (p: Place) => {
      if (!query) return true;
      const words = query.split(/\s+/).filter(Boolean);
      const matchField = (field?: string | null) => {
        if (!field) return false;
        const lower = field.toLowerCase();
        return lower.includes(query) || (words.length > 1 && words.every((w) => lower.includes(w)));
      };
      return matchField(p.name) || matchField(p.romanizedName);
    };

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (query) {
        const tierA = isDirectNameMatch(a) ? 0 : 1;
        const tierB = isDirectNameMatch(b) ? 0 : 1;
        if (tierA !== tierB) return tierA - tierB;
      }

      if (sortBy === "starred") {
        const diff = (b.isStarred ? 1 : 0) - (a.isStarred ? 1 : 0);
        if (diff !== 0) return diff;
        return places.indexOf(a) - places.indexOf(b);
      } else if (sortBy === "reservation-rec") {
        const diff = getReservationRank(b) - getReservationRank(a);
        if (diff !== 0) return diff;
        return places.indexOf(a) - places.indexOf(b);
      } else if (sortBy === "reservation-none") {
        const diff = getReservationRank(a) - getReservationRank(b);
        if (diff !== 0) return diff;
        return places.indexOf(a) - places.indexOf(b);
      } else if (sortBy === "name-asc") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "name-desc") {
        return b.name.localeCompare(a.name);
      } else if (sortBy === "duration-desc") {
        return (b.estimatedDuration ?? 60) - (a.estimatedDuration ?? 60);
      } else if (sortBy === "duration-asc") {
        return (a.estimatedDuration ?? 60) - (b.estimatedDuration ?? 60);
      }
      return 0;
    });

    return sorted;
  }, [baseFilteredPlaces, activeTab, dayFilter, starredOnly, reservationOnly, duplicatesOnly, duplicatePlaceIds, sortBy, places, searchQuery]);

  const getSortLabel = (sort: SortOption) => {
    switch (sort) {
      case "starred":
        return "Starred (Must-Visit First)";
      case "reservation-rec":
        return "Reservation: Recommended First";
      case "reservation-none":
        return "Reservation: Not Needed First";
      case "name-asc":
        return "Name (A-Z)";
      case "name-desc":
        return "Name (Z-A)";
      case "duration-desc":
        return "Duration (High to Low)";
      case "duration-asc":
        return "Duration (Low to High)";
      default:
        return "Default Order";
    }
  };

  const sortableItemIds = useMemo(
    () => filteredPlaces.map((p) => p.id),
    [filteredPlaces],
  );

  // Mass Edit Actions
  const allFilteredStarred = useMemo(() => {
    return filteredPlaces.length > 0 && filteredPlaces.every((p) => p.isStarred);
  }, [filteredPlaces]);

  const allFilteredDisabled = useMemo(() => {
    return filteredPlaces.length > 0 && filteredPlaces.every((p) => p.isDisabled);
  }, [filteredPlaces]);

  const handleMassStar = () => {
    if (filteredPlaces.length === 0) return;
    const targetStarred = !allFilteredStarred;
    const updates = filteredPlaces.map((p) => ({
      id: p.id,
      updates: { isStarred: targetStarred },
    }));
    updatePlacesBulk(updates);
    toast.success(
      targetStarred
        ? `Starred ${filteredPlaces.length} place(s) as Must-Visit.`
        : `Removed star priority from ${filteredPlaces.length} place(s).`,
      "Places Updated"
    );
  };

  const handleMassDisabled = async () => {
    if (filteredPlaces.length === 0) return;
    const targetDisabled = !allFilteredDisabled;
    const ids = filteredPlaces.map((p) => p.id);
    await setAllPlacesDisabled(targetDisabled, ids);
    toast.success(
      targetDisabled
        ? `Excluded ${filteredPlaces.length} place(s) from routing.`
        : `Re-enabled ${filteredPlaces.length} place(s) for routing.`,
      "Places Updated"
    );
  };

  const handleApplyDayRestriction = (range: DayRangeConstraint | null) => {
    if (filteredPlaces.length === 0) return;

    const updates = filteredPlaces.map((p) => {
      const isOutOfRange =
        range &&
        p.dayIndex !== null &&
        p.dayIndex !== undefined &&
        (p.dayIndex < range.startDay || p.dayIndex > range.endDay);

      return {
        id: p.id,
        updates: {
          allowedDayRange: range ? { ...range } : undefined,
          ...(isOutOfRange ? { dayIndex: null, orderInDay: null, pinnedToDay: false } : {}),
        },
      };
    });

    updatePlacesBulk(updates);

    if (range) {
      const badge = formatDayRangeBadge(range, startDate, dayTitles);
      toast.success(
        `Restricted ${filteredPlaces.length} place(s) to ${badge.fullLabel}.`,
        "Day Restriction Applied"
      );
    } else {
      toast.info(
        `Cleared day restrictions for ${filteredPlaces.length} place(s).`,
        "Day Restrictions Cleared"
      );
    }
  };

  const handleApplyCustomRange = () => {
    const start = Math.min(customRangeStart, customRangeEnd);
    const end = Math.max(customRangeStart, customRangeEnd);
    handleApplyDayRestriction({ startDay: start, endDay: end });
    setShowCustomRangePicker(false);
  };

  const handleMassAssignDay = (targetDay: number | "unassign") => {
    if (filteredPlaces.length === 0) return;

    if (targetDay === "unassign") {
      const updates = filteredPlaces.map((p) => ({
        id: p.id,
        updates: { dayIndex: null, orderInDay: null, pinnedToDay: false },
      }));
      updatePlacesBulk(updates);
      toast.info(`Unassigned ${filteredPlaces.length} place(s).`, "Day Assignment Updated");
    } else {
      const updates = filteredPlaces.map((p) => ({
        id: p.id,
        updates: { dayIndex: targetDay, orderInDay: null, pinnedToDay: false, isDisabled: false },
      }));
      updatePlacesBulk(updates);
      const dayTitle = dayTitles?.[targetDay]?.trim();
      toast.success(
        `Assigned ${filteredPlaces.length} place(s) to Day ${targetDay + 1}${dayTitle ? `: ${dayTitle}` : ""}.`,
        "Day Assignment Updated"
      );
    }
  };

  const handleMassDelete = () => {
    if (filteredPlaces.length === 0) return;
    if (
      window.confirm(
        `Are you sure you want to remove all ${filteredPlaces.length} place(s) currently shown from your trip?`
      )
    ) {
      filteredPlaces.forEach((p) => removePlace(p.id));
      toast.success(`Removed ${filteredPlaces.length} place(s).`, "Places Deleted");
    }
  };

  const isSearching = searchQuery.trim().length > 0;
  const showMassEditBar = (isSearching || isMassEditOpen) && filteredPlaces.length > 0;

  if (places.length === 0) {
    return (
      <div className="text-center py-12 px-4 bg-white dark:bg-surface-800 border border-dashed border-surface-300 dark:border-surface-600 rounded-xl">
        <p className="text-surface-500 dark:text-surface-400">
          No places added yet. Search above to add places to your itinerary!
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex gap-1 mb-3 bg-surface-100 dark:bg-surface-900/50 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === "active"
              ? "bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm border border-surface-200/60 dark:border-surface-600"
              : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
            }`}
        >
          <span>Active</span>
          <span className="opacity-60 text-[11px]">({activeCount})</span>
        </button>
        <button
          onClick={() => setActiveTab("unassigned")}
          className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === "unassigned"
              ? "bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm border border-surface-200/60 dark:border-surface-600"
              : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
            }`}
        >
          <span>Unassigned</span>
          {unassignedCount > 0 && (
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full px-1 ${activeTab === "unassigned"
                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  : "bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300"
                }`}
            >
              {unassignedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("disabled")}
          className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === "disabled"
              ? "bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm border border-surface-200/60 dark:border-surface-600"
              : "text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200/80 dark:hover:bg-surface-800"
            }`}
        >
          <span>Excluded</span>
          {disabledCount > 0 && (
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full px-1 ${activeTab === "disabled"
                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  : "bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50"
                }`}
            >
              {disabledCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("all")}
          className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${activeTab === "all"
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
            onClick={() => setAllPlacesDisabled(false, filteredPlaces.map((p) => p.id))}
            className="flex items-center gap-1 font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 shrink-0 ml-2 py-0.5 px-2 rounded hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Re-enable All</span>
          </button>
        </div>
      )}

      {/* Duplicate Places Warning Banner */}
      {duplicatePlaceIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 rounded-xl p-3 mb-3 text-xs shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-start sm:items-center gap-2.5 text-amber-900 dark:text-amber-200 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="font-bold flex items-center gap-1.5">
                <span>Possible Duplicate Places Detected</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200/80 dark:bg-amber-800/80 text-amber-900 dark:text-amber-100">
                  {duplicatePlaceIds.size} {duplicatePlaceIds.size === 1 ? "place" : "places"}
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
              onClick={() => {
                setDuplicatesOnly((prev) => {
                  const next = !prev;
                  if (next) {
                    setActiveTab("all");
                  }
                  return next;
                });
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${duplicatesOnly
                  ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
                  : "bg-white dark:bg-surface-800 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                }`}
            >
              {duplicatesOnly ? "Show All Places" : "View Duplicates Only"}
            </button>
            <button
              type="button"
              onClick={handleRemoveDuplicates}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-2xs cursor-pointer"
              title="Keep one copy of each place and remove redundant duplicates"
            >
              Remove Duplicates
            </button>
          </div>
        </div>
      )}

      {/* PTV Search & Filter */}
      <div className="flex flex-col lg:flex-row gap-2 mb-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 w-3.5 h-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search places by name, highlights, or description..."
            className="w-full h-9 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg pl-8 pr-8 text-surface-900 dark:text-white placeholder:text-surface-400 dark:placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 rounded"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          {/* Day Filter Dropdown */}
          <select
            value={dayFilter}
            onChange={(e) => {
              const val = e.target.value;
              const nextVal = val === "all" || val === "unassigned" ? val : parseInt(val, 10);
              setDayFilter(nextVal);
              if (typeof nextVal === "number" && (activeTab === "unassigned" || activeTab === "disabled")) {
                setActiveTab("active");
              }
            }}
            className="h-9 shrink-0 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg px-2 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer font-medium"
            title="Filter places by assigned day"
          >
            <option value="all">All Days</option>
            <option value="unassigned">Unassigned Only</option>
            {dayIndices.map((i) => {
              const title = dayTitles?.[i]?.trim();
              return (
                <option key={i} value={i}>
                  Day {i + 1}{title ? `: ${title}` : ""}
                </option>
              );
            })}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as PlaceCategory | "all")}
            className="h-9 shrink-0 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg px-2 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
          >
            <option value="all">All Categories</option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {getCategoryEmoji(cat)} {getCategoryLabel(cat)}
              </option>
            ))}
          </select>

          {/* Sort By Dropdown */}
          <div className="relative shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-9 shrink-0 text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg pl-7 pr-3 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer font-medium"
              title="Sort Places to Visit"
            >
              <option value="default">Sort: Default Order</option>
              <option value="starred">Sort: Starred (Must-Visit first)</option>
              <option value="reservation-rec">Sort: Reservation Rec (Yes first)</option>
              <option value="reservation-none">Sort: Reservation Rec (No first)</option>
              <option value="name-asc">Sort: Name (A-Z)</option>
              <option value="duration-desc">Sort: Duration (High to Low)</option>
              <option value="duration-asc">Sort: Duration (Low to High)</option>
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Quick Filter: Starred Only */}
          <button
            type="button"
            onClick={() => setStarredOnly((prev) => !prev)}
            className={`h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer ${starredOnly
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

          {/* Quick Filter: Reservation Rec Only */}
          <button
            type="button"
            onClick={() => setReservationOnly((prev) => !prev)}
            className={`h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer ${reservationOnly
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

          {/* Quick Toggle: Mass Edit */}
          <button
            type="button"
            onClick={() => setIsMassEditOpen((prev) => !prev)}
            className={`h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer ${
              isMassEditOpen || (isSearching && filteredPlaces.length > 0)
                ? "bg-primary-100 dark:bg-primary-900/50 text-primary-900 dark:text-primary-200 border-primary-300 dark:border-primary-700 shadow-2xs"
                : "bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700"
            }`}
            title={isMassEditOpen ? "Close mass edit toolbar" : "Open mass edit toolbar for current results"}
          >
            <Layers className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 shrink-0" />
            <span className="hidden sm:inline">Mass Edit</span>
            <span className="sm:hidden">Mass</span>
            {filteredPlaces.length > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  isMassEditOpen || (isSearching && filteredPlaces.length > 0)
                    ? "bg-primary-200/90 dark:bg-primary-800/90 text-primary-900 dark:text-primary-100"
                    : "bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300"
                }`}
              >
                {filteredPlaces.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Notice when custom sort or quick filters are active */}
      {(sortBy !== "default" || reservationOnly || starredOnly || duplicatesOnly || dayFilter !== "all") && (
        <div className="flex items-center justify-between text-[11px] bg-surface-100/80 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700/80 rounded-lg px-3 py-1.5 mb-3 text-surface-600 dark:text-surface-300 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 flex-wrap">
            {sortBy !== "default" && (
              <span>
                Sorted by <strong className="text-surface-900 dark:text-white">{getSortLabel(sortBy)}</strong>. Manual reordering is locked.
              </span>
            )}
            {dayFilter !== "all" && (
              <span>
                Filter: <strong className="text-primary-700 dark:text-primary-300">
                  {dayFilter === "unassigned"
                    ? "Unassigned"
                    : `Day ${(dayFilter as number) + 1}${dayTitles?.[dayFilter as number] ? `: ${dayTitles[dayFilter as number]}` : ""}`
                  } ({filteredPlaces.length})
                </strong>
              </span>
            )}
            {duplicatesOnly && (
              <span>
                Filter: <strong className="text-amber-700 dark:text-amber-300">Duplicates ({filteredPlaces.length})</strong>
              </span>
            )}
            {starredOnly && (
              <span>
                Filter: <strong className="text-amber-700 dark:text-amber-300">Starred ({starredCount})</strong>
              </span>
            )}
            {reservationOnly && (
              <span>
                Filter: <strong className="text-amber-700 dark:text-amber-300">Reservation Recommendations ({recPlacesCount})</strong>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSortBy("default");
              setReservationOnly(false);
              setStarredOnly(false);
              setDuplicatesOnly(false);
              setDayFilter("all");
            }}
            className="text-primary-600 dark:text-primary-400 font-bold hover:underline shrink-0 ml-2 cursor-pointer"
          >
            Reset
          </button>
        </div>
      )}

      {/* Mass Edit Action Banner for Search/Filter Results */}
      {showMassEditBar && (
        <div className="bg-primary-50/90 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800/80 rounded-xl p-3 mb-3 text-xs shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-primary-200/60 dark:border-primary-800/50">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary-100 dark:bg-primary-900/70 flex items-center justify-center text-primary-700 dark:text-primary-300 shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-surface-900 dark:text-white">
                  Mass Edit {filteredPlaces.length} Result{filteredPlaces.length === 1 ? "" : "s"}
                </span>
                {isSearching && (
                  <span className="text-surface-500 dark:text-surface-400">
                    matching &ldquo;<span className="font-semibold text-primary-700 dark:text-primary-300">{searchQuery.trim()}</span>&rdquo;
                  </span>
                )}
                {!isSearching && (
                  <span className="text-surface-500 dark:text-surface-400">
                    (in current view)
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsMassEditOpen(false);
                setShowCustomRangePicker(false);
              }}
              className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 rounded cursor-pointer transition-colors self-end sm:self-center"
              title="Close mass edit banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Day Restriction Selector */}
            <select
              defaultValue=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                if (val === "clear") {
                  handleApplyDayRestriction(null);
                } else if (val === "first-half") {
                  const halfEnd = Math.ceil(days / 2) - 1;
                  handleApplyDayRestriction({ startDay: 0, endDay: Math.max(0, halfEnd) });
                } else if (val === "second-half") {
                  const halfStart = Math.ceil(days / 2);
                  handleApplyDayRestriction({ startDay: Math.min(days - 1, halfStart), endDay: days - 1 });
                } else if (val === "custom") {
                  setShowCustomRangePicker(true);
                } else if (val.startsWith("day-")) {
                  const dayIdx = parseInt(val.replace("day-", ""), 10);
                  handleApplyDayRestriction({ startDay: dayIdx, endDay: dayIdx });
                }
                e.target.value = "";
              }}
              className="h-8 text-xs font-semibold bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer shadow-2xs"
              style={{ colorScheme: "dark light" }}
              title="Restrict all results to specific days"
            >
              <option value="">📅 Restrict to Days...</option>
              <option value="clear">❌ Clear Day Restriction</option>
              <optgroup label="Single Day Only">
                {dayIndices.map((i) => {
                  const title = dayTitles?.[i]?.trim();
                  return (
                    <option key={i} value={`day-${i}`}>
                      Day {i + 1}{title ? `: ${title}` : ""}
                    </option>
                  );
                })}
              </optgroup>
              {days > 2 && (
                <optgroup label="Multi-Day Ranges">
                  <option value="first-half">
                    Days 1–{Math.ceil(days / 2)} (First Half)
                  </option>
                  <option value="second-half">
                    Days {Math.ceil(days / 2) + 1}–{days} (Second Half)
                  </option>
                </optgroup>
              )}
              <option value="custom">⚙️ Custom Day Range...</option>
            </select>

            {/* Star All / Unstar All */}
            <button
              type="button"
              onClick={handleMassStar}
              className={`h-8 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs ${
                allFilteredStarred
                  ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-200/80"
                  : "bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700"
              }`}
              title={allFilteredStarred ? "Remove star priority from all results" : "Star all results as must-visit"}
            >
              <Star className={`w-3.5 h-3.5 ${allFilteredStarred ? "fill-amber-500 text-amber-500" : "text-amber-500"}`} />
              <span>{allFilteredStarred ? "Unstar All" : "Star All"}</span>
            </button>

            {/* Exclude All / Include All */}
            <button
              type="button"
              onClick={handleMassDisabled}
              className={`h-8 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 border transition-all cursor-pointer shadow-2xs ${
                allFilteredDisabled
                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100"
                  : "bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700"
              }`}
              title={allFilteredDisabled ? "Re-enable all results for routing" : "Exclude all results from routing"}
            >
              {allFilteredDisabled ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Re-enable All</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Exclude All</span>
                </>
              )}
            </button>

            {/* Assign to Day */}
            <select
              defaultValue=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                if (val === "unassign") {
                  handleMassAssignDay("unassign");
                } else if (val.startsWith("day-")) {
                  const d = parseInt(val.replace("day-", ""), 10);
                  handleMassAssignDay(d);
                }
                e.target.value = "";
              }}
              className="h-8 text-xs font-semibold bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer shadow-2xs"
              style={{ colorScheme: "dark light" }}
              title="Assign all results directly to a day or unassign all"
            >
              <option value="">📌 Assign to Day...</option>
              <option value="unassign">Unassign All</option>
              <optgroup label="Assign to Day">
                {dayIndices.map((i) => {
                  const title = dayTitles?.[i]?.trim();
                  return (
                    <option key={i} value={`day-${i}`}>
                      Day {i + 1}{title ? `: ${title}` : ""}
                    </option>
                  );
                })}
              </optgroup>
            </select>

            {/* Delete All */}
            <button
              type="button"
              onClick={handleMassDelete}
              className="h-8 px-2.5 rounded-lg font-semibold flex items-center gap-1.5 bg-white dark:bg-surface-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all cursor-pointer shadow-2xs ml-auto"
              title={`Remove all ${filteredPlaces.length} results from trip`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All</span>
            </button>
          </div>

          {/* Custom Day Range Inline Picker */}
          {showCustomRangePicker && (
            <div className="mt-2.5 pt-2.5 border-t border-primary-200/60 dark:border-primary-800/50 flex flex-wrap items-center gap-2 text-xs animate-in fade-in duration-150">
              <span className="font-semibold text-surface-700 dark:text-surface-300">Custom Day Range:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-surface-500">From</span>
                <select
                  value={customRangeStart}
                  onChange={(e) => setCustomRangeStart(parseInt(e.target.value, 10))}
                  className="h-7 text-xs bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded px-2 text-surface-800 dark:text-surface-200"
                >
                  {dayIndices.map((i) => (
                    <option key={i} value={i}>
                      Day {i + 1}{dayTitles?.[i]?.trim() ? `: ${dayTitles[i]}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-surface-500">To</span>
                <select
                  value={customRangeEnd}
                  onChange={(e) => setCustomRangeEnd(parseInt(e.target.value, 10))}
                  className="h-7 text-xs bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded px-2 text-surface-800 dark:text-surface-200"
                >
                  {dayIndices.map((i) => (
                    <option key={i} value={i}>
                      Day {i + 1}{dayTitles?.[i]?.trim() ? `: ${dayTitles[i]}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleApplyCustomRange}
                className="h-7 px-3 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-bold cursor-pointer transition-colors shadow-2xs"
              >
                Apply Range
              </button>
              <button
                type="button"
                onClick={() => setShowCustomRangePicker(false)}
                className="h-7 px-2.5 rounded-md bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-300 hover:bg-surface-300 dark:hover:bg-surface-600 font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {filteredPlaces.length === 0 ? (
        <div className="text-center py-8 px-4 bg-white dark:bg-surface-800 border border-dashed border-surface-300 dark:border-surface-600 rounded-xl">
          <p className="text-surface-500 dark:text-surface-400 text-sm">
            {searchQuery.trim()
              ? `No places matching "${searchQuery}". Try searching by a different name, dish/highlight, or keyword.`
              : duplicatesOnly
                ? "No duplicate places found."
                : starredOnly
                  ? "No starred must-visit places found. Click the star icon on any place card to star it."
                  : reservationOnly
                    ? "No places with reservation recommendations found."
                    : dayFilter !== "all"
                      ? `No places found for ${typeof dayFilter === "number" ? `Day ${dayFilter + 1}${dayTitles?.[dayFilter] ? `: ${dayTitles[dayFilter]}` : ""}` : "Unassigned"}.`
                      : activeTab === "disabled"
                        ? "No places are currently excluded. You can exclude any place using the toggle button on its card to keep it in reserve without routing it."
                        : activeTab === "unassigned"
                          ? "All active places are assigned to a day!"
                          : activeTab === "active"
                            ? "No active places found. Check the Excluded tab to re-enable saved places, or search above to add new ones."
                            : "No places match this filter."}
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortableItemIds}
            strategy={rectSortingStrategy}
          >
            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-[max-height] duration-300 ease-in-out ${isExpanded ? "" : "max-h-[360px] overflow-y-auto pr-2 custom-scrollbar overscroll-contain smooth-scroll-container"} print:max-h-none print:overflow-visible print:grid-cols-1`}
            >
              {filteredPlaces.map((place, index) => (
                <div key={place.id} className={`h-full ${index >= 6 ? "content-auto" : ""}`}>
                  <PlaceItem
                    place={place}
                    isDuplicate={duplicatePlaceIds.has(place.id)}
                    onEdit={(id) => setEditingPlaceId(id)}
                  />
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {filteredPlaces.length > 6 && (
        <button
          type="button"
          onClick={toggleExpanded}
          className="w-full mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-200 bg-surface-100 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 py-2.5 rounded-lg transition-colors cursor-pointer"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" /> Collapse Grid
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" /> Expand Grid to Show All {filteredPlaces.length}{" "}
              {duplicatesOnly
                ? "Duplicates"
                : starredOnly
                  ? "Starred Places"
                  : reservationOnly
                    ? "Reservation Places"
                    : searchQuery.trim()
                      ? "Search Results"
                      : "Places"}
            </>
          )}
        </button>
      )}

      {editingPlaceId && (
        <React.Suspense fallback={null}>
          <EditPlaceModal
            placeId={editingPlaceId}
            onClose={() => setEditingPlaceId(null)}
          />
        </React.Suspense>
      )}
    </div>
  );
});

