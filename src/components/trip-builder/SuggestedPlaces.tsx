import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouteStore } from "../../store/useRouteStore";
import { getSuggestedPlaces, getCachedSuggestions } from "../../services/recommendationService";
import { searchPlaces } from "../../services/mapsService";
import { Place } from "../../types";
import { getCategoryEmoji, getCategoryLabel, getActivePhotoUrl } from "../../utils/categoryUtils";
import {
  Sparkles,
  MapPin,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Search,
  Compass,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { PlaceHighlightBadge } from "../common/PlaceHighlightBadge";
import { ReservationBadge } from "../common/ReservationBadge";
import { toast } from "../../services/toastService";
import {
  getSpecificMockHighlight,
  getSpecificMockPrice,
  getSpecificMockReservation,
} from "../../utils/mockAiUtils";

// Popular curated quick-start destinations for exploring suggestions
const PRESET_DESTINATIONS = [
  { name: "New York, USA", lat: 40.7128, lng: -74.006 },
  { name: "Paris, France", lat: 48.8566, lng: 2.3522 },
  { name: "Tokyo, Japan", lat: 35.6762, lng: 139.6503 },
  { name: "London, UK", lat: 51.5074, lng: -0.1278 },
  { name: "Kyoto, Japan", lat: 35.0116, lng: 135.7681 },
  { name: "Rome, Italy", lat: 41.9028, lng: 12.4964 },
];

export const SuggestedPlaces: React.FC = React.memo(() => {
  const places = useRouteStore((s) => s.places);
  const hotels = useRouteStore((s) => s.hotels);
  const arrivalFlight = useRouteStore((s) => s.arrivalFlight);
  const departureFlight = useRouteStore((s) => s.departureFlight);
  const appMode = useRouteStore((s) => s.appMode);
  const addPlace = useRouteStore((s) => s.addPlace);
  const showImages = useRouteStore((s) => s.showImages);
  const distanceUnit = useRouteStore((s) => s.distanceUnit);

  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [dismissedNames, setDismissedNames] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Custom anchor state for on-demand exploration
  const [customAnchor, setCustomAnchor] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { name: string; address?: string; lat: number; lng: number }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if any context exists from the itinerary
  const hasTripContext = useMemo(() => {
    return (
      hotels.length > 0 ||
      places.length > 0 ||
      !!arrivalFlight?.location ||
      !!departureFlight?.location
    );
  }, [hotels.length, places.length, arrivalFlight?.location, departureFlight?.location]);

  const hasAnyAnchor = hasTripContext || !!customAnchor;

  // Check local cache on mount or when context changes (0 API calls!)
  useEffect(() => {
    if (!hasAnyAnchor) {
      setSuggestions([]);
      return;
    }

    const flights = [arrivalFlight?.location || null, departureFlight?.location || null];
    const cached = getCachedSuggestions(places, hotels, customAnchor, flights);
    if (cached && cached.length > 0) {
      setSuggestions(cached);
    }
  }, [
    places.length,
    hotels.length,
    arrivalFlight?.location?.id,
    departureFlight?.location?.id,
    customAnchor?.lat,
    customAnchor?.lng,
    hasAnyAnchor,
  ]);

  // Explicit user-triggered fetch function (NEVER run automatically in a background effect)
  const handleFetchSuggestions = useCallback(
    async (
      overrideAnchor?: { lat: number; lng: number; label: string },
      forceRefresh = false
    ) => {
      const anchorToUse = overrideAnchor !== undefined ? overrideAnchor : customAnchor;
      if (!hasTripContext && !anchorToUse) return;

      setLoading(true);
      try {
        const flights = [arrivalFlight?.location || null, departureFlight?.location || null];
        // When force refreshing, reject currently displayed suggestions so new ones are returned
        const currentNames = forceRefresh ? suggestions.map((s) => s.name) : [];
        const allRejected = Array.from(new Set([...dismissedNames, ...currentNames]));

        const fetched = await getSuggestedPlaces(
          places,
          hotels,
          appMode,
          allRejected,
          anchorToUse,
          flights,
          forceRefresh
        );
        if (fetched && fetched.length > 0) {
          setSuggestions(fetched);
          scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
          if (forceRefresh) {
            toast.success(`Found ${fetched.length} new suggested sights!`, "Suggestions Refreshed");
          }
        } else if (forceRefresh) {
          toast.info("No additional suggestions found for this area.", "Suggestions Refreshed");
        }
      } catch (err) {
        console.error("Failed to fetch suggestions on user request:", err);
        if (forceRefresh) {
          toast.error("Failed to refresh suggestions.", "Suggestions");
        }
      } finally {
        setLoading(false);
      }
    },
    [places, hotels, appMode, dismissedNames, customAnchor, arrivalFlight, departureFlight, hasTripContext, suggestions]
  );

  // Search logic for custom destination input
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (appMode !== "real") {
      const filtered = PRESET_DESTINATIONS.filter((d) =>
        d.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(filtered);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(searchQuery);
        setSearchResults(
          results.slice(0, 5).map((r) => ({
            name: r.name,
            address: r.address,
            lat: r.lat,
            lng: r.lng,
          }))
        );
      } catch (err) {
        console.warn("Place search for suggestions failed:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 450);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, appMode]);

  const handleSelectAnchor = (anchor: { lat: number; lng: number; label: string }) => {
    setCustomAnchor(anchor);
    setSearchQuery("");
    setSearchResults([]);
    setShowLocationSearch(false);
    // User explicitly chose a destination -> fetch suggestions for it
    handleFetchSuggestions(anchor);
  };

  const handleClearCustomAnchor = () => {
    setCustomAnchor(null);
    setSearchQuery("");
    setSearchResults([]);
    setShowLocationSearch(false);
    setSuggestions([]);
  };

  const handleDismiss = (e: React.MouseEvent, place: Place) => {
    e.stopPropagation();
    setSuggestions((prev) => prev.filter((p) => p.id !== place.id));
    setDismissedNames((prev) => [...prev, place.name]);
  };

  const handleAdd = (place: Place) => {
    setAddedIds((prev) => {
      const next = new Set(prev);
      next.add(place.id);
      return next;
    });

    setTimeout(() => {
      const { dayIndex, orderInDay, pinnedToDay, ...cleanPlace } = place;
      const enrichedPlace: Omit<Place, "dayIndex" | "orderInDay" | "pinnedToDay"> = {
        ...cleanPlace,
        id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        highlight: cleanPlace.highlight || getSpecificMockHighlight(cleanPlace),
        priceEstimate: cleanPlace.priceEstimate || getSpecificMockPrice(cleanPlace),
        reservation: cleanPlace.reservation || getSpecificMockReservation(cleanPlace),
        descriptionSource: cleanPlace.descriptionSource || (appMode === "real" ? "ai" : "mock"),
      };
      addPlace(enrichedPlace);

      setSuggestions((prev) => prev.filter((p) => p.id !== place.id));
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(place.id);
        return next;
      });
    }, 800);
  };

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  // State 1: Currently loading on user demand
  if (loading) {
    return (
      <div className="mt-8 border-t border-surface-100 dark:border-surface-700/50 pt-6">
        <div className="flex items-center gap-2 mb-4 animate-pulse">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <div className="h-6 w-48 bg-surface-200 dark:bg-surface-700 rounded-md"></div>
        </div>
        <div className="flex gap-4 overflow-hidden py-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="w-72 h-44 bg-surface-100 dark:bg-surface-800 border border-surface-200/50 dark:border-surface-700/50 rounded-xl flex-shrink-0 animate-pulse p-4 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="h-4 w-16 bg-surface-200 dark:bg-surface-700 rounded-full"></div>
                <div className="h-5 w-40 bg-surface-200 dark:bg-surface-700 rounded-md"></div>
                <div className="h-3 w-48 bg-surface-200 dark:bg-surface-700 rounded-md"></div>
              </div>
              <div className="h-9 w-24 bg-surface-200 dark:bg-surface-700 rounded-lg self-end"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // State 2: No suggestions loaded yet -> Render clean on-demand prompt
  // (NEVER makes automatic API calls)
  if (suggestions.length === 0) {
    return (
      <div className="mt-8 border-t border-surface-100 dark:border-surface-700/50 pt-6">
        <div className="bg-gradient-to-br from-purple-50/50 via-white to-surface-50 dark:from-purple-950/20 dark:via-surface-800 dark:to-surface-850 border border-purple-100 dark:border-purple-900/30 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                  Suggested Sights
                  <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200/50 dark:border-purple-800/40 px-2 py-0.5 rounded-full">
                    On Demand
                  </span>
                </h3>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  {hasTripContext
                    ? "Discover curated sights and top tourist attractions near your itinerary:"
                    : "Add a hotel or place above, or explore suggestions around any destination:"}
                </p>
              </div>
            </div>

            {/* If itinerary context exists, show explicit "Suggest Sights" action button */}
            {hasTripContext && (
              <button
                onClick={() => handleFetchSuggestions()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all shrink-0 self-start sm:self-auto active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                <span>Suggest Nearby Sights</span>
              </button>
            )}
          </div>

          {/* Optional Location Search Input */}
          <div className="relative max-w-md">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-surface-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Or search any city (e.g. Paris, Chicago, Kyoto)..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-surface-800 dark:text-surface-200 placeholder:text-surface-400"
              />
              {isSearching && (
                <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin absolute right-3" />
              )}
              {searchQuery && !isSearching && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Results */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-lg z-30 overflow-hidden divide-y divide-surface-100 dark:divide-surface-700/50">
                {searchResults.map((res, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      handleSelectAnchor({
                        lat: res.lat,
                        lng: res.lng,
                        label: res.name,
                      })
                    }
                    className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-purple-50 dark:hover:bg-purple-950/30 flex items-center gap-2 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <div className="truncate">
                      <span className="font-semibold text-surface-800 dark:text-surface-200">
                        {res.name}
                      </span>
                      {res.address && (
                        <span className="text-[11px] text-surface-400 ml-1.5 truncate">
                          {res.address}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Preset Pills */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-purple-100/60 dark:border-purple-900/20">
            <span className="text-[11px] font-medium text-surface-400">Popular:</span>
            {PRESET_DESTINATIONS.map((city) => (
              <button
                key={city.name}
                onClick={() =>
                  handleSelectAnchor({
                    lat: city.lat,
                    lng: city.lng,
                    label: city.name,
                  })
                }
                className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 bg-white dark:bg-surface-900 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/40 px-2.5 py-1 rounded-lg transition-all"
              >
                {city.name.split(",")[0]}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // State 3: Suggestions loaded and ready in carousel
  return (
    <div className="mt-8 border-t border-surface-100 dark:border-surface-700/50 pt-6 relative group/section">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-5 h-5 text-purple-500 animate-pulse" />
          <h3 className="text-sm font-black text-surface-900 dark:text-white uppercase tracking-wider">
            Suggested Sights
          </h3>

          {/* Anchor Context Tag */}
          {customAnchor ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100/70 dark:bg-purple-950/50 px-2.5 py-0.5 rounded-full">
              <MapPin className="w-3 h-3" />
              Near {customAnchor.label}
              <button
                onClick={handleClearCustomAnchor}
                className="hover:text-red-500 ml-0.5"
                title={hasTripContext ? "Reset to itinerary stay" : "Clear location"}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ) : (
            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 rounded-full uppercase tracking-tight">
              Near Your Itinerary
            </span>
          )}

          {/* Explicit Refresh Button */}
          <button
            onClick={() => handleFetchSuggestions(undefined, true)}
            disabled={loading}
            className="text-[11px] font-semibold text-surface-500 hover:text-purple-600 dark:text-surface-400 dark:hover:text-purple-300 flex items-center gap-1 transition-colors ml-1 disabled:opacity-50"
            title="Refresh suggestions with new places"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin text-purple-600 dark:text-purple-400" : ""}`} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>

          {/* Toggle Search Another Area */}
          <button
            onClick={() => setShowLocationSearch(!showLocationSearch)}
            className="text-[11px] font-semibold text-surface-500 hover:text-purple-600 dark:text-surface-400 dark:hover:text-purple-300 flex items-center gap-1 transition-colors ml-1"
          >
            <Search className="w-3 h-3" />
            {showLocationSearch ? "Close search" : "Explore other area"}
          </button>
        </div>

        {/* Carousel Scroll Buttons */}
        <div className="flex gap-1.5 opacity-0 group-hover/section:opacity-100 transition-opacity duration-300 self-end sm:self-auto">
          <button
            onClick={() => scroll("left")}
            className="p-1.5 rounded-full bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-primary-500 hover:text-primary-500 text-surface-400 shadow-sm transition-all"
            title="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="p-1.5 rounded-full bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-primary-500 hover:text-primary-500 text-surface-400 shadow-sm transition-all"
            title="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Explore Search Area */}
      {showLocationSearch && (
        <div className="mb-4 p-3 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl relative max-w-md">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search destination to suggest around..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-surface-800 dark:text-surface-200"
            />
            {isSearching && (
              <Loader2 className="w-3 h-3 text-purple-500 animate-spin absolute right-3" />
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-md divide-y divide-surface-100 dark:divide-surface-700/50 overflow-hidden">
              {searchResults.map((res, i) => (
                <button
                  key={i}
                  onClick={() =>
                    handleSelectAnchor({
                      lat: res.lat,
                      lng: res.lng,
                      label: res.name,
                    })
                  }
                  className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 dark:hover:bg-purple-950/30 flex items-center gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="font-semibold text-surface-800 dark:text-surface-200 truncate">
                    {res.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggested Carousel Container */}
      <div className="relative min-h-[160px] flex items-center justify-center">
        {loading && suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-surface-400">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            <span className="text-xs font-semibold text-surface-600 dark:text-surface-300">
              Discovering fresh sights for your itinerary...
            </span>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="w-full py-8 px-4 text-center border border-dashed border-surface-200 dark:border-surface-700 rounded-xl bg-surface-50/50 dark:bg-surface-800/30">
            <Compass className="w-7 h-7 text-purple-400 mx-auto mb-2 opacity-60" />
            <p className="text-xs font-semibold text-surface-600 dark:text-surface-300">
              No suggested sights loaded yet. Click Refresh to explore ideas!
            </p>
            <button
              onClick={() => handleFetchSuggestions(undefined, true)}
              disabled={loading}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Explore Suggestions
            </button>
          </div>
        ) : (
          <div className="w-full relative">
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-surface-800 to-transparent pointer-events-none z-10 opacity-60" />

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth py-2 pr-12 pl-2 -ml-2"
        >
          {suggestions.map((place) => {
            const isAdded = addedIds.has(place.id);
            const nearestHotel = (place as any).nearestHotel as
              | { name: string; distanceM: number }
              | undefined;
            const activePhotoUrl = getActivePhotoUrl(place.photoUrl);
            const hasImage = showImages && !!activePhotoUrl;

            let distanceStr = "";
            let hotelLabel = "";
            if (nearestHotel) {
              const d = nearestHotel.distanceM;
              if (distanceUnit === "imperial") {
                const ft = d * 3.28084;
                if (ft >= 100) {
                  const mi = ft / 5280;
                  distanceStr = `${mi < 0.1 ? mi.toFixed(2) : mi.toFixed(1)} mi`;
                } else {
                  distanceStr = `${Math.round(ft)} ft`;
                }
              } else {
                if (d >= 30) {
                  const km = d / 1000;
                  distanceStr = `${km < 0.1 ? km.toFixed(2) : km.toFixed(1)} km`;
                } else {
                  distanceStr = `${Math.round(d)} m`;
                }
              }
              hotelLabel = nearestHotel.name;
            }

            return (
              <div
                key={place.id}
                className={`w-72 md:w-80 flex-shrink-0 bg-white dark:bg-surface-800 border border-surface-200/60 dark:border-surface-700/50 rounded-xl flex flex-col justify-between shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-900/50 transition-all duration-300 relative overflow-hidden ${
                  isAdded
                    ? "scale-[0.98] border-emerald-400 dark:border-emerald-800/80 bg-emerald-50/10 dark:bg-emerald-950/10"
                    : ""
                }`}
              >
                <div className="absolute -top-12 -right-12 w-24 h-24 bg-purple-500/5 rounded-full blur-xl pointer-events-none" />

                <button
                  onClick={(e) => handleDismiss(e, place)}
                  className="absolute top-2 right-2 p-1.5 bg-white/80 dark:bg-surface-900/80 backdrop-blur-sm rounded-full text-surface-400 hover:text-red-500 dark:hover:text-red-400 shadow-sm z-20 transition-colors"
                  title="Dismiss suggestion"
                >
                  <X className="w-4 h-4" />
                </button>

                {hasImage && (
                  <div className="h-32 w-full relative shrink-0">
                    <img
                      src={activePhotoUrl!}
                      alt={place.name}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.parentElement!.style.display = "none";
                      }}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-surface-800 via-transparent to-transparent opacity-90" />
                  </div>
                )}

                <div className={`flex flex-col flex-grow ${hasImage ? "p-4 pt-1" : "p-4"}`}>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-surface-400 uppercase tracking-tight bg-surface-50 dark:bg-surface-900 border border-surface-200/50 dark:border-surface-700/50 px-2 py-0.5 rounded-full relative z-10">
                        <span>{getCategoryEmoji(place.category)}</span>
                        <span>{getCategoryLabel(place.category)}</span>
                      </span>
                      {place.priceEstimate && (
                        <span
                          className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border relative z-10 ${
                            place.priceEstimate.toLowerCase().includes("free")
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
                              : "bg-surface-50 dark:bg-surface-900 text-surface-600 dark:text-surface-400 border-surface-200/50 dark:border-surface-700/50"
                          }`}
                          title={`Estimated price: ${place.priceEstimate}`}
                        >
                          {place.priceEstimate}
                        </span>
                      )}
                    </div>
                    {distanceStr && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-semibold text-surface-400 relative z-10 max-w-[130px] truncate"
                        title={hotelLabel ? `${distanceStr} from ${hotelLabel}` : distanceStr}
                      >
                        <MapPin className="w-3 h-3 text-purple-400 shrink-0" />
                        <span className="truncate">
                          {distanceStr}
                          {hotelLabel && (
                            <span className="text-surface-300 dark:text-surface-600">
                              {" "}
                              · {hotelLabel}
                            </span>
                          )}
                        </span>
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-black text-surface-900 dark:text-white mb-1 leading-tight group-hover:text-purple-600 relative z-10">
                    {place.name}
                  </h4>
                  {place.address && (
                    <p
                      className="text-[10px] text-surface-400 dark:text-surface-500 mb-2 truncate relative z-10"
                      title={place.address}
                    >
                      {place.address}
                    </p>
                  )}
                  {place.description ? (
                    <div className="relative group/desc mb-2 z-20">
                      <p
                        className="text-[11px] text-surface-500 dark:text-surface-400 leading-relaxed line-clamp-2 cursor-help hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
                        title={place.description}
                      >
                        {place.description}
                      </p>
                      <div className="absolute -inset-x-2.5 -top-2.5 bottom-auto z-40 hidden group-hover/desc:block animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-3 rounded-xl bg-surface-900/95 dark:bg-surface-800/98 text-white shadow-2xl border border-surface-700/80 backdrop-blur-md">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">
                            <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                            <span>About this sight</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-surface-100 select-text font-normal">
                            {place.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Reservation Requirement Badge */}
                  {place.reservation && (
                    <div className="mb-2 relative z-10">
                      <ReservationBadge reservation={place.reservation} compact />
                    </div>
                  )}

                  {/* Contextual Highlight (Must-Try, Photo Spot, etc.) */}
                  {place.highlight && place.highlight.text && (
                    <div className="mb-2 relative z-10">
                      <PlaceHighlightBadge
                        highlight={place.highlight}
                        category={place.category}
                        compact
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 pt-0 z-10">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      place.name + " " + place.address
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:underline transition-colors"
                    title="View on Google Maps"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View on Google
                  </a>
                  <button
                    onClick={() => handleAdd(place)}
                    disabled={isAdded}
                    className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm ${
                      isAdded
                        ? "bg-emerald-500 text-white shadow-emerald-200 dark:shadow-none pointer-events-none scale-95"
                        : "bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:hover:bg-purple-900/40 dark:text-purple-400 border border-purple-200/40 dark:border-purple-900/30 hover:scale-105 active:scale-95"
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        Added
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        Add to Trip
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-surface-800 to-transparent pointer-events-none z-10 opacity-60" />
          </div>
        )}
      </div>
    </div>
  );
});
