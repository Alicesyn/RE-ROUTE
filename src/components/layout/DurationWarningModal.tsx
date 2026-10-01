import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Timer, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouteStore } from "../../store/useRouteStore";
import { getCategoryEmoji, getCategoryLabel, getDefaultDuration } from "../../utils/categoryUtils";
import { Place } from "../../types";

interface FlaggedPlace {
  place: Place;
  aiDuration: number;
  defaultDuration: number;
}

interface DurationWarningModalProps {
  placeIds: string[];
  onClose: () => void;
}

export const DurationWarningModal: React.FC<DurationWarningModalProps> = ({
  placeIds,
  onClose,
}) => {
  const { places, updatePlace } = useRouteStore();

  const flaggedPlaces: FlaggedPlace[] = placeIds
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is Place => !!p && !!p.aiEstimatedDuration)
    .map((p) => ({
      place: p,
      aiDuration: p.aiEstimatedDuration!,
      defaultDuration: getDefaultDuration(p.category),
    }));

  // Local state: map of placeId -> draft duration string
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    flaggedPlaces.forEach(({ place }) => {
      init[place.id] = String(place.estimatedDuration ?? getDefaultDuration(place.category));
    });
    return init;
  });

  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const handleApplyAi = useCallback(
    (fp: FlaggedPlace) => {
      const val = String(fp.aiDuration);
      setDrafts((prev) => ({ ...prev, [fp.place.id]: val }));
      updatePlace(fp.place.id, { estimatedDuration: fp.aiDuration });
      setSaved((prev) => ({ ...prev, [fp.place.id]: true }));
    },
    [updatePlace]
  );

  const handleSave = useCallback(
    (fp: FlaggedPlace) => {
      const parsed = parseInt(drafts[fp.place.id] || "0", 10);
      if (!parsed || parsed < 5) return;
      updatePlace(fp.place.id, { estimatedDuration: parsed });
      setSaved((prev) => ({ ...prev, [fp.place.id]: true }));
    },
    [drafts, updatePlace]
  );

  const handleApplyAll = useCallback(() => {
    flaggedPlaces.forEach((fp) => handleApplyAi(fp));
  }, [flaggedPlaces, handleApplyAi]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (flaggedPlaces.length === 0) {
    onClose();
    return null;
  }

  const modal = (
    <AnimatePresence>
      <motion.div
        key="duration-warning-backdrop"
        className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        {/* Modal panel */}
        <motion.div
          key="duration-warning-panel"
          className="relative w-full max-w-lg bg-white dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden flex flex-col max-h-[85vh]"
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-200 dark:border-surface-700 bg-amber-50 dark:bg-amber-950/40">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                Visit Duration Warnings
              </h2>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                AI estimates these {flaggedPlaces.length} place{flaggedPlaces.length !== 1 ? "s" : ""} may take significantly longer than their category defaults.
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-1.5 rounded-lg hover:bg-amber-200/60 dark:hover:bg-amber-800/40 transition-all text-amber-600 dark:text-amber-400"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Apply all banner */}
          <div className="px-5 py-2.5 bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/40 flex items-center justify-between gap-3">
            <span className="text-xs text-surface-600 dark:text-surface-400">
              Apply AI estimates to all places at once, or adjust individually below.
            </span>
            <button
              onClick={handleApplyAll}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Apply All
            </button>
          </div>

          {/* Place list */}
          <div className="overflow-y-auto flex-1 divide-y divide-surface-100 dark:divide-surface-800">
            {flaggedPlaces.map(({ place, aiDuration, defaultDuration }) => {
              const isSaved = saved[place.id];
              const current = parseInt(drafts[place.id] || "0", 10);
              const isCustom = current !== aiDuration && current !== defaultDuration;

              return (
                <div
                  key={place.id}
                  className={`px-5 py-3.5 transition-colors ${isSaved ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}
                >
                  {/* Place name + category */}
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-base leading-none mt-0.5">
                      {getCategoryEmoji(place.category)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
                        {place.name}
                      </p>
                      <p className="text-xs text-surface-500 dark:text-surface-400">
                        {getCategoryLabel(place.category)} · default {defaultDuration}m
                      </p>
                    </div>
                    {isSaved && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    )}
                  </div>

                  {/* AI suggestion chip */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[11px] font-semibold">
                      <Sparkles className="w-3 h-3" />
                      AI suggests {aiDuration}m
                      <span className="text-amber-600 dark:text-amber-400 font-normal">
                        (+{aiDuration - defaultDuration}m)
                      </span>
                    </span>
                  </div>

                  {/* Duration input row */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex items-center">
                      <Timer className="absolute left-2.5 w-3.5 h-3.5 text-surface-400 pointer-events-none" />
                      <input
                        type="number"
                        min={5}
                        max={720}
                        value={drafts[place.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [place.id]: e.target.value }))
                        }
                        onKeyDown={(e) => { if (e.key === "Enter") handleSave({ place, aiDuration, defaultDuration }); }}
                        className="pl-7 pr-8 py-1.5 text-xs rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 w-24 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500"
                      />
                      <span className="absolute right-2.5 text-[10px] text-surface-400 pointer-events-none">min</span>
                    </div>

                    <button
                      onClick={() => handleSave({ place, aiDuration, defaultDuration })}
                      className="px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 text-xs font-semibold transition-all"
                    >
                      {isSaved && !isCustom ? "Saved" : "Save"}
                    </button>

                    <button
                      onClick={() => handleApplyAi({ place, aiDuration, defaultDuration })}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-800/60 text-amber-800 dark:text-amber-200 text-xs font-semibold transition-all"
                      title={`Apply AI estimate: ${aiDuration}m`}
                    >
                      <Sparkles className="w-3 h-3" />
                      Use {aiDuration}m
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-surface-200 dark:border-surface-700 flex items-center justify-between gap-3 bg-surface-50 dark:bg-surface-900/60">
            <p className="text-xs text-surface-500 dark:text-surface-400">
              Changes apply immediately to your itinerary.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-surface-200 hover:bg-surface-300 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 text-xs font-semibold transition-all"
            >
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
};
