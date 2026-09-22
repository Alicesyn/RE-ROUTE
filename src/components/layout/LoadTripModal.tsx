import React, { useRef, useState } from "react";
import { useRouteStore } from "../../store/useRouteStore";
import {
  X,
  Calendar,
  MapPin,
  Clock,
  Trash2,
  Download,
  Upload,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Cloud,
  HardDrive,
  CloudUpload,
  Zap,
  Edit2,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "../../services/toastService";
import { ItinerarySnapshot } from "../../types";
import { cloudTripService } from "../../services/cloudTripService";

interface LoadTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "all" | "cloud" | "local";
}

export const formatTripTimestamp = (timestamp?: number | string): string => {
  if (!timestamp) return "Unknown date";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "Unknown date";

  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${dateStr} • ${timeStr}`;
};

export const LoadTripModal: React.FC<LoadTripModalProps> = ({
  isOpen,
  onClose,
  defaultTab = "all",
}) => {
  const {
    savedTrips,
    loadTrip,
    deleteTrip,
    exportTripAsJson,
    exportTripAsExcel,
    importTripFromJson,
    user,
    cloudTrips,
    loadTripFromCloud,
    deleteCloudTrip,
    fetchCloudTrips,
    quickSave,
    loadQuickSave,
    deleteQuickSave,
    renameSavedTrip,
    renameCloudTrip,
  } = useRouteStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"all" | "cloud" | "local">(defaultTab);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);
  const [isImporting, setIsImporting] = useState(false);
  const [exportingTripId, setExportingTripId] = useState<string | null>(null);
  const [exportingExcelTripId, setExportingExcelTripId] = useState<string | null>(null);
  const [uploadingTripId, setUploadingTripId] = useState<string | null>(null);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const handleStartRename = (e: React.MouseEvent, trip: any) => {
    e.stopPropagation();
    setEditingTripId(trip.id);
    setEditingTitle(trip.title);
  };

  const handleSaveRename = async (e: React.MouseEvent | React.FormEvent, trip: any) => {
    e.stopPropagation();
    e.preventDefault();
    const trimmed = editingTitle.trim();
    if (!trimmed || trimmed === trip.title) {
      setEditingTripId(null);
      return;
    }
    setIsRenaming(true);
    try {
      if (trip.isCloud) {
        await renameCloudTrip(trip.id, trimmed);
      } else {
        renameSavedTrip(trip.id, trimmed);
        toast.success(`Renamed trip to "${trimmed}".`, "Trip Renamed");
      }
      setEditingTripId(null);
    } finally {
      setIsRenaming(false);
    }
  };

  React.useEffect(() => {
    if (isOpen && user) {
      fetchCloudTrips();
    }
  }, [isOpen, user, fetchCloudTrips]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await new Promise((r) => setTimeout(r, 250));
        const res = importTripFromJson(content);
        if (res.success) {
          toast.success(`Loaded "${res.tripTitle || "Trip"}" successfully!`, "Trip Imported");
          onClose();
        } else {
          toast.error(res.error || "Failed to import trip file.", "Import Error");
        }
      } finally {
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
      setIsImporting(false);
      toast.error("Failed to read trip file.", "Import Error");
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExportTrip = async (e: React.MouseEvent, trip: any) => {
    e.stopPropagation();
    if (exportingTripId) return;
    setExportingTripId(trip.id);
    try {
      await new Promise((r) => setTimeout(r, 250));
      exportTripAsJson(trip.id);
      toast.success(`Exported "${trip.title}" to JSON.`, "Export Complete");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export trip", "Export Error");
    } finally {
      setExportingTripId(null);
    }
  };

  const handleExportTripExcel = async (e: React.MouseEvent, trip: any) => {
    e.stopPropagation();
    if (exportingExcelTripId) return;
    setExportingExcelTripId(trip.id);
    try {
      await new Promise((r) => setTimeout(r, 150));
      await exportTripAsExcel(trip.id);
      toast.success(`Exported "${trip.title}" to Excel spreadsheet.`, "Export Complete");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export Excel file", "Export Error");
    } finally {
      setExportingExcelTripId(null);
    }
  };


  const handleUploadLocalTripToCloud = async (e: React.MouseEvent, trip: ItinerarySnapshot) => {
    e.stopPropagation();
    if (!user) {
      toast.error("Please sign in with Google to upload trips to the cloud.", "Sign In Required");
      return;
    }
    setUploadingTripId(trip.id);
    try {
      const res = await cloudTripService.saveTripToCloud(trip);
      if (res.success) {
        toast.success(`"${trip.title}" uploaded to your cloud account!`, "Cloud Synced");
        await fetchCloudTrips();
      } else {
        toast.error(res.error || "Failed to upload trip.", "Upload Failed");
      }
    } finally {
      setUploadingTripId(null);
    }
  };

  if (!isOpen) return null;

  // Build unified trip list (excluding quickSave to keep it completely separate)
  // 1. Local trips: all non-quick-save trips in savedTrips
  const localTripsList: (ItinerarySnapshot & { isCloud: boolean })[] = savedTrips
    .filter((t) => !t.isQuickSave && !t.id.startsWith("quicksave_"))
    .map((t) => ({
      ...t,
      isCloud: false,
    }));

  // 2. Cloud trips: all non-quick-save trips in cloudTrips
  const cloudTripsList: (ItinerarySnapshot & { isCloud: boolean })[] = cloudTrips
    .filter((t) => !t.isQuickSave && !t.id.startsWith("quicksave_"))
    .map((t) => ({
      ...t,
      isCloud: true,
    }));

  // Combined list for "All Trips" tab
  // If a trip exists in both local and cloud, both are preserved distinctly with unique keys and badges
  const allTripsList = [...localTripsList, ...cloudTripsList].sort(
    (a, b) => (b.updatedAt || b.savedAt || 0) - (a.updatedAt || a.savedAt || 0)
  );

  const displayTrips =
    activeTab === "cloud"
      ? [...cloudTripsList].sort((a, b) => (b.updatedAt || b.savedAt || 0) - (a.updatedAt || a.savedAt || 0))
      : activeTab === "local"
      ? [...localTripsList].sort((a, b) => (b.updatedAt || b.savedAt || 0) - (a.updatedAt || a.savedAt || 0))
      : allTripsList;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-900/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] transition-colors"
        >
          <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50">
            <div>
              <h2 className="text-xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
                <FileJson className="w-5 h-5 text-primary-500" />
                My Saved Trips
              </h2>
              <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
                Load, sync, or export your trip itineraries
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cloud / Local Filter Tabs */}
          {user && (
            <div className="flex border-b border-surface-200/60 dark:border-surface-700/60 px-4 bg-surface-50/40 dark:bg-surface-900/30">
              <button
                onClick={() => setActiveTab("all")}
                className={`py-2 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  activeTab === "all"
                    ? "border-primary-500 text-primary-600 dark:text-primary-400"
                    : "border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
                }`}
              >
                All Trips ({allTripsList.length})
              </button>
              <button
                onClick={() => setActiveTab("cloud")}
                className={`py-2 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "cloud"
                    ? "border-primary-500 text-primary-600 dark:text-primary-400"
                    : "border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
                }`}
              >
                <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                Cloud Synced ({cloudTripsList.length})
              </button>
              <button
                onClick={() => setActiveTab("local")}
                className={`py-2 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "local"
                    ? "border-primary-500 text-primary-600 dark:text-primary-400"
                    : "border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
                }`}
              >
                <HardDrive className="w-3.5 h-3.5 text-surface-400" />
                This Device Only ({localTripsList.length})
              </button>
            </div>
          )}

          {/* Quick Import Action Header */}
          <div className="px-4 py-2.5 bg-surface-100/50 dark:bg-surface-900/40 border-b border-surface-200/60 dark:border-surface-700/60 flex items-center justify-between">
            <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
              {displayTrips.length} {displayTrips.length === 1 ? "trip" : "trips"} available
            </span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center gap-1.5 text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:text-primary-300 px-2.5 py-1 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Trip File (.json)</span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div className="p-4 overflow-y-auto custom-scrollbar flex-1 bg-surface-50 dark:bg-surface-900/50 transition-colors space-y-3">
            {/* Dedicated Google Quick Save Card */}
            {quickSave && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent border border-amber-300 dark:border-amber-700/80 shadow-xs relative group overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-2xs">
                        <Zap className="w-3 h-3 fill-current" />
                        Quick Save
                      </span>
                      <span className="text-[11px] font-semibold text-surface-600 dark:text-surface-300">
                        {quickSave.quickSaveUserEmail ? `Auto-saved for ${quickSave.quickSaveUserEmail}` : "Google Auto-Save"}
                      </span>
                      <span
                        className="text-[10px] text-surface-400 dark:text-surface-500"
                        title={`Exact auto-save time: ${new Date(quickSave.updatedAt || quickSave.savedAt).toLocaleString()}`}
                      >
                        • {formatTripTimestamp(quickSave.updatedAt || quickSave.savedAt)}
                      </span>
                    </div>

                    <h4 className="font-bold text-base text-surface-900 dark:text-white truncate">
                      {quickSave.title ? quickSave.title.replace(/\s*\(Quick Save\)$/i, "") : "Untitled Itinerary"}
                    </h4>

                    <div className="flex items-center gap-3 text-xs font-medium text-surface-600 dark:text-surface-300">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-primary-500" />
                        {quickSave.days} Days
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" />
                        {quickSave.places.length} Places
                      </span>
                      {quickSave.optimizedRoutes && quickSave.optimizedRoutes.length > 0 && (
                        <span className="flex items-center gap-1 text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 px-1.5 py-0.5 rounded">
                          <Clock className="w-3.5 h-3.5" />
                          Optimized
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        loadQuickSave();
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title="Restore Quick Save into workspace"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>Restore</span>
                    </button>
                    <button
                      onClick={async () => {
                        await deleteQuickSave();
                      }}
                      className="p-1.5 text-surface-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors cursor-pointer"
                      title="Delete Quick Save"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Separator / Title for Other Saves */}
            {quickSave && displayTrips.length > 0 && (
              <div className="pt-1 flex items-center justify-between">
                <span className="text-xs font-bold text-surface-400 uppercase tracking-wider">
                  Saved Itineraries
                </span>
                <span className="text-xs text-surface-400">
                  {displayTrips.length} {displayTrips.length === 1 ? "trip" : "trips"}
                </span>
              </div>
            )}

            {displayTrips.length === 0 ? (
              <div className="text-center py-12 px-4 bg-white dark:bg-surface-800 rounded-xl border border-dashed border-surface-200 dark:border-surface-700">
                <p className="text-surface-500 dark:text-surface-400 font-medium">
                  {activeTab === "cloud"
                    ? "No cloud-synced trips found."
                    : activeTab === "local"
                    ? "No local trips saved on this device."
                    : "You haven't saved any trips yet."}
                </p>
                <p className="text-sm text-surface-400 dark:text-surface-500 mt-1">
                  {activeTab === "cloud"
                    ? "Click 'Save to Cloud' in the header to sync trips across devices."
                    : "Click 'Save' in the header to save your current itinerary locally, or import a .json file."}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-bold hover:bg-primary-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import Trip File (.json)</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {displayTrips.map((trip) => (
                  <div key={trip.isCloud ? `cloud_${trip.id}` : `local_${trip.id}`} className="relative group">
                    <button
                      onClick={async () => {
                        if (trip.isCloud) {
                          await loadTripFromCloud(trip.id);
                        } else {
                          loadTrip(trip.id);
                          toast.success(`Loaded "${trip.title}" itinerary.`, "Trip Loaded");
                        }
                        onClose();
                      }}
                      className="w-full text-left bg-white dark:bg-surface-800 p-4 rounded-xl border border-surface-200 dark:border-surface-700 shadow-sm hover:shadow-md hover:border-primary-300 dark:hover:border-primary-500 transition-all flex flex-col gap-3 cursor-pointer"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1">
                          {editingTripId === trip.id ? (
                            <form
                              onSubmit={(e) => handleSaveRename(e, trip)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5 min-w-[220px]"
                            >
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                autoFocus
                                maxLength={80}
                                className="px-2 py-1 text-sm font-bold border border-primary-400 dark:border-primary-500 rounded-lg bg-white dark:bg-surface-800 text-surface-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                              />
                              <button
                                type="submit"
                                disabled={isRenaming}
                                className="p-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white cursor-pointer"
                                title="Save Name"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTripId(null);
                                }}
                                className="p-1 rounded-md bg-surface-200 hover:bg-surface-300 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-600 dark:text-surface-300 cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-1.5 group/title">
                              <h3 className="font-bold text-surface-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors text-base sm:text-lg">
                                {trip.title}
                              </h3>
                              <button
                                type="button"
                                onClick={(e) => handleStartRename(e, trip)}
                                className="p-1 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md transition-colors opacity-0 group-hover/title:opacity-100 cursor-pointer"
                                title="Rename trip"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            {trip.isCloud ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                                <Cloud className="w-3 h-3" />
                                Cloud Synced
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300">
                                <HardDrive className="w-3 h-3" />
                                Local Device Only
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 dark:text-surface-400 bg-surface-100 dark:bg-surface-700/80 px-2.5 py-1 rounded-md shrink-0 border border-surface-200/60 dark:border-surface-600/50"
                          title={`Exact save time: ${new Date(trip.updatedAt || trip.savedAt).toLocaleString()}`}
                        >
                          <Clock className="w-3 h-3 text-surface-400 dark:text-surface-500 shrink-0" />
                          <span>{formatTripTimestamp(trip.updatedAt || trip.savedAt)}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-medium text-surface-500 dark:text-surface-400">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {trip.days} Days
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {trip.places.length} Places
                        </div>
                        {trip.optimizedRoutes && trip.optimizedRoutes.length > 0 && (
                          <div className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded">
                            <Clock className="w-3 h-3" />
                            Optimized
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Action buttons on card */}
                    <div className="absolute right-3 bottom-3 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      {/* Rename button */}
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(e, trip)}
                        className="p-1.5 text-surface-500 hover:text-primary-600 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors cursor-pointer"
                        title="Rename trip"
                      >
                        <Edit2 className="w-4 h-4 text-surface-500 dark:text-surface-400" />
                      </button>

                      {/* Upload to cloud button for local-only trips */}
                      {!trip.isCloud && user && (
                        <button
                          onClick={(e) => handleUploadLocalTripToCloud(e, trip)}
                          disabled={uploadingTripId === trip.id}
                          className="p-1.5 text-surface-500 hover:text-primary-600 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors cursor-pointer"
                          title="Upload this trip to your cloud account"
                        >
                          {uploadingTripId === trip.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                          ) : (
                            <CloudUpload className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                          )}
                        </button>
                      )}

                      <button
                        onClick={(e) => handleExportTripExcel(e, trip)}
                        disabled={exportingExcelTripId === trip.id}
                        className="p-1.5 text-surface-500 hover:text-emerald-600 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors disabled:opacity-75 cursor-pointer"
                        title="Export trip as Excel spreadsheet (.xlsx)"
                      >
                        {exportingExcelTripId === trip.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </button>
                      <button
                        onClick={(e) => handleExportTrip(e, trip)}
                        disabled={exportingTripId === trip.id}
                        className="p-1.5 text-surface-500 hover:text-primary-600 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors disabled:opacity-75 cursor-pointer"
                        title="Export trip as JSON file"
                      >
                        {exportingTripId === trip.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (trip.isCloud) {
                            await deleteCloudTrip(trip.id);
                          } else {
                            deleteTrip(trip.id);
                            toast.info(`Deleted "${trip.title}".`, "Trip Deleted");
                          }
                        }}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"
                        title="Delete trip"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
