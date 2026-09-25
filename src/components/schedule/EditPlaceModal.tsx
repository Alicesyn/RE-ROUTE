import React, { useState, useEffect } from "react";
import { X, MapPin, Timer, Sparkles, Loader2, ExternalLink, Coins, CalendarClock, Lock, Star, Copy, Eye, EyeOff, CalendarDays, Pin, CheckCircle2, Link2, Hash, Calendar, Clock, Plus } from "lucide-react";
import { format } from "date-fns";
import { useRouteStore } from "../../store/useRouteStore";
import { toast } from "../../services/toastService";
import { formatDayIndexLabel, mergeOverlappingRanges, MAX_DAY_RANGES, formatMultiRangeBadge } from "../../utils/dayRangeUtils";
import { ALL_CATEGORIES, getCategoryEmoji, getCategoryLabel, getDefaultDuration } from "../../utils/categoryUtils";
import { PlaceCategory, ReservationInfo, ReservationRequirement, DayRangeConstraint, TimeRangeConstraint, TabelogInfo } from "../../types";
import { summarizePlace, fetchTabelogInfo } from "../../services/aiService";
import {
  isJapanRestaurant,
  getTabelogSearchUrl,
  formatDescriptionWithTabelog,
  stripTabelogPrefix,
} from "../../utils/tabelogUtils";
import {
  getSpecificMockHighlight,
  getSpecificMockPrice,
  getSpecificMockDescription,
  getSpecificMockReservation,
} from "../../utils/mockAiUtils";

interface Props {
  placeId: string;
  onClose: () => void;
}

