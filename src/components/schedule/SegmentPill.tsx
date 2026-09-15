import React from "react";
import { useRouteStore } from "../../store/useRouteStore";
import { Footprints, Train, Car, ChevronDown } from "lucide-react";
import { RouteSegment, TravelMode } from "../../types";

export interface SegmentPillProps {
  segment: RouteSegment;
  dayIndex: number;
  segmentIndex: number;
}

export const SegmentPill: React.FC<SegmentPillProps> = React.memo(
  ({ segment, dayIndex, segmentIndex }) => {
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
  }
);
