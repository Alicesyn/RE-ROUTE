import React, { useState, useEffect, useRef } from "react";
import {
  X,
  FileText,
  FileJson,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Square,
  CheckSquare,
  Upload,
  Calendar,
  Building,
  Route,
  Plane,
  Sparkles,
} from "lucide-react";
import { searchPlaces, MapsPlace } from "../../services/mapsService";
import { MOCK_PLACES } from "../../services/mockData";
import { useRouteStore } from "../../store/useRouteStore";
import { motion, AnimatePresence } from "framer-motion";
import { autoCategorize, getDefaultDuration } from "../../utils/categoryUtils";
import { ItinerarySnapshot } from "../../types";
import { isDuplicatePlace } from "../../utils/duplicateUtils";
import { isAreaPlace, deriveAreaOpeningHours } from "../../utils/areaOpeningHoursUtils";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "json" | "text";
}

interface ImportResult {
  query: string;
  match: MapsPlace | null;
  selected: boolean;
  error?: string;
  isDuplicate?: boolean;
  isOutlier?: boolean;
  isFar?: boolean;
}

// Haversine distance in km
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

type ModalState = "input" | "searching" | "review" | "success";

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  defaultTab = "json",
}) => {
  const [activeTab, setActiveTab] = useState<"json" | "text">(defaultTab);

  // Full Trip JSON import state
  const [jsonText, setJsonText] = useState("");
  const [parsedTripPreview, setParsedTripPreview] = useState<ItinerarySnapshot | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isImportingTrip, setIsImportingTrip] = useState(false);
  const [tripImportSuccess, setTripImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Places list import state
  const [text, setText] = useState("");
  const [modalState, setModalState] = useState<ModalState>("input");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    currentName: "",
  });

  const { addPlace, appMode, places, hotels, addMissingPlace, importTripFromJson } =
    useRouteStore();

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setModalState("input");
        setText("");
        setResults([]);
        setProgress({ current: 0, total: 0, currentName: "" });
        setJsonText("");
        setParsedTripPreview(null);
        setJsonError(null);
        setIsReadingFile(false);
        setIsImportingTrip(false);
        setIsFinalizing(false);
        setTripImportSuccess(false);
        setActiveTab(defaultTab);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  // Handle JSON file parsing
  const parseAndPreviewJson = (rawContent: string) => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(rawContent);
      let trip: any = null;

      if (parsed && typeof parsed === "object") {
        if (parsed.trip && typeof parsed.trip === "object") {
          trip = parsed.trip;
        } else if (parsed.state && typeof parsed.state === "object") {
          trip = parsed.state;
        } else if (Array.isArray(parsed.places) || typeof parsed.title === "string") {
          trip = parsed;
        }
      }

      if (!trip || (!Array.isArray(trip.places) && typeof trip.days !== "number" && !trip.title)) {
        setJsonError("Invalid file format. Please upload a valid RE-ROUTE trip JSON file.");
        setParsedTripPreview(null);
        return;
      }

      setJsonText(rawContent);
      setParsedTripPreview({
        id: trip.id || `trip_${Date.now()}`,
        title: trip.title || "Imported Trip",
        days: typeof trip.days === "number" ? trip.days : 3,
        startDate: trip.startDate,
        endDate: trip.endDate,
        dateMode: trip.dateMode || "duration",
        dayStartTime: trip.dayStartTime || "09:00",
        dayEndTime: trip.dayEndTime || "21:00",
        showFlights: Boolean(trip.showFlights),
        arrivalFlight: trip.arrivalFlight,
        departureFlight: trip.departureFlight,
        travelMode: trip.travelMode || "driving",
        dailyBudget: trip.dailyBudget ?? 720,
        strictBudget: trip.strictBudget ?? true,
        places: Array.isArray(trip.places) ? trip.places : [],
        hotels: Array.isArray(trip.hotels) ? trip.hotels : [],
        missingPlaces: Array.isArray(trip.missingPlaces) ? trip.missingPlaces : [],
        categoryDurations: trip.categoryDurations,
        categoryConfigs: trip.categoryConfigs,
        optimizedRoutes: Array.isArray(trip.optimizedRoutes) ? trip.optimizedRoutes : [],
        savedAt: trip.savedAt || Date.now(),
      });
    } catch (err: any) {
      setJsonError("Failed to parse JSON file: " + (err?.message || "Invalid syntax"));
      setParsedTripPreview(null);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setIsReadingFile(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          await new Promise((r) => setTimeout(r, 200));
          parseAndPreviewJson(content);
        } finally {
          setIsReadingFile(false);
        }
      };
      reader.onerror = () => {
        setIsReadingFile(false);
        setJsonError("Failed to read file.");
      };
      reader.readAsText(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsReadingFile(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          await new Promise((r) => setTimeout(r, 200));
          parseAndPreviewJson(content);
        } finally {
          setIsReadingFile(false);
        }
      };
      reader.onerror = () => {
        setIsReadingFile(false);
        setJsonError("Failed to read file.");
      };
      reader.readAsText(file);
    }
  };

  const handleConfirmTripImport = async () => {
    if ((!jsonText && !parsedTripPreview) || isImportingTrip) return;
    setIsImportingTrip(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      const res = importTripFromJson(jsonText || JSON.stringify({ trip: parsedTripPreview }));
      if (res.success) {
        setTripImportSuccess(true);
      } else {
        setJsonError(res.error || "Failed to import trip.");
      }
    } finally {
      setIsImportingTrip(false);
    }
  };

  // Places List logic
  const handleSearchAll = async () => {
    const lines = Array.from(
      new Set(
        text
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      ),
    );

    if (lines.length === 0) return;

    setModalState("searching");
    setProgress({ current: 0, total: lines.length, currentName: "" });

    const searchResults: ImportResult[] = [];

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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      setProgress((prev) => ({ ...prev, current: i + 1, currentName: line }));

      const existingPlace = places.find((p) =>
        isDuplicatePlace(p, { name: line }),
      );

      if (existingPlace) {
        searchResults.push({
          query: line,
          match: {
            id: existingPlace.id,
            name: existingPlace.name,
            address: existingPlace.address,
            lat: existingPlace.lat,
            lng: existingPlace.lng,
            types: [],
          },
          selected: false,
          isDuplicate: true,
        });
        continue;
      }

      try {
        let mapsResults: MapsPlace[] = [];

        if (appMode === "real") {
          mapsResults = await searchPlaces(line, biasLocation);
        } else {
          mapsResults = MOCK_PLACES.filter((p) =>
            p.name.toLowerCase().includes(line.toLowerCase()),
          ).map((p) => ({
            id: p.id,
            name: p.name,
            address: p.address,
            lat: p.lat,
            lng: p.lng,
            types: [],
          }));
        }

        if (mapsResults.length > 0) {
          const match = mapsResults[0];
          const isDuplicate = places.some((p) =>
            isDuplicatePlace(p, {
              ...match,
              googlePlaceId: match.id,
            }),
          );

          searchResults.push({
            query: line,
            match,
            selected: !isDuplicate,
            isDuplicate,
          });
        } else {
          searchResults.push({
            query: line,
            match: null,
            selected: false,
            error: "No results found",
          });
        }
      } catch (err) {
        searchResults.push({
          query: line,
          match: null,
          selected: false,
          error: "Search error",
        });
      }

      if (appMode === "real") {
        await new Promise((resolve) => setTimeout(resolve, 150));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    const allMatches = searchResults.map((r) => r.match).filter(Boolean) as MapsPlace[];
    const allLocations = [...allMatches, ...places];

    if (allLocations.length > 0) {
      const lats = allLocations.map((l) => l.lat).sort((a, b) => a - b);
      const lngs = allLocations.map((l) => l.lng).sort((a, b) => a - b);
      const medianLat = lats[Math.floor(lats.length / 2)];
      const medianLng = lngs[Math.floor(lngs.length / 2)];

      searchResults.forEach((res) => {
        if (res.match && !res.isDuplicate) {
          const dist = getDistance(
            res.match.lat,
            res.match.lng,
            medianLat,
            medianLng,
          );
          if (dist > 1000) {
            res.isOutlier = true;
            res.selected = false;
          } else if (dist > 200) {
            res.isFar = true;
          }
        }
      });
    }

    setResults(searchResults);
    setModalState("review");
  };

  const handleFinalize = async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    try {
      await new Promise((r) => setTimeout(r, 250));
      const selectedResults = results.filter((r) => r.selected && r.match);
      const failedResults = results.filter((r) => !r.match || (!r.selected && !r.isDuplicate));

      failedResults.forEach((res) => {
        addMissingPlace(res.query);
      });

      selectedResults.forEach((res) => {
        const bestMatch = res.match!;
        const category = autoCategorize(bestMatch.name, "", bestMatch.types);
        const estimatedDuration = getDefaultDuration(category);
        const isArea = isAreaPlace({
          category,
          openingHours: bestMatch.openingHours,
          types: bestMatch.types || [],
        });
        const newId = `p_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const newPlace = {
          ...bestMatch,
          id: newId,
          googlePlaceId: bestMatch.id,
          photoReference: (bestMatch as any).photoReference || undefined,
          category,
          estimatedDuration,
          description: "",
          descriptionSource: (appMode === "real" ? "ai" : "mock") as "ai" | "mock",
          types: bestMatch.types || [],
          isArea: isArea || undefined,
        };

        addPlace(newPlace);

        if (isArea) {
          deriveAreaOpeningHours(newPlace, appMode)
            .then((result) => {
              if (result) {
                const current = useRouteStore.getState().places.find((p) => p.id === newId);
                const currentDesc = current?.description || "";
                const hasDesc = currentDesc.trim().length > 0;
                const updatedDesc = hasDesc
                  ? (currentDesc.includes(result.areaNote) ? currentDesc : `${currentDesc}\n\n${result.areaNote}`)
                  : result.areaNote;

                useRouteStore.getState().updatePlace(newId, {
                  openingHours: result.hours,
                  areaNote: result.areaNote,
                  isArea: true,
                  description: updatedDesc,
                });
              }
            })
            .catch(() => {});
        }
      });

      setModalState("success");
    } finally {
      setIsFinalizing(false);
    }
  };

  const toggleSelect = (index: number) => {
    setResults((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  const toggleAll = () => {
    const allSelected = results.every((r) => !r.match || r.selected);
    setResults((prev) =>
      prev.map((r) => (r.match ? { ...r, selected: !allSelected } : r)),
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-surface-900/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative w-full max-w-2xl bg-white dark:bg-surface-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-surface-100 dark:border-surface-700 flex items-center justify-between shrink-0 bg-surface-50/50 dark:bg-surface-800/50">
              <div className="flex items-center gap-2">
                {activeTab === "json" ? (
                  <FileJson className="w-5 h-5 text-primary-500" />
                ) : (
                  <FileText className="w-5 h-5 text-primary-500" />
                )}
                <h2 className="text-xl font-bold text-surface-900 dark:text-white">
                  Import Trip Data
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors p-1 rounded-lg"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-surface-200 dark:border-surface-700 bg-surface-100/50 dark:bg-surface-900/50 px-6 pt-3 gap-2">
              <button
                onClick={() => setActiveTab("json")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold transition-all border-t border-x ${
                  activeTab === "json"
                    ? "bg-white dark:bg-surface-800 text-primary-600 dark:text-primary-400 border-surface-200 dark:border-surface-700 shadow-sm"
                    : "border-transparent text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200"
                }`}
              >
                <FileJson className="w-4 h-4" />
                <span>Entire Trip File (.json)</span>
                <span className="text-[10px] bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-bold px-1.5 py-0.5 rounded-full">
                  Transfer
                </span>
              </button>

              <button
                onClick={() => setActiveTab("text")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold transition-all border-t border-x ${
                  activeTab === "text"
                    ? "bg-white dark:bg-surface-800 text-primary-600 dark:text-primary-400 border-surface-200 dark:border-surface-700 shadow-sm"
                    : "border-transparent text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Places List (Text Search)</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {/* TAB 1: FULL TRIP JSON IMPORT */}
              {activeTab === "json" && (
                <div className="space-y-5">
                  {tripImportSuccess ? (
                    <div className="py-8 flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-xl font-bold text-surface-900 dark:text-white mb-2">
                        Trip Imported Successfully!
                      </h3>
                      <p className="text-sm text-surface-500 dark:text-surface-400 mb-6 max-w-md">
                        Loaded{" "}
                        <span className="font-bold text-surface-900 dark:text-white">
                          "{parsedTripPreview?.title}"
                        </span>{" "}
                        with all places, hotel stays, schedules, and custom settings.
                      </p>
                      <button
                        onClick={onClose}
                        className="py-3 px-8 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition-all"
                      >
                        Open Trip
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-surface-600 dark:text-surface-300">
                        Upload or drop a trip JSON file exported from RE-ROUTE on any computer.
                        This will restore your complete itinerary, stays, and optimized routes.
                      </p>

                      {/* Dropzone */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragOver(true);
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleFileDrop}
                        onClick={() => !isReadingFile && fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                          isDragOver
                            ? "border-primary-500 bg-primary-50/50 dark:bg-primary-950/30"
                            : "border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-900/40 hover:bg-surface-100/50 dark:hover:bg-surface-900/70"
                        } ${isReadingFile ? "pointer-events-none opacity-80" : ""}`}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".json,application/json"
                          onChange={handleFileInputChange}
                          className="hidden"
                        />
                        <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-3">
                          {isReadingFile ? (
                            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                          ) : (
                            <Upload className="w-6 h-6" />
                          )}
                        </div>
                        <p className="text-sm font-bold text-surface-800 dark:text-surface-100">
                          {isReadingFile ? "Reading & analyzing trip file..." : "Click to browse or drag & drop a .json trip file"}
                        </p>
                        <p className="text-xs text-surface-400 dark:text-surface-500 mt-1">
                          {isReadingFile ? "Parsing itinerary structure and places..." : "Compatible with all RE-ROUTE JSON export formats"}
                        </p>
                      </div>

                      {/* JSON Error Display */}
                      {jsonError && (
                        <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-300 text-sm">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <span>{jsonError}</span>
                        </div>
                      )}

                      {/* Parsed Trip Preview Card */}
                      {parsedTripPreview && (
                        <div className="bg-surface-50 dark:bg-surface-900/60 border border-surface-200 dark:border-surface-700 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between border-b border-surface-200 dark:border-surface-700 pb-2">
                            <h4 className="font-bold text-surface-900 dark:text-white text-base">
                              {parsedTripPreview.title}
                            </h4>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                              Valid Trip File
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="bg-white dark:bg-surface-800 p-2.5 rounded-lg border border-surface-200 dark:border-surface-700 flex flex-col gap-0.5">
                              <span className="text-surface-400 flex items-center gap-1 font-medium">
                                <Calendar className="w-3.5 h-3.5" /> Duration
                              </span>
                              <span className="font-bold text-surface-800 dark:text-surface-100">
                                {parsedTripPreview.days} Days
                              </span>
                            </div>

                            <div className="bg-white dark:bg-surface-800 p-2.5 rounded-lg border border-surface-200 dark:border-surface-700 flex flex-col gap-0.5">
                              <span className="text-surface-400 flex items-center gap-1 font-medium">
                                <MapPin className="w-3.5 h-3.5" /> Places (PTVs)
                              </span>
                              <span className="font-bold text-surface-800 dark:text-surface-100">
                                {parsedTripPreview.places.length} Places
                              </span>
                            </div>

                            <div className="bg-white dark:bg-surface-800 p-2.5 rounded-lg border border-surface-200 dark:border-surface-700 flex flex-col gap-0.5">
                              <span className="text-surface-400 flex items-center gap-1 font-medium">
                                <Building className="w-3.5 h-3.5" /> Hotels / Stay
                              </span>
                              <span className="font-bold text-surface-800 dark:text-surface-100">
                                {parsedTripPreview.hotels.length} Stays
                              </span>
                            </div>

                            <div className="bg-white dark:bg-surface-800 p-2.5 rounded-lg border border-surface-200 dark:border-surface-700 flex flex-col gap-0.5">
                              <span className="text-surface-400 flex items-center gap-1 font-medium">
                                <Route className="w-3.5 h-3.5" /> Schedule
                              </span>
                              <span className="font-bold text-surface-800 dark:text-surface-100">
                                {parsedTripPreview.optimizedRoutes.length > 0
                                  ? `${parsedTripPreview.optimizedRoutes.length} Days Optimized`
                                  : "Unscheduled"}
                              </span>
                            </div>
                          </div>

                          {parsedTripPreview.showFlights &&
                            (parsedTripPreview.arrivalFlight || parsedTripPreview.departureFlight) && (
                              <div className="flex items-center gap-2 text-xs text-surface-600 dark:text-surface-300 pt-1">
                                <Plane className="w-3.5 h-3.5 text-primary-500" />
                                <span>Includes flight constraints and airport transfers</span>
                              </div>
                            )}
                        </div>
                      )}

                      {/* Manual Paste Accordion */}
                      <details className="text-xs text-surface-500 group">
                        <summary className="cursor-pointer font-medium hover:text-primary-600 transition-colors">
                          Or paste JSON text directly
                        </summary>
                        <div className="mt-2">
                          <textarea
                            value={jsonText}
                            onChange={(e) => parseAndPreviewJson(e.target.value)}
                            placeholder="Paste raw JSON here..."
                            className="w-full h-32 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-3 font-mono text-xs text-surface-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                          />
                        </div>
                      </details>

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={onClose}
                          className="flex-1 py-3 px-4 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 font-semibold hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleConfirmTripImport}
                          disabled={!parsedTripPreview || isImportingTrip}
                          className="flex-1 py-3 px-4 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 shadow-lg shadow-primary-500/20 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                        >
                          {isImportingTrip ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Importing Itinerary...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Import & Load Trip
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 2: PLACES TEXT LIST IMPORT */}
              {activeTab === "text" && (
                <div>
                  {modalState === "input" && (
                    <div className="space-y-4">
                      <p className="text-sm text-surface-600 dark:text-surface-300">
                        Paste a list of places (one per line). We'll find the best
                        matching locations on Google Maps for you.
                      </p>
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="e.g.&#10;Eiffel Tower&#10;Louvre Museum&#10;Notre-Dame Cathedral"
                        className="w-full h-64 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 text-sm text-surface-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={onClose}
                          className="flex-1 py-3 px-4 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 font-semibold hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSearchAll}
                          disabled={!text.trim()}
                          className="flex-1 py-3 px-4 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 shadow-lg shadow-primary-500/20 disabled:opacity-50 transition-all"
                        >
                          Search All Places
                        </button>
                      </div>
                    </div>
                  )}

                  {modalState === "searching" && (
                    <div className="py-12 flex flex-col items-center justify-center text-center">
                      <Loader2 className="w-12 h-12 text-primary-500 animate-spin mb-4" />
                      <h3 className="text-lg font-semibold text-surface-900 dark:text-white">
                        Processing {progress.current} of {progress.total}
                      </h3>
                      <p className="text-sm text-surface-500 dark:text-surface-400 mt-1 truncate max-w-xs mx-auto">
                        Searching for:{" "}
                        <span className="font-medium text-primary-600 dark:text-primary-400">
                          "{progress.currentName}"
                        </span>
                      </p>
                      <div className="w-full max-w-sm bg-surface-100 dark:bg-surface-700 rounded-full h-2.5 mt-8 overflow-hidden">
                        <motion.div
                          className="bg-primary-600 h-full"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${(progress.current / progress.total) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {modalState === "review" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-surface-50 dark:border-surface-700">
                        <p className="text-sm font-medium text-surface-500">
                          Found {results.filter((r) => r.match).length} matches
                        </p>
                        <button
                          onClick={toggleAll}
                          className="text-xs font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
                        >
                          {results.every((r) => !r.match || r.selected)
                            ? "Deselect All"
                            : "Select All"}
                        </button>
                      </div>

                      <div className="space-y-2">
                        {results.map((res, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-4 p-3 rounded-xl border transition-all ${
                              res.match
                                ? res.selected
                                  ? "bg-primary-50/50 dark:bg-primary-900/10 border-primary-200 dark:border-primary-800"
                                  : "bg-white dark:bg-surface-800 border-surface-100 dark:border-surface-700 opacity-60"
                                : "bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30"
                            }`}
                          >
                            <button
                              disabled={!res.match}
                              onClick={() => toggleSelect(i)}
                              className={`mt-1 shrink-0 ${res.match ? "text-primary-600" : "text-surface-300 dark:text-surface-600"}`}
                            >
                              {res.selected ? (
                                <CheckSquare className="w-5 h-5" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[11px] font-bold text-surface-400 uppercase tracking-tighter shrink-0">
                                  Input:
                                </span>
                                <span className="text-sm font-semibold text-surface-900 dark:text-white truncate">
                                  "{res.query}"
                                </span>
                              </div>

                              {res.match ? (
                                <div className="flex items-start gap-2">
                                  <MapPin className="w-3.5 h-3.5 text-primary-500 shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-bold text-primary-700 dark:text-primary-400 truncate">
                                        {res.match.name}
                                      </p>
                                      {res.isDuplicate && (
                                        <span className="shrink-0 text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                          ALREADY ADDED
                                        </span>
                                      )}
                                      {res.isOutlier && (
                                        <span className="shrink-0 text-[9px] font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800 flex items-center gap-1">
                                          <AlertCircle className="w-3 h-3" /> OUTLIER
                                        </span>
                                      )}
                                      {res.isFar && !res.isOutlier && (
                                        <span
                                          className="shrink-0 text-[9px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded border border-orange-200 dark:border-orange-800 flex items-center gap-1"
                                          title="Over 200km from trip center"
                                        >
                                          <AlertCircle className="w-3 h-3" /> FAR AWAY
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-surface-500 dark:text-surface-400 truncate">
                                      {res.match.address}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span className="text-xs font-medium">
                                    {res.error}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-3 pt-4 sticky bottom-0 bg-white dark:bg-surface-800">
                        <button
                          onClick={() => setModalState("input")}
                          className="flex-1 py-3 px-4 rounded-xl border border-surface-200 dark:border-surface-700 text-surface-700 dark:text-surface-300 font-semibold hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                        >
                          Back to Edit
                        </button>
                        <button
                          onClick={handleFinalize}
                          disabled={results.every((r) => !r.selected) || isFinalizing}
                          className="flex-2 py-3 px-8 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 shadow-lg shadow-primary-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                        >
                          {isFinalizing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Adding Places...
                            </>
                          ) : (
                            `Add ${results.filter((r) => r.selected).length} Selected Places`
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {modalState === "success" && (
                    <div className="py-8 flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-xl font-bold text-surface-900 dark:text-white mb-2">
                        Import Complete!
                      </h3>
                      <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
                        Successfully added{" "}
                        <span className="font-bold text-emerald-600">
                          {results.filter((r) => r.selected).length}
                        </span>{" "}
                        places.
                      </p>

                      {results.some((r) => !r.match) && (
                        <div className="w-full bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl p-4 mb-6 text-left">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                              Failed to find ({results.filter((r) => !r.match).length}):
                            </span>
                            <button
                              onClick={() => {
                                const failed = results
                                  .filter((r) => !r.match)
                                  .map((r) => r.query)
                                  .join("\n");
                                navigator.clipboard.writeText(failed);
                              }}
                              className="text-[10px] font-bold bg-white dark:bg-surface-800 text-red-600 border border-red-200 dark:border-red-900 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                            >
                              Copy Failed Names
                            </button>
                          </div>
                          <ul className="text-xs text-red-500 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                            {results
                              .filter((r) => !r.match)
                              .map((res, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span className="mt-1.5 w-1 h-1 bg-red-400 rounded-full shrink-0" />
                                  {res.query}
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}

                      <button
                        onClick={onClose}
                        className="w-full py-3 px-6 rounded-xl bg-surface-900 dark:bg-white text-white dark:text-surface-900 font-bold hover:opacity-90 transition-all"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
