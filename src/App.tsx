import React, { useState, useEffect, useRef, useMemo } from "react";
import { Header } from "./components/layout/Header";
import { PlaceSearch } from "./components/trip-builder/PlaceSearch";
import { PlaceList } from "./components/trip-builder/PlaceList";
import { SuggestedPlaces } from "./components/trip-builder/SuggestedPlaces";
import { TripSettings } from "./components/trip-builder/TripSettings";
import { DailySchedule } from "./components/schedule/DailySchedule";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { ToastContainer } from "./components/layout/ToastContainer";
import { toast } from "./services/toastService";
import { useRouteStore } from "./store/useRouteStore";
import { solveTSP } from "./services/tspSolver";
import { clearMapsCache, fetchFreshPhoto } from "./services/mapsService";
import { analyticsService } from "./services/analyticsService";
import { Wand2, Sparkles, RefreshCw, Loader2, MapPin, RotateCcw, Trash2, Lock, X } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";

const MapView = React.lazy(() =>
  import("./components/map/MapView").then((m) => ({ default: m.MapView }))
);
const ResetTripModal = React.lazy(() =>
  import("./components/layout/ResetTripModal").then((m) => ({ default: m.ResetTripModal }))
);
import { summarizePlacesBatch, romanizePlaceNames, generateHighlightsBatch } from "./services/aiService";
import { hasNonLatinScript } from "./utils/textUtils";
import type { DayRoute, Place } from "./types";
import { isLocalDev } from "./utils/envUtils";
import { getCategoryLabel } from "./utils/categoryUtils";
import {
  getSpecificMockHighlight,
  getSpecificMockPrice,
  getSpecificMockDescription,
  getSpecificMockReservation,
} from "./utils/mockAiUtils";

