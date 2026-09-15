import React, { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Coffee, GripVertical, Pencil, X } from "lucide-react";
import { CustomBuffer } from "../../types";
import { formatTime } from "./scheduleTimeUtils";

export interface SortableCustomBufferProps {
  buffer: CustomBuffer;
  startTime?: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (updates: Partial<CustomBuffer>) => void;
  onDelete: () => void;
}

export const SortableCustomBuffer: React.FC<SortableCustomBufferProps> = React.memo(
  ({ buffer, startTime, isFirst, isLast, onUpdate, onDelete }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: buffer.id });

    const [isEditing, setIsEditing] = useState(false);
    const [tempLabel, setTempLabel] = useState(buffer.label || "Rest Break");
    const [tempDuration, setTempDuration] = useState(buffer.duration);

    useEffect(() => {
      if (!isEditing) {
        setTempLabel(buffer.label || "Rest Break");
        setTempDuration(buffer.duration);
      }
    }, [buffer.label, buffer.duration, isEditing]);

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 50 : isEditing ? 50 : 1,
      position: "relative" as const,
      opacity: isDragging ? 0.3 : 1,
      scale: isDragging ? 1.02 : 1,
    };

    const formattedStartTime = startTime !== undefined ? formatTime(startTime) : null;
    const formattedEndTime = startTime !== undefined ? formatTime(startTime + buffer.duration) : null;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`relative group ${isDragging ? "cursor-grabbing" : ""} ${isEditing ? "z-50" : ""}`}
      >
        {/* Visual Drop Indicator */}
        {isDragging && (
          <div className="absolute inset-x-0 -top-2 h-1 bg-amber-500/50 rounded-full blur-[1px] animate-pulse" />
        )}

        {/* Line connector */}
        <div
          className={`absolute left-5 w-0.5 bg-surface-200 dark:bg-surface-700/50 ${isFirst ? "top-5" : "top-0"} ${isLast ? "h-5" : "bottom-0"}`}
        />

        <div className="flex gap-4 relative z-10">
          {/* Left icon with drag handle */}
          <div className="relative z-20">
            <div
              className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-300 dark:border-amber-700 flex items-center justify-center shrink-0 shadow-sm text-amber-600 dark:text-amber-400"
              title="Buffer / Break"
            >
              <Coffee className="w-5 h-5" />
            </div>

            {/* Drag Handle */}
            <div
              {...attributes}
              {...listeners}
              className="absolute -left-6 top-5 -translate-y-1/2 p-1.5 text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:hover:text-surface-200 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 hover:opacity-100 transition-opacity touch-none"
              title="Drag to reorder buffer"
            >
              <GripVertical className="w-4 h-4" />
            </div>
          </div>

          {/* Card Body */}
          <div className="flex-1 min-w-0 pt-0.5 pb-3">
            <div className="bg-amber-50/75 dark:bg-amber-950/30 rounded-xl p-3 border border-amber-200 dark:border-amber-800/60 shadow-2xs hover:shadow-md transition-all relative">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-bold text-amber-950 dark:text-amber-100 truncate">
                    {buffer.label || "Buffer / Break"}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300/60 dark:border-amber-700/60 shrink-0">
                    {buffer.duration}m
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {formattedStartTime && formattedEndTime && (
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-white dark:bg-surface-800 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/70 shadow-2xs">
                      {formattedStartTime} – {formattedEndTime}
                    </span>
                  )}

                  {/* Edit Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing((prev) => !prev);
                    }}
                    className="p-1 rounded text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                    title="Edit buffer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="p-1 rounded text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Remove buffer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 uppercase font-bold tracking-tight mt-0.5">
                Scheduled Buffer / Free Time
              </p>

              {/* Inline Edit Popover */}
              {isEditing && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(false);
                    }}
                  />
                  <div
                    className="absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-surface-850 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 p-3.5 text-surface-900 dark:text-white ring-1 ring-black/10 dark:ring-white/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-surface-100 dark:border-surface-700 mb-2.5">
                      <span className="text-xs font-bold flex items-center gap-1.5 text-surface-900 dark:text-white">
                        <Coffee className="w-3.5 h-3.5 text-amber-500" />
                        Edit Buffer / Break
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="p-1 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Label Input */}
                    <div className="space-y-1 mb-2.5">
                      <label className="text-[10px] font-bold text-surface-500 uppercase">
                        Label / Activity:
                      </label>
                      <input
                        type="text"
                        value={tempLabel}
                        onChange={(e) => setTempLabel(e.target.value)}
                        placeholder="e.g. Lunch Break, Coffee Stop..."
                        className="w-full bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        {["Rest Break", "Coffee / Snack", "Lunch Break", "Buffer Time"].map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => setTempLabel(chip)}
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-600 hover:border-amber-400 transition-colors"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration input */}
                    <div className="space-y-1.5 mb-3">
                      <label className="text-[10px] font-bold text-surface-500 uppercase">
                        Duration:
                      </label>
                      <div className="flex items-center border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-surface-50 dark:bg-surface-900">
                        <button
                          type="button"
                          onClick={() => setTempDuration((m) => Math.max(5, m - 15))}
                          className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors"
                        >
                          -15
                        </button>
                        <input
                          type="number"
                          min="5"
                          max="480"
                          step="5"
                          value={tempDuration}
                          onChange={(e) => setTempDuration(Math.max(5, parseInt(e.target.value) || 5))}
                          className="flex-1 min-w-0 bg-transparent text-center text-xs font-bold text-surface-900 dark:text-white py-1 focus:outline-none"
                        />
                        <span className="text-[10px] text-surface-400 dark:text-surface-500 pr-2 font-medium">
                          min
                        </span>
                        <button
                          type="button"
                          onClick={() => setTempDuration((m) => m + 15)}
                          className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors"
                        >
                          +15
                        </button>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {[15, 30, 45, 60, 90].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setTempDuration(preset)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${tempDuration === preset
                              ? "bg-amber-600 text-white border-amber-600"
                              : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-600"
                              }`}
                          >
                            {preset}m
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-surface-100 dark:border-surface-700">
                      <button
                        type="button"
                        onClick={() => {
                          onDelete();
                          setIsEditing(false);
                        }}
                        className="text-xs text-red-500 hover:text-red-600 font-semibold px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      >
                        Delete
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="px-2.5 py-1 text-xs font-semibold text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdate({ label: tempLabel, duration: tempDuration });
                            setIsEditing(false);
                          }}
                          className="px-3 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-md shadow-2xs transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
