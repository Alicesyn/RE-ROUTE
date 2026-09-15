import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, PlaneLanding, PlaneTakeoff, Building2 } from "lucide-react";
import { BufferPill } from "./BufferPill";
import { formatTime, formatTimeString, parseTimeToMinutes } from "./scheduleTimeUtils";

export interface SortableAnchorProps {
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
}

export const SortableAnchor: React.FC<SortableAnchorProps> = React.memo(
  ({ id, type, name, time, calculatedTime, buffer, bufferStartTime, isFirst, isLast, onUpdateBuffer }) => {
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
  }
);