function App() {
  const {
    places,
    hotels,
    days,
    travelMode,
    strictBudget,
    avoidClosedHours,
    optimizedRoutes,
    setOptimizedRoutes,
    unassignAll,
    clearOptimizedSchedule,
    appMode,
    updatePlacesBulk,
    theme,
    showFlights,
    arrivalFlight,
    departureFlight,
    startDate,
    dayStartTime,
    dayEndTime,
    categoryConfigs,
    exemptDays,
    toggleDayExemption,
    setExemptDays,
    dayTitles,
    filteredPlaceIds,
    hasActiveFilter,
    activeFilterCategory,
    activeFilterDescription,
  } = useRouteStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showMobileMap, setShowMobileMap] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [showExemptPopover, setShowExemptPopover] = useState(false);

  // Apply dark mode
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const upgradedPhotoPlaceIdsRef = useRef<Set<string>>(new Set());

  // Auto-upgrade any legacy or missing photo URLs to fresh direct Google CDN URLs
  useEffect(() => {
    if (appMode !== "real" || places.length === 0) return;

    const placesNeedingPhotos = places.filter(
      (p) =>
        (!p.photoUrl || p.photoUrl.includes("places.googleapis.com")) &&
        !upgradedPhotoPlaceIdsRef.current.has(p.id)
    );
    if (placesNeedingPhotos.length === 0) return;

    placesNeedingPhotos.forEach((p) => upgradedPhotoPlaceIdsRef.current.add(p.id));

    const upgradeLegacyPhotos = async () => {
      const updates: { id: string; updates: { photoUrl?: string } }[] = [];
      await Promise.all(
        placesNeedingPhotos.map(async (p) => {
          try {
            const freshPhotoUri = await fetchFreshPhoto(p);
            if (freshPhotoUri) {
              updates.push({ id: p.id, updates: { photoUrl: freshPhotoUri } });
            }
          } catch (e) {
            console.warn(`[Auto-Upgrade Photo] Failed for ${p.name}:`, e);
          }
        })
      );

      if (updates.length > 0) {
        updatePlacesBulk(updates);
      }
    };

    upgradeLegacyPhotos();
  }, [places.length, appMode]);

  // Auto-romanize foreign place names that contain non-Latin characters (Japanese, Chinese, Thai, etc.)
  useEffect(() => {
    if (appMode !== "real" || places.length === 0) return;
    const foreignUnromanized = places.filter(
      (p) => hasNonLatinScript(p.name) && !p.romanizedName
    );
    if (foreignUnromanized.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        const results = await romanizePlaceNames(
          foreignUnromanized.map((p) => ({ id: p.id, name: p.name, address: p.address }))
        );
        if (results && results.length > 0) {
          const updates = results
            .filter((r) => r.romanizedName)
            .map((r) => ({ id: r.id, updates: { romanizedName: r.romanizedName! } }));
          if (updates.length > 0) {
            updatePlacesBulk(updates);
          }
        }
      } catch (e) {
        console.warn("[Auto-Romanize] Failed to romanize place names:", e);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [places, appMode, updatePlacesBulk]);

  const handleOptimize = async () => {
    const activePlaces = places.filter((p) => !p.isDisabled);
    if (activePlaces.length === 0 || isOptimizing) return;

    if (exemptDays.length >= days) {
      toast.warning(
        "All days are currently exempt from optimization. Uncheck at least one day in Exempt Days to optimize.",
        "All Days Exempt",
      );
      return;
    }

    setIsOptimizing(true);
    try {
      const [startH, startM] = dayStartTime.split(":").map(Number);
      const [endH, endM] = dayEndTime.split(":").map(Number);
      let baseDayMinutes = endH * 60 + endM - (startH * 60 + startM);
      if (baseDayMinutes < 0) baseDayMinutes += 24 * 60; // Handle overnight

      const dayBudgets = Array.from({ length: days }).map((_, i) => {
        let dayAvailableMinutes = baseDayMinutes;
        const isFirstDay = i === 0;
        const isLastDay = i === days - 1;

        if (showFlights) {
          if (isFirstDay && arrivalFlight) {
            const [arrH, arrM] = arrivalFlight.time.split(":").map(Number);
            const arrivalTotal = arrH * 60 + arrM;
            const dayStartTotal = startH * 60 + startM;
            const effectiveStart = Math.max(dayStartTotal, arrivalTotal);

            let available = endH * 60 + endM - effectiveStart;
            if (available < 0) available += 24 * 60;
            dayAvailableMinutes = available;
          }
          if (isLastDay && departureFlight) {
            const [depH, depM] = departureFlight.time.split(":").map(Number);
            const depTotal = depH * 60 + depM;
            const rawDayEnd = endH * 60 + endM;
            const dayEndTotal = rawDayEnd === 0 ? 24 * 60 : rawDayEnd;
            const effectiveEnd = Math.min(dayEndTotal, depTotal);

            let available = effectiveEnd - (startH * 60 + startM);
            if (available < 0) available += 24 * 60;
            dayAvailableMinutes = available;
          }
        }
        return dayAvailableMinutes;
      });

      const { categoryConfigs: latestConfigs, customTransitTimes } = useRouteStore.getState();

      const result = await solveTSP(
        activePlaces,
        hotels,
        days,
        travelMode,
        dayBudgets,
        strictBudget,
        showFlights ? arrivalFlight?.location : null,
        showFlights ? departureFlight?.location : null,
        latestConfigs || categoryConfigs,
        startDate,
        dayStartTime,
        avoidClosedHours,
        showFlights ? arrivalFlight : null,
        showFlights ? departureFlight : null,
        dayEndTime,
        exemptDays,
        optimizedRoutes,
        customTransitTimes,
      );

      if (result.success) {
        setOptimizedRoutes(result.days);

        // Track optimization and planned destinations telemetry
        analyticsService.trackRouteOptimized(activePlaces.length, days);
        const uniqueCities = new Set<string>();
        activePlaces.forEach((p) => {
          if (p.address) {
            const parts = p.address.split(",");
            const city = parts[parts.length - 2]?.trim() || parts[0]?.trim();
            if (city && city.length > 2) uniqueCities.add(city);
          }
        });
        uniqueCities.forEach((city) => analyticsService.trackDestination(city));

        // Update places with their optimizer-assigned days and order (skip exempt days)
        const placeUpdates: {
          id: string;
          updates: Partial<(typeof places)[0]>;
        }[] = [];
        result.days.forEach((dayRoute: DayRoute) => {
          if (exemptDays.includes(dayRoute.day)) {
            return;
          }
          dayRoute.stops.forEach((stop: Place, idx: number) => {
            const originalPlace = places.find((p) => p.id === stop.id);
            if (originalPlace) {
              placeUpdates.push({
                id: stop.id,
                updates: {
                  dayIndex: dayRoute.day,
                  orderInDay: idx,
                  pinnedToDay: originalPlace.pinnedToDay,
                },
              });
            }
          });
        });

        if (result.unassignedPlaces) {
          result.unassignedPlaces.forEach((unassigned: Place) => {
            placeUpdates.push({
              id: unassigned.id,
              updates: {
                dayIndex: null,
                orderInDay: null,
                unfeasibleReason: unassigned.unfeasibleReason,
              },
            });
          });
        }

        if (placeUpdates.length > 0) {
          updatePlacesBulk(placeUpdates);
        }

        const exemptMsg =
          exemptDays.length > 0
            ? ` (${exemptDays.length} ${exemptDays.length === 1 ? "day" : "days"} exempt)`
            : "";

        if (result.unassignedPlaces && result.unassignedPlaces.length > 0) {
          toast.warning(
            `${result.unassignedPlaces.length} of ${activePlaces.length} places could not fit within the daily time budget${exemptMsg}.`,
            "Schedule Over Capacity",
          );
        } else {
          toast.success(
            `Optimized ${activePlaces.length} places across ${days - exemptDays.length} days${exemptMsg}!`,
            "Route Optimized",
          );
        }
      } else {
        toast.error(
          "Could not optimize routes. Try adjusting day times or budgets.",
          "Optimization Failed",
        );
      }
    } catch (err: any) {
      console.error("Optimization error:", err);
      toast.error(
        err?.message || "An unexpected error occurred during optimization.",
        "Optimization Error",
      );
    } finally {
      setIsOptimizing(false);
    }
  };


  const abortControllerRef = useRef<AbortController | null>(null);

  const handleGenerateDescriptions = async () => {
    if (isGenerating) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsGenerating(false);
      return;
    }

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    // Find places that need real AI descriptions
    const placesToUpdate = places.filter(
      (p) => !p.description || p.description.trim() === ""
    );

    if (placesToUpdate.length === 0) {
      setIsGenerating(false);
      return;
    }

    console.log(`[AI Describe] Starting generation for ${placesToUpdate.length} places...`);

    try {
      const updates: { id: string; updates: any }[] = [];

      // Process sequentially for mock, but batch for real API
      if (appMode === "real") {
        try {
          console.log(`[AI Describe] Preparing batch request for Gemini API...`);
          const batchPlaces = placesToUpdate.map(p => ({
            id: p.id,
            name: p.name,
            address: p.address,
            types: (p as any).types || []
          }));

          console.log(`[AI Describe] Sending request to Gemini... Please wait.`);
          const aiDataArray = await summarizePlacesBatch(batchPlaces, 3, abortControllerRef.current.signal);
          console.log(`[AI Describe] Received response from Gemini! Formatting updates...`);

          for (const p of placesToUpdate) {
            const aiData = aiDataArray.find((d) => d.id === p.id);
            if (aiData) {
              updates.push({
                id: p.id,
                updates: {
                  description: aiData.description,
                  category: aiData.category,
                  estimatedDuration: aiData.estimatedDuration,
                  descriptionSource: "ai" as const,
                  ...(aiData.romanizedName ? { romanizedName: aiData.romanizedName } : {}),
                  ...(aiData.highlight ? { highlight: aiData.highlight } : {}),
                  ...(aiData.priceEstimate ? { priceEstimate: aiData.priceEstimate } : {}),
                  ...(aiData.reservation
                    ? {
                        reservation: {
                          ...p.reservation,
                          ...aiData.reservation,
                          isBooked: p.reservation?.isBooked,
                          bookingUrl: p.reservation?.bookingUrl,
                          confirmationNumber: p.reservation?.confirmationNumber,
                          whosInterested: p.reservation?.whosInterested,
                        },
                      }
                    : {}),
                },
              });
            } else if (p.editorialSummary) {
              // Fallback to Google Maps editorial summary if AI missed this place
              updates.push({
                id: p.id,
                updates: {
                  description: p.editorialSummary,
                  descriptionSource: "ai" as const,
                },
              });
            }
          }
        } catch (e: any) {
          if (e.name === 'AbortError') {
            console.log("AI description generation was aborted by the user.");
            return;
          }
          console.error("Batch processing failed", e);
          // Fallback everything to editorial summary if the batch call failed
          for (const p of placesToUpdate) {
            if (p.editorialSummary) {
              updates.push({
                id: p.id,
                updates: {
                  description: p.editorialSummary,
                  descriptionSource: "ai" as const,
                },
              });
            }
          }
        }
      } else {
        for (const p of placesToUpdate) {
          const mockHighlight = getSpecificMockHighlight(p);
          const mockPrice = getSpecificMockPrice(p);
          const mockReservation = getSpecificMockReservation(p);

          updates.push({
            id: p.id,
            updates: {
              description: getSpecificMockDescription(p),
              category: p.category,
              estimatedDuration: p.estimatedDuration,
              descriptionSource: "ai" as const,
              highlight: mockHighlight,
              priceEstimate: mockPrice,
              reservation: {
                ...p.reservation,
                ...mockReservation,
                isBooked: p.reservation?.isBooked,
                bookingUrl: p.reservation?.bookingUrl,
                confirmationNumber: p.reservation?.confirmationNumber,
                whosInterested: p.reservation?.whosInterested,
              },
            },
          });
        }
      }

      if (updates.length > 0) {
        console.log(`[AI Describe] Saving ${updates.length} descriptions to state...`);
        updatePlacesBulk(updates);
        toast.success(`Generated AI descriptions for ${updates.length} places!`, "AI Descriptions Ready");
      } else {
        toast.info("No description updates needed.", "AI Describe");
      }
    } catch (err: any) {
      console.error("AI Batch Processing Error:", err);
      toast.error(err?.message || "Failed to generate AI descriptions.", "AI Error");
    } finally {
      setIsGenerating(false);
    }
  };

  const [isGeneratingHighlights, setIsGeneratingHighlights] = useState(false);

  const handleGenerateMissingHighlights = async () => {
    const placesMissingHighlights = places.filter((p) => !p.highlight);
    if (isGeneratingHighlights || placesMissingHighlights.length === 0) return;

    setIsGeneratingHighlights(true);
    try {
      if (appMode === "real") {
        toast.info(`Generating Must-Try & highlights for ${placesMissingHighlights.length} places...`, "Generating Highlights");
        const results = await generateHighlightsBatch(
          placesMissingHighlights.map((p) => ({
            id: p.id,
            name: p.name,
            address: p.address,
            category: p.category,
            description: p.description,
          }))
        );
        if (results && results.length > 0) {
          const updates = results
            .filter((r) => r.highlight)
            .map((r) => ({ id: r.id, updates: { highlight: r.highlight } }));
          if (updates.length > 0) {
            updatePlacesBulk(updates);
            toast.success(`Generated Must-Try & highlights for ${updates.length} places!`, "Highlights Ready");
          } else {
            toast.info("No new highlights were returned.", "Highlights");
          }
        }
      } else {
        const updates = placesMissingHighlights.map((p) => ({
          id: p.id,
          updates: { highlight: getSpecificMockHighlight(p) },
        }));
        updatePlacesBulk(updates);
        toast.success(`Generated simulated highlights for ${updates.length} places!`, "Highlights Ready");
      }
    } catch (err: any) {
      console.error("Highlight Generation Error:", err);
      toast.error(err?.message || "Failed to generate highlights.", "Highlight Error");
    } finally {
      setIsGeneratingHighlights(false);
    }
  };

  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false);

  const candidatePlaces: Place[] = useMemo(() => {
    if (filteredPlaceIds !== null) {
      return places.filter((p) => filteredPlaceIds.includes(p.id));
    }
    return places;
  }, [places, filteredPlaceIds]);

  const targetRegeneratePlaces = useMemo(() => {
    return candidatePlaces.filter((p) => p.descriptionSource !== "user");
  }, [candidatePlaces]);

  const devRegenerateLabel = useMemo(() => {
    if (isRegeneratingAll) return "Regenerating...";
    if (activeFilterCategory && activeFilterCategory !== "all") {
      return `Regenerate ${getCategoryLabel(activeFilterCategory)} (${targetRegeneratePlaces.length})`;
    }
    if (hasActiveFilter && activeFilterDescription) {
      if (activeFilterDescription === "Excluded") {
        return `Regenerate Excluded (${targetRegeneratePlaces.length})`;
      }
      if (activeFilterDescription === "Unassigned" || activeFilterDescription === "Unassigned Tab") {
        return `Regenerate Unassigned (${targetRegeneratePlaces.length})`;
      }
      return `Regenerate Filtered (${targetRegeneratePlaces.length})`;
    }
    return `Regenerate All AI (${targetRegeneratePlaces.length})`;
  }, [
    isRegeneratingAll,
    activeFilterCategory,
    hasActiveFilter,
    activeFilterDescription,
    targetRegeneratePlaces.length,
  ]);

  const devRegenerateTooltip = useMemo(() => {
    if (isRegeneratingAll) return "Regenerating AI data...";
    if (candidatePlaces.length === 0) {
      return `[Local Dev Only] No places match active filter${activeFilterDescription ? ` (${activeFilterDescription})` : ""}`;
    }
    if (targetRegeneratePlaces.length === 0) {
      return `[Local Dev Only] All ${candidatePlaces.length} place(s) in current view are user-written and protected`;
    }
    if (activeFilterCategory && activeFilterCategory !== "all") {
      return `[Local Dev Only] Regenerate descriptions & highlights for ${targetRegeneratePlaces.length} ${getCategoryLabel(activeFilterCategory)} place(s)`;
    }
    if (activeFilterDescription) {
      return `[Local Dev Only] Regenerate descriptions & highlights for ${targetRegeneratePlaces.length} place(s) matching ${activeFilterDescription}`;
    }
    return `[Local Dev Only] Regenerate descriptions & specific highlights for all ${targetRegeneratePlaces.length} non-user-inputted places`;
  }, [
    isRegeneratingAll,
    candidatePlaces.length,
    targetRegeneratePlaces.length,
    activeFilterCategory,
    activeFilterDescription,
  ]);

  const handleRegenerateAllAiData = async () => {
    const targetPlaces = candidatePlaces.filter((p) => p.descriptionSource !== "user");
    if (isRegeneratingAll || targetPlaces.length === 0) {
      if (candidatePlaces.length === 0) {
        toast.info(
          activeFilterDescription
            ? `No places match the active filter (${activeFilterDescription}).`
            : "No places found to regenerate.",
          "Regenerate AI"
        );
      } else if (targetPlaces.length === 0) {
        toast.info(
          "All places in this view are user-written and protected from regeneration.",
          "Regenerate AI"
        );
      }
      return;
    }

    setIsRegeneratingAll(true);
    const scopeNotice = activeFilterDescription ? ` (${activeFilterDescription})` : "";
    toast.info(
      `Regenerating descriptions & highlights for ${targetPlaces.length} places${scopeNotice}...`,
      "Regenerating AI"
    );

    try {
      const updates: { id: string; updates: Partial<Place> }[] = [];

      if (appMode === "real") {
        const batchPlaces = targetPlaces.map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          types: (p as any).types || [],
        }));

        const aiDataArray = await summarizePlacesBatch(batchPlaces, 3);

        for (const p of targetPlaces) {
          const aiData = aiDataArray.find((d) => d.id === p.id);
          if (aiData) {
            updates.push({
              id: p.id,
              updates: {
                description:
                  p.areaNote && !aiData.description.includes(p.areaNote)
                    ? `${aiData.description}\n\n${p.areaNote}`
                    : aiData.description,
                category: aiData.category,
                estimatedDuration: aiData.estimatedDuration,
                descriptionSource: "ai",
                ...(aiData.romanizedName ? { romanizedName: aiData.romanizedName } : {}),
                ...(aiData.highlight ? { highlight: aiData.highlight } : {}),
                ...(aiData.priceEstimate ? { priceEstimate: aiData.priceEstimate } : {}),
                ...(aiData.reservation
                  ? {
                      reservation: {
                        ...p.reservation,
                        ...aiData.reservation,
                        isBooked: p.reservation?.isBooked,
                        bookingUrl: p.reservation?.bookingUrl,
                        confirmationNumber: p.reservation?.confirmationNumber,
                        whosInterested: p.reservation?.whosInterested,
                      },
                    }
                  : {}),
              },
            });
          } else if (p.editorialSummary) {
            updates.push({
              id: p.id,
              updates: {
                description: p.editorialSummary,
                descriptionSource: "ai",
              },
            });
          }
        }
      } else {
        for (const p of targetPlaces) {
          updates.push({
            id: p.id,
            updates: {
              description: getSpecificMockDescription(p),
              category: p.category,
              estimatedDuration: p.estimatedDuration,
              descriptionSource: "mock",
              highlight: getSpecificMockHighlight(p),
              priceEstimate: getSpecificMockPrice(p),
              reservation: {
                ...p.reservation,
                ...getSpecificMockReservation(p),
                isBooked: p.reservation?.isBooked,
                bookingUrl: p.reservation?.bookingUrl,
                confirmationNumber: p.reservation?.confirmationNumber,
                whosInterested: p.reservation?.whosInterested,
              },
            },
          });
        }
      }

      if (updates.length > 0) {
        updatePlacesBulk(updates);
        toast.success(
          `Regenerated AI data & highlights for ${updates.length} places${scopeNotice}!`,
          "Regeneration Complete"
        );
      } else {
        toast.info("No updates were made.", "Regenerate AI");
      }
    } catch (err: any) {
      console.error("Failed to regenerate all AI data:", err);
      toast.error(err?.message || "Failed to regenerate AI data.", "AI Error");
    } finally {
      setIsRegeneratingAll(false);
    }
  };

  const [isSyncingPhotos, setIsSyncingPhotos] = useState(false);

  const handleSyncPhotos = async () => {
    if (places.length === 0 || isSyncingPhotos) return;
    setIsSyncingPhotos(true);
    try {
      clearMapsCache();

      const updates: { id: string; updates: any }[] = [];
      await Promise.all(
        places.map(async (p) => {
          try {
            const freshPhotoUri = await fetchFreshPhoto(p);
            if (freshPhotoUri) {
              updates.push({
                id: p.id,
                updates: { photoUrl: freshPhotoUri },
              });
            }
          } catch (err) {
            console.error(`[Sync Photos] Failed for ${p.name}:`, err);
          }
        })
      );

      if (updates.length > 0) {
        updatePlacesBulk(updates);
        toast.success(`Synced fresh photos for ${updates.length} places!`, "Photos Synced");
      } else {
        toast.info("All place photos are already up to date.", "Photos Synced");
      }
    } catch (err: any) {
      console.error("Photo Sync Error:", err);
      toast.error("Failed to sync photos from Google Maps.", "Photo Sync Error");
    } finally {
      setIsSyncingPhotos(false);
    }
  };

  const handleUnassignAll = () => {
    unassignAll();
    toast.info("Unpinned places returned to pool. Restrictions, pins, and reservations preserved.", "Schedule Cleared");
  };

  const handleClearOptimizedSchedule = () => {
    if (window.confirm("Are you sure you want to clear the optimized schedule? Unpinned places will return to the unassigned pool; restrictions, pins, and reservations will be preserved.")) {
      clearOptimizedSchedule();
      toast.info("Schedule cleared. Restrictions, pins, and reservations preserved.", "Schedule Cleared");
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex flex-col font-sans transition-colors overflow-hidden">
      <Header />
      <ToastContainer />
      {isResetOpen && (
        <React.Suspense fallback={null}>
          <ResetTripModal
            isOpen={isResetOpen}
            onClose={() => setIsResetOpen(false)}
          />
        </React.Suspense>
      )}

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 w-full custom-scrollbar">
        <div className="max-w-[1600px] mx-auto space-y-8 pb-16 safe-pb">
          {/* Top Row: Trip Settings & Map */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Trip Settings Panel (takes full remaining width) */}
            <div className="w-full lg:flex-1 min-w-0 flex flex-col bg-white dark:bg-surface-800 rounded-xl shadow-sm border border-surface-200 dark:border-surface-700 overflow-hidden">
              <div className="p-5 sm:p-6 flex-1">
                <TripSettings />
              </div>
            </div>

            {/* Map: Fixed portion of screen on desktop, hidden when window is small */}
            <div className="hidden lg:flex lg:w-[400px] xl:w-[460px] 2xl:w-[500px] shrink-0 flex-col h-[500px] lg:h-[520px] rounded-xl overflow-hidden shadow-sm border border-surface-200 dark:border-surface-700 relative">
              <div className="absolute inset-0">
                <ErrorBoundary fallbackTitle="Interactive map failed to render">
                  <React.Suspense
                    fallback={
                      <div className="w-full h-full bg-surface-100 dark:bg-surface-800 animate-pulse flex items-center justify-center text-xs text-surface-400 font-medium">
                        Loading Map...
                      </div>
                    }
                  >
                    <MapView />
                  </React.Suspense>
                </ErrorBoundary>
              </div>
            </div>
          </div>

          {/* Mobile Map Toggle (only when window is too small for side-by-side map) */}
          <div className="lg:hidden">
            <button
              onClick={() => setShowMobileMap((prev) => !prev)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-xs font-semibold text-surface-700 dark:text-surface-300 shadow-2xs hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
            >
              <MapPin className="w-4 h-4 text-primary-500" />
              <span>{showMobileMap ? "Hide Route Map" : "Show Route Map"}</span>
            </button>
            {showMobileMap && (
              <div className="mt-3 w-full h-[360px] rounded-xl overflow-hidden shadow-sm border border-surface-200 dark:border-surface-700 relative">
                <div className="absolute inset-0">
                  <ErrorBoundary fallbackTitle="Interactive map failed to render">
                    <React.Suspense
                      fallback={
                        <div className="w-full h-full bg-surface-100 dark:bg-surface-800 animate-pulse flex items-center justify-center text-xs text-surface-400 font-medium">
                          Loading Map...
                        </div>
                      }
                    >
                      <MapView />
                    </React.Suspense>
                  </ErrorBoundary>
                </div>
              </div>
            )}
          </div>

          {/* Middle Row: Places to Visit */}
          <div className="bg-white dark:bg-surface-800 rounded-xl p-4 sm:p-6 shadow-sm border border-surface-200 dark:border-surface-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-surface-900 dark:text-white">
                  Places to Visit
                </h2>
                <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-sm font-semibold px-2.5 py-0.5 rounded-full">
                  {places.filter((p) => !p.isDisabled).length}
                </span>
                {places.some((p) => p.isDisabled) && (
                  <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold px-2 py-0.5 rounded-full" title="Places kept in reserve without routing">
                    {places.filter((p) => p.isDisabled).length} excluded
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {places.some(
                  (p) => !p.description || p.description.trim() === "",
                ) && (
                  <button
                    onClick={handleGenerateDescriptions}
                    className="flex items-center gap-1.5 text-sm font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 bg-purple-50 hover:bg-purple-100/90 dark:bg-purple-900/30 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-700/60 px-3 py-1.5 rounded-lg transition-all shadow-2xs"
                    title={isGenerating ? "Stop generating descriptions" : "Auto-generate missing descriptions"}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600 dark:text-purple-400" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    )}
                    {isGenerating ? "Stop AI" : "AI Describe"}
                  </button>
                )}
                {places.some((p) => !p.highlight) && (
                  <button
                    onClick={handleGenerateMissingHighlights}
                    disabled={isGeneratingHighlights}
                    className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 bg-amber-50 hover:bg-amber-100/90 dark:bg-amber-900/30 dark:hover:bg-amber-900/60 border border-amber-200/80 dark:border-amber-700/60 px-3 py-1.5 rounded-lg transition-all shadow-2xs disabled:opacity-50"
                    title="Generate Must-Try and highlights for places that don't have them yet"
                  >
                    {isGeneratingHighlights ? (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    )}
                    {isGeneratingHighlights ? "Adding..." : `Add Highlights (${places.filter((p) => !p.highlight).length})`}
                  </button>
                )}
                {isLocalDev() && places.some((p) => p.descriptionSource !== "user") && (
                  <button
                    onClick={handleRegenerateAllAiData}
                    disabled={isRegeneratingAll || isGenerating || isGeneratingHighlights || targetRegeneratePlaces.length === 0}
                    className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 bg-indigo-50 hover:bg-indigo-100/90 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/60 border border-indigo-200/80 dark:border-indigo-700/60 px-3 py-1.5 rounded-lg transition-all shadow-2xs disabled:opacity-50"
                    title={devRegenerateTooltip}
                  >
                    {isRegeneratingAll ? (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    )}
                    <span>{devRegenerateLabel}</span>
                    <span className="text-[10px] bg-indigo-200/80 dark:bg-indigo-900/80 text-indigo-800 dark:text-indigo-200 font-bold px-1.5 py-0.5 rounded tracking-wide uppercase">
                      Dev
                    </span>
                  </button>
                )}
                 {places.length > 0 && (
                  <button
                    onClick={handleSyncPhotos}
                    disabled={isSyncingPhotos}
                    className="flex items-center gap-1.5 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-100 bg-primary-50 hover:bg-primary-100/90 dark:bg-primary-900/30 dark:hover:bg-primary-900/60 border border-primary-200 dark:border-primary-700/60 px-3 py-1.5 rounded-lg transition-all shadow-2xs disabled:opacity-50"
                    title="Refresh all place photos from Google Maps"
                  >
                    {isSyncingPhotos ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary-600 dark:text-primary-400" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                    )}
                    {isSyncingPhotos ? "Syncing..." : "Sync Photos"}
                  </button>
                )}
                {places.some((p) => p.dayIndex !== null) && (
                  <button
                    onClick={handleUnassignAll}
                    className="text-sm font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 bg-amber-50 hover:bg-amber-100/90 dark:bg-amber-900/30 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-700/60 px-3 py-1.5 rounded-lg transition-all shadow-2xs"
                  >
                    Unassign All
                  </button>
                )}
                {(places.length > 0 || hotels.length > 0) && (
                  <button
                    onClick={() => setIsResetOpen(true)}
                    className="text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50/70 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50 border border-red-200/70 dark:border-red-800/60 px-3 py-1.5 rounded-lg transition-all shadow-2xs flex items-center gap-1.5"
                    title="Reset current trip itinerary"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Trip
                  </button>
                )}
              </div>
            </div>

            <PlaceSearch />

            <div className="mt-4">
              <PlaceList />
              <SuggestedPlaces />
            </div>
          </div>

          {/* Optimize Button & Clear Schedule */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleOptimize}
              disabled={
                places.filter((p) => !p.isDisabled).length === 0 ||
                isOptimizing ||
                exemptDays.length >= days
              }
              className="btn-primary flex-1 flex items-center justify-center gap-2 group py-4 text-lg rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOptimizing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>
                    Optimizing Route ({places.filter((p) => !p.isDisabled).length} places)...
                  </span>
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                  <span>
                    {exemptDays.length >= days
                      ? "All Days Exempt (Locked)"
                      : optimizedRoutes.length > 0
                        ? "Re-Optimize Route"
                        : "Optimize Route"}
                    {exemptDays.length < days && places.some((p) => p.isDisabled)
                      ? ` (${places.filter((p) => !p.isDisabled).length} active)`
                      : ""}
                    {exemptDays.length > 0 && exemptDays.length < days && (
                      <span className="ml-1.5 text-xs font-medium opacity-90">
                        ({days - exemptDays.length}/{days} days)
                      </span>
                    )}
                  </span>
                </>
              )}
            </button>

            {/* Exempt Days Toggle Popover Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowExemptPopover((v) => !v)}
                className={`flex items-center gap-2 py-4 px-3.5 sm:px-4 text-sm font-bold border rounded-xl transition-all shadow-2xs cursor-pointer shrink-0 ${
                  exemptDays.length > 0
                    ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80 text-amber-800 dark:text-amber-200 hover:bg-amber-100/80 dark:hover:bg-amber-900/60"
                    : "bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700"
                }`}
                title="Select days to exempt/lock from route optimization"
                aria-label="Exempt days from route optimization"
              >
                <Lock
                  className={`w-4 h-4 ${
                    exemptDays.length > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-surface-400"
                  }`}
                />
                <span className="hidden sm:inline">
                  {exemptDays.length === 0
                    ? "Exempt Days"
                    : `${exemptDays.length} ${exemptDays.length === 1 ? "Day" : "Days"} Exempt`}
                </span>
                {exemptDays.length > 0 && (
                  <span className="sm:hidden text-xs bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded-full font-black">
                    {exemptDays.length}
                  </span>
                )}
              </button>

              {showExemptPopover && (
                <div className="absolute bottom-full mb-2 right-0 sm:left-auto z-50 w-72 bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 p-3.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-150 text-left">
                  <div className="flex items-center justify-between pb-1.5 border-b border-surface-100 dark:border-surface-700">
                    <span className="text-xs font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-500" />
                      Exempt from Optimization
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowExemptPopover(false)}
                      className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400 leading-tight">
                    Checked days will not be altered or reordered when you click <strong>Optimize Route</strong>.
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pt-1">
                    {Array.from({ length: days }).map((_, idx) => {
                      const isExempt = exemptDays.includes(idx);
                      const dateStr = startDate ? format(addDays(parseISO(startDate), idx), "MMM d") : null;
                      const dayName = dayTitles[idx]
                        ? (dateStr ? `${dayTitles[idx]} (${dateStr})` : `Day ${idx + 1}: ${dayTitles[idx]}`)
                        : (dateStr ? `${dateStr} (Day ${idx + 1})` : `Day ${idx + 1}`);
                      return (
                        <label
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                            isExempt
                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60"
                              : "hover:bg-surface-100 dark:hover:bg-surface-700/50 text-surface-700 dark:text-surface-300"
                          }`}
                        >
                          <span className="truncate pr-2">{dayName}</span>
                          <input
                            type="checkbox"
                            checked={isExempt}
                            onChange={() => toggleDayExemption(idx)}
                            className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>
                  {exemptDays.length > 0 && (
                    <div className="pt-1 border-t border-surface-100 dark:border-surface-700">
                      <button
                        type="button"
                        onClick={() => setExemptDays([])}
                        className="w-full text-center text-[11px] font-bold text-red-600 hover:text-red-700 dark:text-red-400 py-0.5 cursor-pointer"
                      >
                        Clear all exemptions
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {optimizedRoutes.length > 0 && (
              <button
                type="button"
                onClick={handleClearOptimizedSchedule}
                disabled={isOptimizing}
                className="flex items-center justify-center gap-2 py-4 px-5 text-base font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800/60 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer disabled:opacity-50"
                title="Clear optimized schedule and unassign all places back to pool"
              >
                <Trash2 className="w-5 h-5" />
                <span className="hidden sm:inline">Clear Schedule</span>
              </button>
            )}
          </div>

          {/* Bottom Row: Daily Schedule */}
          {optimizedRoutes.length > 0 && (
            <div className="bg-white dark:bg-surface-800 rounded-xl shadow-sm border border-surface-200 dark:border-surface-700 overflow-hidden">
              <ErrorBoundary fallbackTitle="Could not load daily schedule">
                <DailySchedule />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

