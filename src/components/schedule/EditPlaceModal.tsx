import React, { useState, useEffect } from "react";
import { X, MapPin, Timer, Sparkles, Loader2, ExternalLink, Coins, CalendarClock, Lock, Star, Copy } from "lucide-react";
import { useRouteStore } from "../../store/useRouteStore";
import { ALL_CATEGORIES, getCategoryEmoji, getCategoryLabel, getDefaultDuration } from "../../utils/categoryUtils";
import { PlaceCategory, ReservationInfo, ReservationRequirement } from "../../types";
import { summarizePlace } from "../../services/aiService";
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
  const { places, updatePlace, appMode } = useRouteStore();
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
  const [customTimeVal, setCustomTimeVal] = useState("");
  const [isStarred, setIsStarred] = useState(false);
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);
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
      setCustomTimeVal(place.customTime || "");
      setIsStarred(!!place.isStarred);
      setDismissedDuplicate(!!place.dismissedDuplicate);
    }
  }, [place]);

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

    const finalReservation: ReservationInfo | undefined = reservationReq
      ? {
          requirement: reservationReq as ReservationRequirement,
          advanceTime: reservationAdvance.trim() || undefined,
          notes: reservationNotes.trim() || undefined,
        }
      : undefined;

    const trimmedCustomTime = customTimeVal.trim();
    const shouldReoptimize =
      place.dayIndex !== null &&
      place.dayIndex !== undefined &&
      ((trimmedCustomTime || undefined) !== place.customTime || finalDuration !== place.estimatedDuration);

    updatePlace(place.id, {
      description: desc,
      descriptionSource: desc !== place.description ? "user" : place.descriptionSource,
      estimatedDuration: finalDuration,
      category,
      romanizedName: romanizedName.trim() || undefined,
      highlight: finalHighlight,
      priceEstimate: priceEstimate.trim() || undefined,
      reservation: finalReservation,
      customTime: trimmedCustomTime || undefined,
      pinnedToDay: trimmedCustomTime ? true : place.pinnedToDay,
      isStarred,
      dismissedDuplicate,
    });
    onClose();

    if (shouldReoptimize && place.dayIndex !== null && place.dayIndex !== undefined) {
      try {
        useRouteStore.getState().optimizeDay(place.dayIndex);
      } catch (e) {
        console.error("Failed to re-optimize day after editing place", e);
      }
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCat = e.target.value as PlaceCategory;
    setCategory(newCat);
    setDurationVal(getDefaultDuration(newCat).toString());
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
    } catch (err) {
      console.error(err);
      if (place.editorialSummary) {
        setDesc(place.editorialSummary);
      }
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const currentRomanized = romanizedName || place.romanizedName;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between p-5 border-b border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-900/50">
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
          <button
            onClick={onClose}
            className="p-2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 rounded-full hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
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
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                      highlightLabel === preset
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

            {/* Custom Locked Reservation Time */}
            <div className="pt-2.5 mt-2 border-t border-indigo-100 dark:border-indigo-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  Locked Schedule Time
                </span>
                <span className="text-[10px] text-indigo-700/80 dark:text-indigo-400 leading-tight">
                  Locks this place to an exact arrival time (won't be moved by optimizer)
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
          </div>

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
                  Optimizer will prioritize this place and guarantee it is never left unassigned or dropped.
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
        </div>
        
        <div className="p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/80 flex items-center justify-between gap-3">
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
