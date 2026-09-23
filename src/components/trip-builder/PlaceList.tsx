import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
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
import { PlaceFilterTabs, FilterTab } from "./PlaceFilterTabs";
import { DuplicatePlacesBanner } from "./DuplicatePlacesBanner";
import { PlaceListToolbar, SortOption } from "./PlaceListToolbar";
import { PlaceMassEditBar } from "./PlaceMassEditBar";
import { PlaceListEmptyState } from "./PlaceListEmptyState";
import { useRouteStore } from "../../store/useRouteStore";
import { Place, PlaceCategory, DayRangeConstraint, TimeRangeConstraint } from "../../types";
import { findDuplicatePlaceIds, getDuplicatePlaceIdsToRemove } from "../../utils/duplicateUtils";
import { formatMultiRangeBadge } from "../../utils/dayRangeUtils";
import { toast } from "../../services/toastService";
import { isAreaPlace } from "../../utils/areaOpeningHoursUtils";

const EditPlaceModal = React.lazy(() =>
  import("../schedule/EditPlaceModal").then((m) => ({ default: m.EditPlaceModal }))
);
const ReservationsModal = React.lazy(() =>
  import("../schedule/ReservationsModal").then((m) => ({ default: m.ReservationsModal }))
);

interface PlaceListProps {
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

const getReservationRank = (p: Place): number => {
  const req = p.reservation?.requirement;
  if (req === "required") return 3;
  if (req === "recommended") return 2;
  if (req === "walk_ins_only") return 1;
  return 0;
};

export const PlaceList: React.FC<PlaceListProps> = React.memo(
  ({ isExpanded: controlledIsExpanded, onToggleExpanded }) => {
    const places = useRouteStore((s) => s.places);
    const reorderPlaces = useRouteStore((s) => s.reorderPlaces);
    const removePlace = useRouteStore((s) => s.removePlace);
    const updatePlacesBulk = useRouteStore((s) => s.updatePlacesBulk);
    const setAllPlacesDisabled = useRouteStore((s) => s.setAllPlacesDisabled);
    const days = useRouteStore((s) => s.days);
    const dayTitles = useRouteStore((s) => s.dayTitles);
    const startDate = useRouteStore((s) => s.startDate);

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
    const [isReservationsOpen, setIsReservationsOpen] = useState(false);

    // Mass Edit State
    const [isMassEditOpen, setIsMassEditOpen] = useState(false);

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
      })
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
          const isNameMatch = matchField(p.name) || matchField(p.romanizedName);
          const isHighlightMatch =
            matchField(p.highlight?.text) || matchField(p.highlight?.label);
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
          p.reservation?.requirement === "required"
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
            p.reservation?.requirement === "required"
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

