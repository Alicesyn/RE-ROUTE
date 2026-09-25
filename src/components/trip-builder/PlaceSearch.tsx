import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Loader2,
  AlertCircle,
  FileText,
  Clock,
  Check,
  Coins,
} from "lucide-react";
import { useRouteStore } from "../../store/useRouteStore";
import { MOCK_PLACES } from "../../services/mockData";
import { searchPlaces, fetchFreshPhoto } from "../../services/mapsService";
import { motion, AnimatePresence } from "framer-motion";
import {
  getCategoryEmoji,
  getCategoryLabel,
  autoCategorize,
  getDefaultDuration,
} from "../../utils/categoryUtils";
import { toast } from "../../services/toastService";
import { deriveAreaOpeningHours, isAreaPlace } from "../../utils/areaOpeningHoursUtils";
const ImportModal = React.lazy(() =>
  import("./ImportModal").then((m) => ({ default: m.ImportModal }))
);
import { MissingPlacesList } from "./MissingPlacesList";
import { isDuplicatePlace } from "../../utils/duplicateUtils";

export const PlaceSearch: React.FC = () => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay] = useState<number | null>(null);
  const { addPlace, updatePlace, appMode, places, hotels } = useRouteStore();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (appMode !== "real") {
      if (query.length > 0) {
        setResults(
          MOCK_PLACES.filter((p) =>
            p.name.toLowerCase().includes(query.toLowerCase()),
          ),
        );
        setIsOpen(true);
      } else {
        setResults([]);
        setIsOpen(false);
      }
      return;
    }

    // Real mode with debounce
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        // Calculate location bias from existing anchors
        const anchors = [...places, ...hotels];
        let biasLocation: { lat: number; lng: number } | undefined = undefined;
        if (anchors.length > 0) {
          const lats = anchors.map((l) => l.lat).sort((a, b) => a - b);
          const lngs = anchors.map((l) => l.lng).sort((a, b) => a - b);
          biasLocation = {
            lat: lats[Math.floor(lats.length / 2)],
            lng: lngs[Math.floor(lngs.length / 2)],
          };
        }

        const mapsResults = await searchPlaces(query, biasLocation);
        setResults(mapsResults);
        setIsOpen(true);
      } catch (err) {
        setError("Failed to search locations. Check your API key.");
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query, appMode]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const findExistingPlace = (candidate: any) => {
    if (!candidate) return undefined;
    return places.find((p) => {
      if (p.id && candidate.id && p.id === candidate.id) return true;
      if (p.googlePlaceId && candidate.id && p.googlePlaceId === candidate.id) return true;
      if (candidate.googlePlaceId && p.googlePlaceId && candidate.googlePlaceId === p.googlePlaceId) return true;

      return isDuplicatePlace(p, {
        ...candidate,
        googlePlaceId: candidate.googlePlaceId || candidate.id,
      });
    });
  };

  const handleAdd = (place: any) => {
    const existing = findExistingPlace(place);
    if (existing) {
      const confirmAdd = window.confirm(
        `"${place.name}" is already in your Places To Visit (${existing.isDisabled
          ? "Excluded"
          : existing.dayIndex !== null
            ? `Day ${existing.dayIndex + 1}`
            : "Unassigned"
        }).\n\nDo you want to add a duplicate copy?`
      );
      if (!confirmAdd) return;
      toast.warning(`Added duplicate copy of "${place.name}".`, "Duplicate Added");
    }

    // For real places, we initialize them with limited data; Gemini will fill the rest
    const category =
      place.category || autoCategorize(place.name, place.description || "", place.types || []);
    const estimatedDuration =
      place.estimatedDuration || getDefaultDuration(category);

    const isArea = isAreaPlace({
      category,
      openingHours: place.openingHours,
      types: place.types || [],
    });

    const newId = `p_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPlace = {
      ...place,
      id: newId,
      googlePlaceId: place.id,
      photoReference: place.photoReference || undefined,
      category,
      estimatedDuration,
      description: place.description || "",
      descriptionSource: (place.description && place.description.trim()) ? "user" : (appMode === "real" ? "ai" : "mock"),
      openingHours: place.openingHours || [],
      priceEstimate: place.priceEstimate || undefined,
      types: place.types || [],
      isArea: isArea || undefined,
    };
    addPlace(newPlace, selectedDay !== null ? selectedDay : undefined);

    // Eagerly resolve photo for instant display in real mode
    if (appMode === "real" && (place.photoReference || place.id)) {
      fetchFreshPhoto({
        id: newId,
        googlePlaceId: place.id,
        photoReference: place.photoReference,
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
      }).then((freshUrl) => {
        if (freshUrl) {
          updatePlace(newId, { photoUrl: freshUrl });
        }
      }).catch((e) => console.warn("Failed to eagerly fetch fresh photo:", e));
    }

    // RC3: Background area opening hours enrichment
    // If this is a shopping/restaurant neighborhood/district with no openingHours
    // (e.g. Shimokitazawa, Shinjuku Vintage area), derive hours from nearby shops.
    if (isArea) {
      deriveAreaOpeningHours({ ...newPlace, types: place.types || [] }, appMode)
        .then((result) => {
          if (result) {
            const current = useRouteStore.getState().places.find((p) => p.id === newId);
            const currentDesc = current?.description || newPlace.description || "";
            const hasDesc = currentDesc.trim().length > 0;
            const updatedDesc = hasDesc
              ? (currentDesc.includes(result.areaNote) ? currentDesc : `${currentDesc}\n\n${result.areaNote}`)
              : result.areaNote;

            updatePlace(newId, {
              openingHours: result.hours,
              areaNote: result.areaNote,
              isArea: true,
              description: updatedDesc,
            });
          }
        })
        .catch(() => { /* Silently ignore — area lookup is best-effort */ });
    }

    setQuery("");
    setIsOpen(false);
  };

  if (appMode === "dropdown-mock") {
    return (
      <div className="relative mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              onChange={(e) => {
                const place = MOCK_PLACES[parseInt(e.target.value)];
                if (place) handleAdd(place);
                e.target.value = "";
              }}
              className="w-full bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white rounded-xl py-3 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none shadow-sm font-medium"
              defaultValue=""
            >
              <option value="" disabled>
                Select a place to add...
              </option>
              {MOCK_PLACES.map((p, i) => {
                const existing = findExistingPlace(p);
                const status = existing
                  ? existing.isDisabled
                    ? " [Added • Excluded]"
                    : existing.dayIndex !== null
                      ? ` [Added • Day ${existing.dayIndex + 1}]`
                      : " [Added]"
                  : "";
                return (
                  <option key={i} value={i}>
                    {getCategoryEmoji(p.category)} {p.name} ({p.estimatedDuration}{" "}
                    min){status}
                  </option>
                );
              })}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <Plus className="w-5 h-5 text-surface-400" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mb-6">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="text-primary-500 w-5 h-5 animate-spin" />
            ) : (
              <Search className="text-surface-400 w-5 h-5" />
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={handleSearch}
            placeholder={
              appMode === "real"
                ? "Search real places with Google..."
                : "Search for a place to add..."
            }
            className="input-base rounded-xl py-3 pl-12 pr-4"
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center justify-center gap-1.5 px-2 py-1 text-[10px] font-bold text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 border border-surface-200 dark:border-surface-700 rounded-lg hover:border-primary-500/50 transition-all"
          >
            <FileText className="w-3 h-3" />
            Import List
          </button>
        </div>
      </div>

      {isImportOpen && (
        <React.Suspense fallback={null}>
          <ImportModal
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
          />
        </React.Suspense>
      )}
      <MissingPlacesList />

      {error && (
        <div className="mt-2 flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-900/30">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-800 rounded-xl shadow-lg border border-surface-100 dark:border-surface-700 overflow-hidden z-20 max-h-96 overflow-y-auto custom-scrollbar"
          >
            {results.map((place) => {
              const existing = findExistingPlace(place);
              const isAdded = !!existing;

              return (
                <button
                  key={place.id}
                  onClick={() => handleAdd(place)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-700 flex items-center justify-between group transition-colors border-b border-surface-50 dark:border-surface-700 last:border-0 ${isAdded ? "bg-emerald-50/30 dark:bg-emerald-950/15" : ""
                    }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="text-lg shrink-0"
                      title={getCategoryLabel(place.category || "other")}
                    >
                      {getCategoryEmoji(place.category || "other")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-surface-900 dark:text-white truncate">
                          {place.name}
                        </h4>
                        {isAdded && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${existing.isDisabled
                              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
                              : existing.dayIndex !== null
                                ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-800"
                                : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                              }`}
                          >
                            <Check className="w-2.5 h-2.5" />
                            {existing.isDisabled
                              ? "Added (Excluded)"
                              : existing.dayIndex !== null
                                ? `Added (Day ${existing.dayIndex + 1})`
                                : "Added"}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-surface-500 dark:text-surface-400 truncate mt-0.5">
                        {place.address}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {place.priceEstimate && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${place.priceEstimate.toLowerCase().includes("free")
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                              : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-600"
                              }`}
                          >
                            <Coins className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                            {place.priceEstimate}
                          </span>
                        )}
                        {place.openingHours && place.openingHours.length > 0 && (
                          <div
                            className="inline-flex items-center gap-1 text-[10px] text-surface-400 dark:text-surface-500 cursor-help"
                            title={place.openingHours.join("\n")}
                            onClick={(e) => e.stopPropagation()} // Prevent adding if they just want to hover, though hover works regardless
                          >
                            <Clock className="w-3 h-3" />
                            <span>View Hours</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {selectedDay !== null && (
                      <span className="text-[10px] font-bold text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded-full">
                        D{selectedDay + 1}
                      </span>
                    )}
                    {isAdded ? (
                      <div
                        className="bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 p-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center gap-1"
                        title="Already added to your list. Click to add again."
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">In List</span>
                      </div>
                    ) : (
                      <div className="bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
