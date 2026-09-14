import React, { useState } from "react";
import { useRouteStore } from "../../store/useRouteStore";
import {
  Clock,
  Building2,
  Wand2,
  X,
  Timer,
  Car,
  Footprints,
  Train,
  ChevronDown,
  PlaneTakeoff,
  PlaneLanding,
  GripVertical,
  AlertTriangle,
  Loader2,
  Pin,
  Coins,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Coffee,
  Star,
  Utensils,
  CalendarDays,
  Check,
} from "lucide-react";
import { toast } from "../../services/toastService";
import { TravelMode, RouteSegment, CustomBuffer, Place } from "../../types";
import { getCategoryEmoji } from "../../utils/categoryUtils";
import { formatMultiRangeBadge } from "../../utils/dayRangeUtils";
import { format, addDays, parseISO } from "date-fns";
import { checkTimeConflict } from "../../utils/timeUtils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlaceHighlightBadge } from "../common/PlaceHighlightBadge";
import { ReservationBadge } from "../common/ReservationBadge";

const EditPlaceModal = React.lazy(() =>
  import("./EditPlaceModal").then((m) => ({ default: m.EditPlaceModal }))
);

const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const formatMinutesTo24h = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.floor(totalMinutes % 60);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

const formatTime = (totalMinutes: number) => {
  const { timeFormat } = useRouteStore.getState();
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.floor(totalMinutes % 60);

  if (timeFormat === "24h") {
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
};

const formatTimeString = (timeStr: string) => {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  return formatTime(h * 60 + m);
};

interface BufferPillProps {
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

const BufferPill: React.FC<BufferPillProps> = ({
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

  React.useEffect(() => {
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

const SortableCustomBuffer: React.FC<{
  buffer: CustomBuffer;
  startTime?: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (updates: Partial<CustomBuffer>) => void;
  onDelete: () => void;
}> = React.memo(({ buffer, startTime, isFirst, isLast, onUpdate, onDelete }) => {
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

  React.useEffect(() => {
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
});

const ExpandableDescription: React.FC<{ text: any }> = ({ text }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const rawText =
    typeof text === "string"
      ? text
      : text && typeof text === "object" && "text" in text
        ? String(text.text)
        : text && typeof text === "object"
          ? JSON.stringify(text)
          : String(text || "");

  if (!rawText.trim()) return null;

  const shouldTruncate = rawText.length > 100;

  return (
    <div className="relative">
      <p
        className={`text-xs text-surface-500 dark:text-surface-400 leading-relaxed ${!isExpanded && shouldTruncate ? "line-clamp-2" : ""}`}
      >
        {rawText}
      </p>
      {shouldTruncate && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="text-[10px] font-bold text-primary-600 dark:text-primary-400 hover:underline mt-1"
        >
          {isExpanded ? "Show Less" : "Show More"}
        </button>
      )}
    </div>
  );
};

interface SortableStopProps {
  stop: any;
  stopArrivalTime: number;
  isFirst: boolean;
  isLast: boolean;
  unassignPlace: (id: string) => void;
  updatePlace: (id: string, updates: any) => void;
  dayIndex: number;
  dateMode: "fixed" | "duration";
  currentDate: Date;
  onEdit: (id: string) => void;
  mealGapAlert?: { gap: number; minGap: number } | null;
}

const areSortableStopPropsEqual = (
  prev: SortableStopProps,
  next: SortableStopProps,
) => {
  return (
    prev.stop === next.stop &&
    prev.stopArrivalTime === next.stopArrivalTime &&
    prev.isFirst === next.isFirst &&
    prev.isLast === next.isLast &&
    prev.dayIndex === next.dayIndex &&
    prev.dateMode === next.dateMode &&
    prev.currentDate?.getTime() === next.currentDate?.getTime() &&
    prev.unassignPlace === next.unassignPlace &&
    prev.updatePlace === next.updatePlace &&
    prev.onEdit === next.onEdit &&
    prev.mealGapAlert?.gap === next.mealGapAlert?.gap &&
    prev.mealGapAlert?.minGap === next.mealGapAlert?.minGap
  );
};

const SortableStop: React.FC<SortableStopProps> = React.memo(
  ({
    stop,
    stopArrivalTime,
    isFirst,
    isLast,
    unassignPlace,
    updatePlace,
    dayIndex,
    dateMode,
    currentDate,
    onEdit,
    mealGapAlert,
  }) => {
    const startDate = useRouteStore((s) => s.startDate);
    const timeConflict =
      dateMode === "fixed"
        ? checkTimeConflict(stopArrivalTime, stop.estimatedDuration || 60, stop.openingHours, currentDate)
        : { hasConflict: false };

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: stop.id });

    const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
    const [tempTime, setTempTime] = useState(
      stop.customTime || formatMinutesTo24h(stopArrivalTime)
    );

    const isCustomTime = !!stop.customTime;
    const customTimeMinutes = isCustomTime ? parseTimeToMinutes(stop.customTime) : null;
    const isLate = isCustomTime && stopArrivalTime > (customTimeMinutes ?? 0);
    const lateMinutes = isLate ? stopArrivalTime - (customTimeMinutes ?? 0) : 0;

    const openUpward = isLast && !isFirst;

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 60 : isTimeModalOpen ? 50 : 1,
      position: "relative" as const,
      opacity: isDragging ? 0.3 : 1,
      scale: isDragging ? 1.02 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`relative group ${isDragging ? "cursor-grabbing" : ""} ${isTimeModalOpen ? "z-50" : ""}`}
      >
        {/* Visual Drop Indicator */}
        {isDragging && (
          <div className="absolute inset-x-0 -top-2 h-1 bg-primary-500/50 rounded-full blur-[1px] animate-pulse" />
        )}

        {/* Line connector */}
        <div
          className={`absolute left-5 w-0.5 bg-surface-200 dark:bg-surface-700/50 ${isFirst ? "top-5" : "top-0"} ${isLast ? "h-5" : "bottom-0"}`}
        />

        <div className="flex gap-4 relative z-10">
          <div className="relative z-20">
            <button
              onClick={() => onEdit(stop.id)}
              className="w-10 h-10 rounded-full bg-white dark:bg-surface-800 border-2 border-surface-100 dark:border-surface-700 flex items-center justify-center shrink-0 shadow-sm hover:border-primary-500 group-hover:border-primary-500 transition-colors"
              title="Edit Place Details"
            >
              <span className="text-sm">{getCategoryEmoji(stop.category)}</span>
            </button>

            {/* Drag Handle */}
            <div
              {...attributes}
              {...listeners}
              className="absolute -left-6 top-5 -translate-y-1/2 p-1.5 text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:hover:text-surface-200 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 hover:opacity-100 transition-opacity touch-none"
              title="Drag to reorder"
            >
              <GripVertical className="w-4 h-4" />
            </div>
          </div>

          <div className="flex-1 min-w-0 pt-0.5 pb-4">
            <div className="flex items-center justify-between gap-2 relative">
              <button
                onClick={() => onEdit(stop.id)}
                className="text-sm font-bold text-surface-900 dark:text-white truncate hover:text-primary-600 group-hover:text-primary-600 transition-colors text-left outline-none focus:ring-2 focus:ring-primary-500 rounded flex-1 min-w-0"
                title="Edit Place Details"
              >
                <span className="truncate block">
                  {stop.name}
                  {stop.romanizedName && stop.romanizedName.toLowerCase() !== stop.name.toLowerCase() && (
                    <span className="ml-1.5 text-xs font-normal text-surface-500 dark:text-surface-400 italic">
                      ({stop.romanizedName})
                    </span>
                  )}
                </span>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {timeConflict.hasConflict && (
                  <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-bold border border-red-200 dark:border-red-800"
                    title={timeConflict.reason}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span className="hidden sm:inline">Closed</span>
                  </div>
                )}
                {mealGapAlert && (
                  <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[10px] font-bold border border-amber-200 dark:border-amber-800"
                    title={`Only ${mealGapAlert.gap}m since previous meal (minimum recommended: ${mealGapAlert.minGap}m)`}
                  >
                    <Utensils className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span className="hidden sm:inline">{mealGapAlert.gap}m meal gap</span>
                  </div>
                )}
                {/* Star / Must-Visit Priority Toggle Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePlace(stop.id, { isStarred: !stop.isStarred });
                  }}
                  className={`p-1 rounded transition-colors ${stop.isStarred
                    ? "bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                    : "text-surface-300 dark:text-surface-600 hover:text-amber-500 dark:hover:text-amber-400 opacity-0 group-hover:opacity-100 hover:bg-surface-100 dark:hover:bg-surface-700"
                    }`}
                  title={stop.isStarred ? "Must-visit (Starred). Optimizer prioritizes and will never drop this stop." : "Star as Must-Visit (optimizer prioritizes and guarantees this place)"}
                  aria-label={stop.isStarred ? "Unstar stop" : "Star stop as must-visit"}
                >
                  <Star className={`w-3.5 h-3.5 ${stop.isStarred ? "fill-amber-400 text-amber-500" : ""}`} />
                </button>
                {/* Pin Toggle Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePlace(stop.id, { pinnedToDay: !stop.pinnedToDay });
                  }}
                  className={`p-1 rounded transition-colors ${stop.pinnedToDay
                    ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                    : "text-surface-300 dark:text-surface-600 hover:text-amber-600 dark:hover:text-amber-400 opacity-0 group-hover:opacity-100 hover:bg-surface-100 dark:hover:bg-surface-700"
                    }`}
                  title={stop.pinnedToDay ? "Pinned to this day (click to unpin)" : "Pin to this day (prevent optimizer from moving)"}
                  aria-label={stop.pinnedToDay ? "Unpin stop from this day" : "Pin stop to this day"}
                >
                  <Pin className={`w-3.5 h-3.5 ${stop.pinnedToDay ? "fill-current" : ""}`} />
                </button>
                {/* Remove from day Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    unassignPlace(stop.id);
                  }}
                  className="p-1 text-surface-300 dark:text-surface-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove from day"
                  aria-label="Remove stop from day"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Arrival Time Badge / Custom Time Lock Button */}
                <div className="relative inline-block ml-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTempTime(stop.customTime || formatMinutesTo24h(stopArrivalTime));
                      setIsTimeModalOpen((prev) => !prev);
                    }}
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded flex items-center gap-1 transition-all border shadow-2xs ${isCustomTime
                      ? "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700/80 hover:bg-purple-200/80 dark:hover:bg-purple-900/60"
                      : "bg-surface-100 dark:bg-surface-800 text-surface-800 dark:text-surface-100 border-surface-200 dark:border-surface-700 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-300"
                      }`}
                    title={
                      isCustomTime
                        ? `Locked reservation time at ${formatTimeString(stop.customTime)}. Click to edit or unlock.`
                        : "Calculated arrival time. Click to lock custom reservation time."
                    }
                  >
                    {isCustomTime && <Lock className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400 shrink-0" />}
                    <span>{isCustomTime ? formatTimeString(stop.customTime) : formatTime(stopArrivalTime)}</span>
                    {isCustomTime && <span className="text-[9px] font-semibold opacity-75 uppercase">Locked</span>}
                  </button>

                  {/* Time Lock Popover */}
                  {isTimeModalOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40 bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTimeModalOpen(false);
                        }}
                      />
                      <div
                        className={`absolute right-0 ${openUpward ? "bottom-full mb-2" : "top-full mt-2"
                          } z-50 w-72 bg-white dark:bg-surface-850 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 p-3.5 text-surface-900 dark:text-white ring-1 ring-black/10 dark:ring-white/10`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-surface-100 dark:border-surface-700 mb-2.5">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-surface-900 dark:text-white">
                            <Lock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            Locked Reservation Time
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsTimeModalOpen(false)}
                            className="p-1 rounded text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <p className="text-[11px] text-surface-600 dark:text-surface-300 mb-3 leading-snug">
                          Fix this place to an exact time. The optimizer will schedule other stops around it and will not move this place.
                        </p>

                        <div className="flex items-center gap-2 mb-3">
                          <label className="text-xs font-bold text-surface-600 dark:text-surface-300 uppercase shrink-0">Time:</label>
                          <input
                            type="time"
                            value={tempTime}
                            onChange={(e) => setTempTime(e.target.value)}
                            className="flex-1 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
                          {isCustomTime ? (
                            <button
                              type="button"
                              onClick={async () => {
                                updatePlace(stop.id, { customTime: undefined });
                                setIsTimeModalOpen(false);
                                toast.info(`Removed locked time for ${stop.name}.`);
                                try {
                                  await useRouteStore.getState().optimizeDay(dayIndex);
                                } catch (e) {
                                  console.error("Failed to re-optimize day after unlocking time", e);
                                }
                              }}
                              className="text-xs font-bold text-red-500 hover:text-red-700 hover:underline"
                            >
                              Unlock
                            </button>
                          ) : <span />}

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsTimeModalOpen(false)}
                              className="px-2.5 py-1 text-xs font-semibold text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (tempTime) {
                                  updatePlace(stop.id, { customTime: tempTime, pinnedToDay: true });
                                  setIsTimeModalOpen(false);
                                  toast.success(`Locked ${stop.name} to ${formatTimeString(tempTime)}.`);
                                  try {
                                    await useRouteStore.getState().optimizeDay(dayIndex);
                                  } catch (e) {
                                    console.error("Failed to re-optimize day after setting custom time", e);
                                  }
                                }
                              }}
                              className="px-3 py-1 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-md shadow-2xs transition-colors"
                            >
                              Lock Time
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap relative">
              {/* Late Arrival Warning */}
              {isLate && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80"
                  title={`Reservation is locked at ${formatTimeString(stop.customTime)}, but estimated arrival from previous stops is ${formatTime(stopArrivalTime)}`}
                >
                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Late by {lateMinutes}m</span>
                </span>
              )}

              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-tight flex items-center gap-1">
                <Timer className="w-2.5 h-2.5" />
                {stop.estimatedDuration || 60}m visit
              </span>
              {stop.priceEstimate && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border ${stop.priceEstimate.toLowerCase().includes("free")
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                    : "bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700"
                    }`}
                  title={`Estimated price: ${stop.priceEstimate}`}
                >
                  <Coins className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                  {stop.priceEstimate}
                </span>
              )}
              {stop.allowedDayRanges && stop.allowedDayRanges.length > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 border bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80 shadow-2xs"
                  title={`Constrained by user to ${formatMultiRangeBadge(stop.allowedDayRanges, startDate).fullLabel}`}
                >
                  <CalendarDays className="w-2.5 h-2.5 text-indigo-500" />
                </span>
              )}
              {stop.reservation && (
                <ReservationBadge reservation={stop.reservation} compact />
              )}
            </div>

            {(stop.description || (Array.isArray(stop.openingHours) && stop.openingHours.length > 0)) && (
              <div className="mt-1 space-y-1">
                {stop.description && <ExpandableDescription text={stop.description} />}
                {Array.isArray(stop.openingHours) && stop.openingHours.length > 0 && (
                  <div
                    className="inline-flex items-center gap-1 text-[10px] text-surface-400 dark:text-surface-500 cursor-help"
                    title={stop.openingHours.filter((h: any) => typeof h === "string").join("\n")}
                  >
                    <Clock className="w-3 h-3" />
                    <span>View Hours</span>
                  </div>
                )}
              </div>
            )}

            {/* Contextual Highlight (Must-Try, Photo Spot, etc.) - Always visible, never cut off */}
            {stop.highlight && stop.highlight.text && (
              <div className="mt-2">
                <PlaceHighlightBadge
                  highlight={stop.highlight}
                  category={stop.category}
                  compact
                  onEdit={() => onEdit(stop.id)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, areSortableStopPropsEqual);

const SortableAnchor: React.FC<{
  id: string;
  type: "arrival" | "departure" | "start-hotel" | "end-hotel";
  name: string;
  time?: string;
  calculatedTime?: number;
  buffer?: number;
  bufferStartTime?: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdateBuffer?: (newBuffer: number) => void;
}> = React.memo(({ id, type, name, time, calculatedTime, buffer, bufferStartTime, isFirst, isLast, onUpdateBuffer }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    position: "relative" as const,
    opacity: isDragging ? 0.3 : 1,
    scale: isDragging ? 1.02 : 1,
  };

  const getIcon = () => {
    switch (type) {
      case "arrival":
        return <PlaneLanding className="w-5 h-5" />;
      case "departure":
        return <PlaneTakeoff className="w-5 h-5" />;
      default:
        return <Building2 className="w-5 h-5" />;
    }
  };

  const getColors = () => {
    switch (type) {
      case "arrival":
        return "bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400";
      case "departure":
        return "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400";
      default:
        return "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400";
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? "cursor-grabbing" : ""}`}
    >
      {/* Visual Drop Indicator */}
      {isDragging && (
        <div className="absolute inset-x-0 -top-2 h-1 bg-primary-500/50 rounded-full blur-[1px] animate-pulse" />
      )}

      {/* Line connector */}
      <div
        className={`absolute left-5 w-0.5 bg-surface-200 dark:bg-surface-700/50 ${type === "departure"
          ? "top-0 bottom-6"
          : isFirst
            ? "top-5"
            : isLast
              ? "h-5"
              : "bottom-0"
          }`}
      />

      {/* Pre-flight Departure Buffer rendered BEFORE Trip Departure icon */}
      {type === "departure" && buffer !== undefined && (
        <BufferPill
          minutes={buffer}
          startTime={bufferStartTime ?? (time ? parseTimeToMinutes(time) - buffer : calculatedTime)}
          label={`${buffer} min buffer before flight`}
          showLine={false}
          type="departure"
          onSaveMinutes={onUpdateBuffer}
        />
      )}

      <div className="flex items-start gap-4 relative z-20">
        <div className="relative">
          <div
            className={`w-10 h-10 rounded-full ${getColors()} flex items-center justify-center shrink-0 shadow-sm border border-white/50 dark:border-surface-700`}
          >
            {getIcon()}
          </div>

          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="absolute -left-6 top-5 -translate-y-1/2 p-1.5 text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:hover:text-surface-200 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 hover:opacity-100 transition-opacity touch-none"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </div>
        </div>

        <div className="flex-1 min-w-0 pt-0.5 pb-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-surface-900 dark:text-white truncate">
              {name}
            </h4>
            {time && (
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 text-surface-800 dark:text-surface-100 shadow-2xs shrink-0">
                {formatTimeString(time)}
              </span>
            )}
            {calculatedTime !== undefined && (
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 text-surface-800 dark:text-surface-100 shadow-2xs shrink-0">
                {formatTime(calculatedTime)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-surface-500 uppercase font-bold tracking-tight">
            {type === "arrival"
              ? "Airport/Station Arrival"
              : type === "departure"
                ? "Trip Departure"
                : type === "start-hotel"
                  ? "Day Start / Hotel"
                  : "Day End / Hotel"}
          </p>
        </div>
      </div>

      {/* Post-arrival buffer rendered AFTER Arrival icon */}
      {type !== "departure" && buffer !== undefined && (
        <BufferPill
          minutes={buffer}
          startTime={bufferStartTime ?? (time ? parseTimeToMinutes(time) : calculatedTime)}
          label={
            type === "arrival"
              ? `${buffer} min buffer after landing`
              : `${buffer} min buffer`
          }
          showLine={!isLast}
          type={type === "arrival" ? "arrival" : undefined}
          onSaveMinutes={onUpdateBuffer}
        />
      )}
    </div>
  );
});

const SegmentPill: React.FC<{
  segment: RouteSegment;
  dayIndex: number;
  segmentIndex: number;
}> = React.memo(({ segment, dayIndex, segmentIndex }) => {
  const updateSegmentTravelMode = useRouteStore((s) => s.updateSegmentTravelMode);
  const distanceUnit = useRouteStore((s) => s.distanceUnit);

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateSegmentTravelMode(
      dayIndex,
      segmentIndex,
      e.target.value as TravelMode,
    );
  };

  const isHeuristicTransit = segment.travelMode === "transit" && segment.isHeuristic !== false;

  const getModeIcon = () => {
    switch (segment.travelMode) {
      case "walking":
        return <Footprints className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case "transit":
        return <Train className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />;
      case "driving":
      default:
        return <Car className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />;
    }
  };

  return (
    <div className="pt-0 pb-3 pl-12 relative group">
      {/* Line connector segment - always full height for segments as they are intermediate */}
      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-surface-200 dark:bg-surface-700/50" />
      <div
        className={`travel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer relative overflow-hidden shadow-2xs ${isHeuristicTransit
          ? "bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-600/70 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60"
          : "bg-surface-50 hover:bg-surface-100 dark:bg-surface-700/90 dark:hover:bg-surface-600 border border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-100"
          }`}
        title={
          isHeuristicTransit
            ? `Estimated Transit: Live transit APIs return ZERO_RESULTS for Japan transit or are offline. Time is estimated geometrically (~${distanceUnit === "imperial" ? "11 mph local / ~101 mph express" : "18 km/h local / ~162 km/h express"}) without real-time train timetables or megastation transfer times.`
            : "Click to change travel mode (Driving, Transit, Walking)"
        }
      >
        {getModeIcon()}
        <span className="font-semibold text-surface-900 dark:text-surface-100">{Math.round(segment.time / 60)} min</span>

        <span className="text-surface-300 dark:text-surface-500 mx-0.5">•</span>
        <span className="text-surface-600 dark:text-surface-300">
          {(() => {
            const dist = segment.distance;
            if (distanceUnit === "imperial") {
              const ft = dist * 3.28084;
              if (ft >= 100) {
                const mi = ft / 5280;
                return `${mi < 0.1 ? mi.toFixed(2) : mi.toFixed(1)} mi`;
              }
              return `${Math.round(ft)} ft`;
            } else {
              if (dist >= 30) {
                const km = dist / 1000;
                return `${km < 0.1 ? km.toFixed(2) : km.toFixed(1)} km`;
              }
              return `${Math.round(dist)} m`;
            }
          })()}
        </span>

        <ChevronDown className="w-3.5 h-3.5 text-surface-400 dark:text-surface-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors ml-0.5 shrink-0" />

        <select
          value={segment.travelMode || "driving"}
          onChange={handleModeChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-white dark:bg-surface-800 text-surface-900 dark:text-white"
          title="Change travel mode for this segment"
        >
          <option value="driving" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white py-1">
            🚗 Driving
          </option>
          <option value="transit" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white py-1">
            🚆 Transit
          </option>
          <option value="walking" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white py-1">
            🚶 Walking
          </option>
        </select>
      </div>
    </div>
  );
});


export const DailySchedule: React.FC = () => {
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [optimizingDayIndex, setOptimizingDayIndex] = useState<number | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [addBufferDayIndex, setAddBufferDayIndex] = useState<number | null>(null);
  const [newBufferDuration, setNewBufferDuration] = useState<number>(30);
  const [newBufferLabel, setNewBufferLabel] = useState<string>("Rest Break");
  const [inlineBufferAfter, setInlineBufferAfter] = useState<{ dayIndex: number; afterId: string } | null>(null);
  const [inlineDuration, setInlineDuration] = useState<number>(30);
  const [inlineLabel, setInlineLabel] = useState<string>("Rest Break");

  const optimizedRoutes = useRouteStore((s) => s.optimizedRoutes);
  const optimizeDay = useRouteStore((s) => s.optimizeDay);
  const clearOptimizedSchedule = useRouteStore((s) => s.clearOptimizedSchedule);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const unassignPlace = useRouteStore((s) => s.unassignPlace);
  const updatePlace = useRouteStore((s) => s.updatePlace);
  const reorderDayStops = useRouteStore((s) => s.reorderDayStops);
  const customBuffers = useRouteStore((s) => s.customBuffers);
  const addCustomBuffer = useRouteStore((s) => s.addCustomBuffer);
  const updateCustomBuffer = useRouteStore((s) => s.updateCustomBuffer);
  const deleteCustomBuffer = useRouteStore((s) => s.deleteCustomBuffer);
  const startDate = useRouteStore((s) => s.startDate);
  const dateMode = useRouteStore((s) => s.dateMode);
  const dayStartTime = useRouteStore((s) => s.dayStartTime);
  const dayEndTime = useRouteStore((s) => s.dayEndTime);
  const showFlights = useRouteStore((s) => s.showFlights);
  const arrivalFlight = useRouteStore((s) => s.arrivalFlight);
  const setArrivalFlight = useRouteStore((s) => s.setArrivalFlight);
  const departureFlight = useRouteStore((s) => s.departureFlight);
  const setDepartureFlight = useRouteStore((s) => s.setDepartureFlight);
  const distanceUnit = useRouteStore((s) => s.distanceUnit);
  const categoryConfigs = useRouteStore((s) => s.categoryConfigs);
  const dayTitles = useRouteStore((s) => s.dayTitles);
  const setDayTitle = useRouteStore((s) => s.setDayTitle);

  const [editingDayTitleIndex, setEditingDayTitleIndex] = useState<number | null>(null);
  const [editingDayTitleText, setEditingDayTitleText] = useState<string>("");
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  const startEditingDayTitle = (dayIndex: number, currentTitle?: string) => {
    setEditingDayTitleIndex(dayIndex);
    setEditingDayTitleText(currentTitle || "");
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 50);
  };

  const handleSaveDayTitle = (dayIndex: number) => {
    const trimmed = editingDayTitleText.trim();
    setDayTitle(dayIndex, trimmed);
    setEditingDayTitleIndex(null);
    if (trimmed) {
      toast.success(`Day ${dayIndex + 1} named "${trimmed}"!`, "Day Renamed");
    } else {
      toast.info(`Day ${dayIndex + 1} reset to default title.`);
    }
  };

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const handleEditPlace = React.useCallback((id: string) => {
    setEditingPlaceId(id);
  }, []);

  // Prevent mouse wheel controls from scrolling the horizontal schedule;
  // it can now only be moved by dragging/clicking the horizontal scrollbar or using Jump-to buttons.
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent horizontal wheel events (e.g. mouse tilt/thumb wheel, Shift + wheel)
      // from scrolling this container horizontally so only the scrollbar moves it.
      if (e.deltaX !== 0 || e.shiftKey) {
        e.preventDefault();
      }
      // Standard vertical mouse wheel (e.deltaY) is not intercepted,
      // allowing it to scroll the page or inner stops list naturally.
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const hasHeuristicTransit = optimizedRoutes.some((r) =>
    r.segments.some((s) => s.travelMode === "transit" && s.isHeuristic !== false)
  );

  const handleOptimizeSingleDay = async (dayIndex: number) => {
    if (optimizingDayIndex !== null) return;
    setOptimizingDayIndex(dayIndex);
    try {
      await optimizeDay(dayIndex);
      toast.success(`Day ${dayIndex + 1} route re-optimized!`, "Day Optimized");
    } catch (err: any) {
      toast.error(err?.message || `Failed to optimize Day ${dayIndex + 1}`, "Optimization Error");
    } finally {
      setOptimizingDayIndex(null);
    }
  };

  const handleClearSchedule = () => {
    clearOptimizedSchedule();
    setShowClearConfirm(false);
    toast.info("Optimized schedule cleared. All places returned to unassigned pool.", "Schedule Cleared");
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
    }),
  );

  if (optimizedRoutes.length === 0) return null;

  // Calculate day total in minutes
  const [startH, startM] = dayStartTime.split(":").map(Number);
  const [endH, endM] = dayEndTime.split(":").map(Number);
  let baseDayMinutes = endH * 60 + endM - (startH * 60 + startM);
  if (baseDayMinutes < 0) baseDayMinutes += 24 * 60; // Handle overnight

  const scrollToDay = (dayIndex: number) => {
    const element = document.getElementById(`schedule-day-${dayIndex}`);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  };

  return (
    <>
      <div className="schedule-container">
        <div className="px-6 py-3 border-b border-surface-100 dark:border-surface-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-50 dark:bg-surface-800 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-surface-900 dark:text-white">
              Optimized Schedule
            </h2>

            {hasHeuristicTransit && (
              <button
                onClick={() => setIsBannerDismissed((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${!isBannerDismissed
                  ? "bg-amber-100/90 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700/80 shadow-2xs hover:bg-amber-200/80 dark:hover:bg-amber-900/70"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700/80 hover:bg-amber-100/80 dark:hover:bg-amber-900/60 shadow-2xs"
                  }`}
                title={
                  isBannerDismissed
                    ? "Click to view notice: Why are transit times orange & estimated?"
                    : "Click to hide transit notice"
                }
                aria-label="Toggle orange transit notice"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Orange Transit = Estimated</span>
                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-200/70 dark:bg-amber-900/70 px-1.5 py-0.5 rounded-full">
                  {!isBannerDismissed ? "Hide Notice" : "Why?"}
                </span>
              </button>
            )}

            {showClearConfirm ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 rounded-lg animate-in fade-in zoom-in-95 duration-150">
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">Clear all days?</span>
                <button
                  type="button"
                  onClick={handleClearSchedule}
                  className="px-2 py-0.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded transition-colors shadow-2xs cursor-pointer"
                >
                  Yes, Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="px-2 py-0.5 text-xs font-medium text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 hover:bg-red-100/90 dark:bg-red-950/40 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/60 transition-all shadow-2xs cursor-pointer"
                title="Clear optimized schedule and return places to unassigned pool"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Schedule</span>
              </button>
            )}
          </div>

          {/* Day Quick Navigation */}
          <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1 sm:justify-end">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-surface-400 uppercase tracking-wider whitespace-nowrap">
                Jump to:
              </span>

              {optimizedRoutes.length > 18 && (
                <input
                  type="number"
                  placeholder="Day #"
                  min={1}
                  max={optimizedRoutes.length}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) scrollToDay(val - 1);
                  }}
                  className="w-20 bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 rounded-md px-2 py-0.5 text-xs font-bold text-primary-600 outline-none focus:ring-1 focus:ring-primary-500 text-center"
                />
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {optimizedRoutes.map((route, i) => {
                const btnDate = addDays(parseISO(startDate), i);
                const customName = route.title || dayTitles[i];
                return (
                  <button
                    key={i}
                    onClick={() => scrollToDay(i)}
                    title={customName ? `${customName} (Day ${i + 1})` : `Day ${i + 1}`}
                    className={`px-3 py-1.5 rounded-lg bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 font-bold text-surface-600 dark:text-surface-300 hover:border-primary-500 hover:text-primary-600 transition-all whitespace-nowrap flex flex-col items-center justify-center min-w-[60px] max-w-[120px] ${dateMode === "fixed" ? "text-[10px]" : "text-xs"}`}
                  >
                    {customName ? (
                      <>
                        <span className="truncate w-full font-black text-primary-600 dark:text-primary-400 text-center">{customName}</span>
                        <span className="text-[9px] opacity-60">D{i + 1}{dateMode === "fixed" ? ` • ${format(btnDate, "MMM d")}` : ""}</span>
                      </>
                    ) : (
                      dateMode === "fixed" ? (
                        <>
                          <span className="opacity-50">D{i + 1}</span>
                          <span>{format(btnDate, "MMM d")}</span>
                        </>
                      ) : (
                        <span>Day {i + 1}</span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Heuristic Transit Inaccurate Times Warning Banner */}
        {hasHeuristicTransit && !isBannerDismissed && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 rounded-2xl border border-amber-300 dark:border-amber-700/80 bg-gradient-to-r from-amber-50 to-orange-50/60 dark:from-amber-950/50 dark:to-orange-950/30 text-amber-950 dark:text-amber-200 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-200/80 dark:bg-amber-900/60 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-100">
                  ⚠ Transit times are estimated — actual durations may differ significantly.
                </p>
              </div>
              <button
                onClick={() => setIsBannerDismissed(true)}
                className="p-1.5 rounded-xl text-amber-700 dark:text-amber-400 hover:bg-amber-200/60 dark:hover:bg-amber-900/60 transition-colors shrink-0"
                title="Dismiss notice"
                aria-label="Dismiss heuristic transit notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <details className="mt-2">
              <summary className="text-[11px] sm:text-xs font-bold text-amber-800 dark:text-amber-300 cursor-pointer hover:text-amber-950 dark:hover:text-amber-100 transition-colors select-none">
                Why this happens
              </summary>
              <p className="mt-1.5 text-[11px] sm:text-xs text-amber-900/80 dark:text-amber-300/80 leading-relaxed pl-1">
                Google Maps developer APIs return <code className="font-mono text-[10px] bg-amber-200/70 dark:bg-amber-900/70 px-1 py-0.5 rounded font-bold">ZERO_RESULTS</code> for Japan transit due to commercial licensing. Times are approximated geometrically (~{distanceUnit === "imperial" ? "11 mph local / ~101 mph express" : "18 km/h local / ~162 km/h express"}) without real timetables, departure intervals, or megastation transfer walks. Cross-check with local transit apps (NAVITIME, Jorudan) on your travel day.{" "}
                <button
                  onClick={() => { window.location.hash = "#about-limitations"; }}
                  className="inline font-bold text-amber-950 dark:text-amber-100 underline underline-offset-2 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  More details →
                </button>
              </p>
            </details>
          </div>
        )}


        <div
          ref={scrollContainerRef}
          className="p-6 overflow-x-auto overflow-y-hidden custom-scrollbar flex gap-6 snap-x snap-proximity overscroll-x-contain"
        >
          {optimizedRoutes.map((route, i) => {
            const currentDate = addDays(parseISO(startDate), i);
            const isFirstDay = i === 0;
            const isLastDay = i === optimizedRoutes.length - 1;

            // Calculate base day start time in minutes
            const [startH, startM] = dayStartTime.split(":").map(Number);
            let currentTime = startH * 60 + startM;

            // Calculate available time for this day
            let dayAvailableMinutes = baseDayMinutes;
            if (showFlights) {
              if (isFirstDay && arrivalFlight) {
                const [arrH, arrM] = arrivalFlight.time.split(":").map(Number);
                const arrivalTotal = arrH * 60 + arrM;
                const dayStartTotal = startH * 60 + startM;
                const effectiveStart = Math.max(dayStartTotal, arrivalTotal);
                currentTime = effectiveStart; // Day starts after flight

                let available = endH * 60 + endM - effectiveStart;
                if (available < 0) available += 24 * 60;
                dayAvailableMinutes = available;
              }
              if (isLastDay && departureFlight) {
                const [depH, depM] = departureFlight.time.split(":").map(Number);
                const depTotal = depH * 60 + depM;
                // Handle overnight: if dayEndTime is "00:00" (midnight), treat as 1440
                const rawDayEnd = endH * 60 + endM;
                const dayEndTotal = rawDayEnd === 0 ? 24 * 60 : rawDayEnd;
                const effectiveEnd = Math.min(dayEndTotal, depTotal - (departureFlight.buffer ?? 90));

                let available = effectiveEnd - (startH * 60 + startM);
                if (available < 0) available += 24 * 60;
                dayAvailableMinutes = available;
              }
            }

            const getDayItemSequence = (dayRoute: typeof route, dayIdx: number) => {
              let ids = dayRoute.manualSequence ? [...dayRoute.manualSequence] : [];
              const dayCustoms = customBuffers.filter((b) => b.dayIndex === dayIdx);
              const isFirst = dayIdx === 0;
              const isLast = dayIdx === optimizedRoutes.length - 1;

              if (!dayRoute.manualSequence) {
                if (showFlights && isFirst && arrivalFlight) ids.push("arrival");
                if (dayRoute.startHotel) ids.push("start-hotel");
                dayRoute.stops.forEach((s) => ids.push(s.id));
                dayCustoms.forEach((b) => ids.push(b.id));
                if (dayRoute.endHotel && !isLast) ids.push("end-hotel");
                if (showFlights && isLast && departureFlight) ids.push("departure");
              } else {
                dayCustoms.forEach((b) => {
                  if (!ids.includes(b.id)) {
                    const endIdx = ids.findIndex((id) => id === "end-hotel" || id === "departure");
                    if (endIdx >= 0) {
                      ids.splice(endIdx, 0, b.id);
                    } else {
                      ids.push(b.id);
                    }
                  }
                });
                ids = ids.filter((id) => {
                  if (id.startsWith("custom-buffer-")) {
                    return dayCustoms.some((b) => b.id === id);
                  }
                  return true;
                });
                if (showFlights && isFirst && arrivalFlight && !ids.includes("arrival")) {
                  ids.unshift("arrival");
                } else if (!showFlights) {
                  ids = ids.filter((id) => id !== "arrival" && id !== "departure");
                }
                if (showFlights && isLast && departureFlight && !ids.includes("departure")) {
                  ids.push("departure");
                }
              }
              if (isLast) {
                ids = ids.filter((id) => id !== "end-hotel");
              }
              return ids;
            };

            const dayItems = getDayItemSequence(route, i);

            // Unified day timeline simulation: calculate exact start times, wait buffers, durations, and segments
            let simTime = currentTime;
            let simSegIdx = 0;
            let autoWaitBufferMin = 0;

            const itemScheduleList = dayItems.map((itemId, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === dayItems.length - 1;
              let preWaitMin = 0;
              let preWaitType: "reservation" | "wait" | undefined = undefined;
              let itemDuration = 0;
              let customBuf: CustomBuffer | null = null;
              let stop: Place | null = null;

              if (itemId === "arrival" && arrivalFlight) {
                itemDuration = arrivalFlight.buffer ?? 30;
              } else if (itemId === "departure" && departureFlight) {
                itemDuration = departureFlight.buffer ?? 90;
              } else if (itemId === "start-hotel" && route.startHotel) {
                itemDuration = 0;
              } else if (itemId === "end-hotel" && route.endHotel && !isLastDay) {
                itemDuration = 0;
              } else if (itemId.startsWith("custom-buffer-")) {
                customBuf = customBuffers.find((b) => b.id === itemId) || null;
                itemDuration = customBuf ? customBuf.duration : 0;
              } else {
                stop = route.stops.find((s) => s.id === itemId) || null;
                if (stop) {
                  if (stop.customTime) {
                    const customMin = parseTimeToMinutes(stop.customTime);
                    if (customMin > simTime) {
                      preWaitMin = customMin - simTime;
                      preWaitType = "reservation";
                      simTime = customMin;
                    }
                  } else if (dateMode === "fixed") {
                    const tc = checkTimeConflict(
                      simTime,
                      stop.estimatedDuration || 60,
                      stop.openingHours,
                      currentDate
                    );
                    if (tc.waitMinutes && tc.waitMinutes > 0) {
                      preWaitMin = tc.waitMinutes;
                      preWaitType = "wait";
                      simTime += tc.waitMinutes;
                    }
                  }
                  itemDuration = stop.estimatedDuration || 0;
                }
              }

              const stopArrivalTime = simTime;
              const itemStartTime = simTime;
              simTime += itemDuration;
              autoWaitBufferMin += preWaitMin;

              // Segment calculation (segment renders right before the next physical stop)
              const nextPhysicalIdx = dayItems.slice(idx + 1).findIndex((id) => !id.startsWith("custom-buffer-"));
              const hasPrevPhysical = dayItems.slice(0, idx + 1).some((id) => !id.startsWith("custom-buffer-"));

              let segmentData: { seg: RouteSegment; segIdx: number; segTimeMin: number } | null = null;
              if (hasPrevPhysical && nextPhysicalIdx === 0 && simSegIdx < route.segments.length) {
                const seg = route.segments[simSegIdx];
                const segIdx = simSegIdx;
                simSegIdx++;
                const segTimeMin = Math.round(seg.time / 60);
                simTime += segTimeMin;
                segmentData = { seg, segIdx, segTimeMin };
              }

              return {
                itemId,
                idx,
                isFirst,
                isLast,
                preWaitMin,
                preWaitType,
                preWaitStartTime: stopArrivalTime - preWaitMin,
                startTime: itemStartTime,
                stopArrivalTime,
                itemDuration,
                segmentData,
                customBuf,
                stop,
              };
            });

            const visitMin = route.stops.reduce(
              (acc, s) => acc + (s.estimatedDuration || 0),
              0,
            );
            const dayCustomBuffers = customBuffers.filter((b) => b.dayIndex === i);
            const customBufferMin = dayCustomBuffers.reduce((acc, b) => acc + (b.duration || 0), 0);
            const arrivalFlightBuffer = showFlights && isFirstDay && arrivalFlight ? (arrivalFlight.buffer ?? 30) : 0;
            const bufferMin = customBufferMin + autoWaitBufferMin + arrivalFlightBuffer;
            const travelMin = Math.round(route.totalTime / 60);
            const totalDayMin = visitMin + travelMin + bufferMin;
            const remainingTime = Math.max(0, dayAvailableMinutes - totalDayMin);
            const isOverBudget = totalDayMin > dayAvailableMinutes;
            const budgetPct = Math.min(
              100,
              Math.round((totalDayMin / dayAvailableMinutes) * 100),
            );

            return (
              <div
                key={i}
                id={`schedule-day-${i}`}
                className={`flex-shrink-0 w-80 md:w-96 snap-start ${i >= 3 ? "content-auto-day" : ""}`}
              >
                <div className="bg-white dark:bg-surface-800 rounded-2xl border border-surface-100 dark:border-surface-700 shadow-xl overflow-hidden flex flex-col h-full max-h-[600px]">
                  <div className="p-4 border-b border-surface-100 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1 min-w-0 pr-2">
                        {editingDayTitleIndex === i ? (
                          <div className="flex items-center gap-1.5 w-full">
                            <input
                              ref={titleInputRef}
                              type="text"
                              value={editingDayTitleText}
                              onChange={(e) => setEditingDayTitleText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveDayTitle(i);
                                if (e.key === "Escape") setEditingDayTitleIndex(null);
                              }}
                              placeholder="e.g. Kyoto Day 1!"
                              maxLength={40}
                              className="w-full max-w-[200px] bg-white dark:bg-surface-900 border border-primary-500 rounded-lg px-2 py-1 text-sm font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveDayTitle(i)}
                              className="p-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors cursor-pointer shadow-2xs shrink-0"
                              title="Save day name"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDayTitleIndex(null)}
                              className="p-1.5 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors cursor-pointer shrink-0"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          (() => {
                            const customName = route.title || dayTitles[i];
                            return (
                              <div className="flex flex-col min-w-0">
                                <div
                                  onClick={() => startEditingDayTitle(i, customName)}
                                  className="group/title flex items-center gap-1.5 cursor-pointer max-w-full"
                                  title="Click to rename this day (e.g. Kyoto Day 1!)"
                                >
                                  <h3 className="text-lg font-black text-surface-900 dark:text-white leading-tight truncate group-hover/title:text-primary-600 dark:group-hover/title:text-primary-400 transition-colors">
                                    {customName || `Day ${i + 1}`}
                                  </h3>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingDayTitle(i, customName);
                                    }}
                                    className="opacity-0 group-hover/title:opacity-100 p-1 text-surface-400 hover:text-primary-600 dark:hover:text-primary-400 rounded transition-all cursor-pointer shrink-0"
                                    title="Rename day"
                                    aria-label="Rename day"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-surface-500 dark:text-surface-400">
                                  {customName ? (
                                    <>
                                      <span>Day {i + 1}</span>
                                      {dateMode === "fixed" && (
                                        <>
                                          <span>•</span>
                                          <span className="text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                                            {format(currentDate, "MMM d (EEE)")}
                                          </span>
                                        </>
                                      )}
                                    </>
                                  ) : (
                                    dateMode === "fixed" && (
                                      <span className="text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                                        {format(currentDate, "MMM d (EEE)")}
                                      </span>
                                    )
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                      <div className="flex items-center gap-2 relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (addBufferDayIndex === i) {
                              setAddBufferDayIndex(null);
                            } else {
                              setAddBufferDayIndex(i);
                              setNewBufferDuration(30);
                              setNewBufferLabel("Rest Break");
                            }
                          }}
                          className={`p-1.5 px-2.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${addBufferDayIndex === i
                            ? "bg-amber-600 text-white border-amber-600 shadow-amber-500/20"
                            : "bg-white dark:bg-surface-700 border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-200 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            }`}
                          title="Add custom buffer or break to this day"
                        >
                          <Plus className="w-3.5 h-3.5 text-amber-500" />
                          <span>Buffer</span>
                        </button>

                        {/* Add Buffer Popover */}
                        {addBufferDayIndex === i && (
                          <div className="absolute top-10 right-0 z-50 w-72 bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150 text-left">
                            <div className="flex items-center justify-between pb-1 border-b border-surface-100 dark:border-surface-700">
                              <span className="text-xs font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                                <Coffee className="w-3.5 h-3.5 text-amber-500" />
                                Add Day {i + 1} Buffer
                              </span>
                              <button
                                type="button"
                                onClick={() => setAddBufferDayIndex(null)}
                                className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 p-0.5"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Label input */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-surface-500 uppercase">
                                Activity / Label:
                              </label>
                              <input
                                type="text"
                                value={newBufferLabel}
                                onChange={(e) => setNewBufferLabel(e.target.value)}
                                placeholder="e.g. Lunch Break, Coffee Stop..."
                                className="w-full bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                              />
                              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                {["Rest Break", "Coffee / Snack", "Lunch Break", "Buffer Time"].map((chip) => (
                                  <button
                                    key={chip}
                                    type="button"
                                    onClick={() => setNewBufferLabel(chip)}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-600 hover:border-amber-400 transition-colors"
                                  >
                                    {chip}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Duration input */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-surface-500 uppercase">
                                Duration:
                              </label>
                              <div className="flex items-center border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-surface-50 dark:bg-surface-900">
                                <button
                                  type="button"
                                  onClick={() => setNewBufferDuration((m) => Math.max(5, m - 15))}
                                  className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors"
                                >
                                  -15
                                </button>
                                <input
                                  type="number"
                                  min="5"
                                  max="480"
                                  step="5"
                                  value={newBufferDuration}
                                  onChange={(e) => setNewBufferDuration(Math.max(5, parseInt(e.target.value) || 5))}
                                  className="flex-1 min-w-0 bg-transparent text-center text-xs font-bold text-surface-900 dark:text-white py-1 focus:outline-none"
                                />
                                <span className="text-[10px] text-surface-400 dark:text-surface-500 pr-2 font-medium">
                                  min
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setNewBufferDuration((m) => m + 15)}
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
                                    onClick={() => setNewBufferDuration(preset)}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${newBufferDuration === preset
                                      ? "bg-amber-600 text-white border-amber-600"
                                      : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-600"
                                      }`}
                                  >
                                    {preset}m
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-100 dark:border-surface-700">
                              <button
                                type="button"
                                onClick={() => setAddBufferDayIndex(null)}
                                className="px-2.5 py-1 text-xs font-semibold text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  addCustomBuffer(i, newBufferDuration, newBufferLabel || "Custom Buffer");
                                  toast.success(`Added ${newBufferDuration}m buffer to Day ${i + 1}`);
                                  setAddBufferDayIndex(null);
                                }}
                                className="px-3 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-md shadow-2xs transition-colors"
                              >
                                Add Buffer
                              </button>
                            </div>
                          </div>
                        )}

                        {route.stops.length > 1 && (
                          <button
                            onClick={() => handleOptimizeSingleDay(i)}
                            disabled={optimizingDayIndex !== null}
                            className="p-1.5 rounded-lg bg-white dark:bg-surface-700 border border-surface-200 dark:border-surface-600 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-all disabled:opacity-50"
                            title="Optimize this day's route"
                          >
                            {optimizingDayIndex === i ? (
                              <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                            ) : (
                              <Wand2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-[10px] font-bold text-surface-500 uppercase tracking-tight flex-wrap">
                        <span className="flex items-center gap-1.5 bg-surface-100 dark:bg-surface-700/50 px-2 py-0.5 rounded-full">
                          <Timer className="w-3 h-3 text-primary-500" />
                          <span className="text-surface-400">Visit:</span>
                          <span className="text-surface-600 dark:text-surface-300">
                            {visitMin > 60
                              ? `${Math.floor(visitMin / 60)}h ${visitMin % 60}m`
                              : `${visitMin}m`}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5 bg-surface-100 dark:bg-surface-700/50 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3 text-primary-500" />
                          <span className="text-surface-400">Travel:</span>
                          <span className="text-surface-600 dark:text-surface-300">
                            {travelMin > 60
                              ? `${Math.floor(travelMin / 60)}h ${travelMin % 60}m`
                              : `${travelMin}m`}
                          </span>
                        </span>
                        {bufferMin > 0 && (
                          <span className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50">
                            <Coffee className="w-3 h-3 text-amber-500" />
                            <span className="text-surface-400 dark:text-amber-400/70">Buffer:</span>
                            <span>
                              {bufferMin > 60
                                ? `${Math.floor(bufferMin / 60)}h ${bufferMin % 60}m`
                                : `${bufferMin}m`}
                            </span>
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded ${isOverBudget ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}
                      >
                        {isOverBudget
                          ? "OVER BUDGET"
                          : remainingTime >= 60
                            ? `${Math.floor(remainingTime / 60)}h ${remainingTime % 60}m left`
                            : `${remainingTime}m left`}
                      </div>
                    </div>

                    {/* Budget bar */}
                    <div className="w-full bg-surface-100 dark:bg-surface-700 rounded-full h-1 mt-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOverBudget ? "bg-red-500" : "bg-primary-500"}`}
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pl-8 pr-4 py-4 space-y-0 relative smooth-scroll-container">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => {
                        const { active, over } = event;
                        if (over && active.id !== over.id) {
                          reorderDayStops(
                            i,
                            active.id as string,
                            over.id as string,
                          );
                        }
                      }}
                    >
                      <SortableContext
                        items={dayItems}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="flex flex-col relative">
                          {(() => {
                            let lastMealDepartureTime: number | null = null;

                            return itemScheduleList.map((item) => {
                              const {
                                itemId,
                                isFirst,
                                isLast,
                                preWaitMin,
                                preWaitType,
                                preWaitStartTime,
                                startTime,
                                stopArrivalTime,
                                segmentData,
                                customBuf,
                                stop,
                              } = item;

                              let element = null;
                              let preBufferPill = null;

                              if (preWaitMin > 0 && stop) {
                                const isRes = preWaitType === "reservation";
                                const openTimeFormatted = formatTime(stopArrivalTime);
                                preBufferPill = (
                                  <BufferPill
                                    key={isRes ? `buffer-${stop.id}` : `wait-buffer-${stop.id}`}
                                    minutes={preWaitMin}
                                    startTime={preWaitStartTime}
                                    label={
                                      isRes
                                        ? `Buffer: ${preWaitMin} min free time before reservation`
                                        : `Buffer: ${preWaitMin} min wait until opening (${openTimeFormatted})`
                                    }
                                    isReservation={isRes}
                                    showLine={!isFirst}
                                    type={isRes ? "reservation" : "wait"}
                                    stopName={stop.name}
                                    reservationTime={stop.customTime}
                                    onSaveReservationTime={
                                      isRes
                                        ? async (newTime) => {
                                          updatePlace(stop.id, { customTime: newTime });
                                          toast.success(`Updated ${stop.name} reservation to ${formatTimeString(newTime)}`);
                                          try {
                                            await useRouteStore.getState().optimizeDay(i);
                                          } catch (e) {
                                            console.error("Failed to re-optimize day after setting custom time", e);
                                          }
                                        }
                                        : undefined
                                    }
                                  />
                                );
                              }

                              if (itemId === "arrival" && arrivalFlight) {
                                const arrMin = parseTimeToMinutes(arrivalFlight.time);
                                const arrBuffer = arrivalFlight.buffer ?? 30;
                                element = (
                                  <SortableAnchor
                                    key="arrival"
                                    id="arrival"
                                    type="arrival"
                                    name={
                                      arrivalFlight.location
                                        ? arrivalFlight.location.name
                                        : "Flight Arrival"
                                    }
                                    time={arrivalFlight.time}
                                    buffer={arrBuffer}
                                    bufferStartTime={arrMin}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                    onUpdateBuffer={(newBuffer) => {
                                      setArrivalFlight({ ...arrivalFlight, buffer: newBuffer });
                                      toast.success(`Arrival buffer updated to ${newBuffer}m.`);
                                    }}
                                  />
                                );
                              } else if (
                                itemId === "departure" &&
                                departureFlight
                              ) {
                                const depMin = parseTimeToMinutes(departureFlight.time);
                                const depBuffer = departureFlight.buffer ?? 90;
                                const depBufferStart = depMin - depBuffer;
                                element = (
                                  <SortableAnchor
                                    key="departure"
                                    id="departure"
                                    type="departure"
                                    name={
                                      departureFlight.location
                                        ? departureFlight.location.name
                                        : "Flight Departure"
                                    }
                                    time={departureFlight.time}
                                    buffer={depBuffer}
                                    bufferStartTime={depBufferStart}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                    onUpdateBuffer={(newBuffer) => {
                                      setDepartureFlight({ ...departureFlight, buffer: newBuffer });
                                      toast.success(`Departure buffer updated to ${newBuffer}m.`);
                                    }}
                                  />
                                );
                              } else if (
                                itemId === "start-hotel" &&
                                route.startHotel
                              ) {
                                element = (
                                  <SortableAnchor
                                    key="start-hotel"
                                    id="start-hotel"
                                    name={route.startHotel.name}
                                    type="start-hotel"
                                    calculatedTime={startTime}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                  />
                                );
                              } else if (
                                itemId === "end-hotel" &&
                                route.endHotel &&
                                !isLastDay
                              ) {
                                element = (
                                  <SortableAnchor
                                    key="end-hotel"
                                    id="end-hotel"
                                    name={route.endHotel.name}
                                    type="end-hotel"
                                    calculatedTime={startTime}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                  />
                                );
                              } else if (itemId.startsWith("custom-buffer-") && customBuf) {
                                element = (
                                  <SortableCustomBuffer
                                    key={customBuf.id}
                                    buffer={customBuf}
                                    startTime={startTime}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                    onUpdate={(updates) => updateCustomBuffer(customBuf.id, updates)}
                                    onDelete={() => {
                                      deleteCustomBuffer(customBuf.id);
                                      toast.success("Buffer removed");
                                    }}
                                  />
                                );
                              } else if (stop) {
                                let mealGapAlert: { gap: number; minGap: number } | null = null;
                                const minSpacing = categoryConfigs?.[stop.category]?.minTimeBetween ?? (stop.category === "restaurant" ? 180 : 0);
                                if (minSpacing > 0 && stop.category === "restaurant") {
                                  if (lastMealDepartureTime !== null) {
                                    const gap = stopArrivalTime - lastMealDepartureTime;
                                    if (gap < minSpacing) {
                                      mealGapAlert = { gap, minGap: minSpacing };
                                    }
                                  }
                                }

                                element = (
                                  <SortableStop
                                    key={stop.id}
                                    stop={stop}
                                    stopArrivalTime={stopArrivalTime}
                                    isFirst={isFirst}
                                    isLast={isLast}
                                    unassignPlace={unassignPlace}
                                    updatePlace={updatePlace}
                                    dayIndex={i}
                                    dateMode={dateMode}
                                    currentDate={currentDate}
                                    onEdit={handleEditPlace}
                                    mealGapAlert={mealGapAlert}
                                  />
                                );
                                if (stop.category === "restaurant") {
                                  lastMealDepartureTime = stopArrivalTime + (stop.estimatedDuration || 60);
                                }
                              }

                              if (!element) return null;

                              let segmentElement = null;
                              if (segmentData) {
                                segmentElement = (
                                  <div
                                    className="mt-[-4px]"
                                    key={`seg-${itemId}-${segmentData.segIdx}`}
                                  >
                                    <SegmentPill
                                      segment={segmentData.seg}
                                      dayIndex={i}
                                      segmentIndex={segmentData.segIdx}
                                    />
                                  </div>
                                );
                              }

                              // Inline "Add Buffer" divider between items
                              const showInlineDivider = !isLast && !itemId.startsWith("custom-buffer-") && itemId !== "arrival" && itemId !== "start-hotel";
                              const isInlineOpen = inlineBufferAfter?.dayIndex === i && inlineBufferAfter?.afterId === itemId;

                              return (
                                <React.Fragment key={`group-${itemId}`}>
                                  {preBufferPill}
                                  {element}
                                  {segmentElement}
                                  {showInlineDivider && (
                                    <div className="relative group/add-buf py-0.5 -my-0.5 z-10">
                                      {/* Vertical line connector */}
                                      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-surface-200 dark:bg-surface-700/50" />

                                      {!isInlineOpen ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setInlineBufferAfter({ dayIndex: i, afterId: itemId });
                                            setInlineDuration(30);
                                            setInlineLabel("Rest Break");
                                          }}
                                          className="relative flex items-center gap-1.5 ml-[14px] py-1 opacity-0 group-hover/add-buf:opacity-100 focus:opacity-100 transition-opacity duration-150"
                                          title="Insert buffer here"
                                        >
                                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors shadow-sm">
                                            <Plus className="w-3 h-3" />
                                          </span>
                                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                            Insert buffer
                                          </span>
                                        </button>
                                      ) : (
                                        <div className="relative ml-8 mr-2 my-1 bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-amber-300 dark:border-amber-700 p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150 z-50">
                                          <div className="flex items-center justify-between pb-1 border-b border-surface-100 dark:border-surface-700">
                                            <span className="text-[10px] font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                                              <Coffee className="w-3 h-3 text-amber-500" />
                                              Insert Buffer
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => setInlineBufferAfter(null)}
                                              className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 p-0.5"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>

                                          {/* Quick label chips */}
                                          <div className="flex items-center gap-1 flex-wrap">
                                            {["Rest Break", "Coffee / Snack", "Lunch Break", "Buffer Time"].map((chip) => (
                                              <button
                                                key={chip}
                                                type="button"
                                                onClick={() => setInlineLabel(chip)}
                                                className={`px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors ${inlineLabel === chip
                                                  ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-400 dark:border-amber-600"
                                                  : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-600 hover:border-amber-400"
                                                  }`}
                                              >
                                                {chip}
                                              </button>
                                            ))}
                                          </div>

                                          {/* Custom label input */}
                                          <input
                                            type="text"
                                            value={inlineLabel}
                                            onChange={(e) => setInlineLabel(e.target.value)}
                                            placeholder="Custom label..."
                                            className="w-full bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1 text-[11px] font-bold text-surface-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                          />

                                          {/* Duration row */}
                                          <div className="flex items-center gap-1.5">
                                            <div className="flex items-center border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-surface-50 dark:bg-surface-900 flex-1">
                                              <button
                                                type="button"
                                                onClick={() => setInlineDuration((m) => Math.max(5, m - 15))}
                                                className="px-2 py-1 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-[10px] font-bold transition-colors"
                                              >
                                                -15
                                              </button>
                                              <input
                                                type="number"
                                                min="5"
                                                max="480"
                                                step="5"
                                                value={inlineDuration}
                                                onChange={(e) => setInlineDuration(Math.max(5, parseInt(e.target.value) || 5))}
                                                className="flex-1 min-w-0 bg-transparent text-center text-[11px] font-bold text-surface-900 dark:text-white py-1 focus:outline-none"
                                              />
                                              <span className="text-[9px] text-surface-400 pr-1.5 font-medium">min</span>
                                              <button
                                                type="button"
                                                onClick={() => setInlineDuration((m) => m + 15)}
                                                className="px-2 py-1 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 text-[10px] font-bold transition-colors"
                                              >
                                                +15
                                              </button>
                                            </div>
                                            {/* Quick duration presets */}
                                            {[15, 30, 60].map((preset) => (
                                              <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setInlineDuration(preset)}
                                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${inlineDuration === preset
                                                  ? "bg-amber-600 text-white border-amber-600"
                                                  : "bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-600"
                                                  }`}
                                              >
                                                {preset}m
                                              </button>
                                            ))}
                                          </div>

                                          {/* Actions */}
                                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-surface-100 dark:border-surface-700">
                                            <button
                                              type="button"
                                              onClick={() => setInlineBufferAfter(null)}
                                              className="px-2 py-0.5 text-[10px] font-semibold text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                addCustomBuffer(i, inlineDuration, inlineLabel || "Custom Buffer", itemId);
                                                toast.success(`Added ${inlineDuration}m buffer`);
                                                setInlineBufferAfter(null);
                                              }}
                                              className="px-2.5 py-0.5 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-md shadow-2xs transition-colors"
                                            >
                                              Add
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </React.Fragment>
                              );
                            });
                          })()}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {editingPlaceId && (
        <React.Suspense fallback={null}>
          <EditPlaceModal
            placeId={editingPlaceId}
            onClose={() => setEditingPlaceId(null)}
          />
        </React.Suspense>
      )}
    </>
  );
};