        if (sortBy === "date-newest") {
          const aTime = a.addedAt ?? 0;
          const bTime = b.addedAt ?? 0;
          if (aTime !== bTime) return bTime - aTime;
          return places.indexOf(b) - places.indexOf(a);
        } else if (sortBy === "date-oldest") {
          const aTime = a.addedAt ?? 0;
          const bTime = b.addedAt ?? 0;
          if (aTime !== bTime) return aTime - bTime;
          return places.indexOf(a) - places.indexOf(b);
        } else if (sortBy === "starred") {
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
        } else if (sortBy === "area-places") {
          const isAreaA = isAreaPlace(a) ? 1 : 0;
          const isAreaB = isAreaPlace(b) ? 1 : 0;
          const diff = isAreaB - isAreaA;
          if (diff !== 0) return diff;
          return places.indexOf(a) - places.indexOf(b);
        }
        return 0;
      });

      return sorted;
    }, [
      baseFilteredPlaces,
      activeTab,
      dayFilter,
      starredOnly,
      reservationOnly,
      duplicatesOnly,
      duplicatePlaceIds,
      sortBy,
      places,
      searchQuery,
    ]);

    const sortableItemIds = useMemo(
      () => filteredPlaces.map((p) => p.id),
      [filteredPlaces]
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

    const handleApplyDayRestriction = (ranges: DayRangeConstraint[] | null) => {
      if (filteredPlaces.length === 0) return;

      const updates = filteredPlaces.map((p) => {
        const isOutOfRange =
          ranges &&
          ranges.length > 0 &&
          p.dayIndex !== null &&
          p.dayIndex !== undefined &&
          !ranges.some((r) => p.dayIndex! >= r.startDay && p.dayIndex! <= r.endDay);

        return {
          id: p.id,
          updates: {
            allowedDayRanges: ranges && ranges.length > 0 ? ranges.map((r) => ({ ...r })) : undefined,
            ...(isOutOfRange ? { dayIndex: null, orderInDay: null, pinnedToDay: false } : {}),
          },
        };
      });

      updatePlacesBulk(updates);

      if (ranges && ranges.length > 0) {
        const badge = formatMultiRangeBadge(ranges, startDate, dayTitles);
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

    const handleApplyTimeRestriction = (range: TimeRangeConstraint | null) => {
      if (filteredPlaces.length === 0) return;

      const updates = filteredPlaces.map((p) => ({
        id: p.id,
        updates: {
          allowedTimeRange: range ?? undefined,
        },
      }));

      updatePlacesBulk(updates);

      if (range) {
        const formatTime = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          const ampm = h >= 12 ? "PM" : "AM";
          const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
          return m === 0 ? `${h12} ${ampm}` : `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
        };
        toast.success(
          `Restricted ${filteredPlaces.length} place(s) to ${formatTime(range.startTime)} – ${formatTime(range.endTime)}.`,
          "Time Restriction Applied"
        );
      } else {
        toast.info(
          `Cleared time restrictions for ${filteredPlaces.length} place(s).`,
          "Time Restrictions Cleared"
        );
      }
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
          `Assigned ${filteredPlaces.length} place(s) to Day ${targetDay + 1}${
            dayTitle ? `: ${dayTitle}` : ""
          }.`,
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

    const showMassEditBar = isMassEditOpen && filteredPlaces.length > 0;

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
        {/* Status / Category Tabs & Excluded Banner */}
        <PlaceFilterTabs
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          activeCount={activeCount}
          unassignedCount={unassignedCount}
          disabledCount={disabledCount}
          allCount={allCount}
          onReenableAll={() =>
            setAllPlacesDisabled(false, filteredPlaces.map((p) => p.id))
          }
        />

        {/* Duplicate Places Warning Banner */}
        <DuplicatePlacesBanner
          duplicateCount={duplicatePlaceIds.size}
          duplicatesOnly={duplicatesOnly}
          onToggleDuplicatesOnly={() => {
            setDuplicatesOnly((prev) => {
              const next = !prev;
              if (next) {
                setActiveTab("all");
              }
              return next;
            });
          }}
          onRemoveDuplicates={handleRemoveDuplicates}
        />

        {/* Search, Filters, and Sort Toolbar */}
        <PlaceListToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          dayFilter={dayFilter}
          onDayFilterChange={setDayFilter}
          days={days}
          dayTitles={dayTitles}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          starredOnly={starredOnly}
          onToggleStarredOnly={() => setStarredOnly((prev) => !prev)}
          starredCount={starredCount}
          reservationOnly={reservationOnly}
          onToggleReservationOnly={() => setReservationOnly((prev) => !prev)}
          recPlacesCount={recPlacesCount}
          isMassEditOpen={isMassEditOpen}
          onToggleMassEdit={() => setIsMassEditOpen((prev) => !prev)}
          filteredPlacesCount={filteredPlaces.length}
          duplicatesOnly={duplicatesOnly}
          onOpenReservationsHub={() => setIsReservationsOpen(true)}
          onResetFilters={() => {
            setSortBy("default");
            setReservationOnly(false);
            setStarredOnly(false);
            setDuplicatesOnly(false);
            setDayFilter("all");
          }}
        />

        {/* Mass Edit Action Banner */}
        <PlaceMassEditBar
          showMassEditBar={showMassEditBar}
          filteredPlacesCount={filteredPlaces.length}
          searchQuery={searchQuery}
          days={days}
          dayTitles={dayTitles}
          startDate={startDate}
          allFilteredStarred={allFilteredStarred}
          onMassStar={handleMassStar}
          allFilteredDisabled={allFilteredDisabled}
          onMassDisabled={handleMassDisabled}
          onApplyDayRestriction={handleApplyDayRestriction}
          onApplyTimeRestriction={handleApplyTimeRestriction}
          onMassAssignDay={handleMassAssignDay}
          onMassDelete={handleMassDelete}
          onClose={() => setIsMassEditOpen(false)}
        />

        {/* Place Grid or Context-Sensitive Empty State */}
        {filteredPlaces.length === 0 ? (
          <PlaceListEmptyState
            searchQuery={searchQuery}
            duplicatesOnly={duplicatesOnly}
            starredOnly={starredOnly}
            reservationOnly={reservationOnly}
            dayFilter={dayFilter}
            dayTitles={dayTitles}
            activeTab={activeTab}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableItemIds} strategy={rectSortingStrategy}>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-[max-height] duration-300 ease-in-out ${
                  isExpanded
                    ? ""
                    : "max-h-[360px] overflow-y-auto pr-2 custom-scrollbar overscroll-contain smooth-scroll-container"
                } print:max-h-none print:overflow-visible print:grid-cols-1`}
              >
                {filteredPlaces.map((place, index) => (
                  <div
                    key={place.id}
                    className={`h-full ${index >= 6 ? "content-auto" : ""}`}
                  >
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

        {/* Expand / Collapse Button */}
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
                <ChevronDown className="w-4 h-4" /> Expand Grid to Show All{" "}
                {filteredPlaces.length}{" "}
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

        {/* Edit Place Modal */}
        {editingPlaceId && (
          <React.Suspense fallback={null}>
            <EditPlaceModal
              placeId={editingPlaceId}
              onClose={() => setEditingPlaceId(null)}
            />
          </React.Suspense>
        )}

        {/* Reservations & Booking Hub Modal */}
        {isReservationsOpen && (
          <React.Suspense fallback={null}>
            <ReservationsModal
              isOpen={isReservationsOpen}
              onClose={() => setIsReservationsOpen(false)}
            />
          </React.Suspense>
        )}
      </div>
    );
  }
);

PlaceList.displayName = "PlaceList";