export const EditPlaceModal: React.FC<Props> = ({ placeId, onClose }) => {
  const { places, updatePlace, togglePlaceDisabled, appMode, days, startDate, dayTitles } = useRouteStore();
  const place = places.find((p) => p.id === placeId);

  const [desc, setDesc] = useState("");
  const [durationVal, setDurationVal] = useState("");
  const [category, setCategory] = useState<PlaceCategory>("other");
  const [romanizedName, setRomanizedName] = useState("");
  const [highlightLabel, setHighlightLabel] = useState("");
  const [highlightText, setHighlightText] = useState("");
  const [priceEstimate, setPriceEstimate] = useState("");
  const [reservationReq, setReservationReq] = useState<ReservationRequirement | "">("");
  const [reservationAdvance, setReservationAdvance] = useState("");
  const [reservationNotes, setReservationNotes] = useState("");
  const [isBooked, setIsBooked] = useState(false);
  const [bookingUrl, setBookingUrl] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [customTimeVal, setCustomTimeVal] = useState("");
  const [pinnedToDay, setPinnedToDay] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);
  const [hasDayRange, setHasDayRange] = useState(false);
  const [dayRangeRows, setDayRangeRows] = useState<DayRangeConstraint[]>([
    { startDay: 0, endDay: Math.max(0, days - 1) },
  ]);
  const [hasTimeRange, setHasTimeRange] = useState(false);
  const [timeRangeStart, setTimeRangeStart] = useState("09:00");
  const [timeRangeEnd, setTimeRangeEnd] = useState("18:00");
  const [tabelogRating, setTabelogRating] = useState("");
  const [tabelogUrl, setTabelogUrl] = useState("");
  const [tabelogAward, setTabelogAward] = useState("");
  const [prependTabelogToDesc, setPrependTabelogToDesc] = useState(true);
  const [isFetchingTabelog, setIsFetchingTabelog] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  useEffect(() => {
    if (place) {
      setDesc(place.description || "");
      setDurationVal((place.estimatedDuration ?? 60).toString());
      setCategory(place.category);
      setRomanizedName(place.romanizedName || "");
      setHighlightLabel(place.highlight?.label || "");
      setHighlightText(place.highlight?.text || "");
      setPriceEstimate(place.priceEstimate || "");
      setReservationReq(place.reservation?.requirement || "");
      setReservationAdvance(place.reservation?.advanceTime || "");
      setReservationNotes(place.reservation?.notes || "");
      setIsBooked(Boolean(place.reservation?.isBooked));
      setBookingUrl(place.reservation?.bookingUrl || "");
      setConfirmationNumber(place.reservation?.confirmationNumber || "");
      setCustomTimeVal(place.customTime || "");
      setPinnedToDay(!!place.pinnedToDay);
      setIsStarred(!!place.isStarred);
      setDismissedDuplicate(!!place.dismissedDuplicate);
      if (place.allowedDayRanges && place.allowedDayRanges.length > 0) {
        setHasDayRange(true);
        setDayRangeRows(
          place.allowedDayRanges.map((r) => ({
            startDay: Math.max(0, Math.min(days - 1, r.startDay)),
            endDay: Math.max(0, Math.min(days - 1, r.endDay)),
          }))
        );
      } else {
        setHasDayRange(false);
        setDayRangeRows([{ startDay: 0, endDay: Math.max(0, days - 1) }]);
      }
      if (place.allowedTimeRange && place.allowedTimeRange.startTime && place.allowedTimeRange.endTime) {
        setHasTimeRange(true);
        setTimeRangeStart(place.allowedTimeRange.startTime);
        setTimeRangeEnd(place.allowedTimeRange.endTime);
      } else {
        setHasTimeRange(false);
        setTimeRangeStart("09:00");
        setTimeRangeEnd("18:00");
      }
      setTabelogRating(place.tabelog?.rating !== undefined && place.tabelog?.rating !== null ? place.tabelog.rating.toString() : "");
      setTabelogUrl(place.tabelog?.url || "");
      setTabelogAward(place.tabelog?.award || "");
      setPrependTabelogToDesc(true);
    }
  }, [place, days]);

  if (!place) return null;

  const handleSave = () => {
    const parsedDuration = parseInt(durationVal);
    const finalDuration = (!isNaN(parsedDuration) && parsedDuration > 0) ? parsedDuration : place.estimatedDuration;

    const trimmedHighlightText = highlightText.trim();
    const finalHighlight = trimmedHighlightText
      ? {
        label: highlightLabel.trim() || (category === "restaurant" ? "Must-Try" : "Pro Tip"),
        text: trimmedHighlightText,
      }
      : undefined;

    const hasReservationContent =
      Boolean(reservationReq) ||
      isBooked ||
      Boolean(bookingUrl.trim()) ||
      Boolean(confirmationNumber.trim()) ||
      Boolean(reservationAdvance.trim()) ||
      Boolean(reservationNotes.trim());

    const finalReservation: ReservationInfo | undefined = hasReservationContent
      ? {
        requirement: (reservationReq as ReservationRequirement) || "recommended",
        advanceTime: reservationAdvance.trim() || undefined,
        notes: reservationNotes.trim() || undefined,
        isBooked,
        bookingUrl: bookingUrl.trim() || undefined,
        confirmationNumber: confirmationNumber.trim() || undefined,
        whosInterested: place.reservation?.whosInterested,
      }
      : undefined;

    const trimmedCustomTime = customTimeVal.trim();
    const finalAllowedDayRanges: DayRangeConstraint[] | undefined = (hasDayRange && dayRangeRows.length > 0)
      ? mergeOverlappingRanges(
        dayRangeRows.map((r) => ({
          startDay: Math.min(r.startDay, r.endDay),
          endDay: Math.max(r.startDay, r.endDay),
        }))
      )
      : undefined;

    const finalAllowedTimeRange: TimeRangeConstraint | undefined = (hasTimeRange && timeRangeStart && timeRangeEnd)
      ? {
        startTime: timeRangeStart,
        endTime: timeRangeEnd,
      }
      : undefined;

    const isDayOutOfRange =
      place.dayIndex !== null &&
      place.dayIndex !== undefined &&
      finalAllowedDayRanges !== undefined &&
      !finalAllowedDayRanges.some((r) => place.dayIndex! >= r.startDay && place.dayIndex! <= r.endDay);

    const timeRangeChanged =
      finalAllowedTimeRange?.startTime !== place.allowedTimeRange?.startTime ||
      finalAllowedTimeRange?.endTime !== place.allowedTimeRange?.endTime;

    const shouldReoptimize =
      place.dayIndex !== null &&
      place.dayIndex !== undefined &&
      (((trimmedCustomTime || undefined) !== place.customTime ||
        finalDuration !== place.estimatedDuration ||
        pinnedToDay !== place.pinnedToDay ||
        timeRangeChanged) ||
        isDayOutOfRange);

    const parsedRating = parseFloat(tabelogRating);
    const hasTabelog =
      (!isNaN(parsedRating) && parsedRating > 0) ||
      Boolean(tabelogUrl.trim()) ||
      Boolean(tabelogAward.trim());

    const finalTabelog: TabelogInfo | undefined = hasTabelog
      ? {
          rating: !isNaN(parsedRating) && parsedRating > 0 ? parsedRating : undefined,
          url: tabelogUrl.trim() || undefined,
          award: tabelogAward.trim() || undefined,
          savedAt: Date.now(),
        }
      : undefined;

    let finalDesc = desc.trim();
    if (finalTabelog?.rating && prependTabelogToDesc) {
      finalDesc = formatDescriptionWithTabelog(finalDesc, finalTabelog.rating, finalTabelog.award);
    } else if (!prependTabelogToDesc) {
      finalDesc = stripTabelogPrefix(finalDesc);
    }

    updatePlace(place.id, {
      description: finalDesc,
      descriptionSource: finalDesc !== place.description ? "user" : place.descriptionSource,
      estimatedDuration: finalDuration,
      category,
      romanizedName: romanizedName.trim() || undefined,
      highlight: finalHighlight,
      priceEstimate: priceEstimate.trim() || undefined,
      reservation: finalReservation,
      tabelog: finalTabelog,
      customTime: trimmedCustomTime || undefined,
      pinnedToDay: isDayOutOfRange ? false : pinnedToDay,
      isStarred,
      dismissedDuplicate,
      allowedDayRanges: finalAllowedDayRanges,
      allowedTimeRange: finalAllowedTimeRange,
      ...(isDayOutOfRange ? { dayIndex: null, orderInDay: null, pinnedToDay: false } : {}),
    });
    onClose();

    if (shouldReoptimize && place.dayIndex !== null && place.dayIndex !== undefined && !isDayOutOfRange) {
      try {
        useRouteStore.getState().optimizeDay(place.dayIndex);
      } catch (e) {
        console.error("Failed to re-optimize day after editing place", e);
      }
    } else if (isDayOutOfRange) {
      toast.info(`Moved "${place.name}" to unassigned because Day ${(place.dayIndex ?? 0) + 1} is outside the new allowed range.`, "Schedule Updated");
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCat = e.target.value as PlaceCategory;
    setCategory(newCat);
    setDurationVal(getDefaultDuration(newCat).toString());
  };

  const handleFetchTabelog = async () => {
    if (!place) return;
    setIsFetchingTabelog(true);
    try {
      const res = await fetchTabelogInfo(
        place.name,
        place.address,
        romanizedName || place.romanizedName
      );
      if (res) {
        if (res.rating) {
          setTabelogRating(res.rating.toString());
          if (prependTabelogToDesc) {
            setDesc((prev) => formatDescriptionWithTabelog(prev, res.rating, res.award));
          }
        }
        if (res.url) setTabelogUrl(res.url);
        if (res.award) setTabelogAward(res.award);
        toast.success(`Found Tabelog listing (${res.rating ? `★ ${res.rating}` : "link found"})!`, "Tabelog Found");
      } else {
        toast.info("No direct Tabelog score found via AI. You can use 'Search Tabelog' to look up manually.", "Tabelog Lookup");
      }
    } catch {
      toast.error("Failed to query Tabelog via AI.", "Lookup Error");
    } finally {
      setIsFetchingTabelog(false);
    }
  };

  const handleUpdateDayRange = (index: number, field: "startDay" | "endDay", value: number) => {
    setDayRangeRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        if (field === "startDay") {
          return {
            startDay: value,
            endDay: Math.max(value, r.endDay),
          };
        } else {
          return {
            startDay: Math.min(r.startDay, value),
            endDay: value,
          };
        }
      })
    );
  };

  const handleAddDayRange = () => {
    if (dayRangeRows.length >= MAX_DAY_RANGES) return;
    const lastEnd = dayRangeRows[dayRangeRows.length - 1]?.endDay ?? 0;
    const nextStart = Math.min(days - 1, lastEnd + 1);
    const nextEnd = Math.min(days - 1, nextStart + 1);
    setDayRangeRows((prev) => [...prev, { startDay: nextStart, endDay: nextEnd }]);
  };

  const handleRemoveDayRange = (index: number) => {
    if (dayRangeRows.length <= 1) return;
    setDayRangeRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    setIsGeneratingAI(true);
    try {
      let aiData;
      if (appMode === "real") {
        aiData = await summarizePlace(
          place.name,
          place.address,
          (place as any).types || []
        );
      } else {
        const mockHighlight = getSpecificMockHighlight({ name: place.name, category, address: place.address });
        const mockPrice = getSpecificMockPrice({ name: place.name, category });
        const mockReservation = getSpecificMockReservation({ name: place.name, category, address: place.address });

        aiData = {
          description: getSpecificMockDescription({ name: place.name, category, address: place.address }),
          category: place.category,
          estimatedDuration: place.estimatedDuration,
          highlight: mockHighlight,
          priceEstimate: mockPrice,
          reservation: mockReservation,
        };
      }
      setDesc(aiData.description);
      setCategory(aiData.category);
      setDurationVal(aiData.estimatedDuration.toString());
      if (aiData.romanizedName) {
        setRomanizedName(aiData.romanizedName);
      }
      if (aiData.highlight) {
        setHighlightLabel(aiData.highlight.label);
        setHighlightText(aiData.highlight.text);
      }
      if (aiData.priceEstimate) {
        setPriceEstimate(aiData.priceEstimate);
      }
      if (aiData.reservation) {
        setReservationReq(aiData.reservation.requirement);
        setReservationAdvance(aiData.reservation.advanceTime || "");
        setReservationNotes(aiData.reservation.notes || "");
      }
      if (aiData.tabelog) {
        if (aiData.tabelog.rating) setTabelogRating(aiData.tabelog.rating.toString());
        if (aiData.tabelog.url) setTabelogUrl(aiData.tabelog.url);
        if (aiData.tabelog.award) setTabelogAward(aiData.tabelog.award);
      }
    } catch (err) {
      console.error(err);
      if (place.editorialSummary) {
        setDesc(place.editorialSummary);
      }
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleToggleExclude = async () => {
    if (!place) return;
    const willBeDisabled = !place.isDisabled;
    await togglePlaceDisabled(place.id);
    if (willBeDisabled) {
      toast.info(`Excluded "${place.name}" from schedule and routing.`, "Place Excluded");
    } else {
      toast.success(`Re-enabled "${place.name}" for routing.`, "Place Re-enabled");
    }
    onClose();
  };

  const currentRomanized = romanizedName || place.romanizedName;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-surface-200 dark:border-surface-700">

        <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-900/70 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg font-black text-surface-900 dark:text-white flex items-center gap-2 truncate">
              <MapPin className="w-5 h-5 text-primary-500 shrink-0" />
              <span className="truncate">{place.name}</span>
              {currentRomanized && currentRomanized.toLowerCase() !== place.name.toLowerCase() && (
                <span className="text-xs font-normal text-surface-500 dark:text-surface-400 italic shrink-0">
                  ({currentRomanized})
                </span>
              )}
            </h2>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 truncate">
              {place.address}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleExclude}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${place.isDisabled
                ? "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-200"
                : "bg-surface-100 dark:bg-surface-700/80 text-surface-700 dark:text-surface-300 border-surface-200 dark:border-surface-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-300 hover:border-amber-300"
                }`}
              title={
                place.isDisabled
                  ? "Re-enable place to include it in schedule and routing"
                  : "Exclude this place from schedule and route optimization"
              }
            >
              {place.isDisabled ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="hidden sm:inline">Include</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Exclude</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 rounded-full hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider flex items-center justify-between">
              <span>Romanized / English Name</span>
              <span className="text-[10px] text-surface-400 font-normal lowercase">(optional, for foreign scripts)</span>
            </label>
            <input
              type="text"
              value={romanizedName}
              onChange={(e) => setRomanizedName(e.target.value)}
              placeholder="e.g. Senso-ji, Wat Phra Kaew"
              className="w-full text-sm font-medium bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider">
                Category
              </label>
              <select
                value={category}
                onChange={handleCategoryChange}
                className="w-full text-sm font-medium bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {getCategoryEmoji(cat)} {getCategoryLabel(cat)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <Timer className="w-3.5 h-3.5" /> Duration (min)
              </label>
              <input
                type="number"
                min="5"
                value={durationVal}
                onChange={(e) => setDurationVal(e.target.value)}
                className="w-full text-sm font-medium bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Price Estimate
              </label>
              <input
                type="text"
                value={priceEstimate}
                onChange={(e) => setPriceEstimate(e.target.value)}
                placeholder="e.g. Free, ¥1,000, $15 - $25"
                className="w-full text-sm font-medium bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider">
                Description
              </label>
              <button
                onClick={handleGenerate}
                disabled={isGeneratingAI}
                className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded transition-colors disabled:opacity-50"
              >
                {isGeneratingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {isGeneratingAI ? "Generating..." : "AI Describe"}
              </button>
            </div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full text-sm text-surface-700 dark:text-surface-300 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none h-24 custom-scrollbar"
              placeholder="Add a description..."
            />
          </div>

          {/* Highlight Section (Must-Try / Photo Spot / Advice) */}
          <div className="space-y-1.5 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Contextual Highlight (Must-Try, Photo Spot, Advice)</span>
              </label>
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {["Must-Try", "Best Photo Spot", "Pro Tip", "Best Time to Go", "What to Buy"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setHighlightLabel(preset)}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded transition-all cursor-pointer ${highlightLabel === preset
                      ? "bg-amber-200 dark:bg-amber-800/80 text-amber-900 dark:text-amber-100 font-bold shadow-2xs"
                      : "bg-amber-100/60 dark:bg-amber-950/40 hover:bg-amber-200/80 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300"
                      }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={highlightLabel}
                onChange={(e) => setHighlightLabel(e.target.value)}
                placeholder={category === "restaurant" ? "Must-Try" : "Pro Tip"}
                className="text-xs font-semibold bg-white dark:bg-surface-900 border border-amber-200 dark:border-amber-800/80 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                title="Highlight label (e.g. Must-Try, Best Photo Spot)"
              />
              <input
                type="text"
                value={highlightText}
                onChange={(e) => setHighlightText(e.target.value)}
                placeholder={category === "restaurant" ? "e.g. Truffle ramen & pan-fried gyoza" : "e.g. Sunset view from east garden"}
                className="col-span-2 text-xs font-medium bg-white dark:bg-surface-900 border border-amber-200 dark:border-amber-800/80 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Reservation & Booking Guidance Section */}
          <div className="space-y-1.5 p-3 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Reservation & Booking Timing</span>
              </label>
              <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-medium">
                Shown in cards & schedule
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={reservationReq}
                onChange={(e) => setReservationReq(e.target.value as ReservationRequirement | "")}
                className="text-xs font-semibold bg-white dark:bg-surface-900 border border-indigo-200 dark:border-indigo-800/80 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                title="Reservation Requirement Status"
              >
                <option value="">None / Unspecified</option>
                <option value="required">🔴 Required</option>
                <option value="recommended">🟡 Recommended</option>
                <option value="walk_ins_only">🔵 Walk-in Only</option>
                <option value="not_needed">🟢 Not Needed</option>
              </select>
              <input
                type="text"
                value={reservationAdvance}
                onChange={(e) => setReservationAdvance(e.target.value)}
                placeholder="e.g. Reserve 1 month in advance, opens 30 days prior"
                className="col-span-2 text-xs font-medium bg-white dark:bg-surface-900 border border-indigo-200 dark:border-indigo-800/80 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                title="Advance booking timing guidance"
              />
            </div>

            {/* Notes */}
            <div>
              <input
                type="text"
                value={reservationNotes}
                onChange={(e) => setReservationNotes(e.target.value)}
                placeholder="Reservation notes (e.g. Online lottery, TableCheck link, phone only)"
                className="w-full text-xs font-medium bg-white dark:bg-surface-900 border border-indigo-200 dark:border-indigo-800/80 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Booking URL & Confirmation Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="relative flex items-center">
                <Link2 className="absolute left-2.5 w-3.5 h-3.5 text-indigo-400 pointer-events-none" />
                <input
                  type="url"
                  value={bookingUrl}
                  onChange={(e) => setBookingUrl(e.target.value)}
                  placeholder="Booking link (https://...)"
                  className="w-full pl-8 pr-7 text-xs font-medium bg-white dark:bg-surface-900 border border-indigo-200 dark:border-indigo-800/80 text-surface-900 dark:text-white rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {bookingUrl && (
                  <a
                    href={bookingUrl.startsWith("http") ? bookingUrl : `https://${bookingUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300"
                    title="Open booking link in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <div className="relative flex items-center">
                <Hash className="absolute left-2.5 w-3.5 h-3.5 text-indigo-400 pointer-events-none" />
                <input
                  type="text"
                  value={confirmationNumber}
                  onChange={(e) => setConfirmationNumber(e.target.value)}
                  placeholder="Confirmation / Code #"
                  className="w-full pl-8 text-xs font-medium bg-white dark:bg-surface-900 border border-indigo-200 dark:border-indigo-800/80 text-surface-900 dark:text-white rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Booking Status Toggle */}
            <div className="flex items-center justify-between pt-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 ${isBooked ? "text-emerald-500 fill-emerald-100 dark:fill-emerald-950" : "text-surface-400"}`} />
                <div>
                  <span className="text-xs font-semibold text-surface-900 dark:text-white">
                    Reservation Confirmed / Booked
                  </span>
                  <p className="text-[10px] text-surface-500 dark:text-surface-400">
                    Mark as completed in Reservations Hub
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                <input
                  type="checkbox"
                  checked={isBooked}
                  onChange={(e) => setIsBooked(e.target.checked)}
                  className="sr-only peer"
                  aria-label="Reservation booked status"
                />
                <div className="w-8 h-4.5 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all dark:bg-surface-700 peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Custom Locked Reservation Time */}
            <div className="pt-2.5 mt-2 border-t border-indigo-100 dark:border-indigo-900/40 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    Locked Arrival Time
                  </span>
                  <span className="text-[10px] text-indigo-700/80 dark:text-indigo-400 leading-tight">
                    Fixed arrival/reservation time (e.g. 21:00 for club/dinner)
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="time"
                    value={customTimeVal}
                    onChange={(e) => setCustomTimeVal(e.target.value)}
                    className="text-xs font-bold bg-white dark:bg-surface-900 border border-indigo-200 dark:border-indigo-800/80 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title="Lock schedule arrival time"
                  />
                  {customTimeVal && (
                    <button
                      type="button"
                      onClick={() => setCustomTimeVal("")}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Explicit Pin to Day Toggle (when place is assigned to a day) */}
              {place.dayIndex !== null && place.dayIndex !== undefined && (
                <div className="pt-2 border-t border-indigo-100/60 dark:border-indigo-900/30 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                      <Pin className={`w-3 h-3 ${pinnedToDay ? "fill-current text-indigo-600 dark:text-indigo-400" : "text-surface-400"}`} />
                      Pin to Day {place.dayIndex + 1}
                    </span>
                    <span className="text-[10px] text-indigo-700/70 dark:text-indigo-400">
                      {customTimeVal
                        ? pinnedToDay
                          ? `Exact reservation locked to Day ${place.dayIndex + 1} at ${customTimeVal}`
                          : `Flexible day — optimizer can place this on the best day at ${customTimeVal}`
                        : pinnedToDay
                          ? `Locked to Day ${place.dayIndex + 1} (optimizer won't move to another day)`
                          : `Flexible day — optimizer can redistribute to another day`}
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                    <input
                      type="checkbox"
                      checked={pinnedToDay}
                      onChange={(e) => setPinnedToDay(e.target.checked)}
                      className="sr-only peer"
                      aria-label={`Pin place to Day ${place.dayIndex + 1}`}
                    />
                    <div className="w-8 h-4.5 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all dark:bg-surface-700 peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Tabelog (食べログ) Section for Restaurants in Japan */}
          {(category === "restaurant" || isJapanRestaurant(place)) && (
            <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 dark:border-amber-500/30 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-500 text-sm">🍜</span>
                  <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                    Tabelog (食べログ) Review & Links
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={getTabelogSearchUrl({ name: place.name, romanizedName, address: place.address })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 flex items-center gap-0.5 hover:underline"
                  >
                    Search Tabelog <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    onClick={handleFetchTabelog}
                    disabled={isFetchingTabelog}
                    className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                    title="AI search for Tabelog rating and official link"
                  >
                    {isFetchingTabelog ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {isFetchingTabelog ? "Finding..." : "AI Fetch"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> Star Rating
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1.00"
                    max="5.00"
                    value={tabelogRating}
                    onChange={(e) => setTabelogRating(e.target.value)}
                    placeholder="e.g. 3.74 (>=3.5 is top 3%)"
                    className="w-full text-xs font-semibold bg-white dark:bg-surface-900 border border-amber-200 dark:border-amber-800/80 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                    Award / Honor (optional)
                  </label>
                  <input
                    type="text"
                    value={tabelogAward}
                    onChange={(e) => setTabelogAward(e.target.value)}
                    placeholder="e.g. Hyakumeiten 2024, Bronze"
                    className="w-full text-xs font-medium bg-white dark:bg-surface-900 border border-amber-200 dark:border-amber-800/80 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                    <Link2 className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Direct Tabelog URL
                  </label>
                  {tabelogUrl && (
                    <a
                      href={tabelogUrl.startsWith("http") ? tabelogUrl : `https://${tabelogUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-400 flex items-center gap-0.5 hover:underline"
                    >
                      Open listing <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  value={tabelogUrl}
                  onChange={(e) => setTabelogUrl(e.target.value)}
                  placeholder="https://tabelog.com/tokyo/A1301/..."
                  className="w-full text-xs font-medium bg-white dark:bg-surface-900 border border-amber-200 dark:border-amber-800/80 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Prepend to Description checkbox */}
              <div className="flex items-center justify-between pt-1 border-t border-amber-200/50 dark:border-amber-800/40">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prependTabelogToDesc}
                    onChange={(e) => setPrependTabelogToDesc(e.target.checked)}
                    className="w-3.5 h-3.5 text-amber-600 rounded focus:ring-amber-500 border-amber-300"
                  />
                  <span className="text-[11px] text-surface-700 dark:text-surface-300">
                    Prepend rating to description on save <span className="text-amber-600 dark:text-amber-400 font-medium">(e.g. &quot;★ 3.74 Tabelog • ...&quot;)</span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Starred / Must-Visit Priority Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${isStarred ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400" : "bg-surface-100 dark:bg-surface-800 text-surface-400 dark:text-surface-500"}`}>
                <Star className={`w-4 h-4 ${isStarred ? "fill-amber-400 text-amber-500" : ""}`} />
              </div>
              <div>
                <span className="text-xs font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                  Must-Visit Place (Priority Star)
                </span>
                <p className="text-[10px] text-surface-500 dark:text-surface-400">
                  Optimizer will prioritize this place and guarantee it is never left unassigned.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
              <input
                type="checkbox"
                checked={isStarred}
                onChange={(e) => setIsStarred(e.target.checked)}
                className="sr-only peer"
                aria-label="Must-visit place"
              />
              <div className="w-9 h-5 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:bg-surface-700 peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Duplicate Detection Dismiss Override Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-100/60 dark:bg-surface-800/40 border border-surface-200 dark:border-surface-700/80">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${dismissedDuplicate ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" : "bg-surface-200/60 dark:bg-surface-700 text-surface-400 dark:text-surface-500"}`}>
                <Copy className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                  Dismiss Duplicate Flag
                </span>
                <p className="text-[10px] text-surface-500 dark:text-surface-400">
                  Treat this place as a distinct location and ignore duplicate warnings.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
              <input
                type="checkbox"
                checked={dismissedDuplicate}
                onChange={(e) => setDismissedDuplicate(e.target.checked)}
                className="sr-only peer"
                aria-label="Dismiss duplicate flag"
              />
              <div className="w-9 h-5 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:bg-surface-700 peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          {/* Allowed Trip Day Range Constraint */}
          <div className="p-3.5 rounded-xl bg-surface-100/60 dark:bg-surface-800/40 border border-surface-200 dark:border-surface-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${hasDayRange ? "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400" : "bg-surface-200/60 dark:bg-surface-700 text-surface-400 dark:text-surface-500"}`}>
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                    Restrict to Certain Days / Dates
                  </span>
                  <p className="text-[10px] text-surface-500 dark:text-surface-400">
                    Optimizer will only schedule this place within your specified day or date range.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                <input
                  type="checkbox"
                  checked={hasDayRange}
                  onChange={(e) => setHasDayRange(e.target.checked)}
                  className="sr-only peer"
                  aria-label="Restrict to certain days"
                />
                <div className="w-9 h-5 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:bg-surface-700 peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {hasDayRange && (
              <div className="pt-2 border-t border-surface-200/60 dark:border-surface-700/60 space-y-2.5 animate-in fade-in duration-150">
                {/* Range Rows */}
                <div className="space-y-2">
                  {dayRangeRows.map((row, idx) => (
                    <div
                      key={idx}
                      className="flex items-end gap-2 p-2 rounded-lg bg-surface-50/80 dark:bg-surface-800/60 border border-surface-200/80 dark:border-surface-700/60"
                    >
                      <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 shrink-0 self-center">
                        <span className="w-5 h-5 rounded bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-black text-[10px]">
                          {idx + 1}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider block mb-0.5">
                          From (Start Day)
                        </label>
                        <select
                          value={row.startDay}
                          onChange={(e) =>
                            handleUpdateDayRange(idx, "startDay", parseInt(e.target.value, 10))
                          }
                          className="w-full text-xs font-medium bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {Array.from({ length: days }, (_, i) => (
                            <option key={i} value={i}>
                              {formatDayIndexLabel(i, startDate, dayTitles)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <span className="text-surface-400 dark:text-surface-500 text-xs font-bold self-center pb-1">
                        →
                      </span>

                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider block mb-0.5">
                          To (End Day)
                        </label>
                        <select
                          value={row.endDay}
                          onChange={(e) =>
                            handleUpdateDayRange(idx, "endDay", parseInt(e.target.value, 10))
                          }
                          className="w-full text-xs font-medium bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {Array.from({ length: days }, (_, i) => (
                            <option key={i} value={i}>
                              {formatDayIndexLabel(i, startDate, dayTitles)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {dayRangeRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDayRange(idx)}
                          className="p-1 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer self-center"
                          title="Remove this range"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Another Range */}
                {dayRangeRows.length < MAX_DAY_RANGES && (
                  <button
                    type="button"
                    onClick={handleAddDayRange}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-2.5 py-1.5 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add another date range ({dayRangeRows.length}/{MAX_DAY_RANGES})</span>
                  </button>
                )}

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-semibold text-surface-400">Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDayRangeRows([{ startDay: 0, endDay: days - 1 }]);
                    }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface-200/70 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer"
                  >
                    Full Trip
                  </button>
                  {days >= 3 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const mid = Math.ceil(days / 2);
                          setDayRangeRows([{ startDay: 0, endDay: mid - 1 }]);
                        }}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface-200/70 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer"
                      >
                        First Half (Days 1–{Math.ceil(days / 2)})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const mid = Math.ceil(days / 2);
                          setDayRangeRows([{ startDay: mid, endDay: days - 1 }]);
                        }}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface-200/70 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer"
                      >
                        Second Half (Days {Math.ceil(days / 2) + 1}–{days})
                      </button>
                    </>
                  )}
                </div>

                {/* Summary badge / text */}
                <div className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/30 px-2.5 py-1.5 rounded-lg border border-indigo-200/60 dark:border-indigo-900/40 flex items-center justify-between flex-wrap gap-1">
                  <span>
                    Allowed schedule:{" "}
                    <strong>
                      {formatMultiRangeBadge(dayRangeRows, startDate, dayTitles).fullLabel}
                    </strong>
                  </span>
                  {dayRangeRows.length > 1 && (
                    <span className="text-[9px] text-indigo-500/80 dark:text-indigo-400/70">
                      (Overlapping ranges auto-merge on save)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Restricted Time Window Constraint */}
          <div className="p-3.5 rounded-xl bg-surface-100/60 dark:bg-surface-800/40 border border-surface-200 dark:border-surface-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${hasTimeRange ? "bg-teal-100 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400" : "bg-surface-200/60 dark:bg-surface-700 text-surface-400 dark:text-surface-500"}`}>
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-surface-900 dark:text-white flex items-center gap-1.5">
                    Restrict to Time Window
                  </span>
                  <p className="text-[10px] text-surface-500 dark:text-surface-400">
                    Optimizer will only schedule this place within your specified daily time window.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                <input
                  type="checkbox"
                  checked={hasTimeRange}
                  onChange={(e) => setHasTimeRange(e.target.checked)}
                  className="sr-only peer"
                  aria-label="Restrict to time window"
                />
                <div className="w-9 h-5 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:bg-surface-700 peer-checked:bg-teal-600"></div>
              </label>
            </div>

            {hasTimeRange && (
              <div className="pt-2 border-t border-surface-200/60 dark:border-surface-700/60 space-y-2.5 animate-in fade-in duration-150">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider block">
                      Earliest Arrival
                    </label>
                    <input
                      type="time"
                      value={timeRangeStart}
                      onChange={(e) => setTimeRangeStart(e.target.value)}
                      className="w-full text-xs font-semibold bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                      style={{ colorScheme: "dark light" }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider block">
                      Latest Departure
                    </label>
                    <input
                      type="time"
                      value={timeRangeEnd}
                      onChange={(e) => setTimeRangeEnd(e.target.value)}
                      className="w-full text-xs font-semibold bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                      style={{ colorScheme: "dark light" }}
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-semibold text-surface-400">Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeRangeStart("08:00");
                      setTimeRangeEnd("12:00");
                    }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface-200/70 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer"
                  >
                    Morning (8 AM – 12 PM)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeRangeStart("12:00");
                      setTimeRangeEnd("17:00");
                    }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface-200/70 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer"
                  >
                    Afternoon (12 PM – 5 PM)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeRangeStart("17:00");
                      setTimeRangeEnd("21:00");
                    }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface-200/70 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer"
                  >
                    Evening (5 PM – 9 PM)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimeRangeStart("20:00");
                      setTimeRangeEnd("23:59");
                    }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-surface-200/70 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 transition-colors cursor-pointer"
                  >
                    Night (8 PM – Late)
                  </button>
                </div>

                {/* Preview Badge */}
                <div className="text-[10px] text-teal-700 dark:text-teal-300 bg-teal-50/80 dark:bg-teal-950/30 px-2.5 py-1.5 rounded-lg border border-teal-200/60 dark:border-teal-900/40 flex items-center justify-between">
                  <span>
                    Only schedule between <strong>{(() => {
                      const [h, m] = timeRangeStart.split(":").map(Number);
                      const ampm = (h || 0) >= 12 ? "PM" : "AM";
                      const h12 = h === 0 ? 12 : (h || 0) > 12 ? (h || 0) - 12 : h;
                      return m === 0 ? `${h12} ${ampm}` : `${h12}:${(m ?? 0).toString().padStart(2, "0")} ${ampm}`;
                    })()}</strong> and <strong>{(() => {
                      const [h, m] = timeRangeEnd.split(":").map(Number);
                      const ampm = (h || 0) >= 12 ? "PM" : "AM";
                      const h12 = h === 0 ? 12 : (h || 0) > 12 ? (h || 0) - 12 : h;
                      return m === 0 ? `${h12} ${ampm}` : `${h12}:${(m ?? 0).toString().padStart(2, "0")} ${ampm}`;
                    })()}</strong>.
                  </span>
                  {timeRangeStart >= timeRangeEnd && (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold ml-2">
                      (Note: Ends next day / overnight)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-surface-600 dark:text-surface-300 hover:text-surface-900 dark:hover:text-white bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 border border-surface-200 dark:border-surface-600 px-3 py-2 rounded-lg transition-all"
              title="View on Google Maps"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on Google
            </a>

            {place.addedAt && (
              <span className="text-[11px] font-medium text-surface-400 dark:text-surface-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-surface-400" />
                Added {format(new Date(place.addedAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
