import React, { useState, useEffect, useRef } from "react";
import { useRouteStore } from "../../store/useRouteStore";
import {
  Save,
  Cloud,
  HardDrive,
  X,
  MapPin,
  Calendar,
  Clock,
  Loader2,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "../../services/toastService";

interface SaveTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: "local" | "cloud";
  onOpenAuth?: () => void;
}

export const SaveTripModal: React.FC<SaveTripModalProps> = ({
  isOpen,
  onClose,
  defaultMode = "local",
  onOpenAuth,
}) => {
  const title = useRouteStore((s) => s.title);
  const places = useRouteStore((s) => s.places);
  const days = useRouteStore((s) => s.days);
  const optimizedRoutes = useRouteStore((s) => s.optimizedRoutes);
  const user = useRouteStore((s) => s.user);
  const saveTrip = useRouteStore((s) => s.saveTrip);
  const saveActiveTripToCloud = useRouteStore((s) => s.saveActiveTripToCloud);
  const savedTrips = useRouteStore((s) => s.savedTrips);
  const cloudTrips = useRouteStore((s) => s.cloudTrips);

  const [tripName, setTripName] = useState(title || "My Trip");
  const [saveMode, setSaveMode] = useState<"local" | "cloud">(
    defaultMode === "cloud" && user ? "cloud" : "local"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const existingTrip = React.useMemo(() => {
    const trimmed = tripName.trim().toLowerCase();
    if (!trimmed) return null;
    if (saveMode === "cloud") {
      return cloudTrips.find((t) => t.title?.trim().toLowerCase() === trimmed);
    }
    return savedTrips.find((t) => t.title?.trim().toLowerCase() === trimmed);
  }, [tripName, saveMode, savedTrips, cloudTrips]);

  useEffect(() => {
    if (isOpen) {
      setTripName(title || "My Trip");
      setSaveMode(defaultMode === "cloud" && user ? "cloud" : "local");
      setIsSaved(false);
      setIsSaving(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, title, defaultMode, user]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSaving) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isSaving]);

  if (!isOpen) return null;

  const handleSave = async (targetMode: "local" | "cloud" = saveMode) => {
    const finalName = tripName.trim() || "My Trip";
    if (isSaving) return;

    setIsSaving(true);
    try {
      if (targetMode === "cloud") {
        if (!user) {
          setIsSaving(false);
          onClose();
          onOpenAuth?.();
          return;
        }
        const success = await saveActiveTripToCloud(false, finalName);
        if (success) {
          setIsSaved(true);
          setTimeout(() => {
            onClose();
          }, 800);
        }
      } else {
        saveTrip(finalName);
        setIsSaved(true);
        const timeStr = new Date().toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        toast.success(`"${finalName}" saved at ${timeStr}!`, "Trip Saved");
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save trip.", "Save Error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave(saveMode);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-900/50 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 w-full max-w-md overflow-hidden flex flex-col transition-colors"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary-50 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 border border-primary-200/60 dark:border-primary-800/60 shadow-2xs">
                <Save className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-surface-900 dark:text-white">
                  Save Itinerary
                </h3>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                  Name your trip and choose where to save it
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="p-1.5 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-5 space-y-4">
            {/* Trip Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-surface-700 dark:text-surface-300">
                Itinerary Name
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Tokyo & Kyoto 2026"
                  maxLength={80}
                  className="w-full h-10 px-3.5 rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50/50 dark:bg-surface-900/50 text-surface-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white dark:focus:bg-surface-800 transition-all placeholder:text-surface-400"
                />
                {tripName.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTripName("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
                    title="Clear"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {existingTrip && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mt-1 font-medium">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Updates existing save (last saved on{" "}
                    {new Date(existingTrip.updatedAt || existingTrip.savedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    {" • "}
                    {new Date(existingTrip.updatedAt || existingTrip.savedAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                    )
                  </span>
                </p>
              )}
            </div>

            {/* Destination / Details Pill */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-50 dark:bg-surface-900/40 border border-surface-200/60 dark:border-surface-700/60 text-xs text-surface-600 dark:text-surface-300">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-primary-500" />
                <span className="font-semibold">{days} Days</span>
              </div>
              <span className="text-surface-300 dark:text-surface-600">•</span>
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span className="font-semibold">{places.length} Places</span>
              </div>
              {optimizedRoutes.length > 0 && (
                <>
                  <span className="text-surface-300 dark:text-surface-600">•</span>
                  <div className="flex items-center gap-1 text-primary-600 dark:text-primary-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Optimized</span>
                  </div>
                </>
              )}
            </div>

            {/* Save Destination Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-surface-700 dark:text-surface-300">
                Save Destination
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Local Device Option */}
                <button
                  type="button"
                  onClick={() => setSaveMode("local")}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                    saveMode === "local"
                      ? "bg-primary-50/80 dark:bg-primary-950/40 border-primary-400 dark:border-primary-600 shadow-2xs"
                      : "bg-surface-50/40 dark:bg-surface-900/20 border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-surface-900 dark:text-white">
                      <HardDrive className={`w-3.5 h-3.5 ${saveMode === "local" ? "text-primary-600 dark:text-primary-400" : "text-surface-400"}`} />
                      <span>This Device</span>
                    </div>
                    {saveMode === "local" && (
                      <Check className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400" />
                    )}
                  </div>
                  <span className="text-[11px] text-surface-500 dark:text-surface-400 leading-tight">
                    Saved in browser storage (offline ready)
                  </span>
                </button>

                {/* Cloud Save Option */}
                <button
                  type="button"
                  onClick={() => {
                    if (user) {
                      setSaveMode("cloud");
                    } else {
                      onClose();
                      onOpenAuth?.();
                    }
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                    saveMode === "cloud"
                      ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600 shadow-2xs"
                      : "bg-surface-50/40 dark:bg-surface-900/20 border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-surface-900 dark:text-white">
                      <Cloud className={`w-3.5 h-3.5 ${saveMode === "cloud" ? "text-emerald-600 dark:text-emerald-400" : "text-surface-400"}`} />
                      <span>Cloud Sync</span>
                    </div>
                    {saveMode === "cloud" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : !user ? (
                      <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/60 px-1 py-0.2 rounded">
                        Sign In
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-surface-500 dark:text-surface-400 leading-tight">
                    {user ? "Syncs across all signed-in devices" : "Sign in to sync across devices"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-surface-100 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/80 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSave(saveMode)}
                disabled={isSaving || !tripName.trim()}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSaved
                    ? "bg-emerald-600"
                    : saveMode === "cloud"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-primary-600 hover:bg-primary-700"
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : isSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved!</span>
                  </>
                ) : saveMode === "cloud" ? (
                  <>
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Save to Cloud</span>
                  </>
                ) : (
                  <>
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>Save to Device</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
