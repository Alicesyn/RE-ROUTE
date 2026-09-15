import React, { useState, useEffect } from "react";
import {
  Clock,
  Timer,
  Lock,
  Pencil,
  X,
  Trash2,
  PlaneLanding,
  PlaneTakeoff,
} from "lucide-react";
import { formatTime } from "./scheduleTimeUtils";

export interface BufferPillProps {
  minutes: number;
  startTime?: number;
  label?: string;
  showLine?: boolean;
  isReservation?: boolean;
  type?: "arrival" | "departure" | "reservation" | "custom" | "wait";
  stopName?: string;
  reservationTime?: string;
  customLabel?: string;
  onSaveMinutes?: (newMinutes: number) => void;
  onSaveReservationTime?: (newTime: string) => void;
  onSaveLabel?: (newLabel: string) => void;
  onDelete?: () => void;
}

export const BufferPill: React.FC<BufferPillProps> = ({
  minutes,
  startTime,
  label,
  showLine = true,
  isReservation = false,
  type,
  stopName,
  reservationTime,
  customLabel,
  onSaveMinutes,
  onSaveReservationTime,
  onSaveLabel,
  onDelete,
}) => {
  const isEditable = !!(onSaveMinutes || onSaveReservationTime || onSaveLabel || onDelete);
  const [isOpen, setIsOpen] = useState(false);
  const [tempMinutes, setTempMinutes] = useState(minutes);
  const [tempReservationTime, setTempReservationTime] = useState(reservationTime || "");
  const [tempLabel, setTempLabel] = useState(customLabel || "");

  useEffect(() => {
    if (!isOpen) {
      setTempMinutes(minutes);
      if (reservationTime) setTempReservationTime(reservationTime);
      if (customLabel !== undefined) setTempLabel(customLabel);
    }
  }, [minutes, reservationTime, customLabel, isOpen]);

  const presets =
    type === "departure"
      ? [30, 45, 60, 90, 120, 180]
      : [15, 30, 45, 60, 90, 120];

  const handleSave = () => {
    if (onSaveMinutes) {
      onSaveMinutes(tempMinutes);
    }
    if (isReservation && onSaveReservationTime && tempReservationTime) {
      onSaveReservationTime(tempReservationTime);
    }
    if (onSaveLabel) {
      onSaveLabel(tempLabel);
    }
    setIsOpen(false);
  };

  return (
    <div className={`pt-0 pb-3 pl-12 relative group flex items-center justify-between gap-2 ${isOpen ? "z-50" : ""}`}>
      {/* Line connector segment */}
      {showLine && (
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-surface-200 dark:bg-surface-700/50" />
      )}

      {/* Interactive Buffer Pill */}
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            if (!isEditable) return;
            e.stopPropagation();
            setTempMinutes(minutes);
            if (reservationTime) setTempReservationTime(reservationTime);
            if (customLabel !== undefined) setTempLabel(customLabel);
            setIsOpen((prev) => !prev);
          }}
          disabled={!isEditable}
          className={`travel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight border shadow-2xs transition-all ${isEditable
            ? "cursor-pointer hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-xs hover:scale-[1.02] active:scale-[0.98]"
            : "cursor-default"
            } ${isReservation
              ? "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-300"
              : type === "wait"
                ? "bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200"
                : type === "custom"
                  ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200"
                  : "bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300"
            }`}
          title={isEditable ? `Click to edit buffer (${minutes}m)` : label || undefined}
        >
          {isReservation ? (
            <Lock className="w-3 h-3 text-purple-500 shrink-0" />
          ) : type === "wait" ? (
            <Clock className="w-3 h-3 text-amber-500 shrink-0" />
          ) : type === "custom" ? (
            <Timer className="w-3 h-3 text-amber-500 shrink-0" />
          ) : (
            <Clock className="w-3 h-3 text-surface-400 shrink-0" />
          )}
          <span>{label || `${minutes} min buffer`}</span>
          {startTime !== undefined && (
            <span className="font-mono text-[9px] lowercase opacity-75 font-semibold">
              ({formatTime(startTime)} – {formatTime(startTime + minutes)})
            </span>
          )}
          {isEditable && (
            <Pencil className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100 hover:opacity-100 transition-opacity text-primary-500 dark:text-primary-400" />
          )}
        </button>

        {/* Inline Buffer Edit Popover */}
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />
            <div
              className="absolute left-0 top-full mt-2 z-50 w-72 bg-white dark:bg-surface-850 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 p-3.5 text-surface-900 dark:text-white ring-1 ring-black/10 dark:ring-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-surface-100 dark:border-surface-700 mb-2.5">
                <span className="text-xs font-bold flex items-center gap-1.5 text-surface-900 dark:text-white">
                  {type === "arrival" ? (
                    <>
                      <PlaneLanding className="w-3.5 h-3.5 text-emerald-500" />
                      Arrival Buffer Time
                    </>
                  ) : type === "departure" ? (
                    <>
                      <PlaneTakeoff className="w-3.5 h-3.5 text-red-500" />
                      Departure Airport Buffer
                    </>
                  ) : isReservation ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      Reservation Buffer
                    </>
                  ) : type === "custom" ? (
                    <>
                      <Timer className="w-3.5 h-3.5 text-amber-500" />
                      Custom Day Buffer
                    </>
                  ) : (
                    <>
                      <Timer className="w-3.5 h-3.5 text-primary-500" />
                      Edit Buffer Time
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[11px] text-surface-600 dark:text-surface-300 mb-3 leading-snug">
                {type === "arrival"
                  ? "Time needed after landing for customs, baggage claim, and transit exit before sightseeing begins."
                  : type === "departure"
                    ? "Airport lead time required before flight takeoff for check-in, bag drop, and security screening."
                    : isReservation
                      ? `Free time gap before locked reservation${stopName ? ` at ${stopName}` : ""}.`
                      : "Custom buffer allocated in this day's schedule to prevent fatigue or cushion transit delays."}
              </p>

              {/* Custom Label editing if available */}
              {onSaveLabel && (
                <div className="space-y-1.5 mb-3">
                  <label className="text-[11px] font-bold text-surface-500 uppercase tracking-tight">
                    Buffer Label:
                  </label>
                  <input
                    type="text"
                    value={tempLabel}
                    onChange={(e) => setTempLabel(e.target.value)}
                    placeholder="e.g. Lunch Break, Coffee Stop..."
                    className="w-full bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                    {["Rest Break", "Coffee / Snack", "Lunch Break", "Buffer Time"].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setTempLabel(suggestion)}
                        className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:border-primary-400 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Number stepper and input */}
              {onSaveMinutes && (
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-surface-500 uppercase tracking-tight shrink-0">
                      Duration:
                    </label>
                    <div className="flex items-center flex-1 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-surface-50 dark:bg-surface-900">
                      <button
                        type="button"
                        onClick={() => setTempMinutes((m) => Math.max(0, m - 15))}
                        className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors"
                        title="-15 minutes"
                      >
                        -15
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="480"
                        step="5"
                        value={tempMinutes}
                        onChange={(e) => setTempMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                        className="flex-1 min-w-0 bg-transparent text-center text-xs font-bold text-surface-900 dark:text-white py-1 focus:outline-none"
                      />
                      <span className="text-[10px] text-surface-400 dark:text-surface-500 pr-2 font-medium">
                        min
                      </span>
                      <button
                        type="button"
                        onClick={() => setTempMinutes((m) => m + 15)}
                        className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors"
                        title="+15 minutes"
                      >
                        +15
                      </button>
                    </div>
                  </div>

                  {/* Preset chips */}
                  <div className="flex items-center gap-1 flex-wrap pt-1">
                    <span className="text-[10px] font-semibold text-surface-400 mr-0.5">Presets:</span>
                    {presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTempMinutes(preset)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${tempMinutes === preset
                          ? "bg-primary-600 text-white border-primary-600"
                          : "bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700 hover:bg-surface-200 dark:hover:bg-surface-700"
                          }`}
                      >
                        {preset}m
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reservation time adjustment if applicable */}
              {isReservation && onSaveReservationTime && (
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-surface-500 uppercase tracking-tight shrink-0">
                      Reservation:
                    </label>
                    <input
                      type="time"
                      value={tempReservationTime}
                      onChange={(e) => setTempReservationTime(e.target.value)}
                      className="flex-1 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 py-1 text-xs font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onDelete();
                    }}
                    className="text-xs font-bold text-red-500 hover:text-red-700 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                ) : <span />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-2.5 py-1 text-xs font-semibold text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="px-3 py-1 text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-md shadow-2xs transition-colors"
                  >
                    Save Buffer
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right-aligned ETA time badge */}
      {startTime !== undefined && (
        <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 text-surface-800 dark:text-surface-100 shadow-2xs shrink-0">
          {formatTime(startTime)}
        </span>
      )}
    </div>
  );
};
