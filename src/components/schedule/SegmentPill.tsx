import React, { useState, useRef, useEffect } from "react";
import { useRouteStore } from "../../store/useRouteStore";
import { Footprints, Train, Car, ChevronDown, Pencil, RotateCcw, X, Clock, ExternalLink } from "lucide-react";
import { RouteSegment, TravelMode } from "../../types";
import { toast } from "../../services/toastService";
import { isJapanCoordinate, calculateJapanStationTransit } from "../../services/ekispertService";
import { isWalkSegment } from "../../utils/distance";

export interface SegmentPillProps {
  segment: RouteSegment;
  dayIndex: number;
  segmentIndex: number;
}

export const SegmentPill: React.FC<SegmentPillProps> = React.memo(
  ({ segment, dayIndex, segmentIndex }) => {
    const updateSegmentTravelMode = useRouteStore((s) => s.updateSegmentTravelMode);
    const updateSegmentTransitTime = useRouteStore((s) => s.updateSegmentTransitTime);
    const distanceUnit = useRouteStore((s) => s.distanceUnit);

    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const activeMinutes = Math.round(segment.time / 60);
    const [customMinutesInput, setCustomMinutesInput] = useState<string | number>(activeMinutes);
    const popoverRef = useRef<HTMLDivElement>(null);

    const isWalk = isWalkSegment(segment);
    const isCustom = segment.customDuration !== undefined;
    const estimatedMinutes = Math.round((segment.originalTime ?? segment.time) / 60);
    const isHeuristicTransit = !isWalk && segment.travelMode === "transit" && segment.isHeuristic !== false;

    // Auto-hydrate transit details if in Japan and missing (e.g. loaded from earlier save/state)
    useEffect(() => {
      if (segment.travelMode !== "transit" || segment.transitDetails) return;

      const state = useRouteStore.getState();
      const route = state.optimizedRoutes.find((r) => r.day === dayIndex);
      if (!route) return;

      const findCoord = (id?: string) => {
        if (!id) return null;
        if (id === "arrival" && state.arrivalFlight?.location) {
          return { lat: state.arrivalFlight.location.lat, lng: state.arrivalFlight.location.lng };
        }
        if (id === "departure" && state.departureFlight?.location) {
          return { lat: state.departureFlight.location.lat, lng: state.departureFlight.location.lng };
        }
        if (id === "start-hotel" && route.startHotel) return { lat: route.startHotel.lat, lng: route.startHotel.lng };
        if (id === "end-hotel" && route.endHotel) return { lat: route.endHotel.lat, lng: route.endHotel.lng };
        const p = route.stops.find((s) => s.id === id) || state.places.find((s) => s.id === id);
        if (p?.lat && p?.lng) return { lat: p.lat, lng: p.lng };
        return null;
      };

      let origin = findCoord(segment.fromId);
      let destination = findCoord(segment.toId);

      // If IDs were not explicitly on segment, infer by physical order in day
      if (!origin || !destination) {
        const physicalPoints: { id: string; lat: number; lng: number }[] = [];
        if (state.showFlights && dayIndex === 0 && state.arrivalFlight?.location) {
          physicalPoints.push({ id: "arrival", lat: state.arrivalFlight.location.lat, lng: state.arrivalFlight.location.lng });
        }
        if (route.startHotel) physicalPoints.push({ id: "start-hotel", lat: route.startHotel.lat, lng: route.startHotel.lng });
        route.stops.forEach((s) => physicalPoints.push({ id: s.id, lat: s.lat, lng: s.lng }));
        if (route.endHotel && route.day < state.days - 1) physicalPoints.push({ id: "end-hotel", lat: route.endHotel.lat, lng: route.endHotel.lng });
        if (state.showFlights && route.day === state.days - 1 && state.departureFlight?.location) {
          physicalPoints.push({ id: "departure", lat: state.departureFlight.location.lat, lng: state.departureFlight.location.lng });
        }

        if (physicalPoints[segmentIndex] && physicalPoints[segmentIndex + 1]) {
          origin = { lat: physicalPoints[segmentIndex].lat, lng: physicalPoints[segmentIndex].lng };
          destination = { lat: physicalPoints[segmentIndex + 1].lat, lng: physicalPoints[segmentIndex + 1].lng };
        }
      }

      if (origin && destination && isJapanCoordinate(origin.lat, origin.lng) && isJapanCoordinate(destination.lat, destination.lng)) {
        calculateJapanStationTransit(origin, destination).then((result) => {
          if (result && result.transitDetails) {
            const details = result.transitDetails;
            const isDirectWalk = !details.trainMin || details.trainMin === 0;
            useRouteStore.setState((prev) => {
              const newRoutes = [...prev.optimizedRoutes];
              const rIdx = newRoutes.findIndex((r) => r.day === dayIndex);
              if (rIdx >= 0 && newRoutes[rIdx].segments[segmentIndex]) {
                const targetSeg = newRoutes[rIdx].segments[segmentIndex];
                const finalTime = targetSeg.customDuration !== undefined ? targetSeg.customDuration : result.durationS;
                const updatedSeg = {
                  ...targetSeg,
                  travelMode: (targetSeg.travelMode === "transit" && isDirectWalk && !targetSeg.customTravelMode) ? "walking" as TravelMode : targetSeg.travelMode,
                  time: finalTime,
                  originalTime: result.durationS,
                  distance: result.distanceM,
                  transitDetails: details,
                  stationFrom: result.stationFrom,
                  stationTo: result.stationTo,
                  transitUrl: result.transitUrl,
                  heuristicReason: result.heuristicReason,
                };
                const updatedSegs = [...newRoutes[rIdx].segments];
                updatedSegs[segmentIndex] = updatedSeg;
                newRoutes[rIdx] = {
                  ...newRoutes[rIdx],
                  segments: updatedSegs,
                  totalTime: updatedSegs.reduce((sum, s) => sum + s.time, 0),
                  totalDistance: updatedSegs.reduce((sum, s) => sum + s.distance, 0),
                };
                return { optimizedRoutes: newRoutes };
              }
              return prev;
            });
          }
        }).catch(console.warn);
      }
    }, [segment.travelMode, segment.transitDetails, segment.fromId, segment.toId, dayIndex, segmentIndex]);

    // Synchronize local input state whenever popover opens or segment changes
    useEffect(() => {
      setCustomMinutesInput(activeMinutes);
    }, [activeMinutes, isPopoverOpen]);

    // Handle click outside and Escape key to close popover
    useEffect(() => {
      if (!isPopoverOpen) return;
      const handleClickOutside = (e: MouseEvent) => {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          setIsPopoverOpen(false);
        }
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsPopoverOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [isPopoverOpen]);

    const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateSegmentTravelMode(
        dayIndex,
        segmentIndex,
        e.target.value as TravelMode,
      );
    };

    const handleApplyCustomTime = () => {
      const num = Number(customMinutesInput);
      const validMin = Math.max(1, Math.min(480, Number.isFinite(num) && num > 0 ? Math.round(num) : activeMinutes));
      updateSegmentTransitTime(dayIndex, segmentIndex, validMin);
      toast.success(`${isWalk ? "Walk" : "Transit"} time set to ${validMin} min.`);
      setIsPopoverOpen(false);
    };

    const handleResetToEstimate = () => {
      updateSegmentTransitTime(dayIndex, segmentIndex, null);
      toast.success(`${isWalk ? "Walk" : "Transit"} time reset to estimated ${estimatedMinutes} min.`);
      setIsPopoverOpen(false);
    };

    const getModeIcon = () => {
      if (isWalk) {
        return <Footprints className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      }
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

    const formattedDistance = (() => {
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
    })();

    const PRESETS = [5, 10, 15, 20, 30, 45, 60, 90];

    return (
      <div className="pt-0 pb-3 pl-12 relative group">
        {/* Line connector segment - vertical timeline path */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-surface-200 dark:bg-surface-700/50" />

        <div
          className="relative inline-block group/pill"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Hover Tooltip: Total Time & Step Breakdown */}
          {!isPopoverOpen && (segment.travelMode === "transit" || isWalk) && (
            <div
              role="tooltip"
              className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 pointer-events-none whitespace-nowrap transition-all duration-150 ${
                isHovered
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-1 group-hover/pill:opacity-100 group-hover/pill:translate-y-0"
              }`}
            >
              <div className="bg-surface-900/95 dark:bg-surface-800 text-white dark:text-surface-100 text-[11px] rounded-xl px-3.5 py-2.5 shadow-2xl border border-surface-700/60 dark:border-surface-600/60 backdrop-blur-md flex flex-col gap-1.5 min-w-[200px]">
                <div className="flex items-center justify-between gap-3 border-b border-surface-700/60 pb-1">
                  <div className={`flex items-center gap-1.5 font-bold ${isWalk ? "text-emerald-300 dark:text-emerald-400" : "text-amber-300 dark:text-amber-400"}`}>
                    {isWalk ? (
                      <Footprints className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Train className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <span>{isWalk ? `Walk: ${activeMinutes} min` : `Total Transit: ${activeMinutes} min`}</span>
                  </div>
                  {segment.stationFrom && segment.stationTo && !isWalk && (
                    <span className="text-[10px] text-surface-400 font-medium">
                      {segment.stationFrom} ➔ {segment.stationTo}
                    </span>
                  )}
                </div>

                {isWalk ? (
                  <div className="flex flex-col gap-1 text-[11px] text-surface-200 dark:text-surface-300 pl-1 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <Footprints className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>
                        <strong>{activeMinutes} min</strong> walk to next place ({formattedDistance})
                      </span>
                    </div>
                  </div>
                ) : segment.transitDetails ? (
                  <div className="flex flex-col gap-1 text-[11px] text-surface-200 dark:text-surface-300 pl-1 pt-0.5">
                    {segment.transitDetails.walkToStationMin === undefined && segment.transitDetails.trainMin === undefined ? (
                      <div className="flex items-center gap-1.5">
                        <Footprints className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>
                          <strong>{segment.transitDetails.totalMin} min</strong> direct walking access (&lt;800m)
                        </span>
                      </div>
                    ) : (
                      <>
                        {segment.transitDetails.walkToStationMin !== undefined && segment.transitDetails.walkToStationMin > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Footprints className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>
                              <strong>{segment.transitDetails.walkToStationMin} min</strong> walking to {segment.stationFrom || "Station A"}
                            </span>
                          </div>
                        )}
                        {segment.transitDetails.trainMin !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <Train className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>
                              <strong>{segment.transitDetails.trainMin} min</strong> train ride
                            </span>
                          </div>
                        )}
                        {segment.transitDetails.walkFromStationMin !== undefined && segment.transitDetails.walkFromStationMin > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Footprints className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>
                              <strong>{segment.transitDetails.walkFromStationMin} min</strong> walking to destination
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-surface-300 max-w-xs whitespace-normal leading-relaxed">
                    {segment.heuristicReason?.includes("ZERO_RESULTS") || segment.heuristicReason?.includes("geometric")
                      ? `Calculating station-aware transit via Ekispert...`
                      : segment.heuristicReason || `Calculated transit time: ${activeMinutes} min`}
                  </div>
                )}

                {/* Arrow */}
                <div className="w-2 h-2 bg-surface-900/95 dark:bg-surface-800 border-r border-b border-surface-700/60 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
              </div>
            </div>
          )}

          {/* Main Segment Pill */}
          <div
            className={`travel-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all shadow-2xs ${
              isCustom
                ? "bg-indigo-50/95 dark:bg-indigo-950/70 border border-indigo-300 dark:border-indigo-600/80 text-indigo-900 dark:text-indigo-200"
                : isHeuristicTransit
                ? "bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-600/70 text-amber-900 dark:text-amber-200"
                : isWalk
                ? "bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700/70 text-emerald-900 dark:text-emerald-200"
                : "bg-surface-50 dark:bg-surface-700/90 border border-surface-200 dark:border-surface-600 text-surface-700 dark:text-surface-100"
            }`}
          >
            {/* Travel Mode Dropdown */}
            <div
              className="relative flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              title={isWalk ? "Walking to next place (Click to change mode)" : "Change travel mode (Driving, Transit, Walking)"}
            >
              {getModeIcon()}
              <ChevronDown className="w-3 h-3 text-surface-400 dark:text-surface-400" />
              <select
                value={isWalk ? "walking" : (segment.travelMode || "driving")}
                onChange={handleModeChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-white dark:bg-surface-800 text-surface-900 dark:text-white"
                title="Change travel mode"
                style={{ colorScheme: "dark light" }}
              >
                <option value="driving" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white">
                  🚗 Driving
                </option>
                <option value="transit" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white">
                  🚆 Transit
                </option>
                <option value="walking" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white">
                  🚶 Walking
                </option>
              </select>
            </div>

            <span className="text-surface-300 dark:text-surface-500">•</span>

            {/* Clickable Custom Transit Time Trigger */}
            <button
              type="button"
              onClick={() => setIsPopoverOpen((prev) => !prev)}
              className={`group/time flex items-center gap-1 font-semibold rounded px-1 -mx-0.5 transition-colors cursor-pointer ${
                isCustom
                  ? "text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                  : "text-surface-900 dark:text-surface-100 hover:bg-surface-200/70 dark:hover:bg-surface-600/70"
              }`}
              title={
                isCustom
                  ? `Custom ${isWalk ? "walk" : "transit"} time: ${activeMinutes} min (Estimated: ${estimatedMinutes} min) • Click to edit or reset`
                  : `Estimated ${isWalk ? "walk" : "transit"} time: ${activeMinutes} min • Click to customize`
              }
            >
              <span>{activeMinutes} min</span>
              {isCustom && (
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-indigo-200/90 dark:bg-indigo-800/90 text-indigo-900 dark:text-indigo-100 leading-none uppercase tracking-wider">
                  custom
                </span>
              )}
              <Pencil className="w-2.5 h-2.5 opacity-40 group-hover/time:opacity-100 transition-opacity ml-0.5 text-surface-500 dark:text-surface-400" />
            </button>

            <span className="text-surface-300 dark:text-surface-500">•</span>

            {/* Distance Display */}
            <span className="text-surface-600 dark:text-surface-300">
              {formattedDistance}
            </span>

            {/* Ekispert Live Timetable Link */}
            {segment.transitUrl && !isWalk && (
              <>
                <span className="text-surface-300 dark:text-surface-500">•</span>
                <a
                  href={segment.transitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:underline transition-colors"
                  title={
                    segment.stationFrom && segment.stationTo
                      ? `View live Ekispert timetable for ${segment.stationFrom} ➔ ${segment.stationTo}`
                      : "View live transit timetable on Ekispert"
                  }
                >
                  <span>Timetable</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </>
            )}
          </div>

          {/* Customize Transit Time Popover */}
          {isPopoverOpen && (
            <div
              ref={popoverRef}
              className="absolute left-0 top-full mt-2 z-50 w-72 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-2xl p-3.5 animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between pb-2 border-b border-surface-100 dark:border-surface-700 mb-3">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="text-xs font-bold text-surface-900 dark:text-white">
                    {isWalk ? "Customize Walk Time" : "Customize Transit Time"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPopoverOpen(false)}
                  className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 p-1 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Ekispert Station Route & Timetable Link */}
              {segment.transitUrl && !isWalk && (
                <div className="mb-3 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-rose-900 dark:text-rose-200 font-medium text-[11px] truncate mr-2">
                    <Train className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span className="truncate">
                      {segment.stationFrom && segment.stationTo
                        ? `${segment.stationFrom} ➔ ${segment.stationTo}`
                        : "Ekispert Route"}
                    </span>
                  </div>
                  <a
                    href={segment.transitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 underline shrink-0"
                  >
                    Timetable <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}

              {/* Leg Details Note */}
              <div className="text-[11px] text-surface-500 dark:text-surface-400 mb-2 flex items-center justify-between">
                <span>
                  {isWalk ? "🚶 Walking" : segment.travelMode === "transit" ? "🚆 Transit" : "🚗 Driving"} • {formattedDistance}
                </span>
                <span className="text-surface-400">
                  Est: <strong className="text-surface-700 dark:text-surface-300">{estimatedMinutes}m</strong>
                </span>
              </div>

              {/* Detailed Heuristic Breakdown */}
              {segment.heuristicReason && (
                <p className="text-[10px] text-surface-600 dark:text-surface-400 mb-3 leading-relaxed bg-surface-50 dark:bg-surface-900/60 p-2 rounded-lg border border-surface-200 dark:border-surface-700/60">
                  {segment.heuristicReason.includes("ZERO_RESULTS") || segment.heuristicReason.includes("geometric")
                    ? `Transit modeled via station-aware heuristic (~${estimatedMinutes}m).`
                    : segment.heuristicReason}
                </p>
              )}

              {/* Duration Stepper Input */}
              <div className="space-y-2 mb-3">
                <label className="text-[10px] font-bold text-surface-500 uppercase tracking-wider block">
                  {isWalk ? "Walk Duration:" : "Transit Duration:"}
                </label>
                <div className="flex items-center border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden bg-surface-50 dark:bg-surface-900 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(customMinutesInput) || activeMinutes;
                      setCustomMinutesInput(Math.max(1, cur - 5));
                    }}
                    className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors cursor-pointer"
                    title="-5 minutes"
                  >
                    -5
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={customMinutesInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^\d+$/.test(val)) {
                        setCustomMinutesInput(val);
                      }
                    }}
                    onBlur={() => {
                      if (customMinutesInput === "" || Number(customMinutesInput) < 1) {
                        setCustomMinutesInput(activeMinutes || 1);
                      } else {
                        setCustomMinutesInput(Math.min(480, Number(customMinutesInput)));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyCustomTime();
                    }}
                    className="flex-1 min-w-0 bg-transparent text-center text-xs font-bold text-surface-900 dark:text-white py-1 focus:outline-none"
                    autoFocus
                  />
                  <span className="text-[11px] text-surface-400 dark:text-surface-500 pr-2 font-medium">
                    min
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = Number(customMinutesInput) || activeMinutes;
                      setCustomMinutesInput(Math.min(480, cur + 5));
                    }}
                    className="px-2.5 py-1.5 hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-600 dark:text-surface-300 text-xs font-bold transition-colors cursor-pointer"
                    title="+5 minutes"
                  >
                    +5
                  </button>
                </div>
              </div>

              {/* Quick Preset Chips */}
              <div className="space-y-1 mb-4">
                <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider block">
                  Quick Presets:
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustomMinutesInput(preset)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        Number(customMinutesInput) === preset
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-surface-100 dark:bg-surface-700/80 text-surface-700 dark:text-surface-300 border-surface-200 dark:border-surface-600 hover:border-indigo-400"
                      }`}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Popover Actions */}
              <div className="flex items-center justify-between pt-2.5 border-t border-surface-100 dark:border-surface-700">
                {isCustom ? (
                  <button
                    type="button"
                    onClick={handleResetToEstimate}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:underline cursor-pointer"
                    title="Revert back to calculated duration"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                ) : (
                  <span className="text-[11px] text-surface-400 italic">
                    Original: {estimatedMinutes}m
                  </span>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsPopoverOpen(false)}
                    className="px-2.5 py-1 text-xs font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyCustomTime}
                    className="px-3 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
