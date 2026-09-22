import React, { useState, useMemo } from "react";
import {
  X,
  Ticket,
  CalendarClock,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Search,
  Lock,
  CalendarDays,
  Sparkles,
  Hash,
  ArrowUpDown,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouteStore } from "../../store/useRouteStore";
import { toast } from "../../services/toastService";
import {
  isReservationRelevant,
  enrichReservationPlace,
  generateBookingChecklist,
  EnrichedReservationPlace,
  BookingUrgency,
} from "../../utils/reservationUtils";
import { getCategoryEmoji, getCategoryLabel } from "../../utils/categoryUtils";
import { formatDayIndexLabel } from "../../utils/dayRangeUtils";
import { EditPlaceModal } from "./EditPlaceModal";
import { format } from "date-fns";

interface ReservationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterTab = "pending" | "booked" | "required" | "recommended" | "walk_in";
type SortOption = "urgency" | "schedule" | "name";

export const ReservationsModal: React.FC<ReservationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { places, startDate, dayTitles, updatePlace } = useRouteStore();

  const [activeTab, setActiveTab] = useState<FilterTab>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("urgency");
  const [copiedChecklist, setCopiedChecklist] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);

  // Filter all relevant places & enrich them with booking math
  const allReservationPlaces: EnrichedReservationPlace[] = useMemo(() => {
    return places
      .filter((p) => !p.isDisabled && isReservationRelevant(p))
      .map((p) => enrichReservationPlace(p, startDate));
  }, [places, startDate]);

  // Key KPI metrics
  const totalCount = allReservationPlaces.length;
  const bookedCount = allReservationPlaces.filter((p) => p.isBooked).length;
  // Walk-in / no-res places: don't need to be booked
  const walkInCount = allReservationPlaces.filter(
    (p) => p.requirement === "walk_ins_only" || p.requirement === "not_needed"
  ).length;
  // Pending = unbooked AND requires actual booking action
  const pendingCount = allReservationPlaces.filter(
    (p) => !p.isBooked && p.requirement !== "walk_ins_only" && p.requirement !== "not_needed"
  ).length;
  const urgentCount = allReservationPlaces.filter(
    (p) => !p.isBooked && p.urgency === "urgent" && p.requirement !== "walk_ins_only" && p.requirement !== "not_needed"
  ).length;
  const requiredCount = allReservationPlaces.filter(
    (p) => p.requirement === "required"
  ).length;
  const recommendedCount = allReservationPlaces.filter(
    (p) => p.requirement === "recommended"
  ).length;
  // Trip readiness: booked out of places that require or recommend a reservation
  const bookablePlaces = allReservationPlaces.filter(
    (p) => p.requirement === "required" || p.requirement === "recommended"
  );
  const bookableBookedCount = bookablePlaces.filter((p) => p.isBooked).length;
  const progressPercent =
    bookablePlaces.length > 0
      ? Math.round((bookableBookedCount / bookablePlaces.length) * 100)
      : 0;

  // Filtered and sorted places
  const displayedPlaces = useMemo(() => {
    let list = [...allReservationPlaces];

    // Tab filter
    if (activeTab === "pending") {
      // Only show places that aren't booked AND actually require a booking action
      list = list.filter(
        (p) => !p.isBooked && p.requirement !== "walk_ins_only" && p.requirement !== "not_needed"
      );
    } else if (activeTab === "booked") {
      list = list.filter((p) => p.isBooked);
    } else if (activeTab === "required") {
      list = list.filter((p) => p.requirement === "required");
    } else if (activeTab === "recommended") {
      list = list.filter((p) => p.requirement === "recommended");
    } else if (activeTab === "walk_in") {
      list = list.filter(
        (p) => p.requirement === "walk_ins_only" || p.requirement === "not_needed"
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.place.name.toLowerCase().includes(q) ||
          (item.place.reservation?.notes && item.place.reservation.notes.toLowerCase().includes(q)) ||
          (item.place.reservation?.confirmationNumber && item.place.reservation.confirmationNumber.toLowerCase().includes(q)) ||
          (item.place.reservation?.advanceTime && item.place.reservation.advanceTime.toLowerCase().includes(q))
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "urgency") {
        // Unbooked urgent first, then soon, then future, then unknown, then booked
        const urgencyWeight: Record<BookingUrgency, number> = {
          urgent: 1,
          soon: 2,
          future: 3,
          unknown: 4,
          booked: 5,
        };
        const weightDiff = urgencyWeight[a.urgency] - urgencyWeight[b.urgency];
        if (weightDiff !== 0) return weightDiff;

        // Within same urgency, sort by targetBookingDate ascending
        if (a.targetBookingDate && b.targetBookingDate) {
          return a.targetBookingDate.getTime() - b.targetBookingDate.getTime();
        }
        if (a.targetBookingDate) return -1;
        if (b.targetBookingDate) return 1;
      }

      if (sortBy === "schedule") {
        const dayA = a.place.dayIndex ?? 999;
        const dayB = b.place.dayIndex ?? 999;
        if (dayA !== dayB) return dayA - dayB;
        return (a.place.orderInDay ?? 999) - (b.place.orderInDay ?? 999);
      }

      // Name alphabetical
      return a.place.name.localeCompare(b.place.name);
    });

    return list;
  }, [allReservationPlaces, activeTab, searchQuery, sortBy]);

  const handleToggleBooked = (item: EnrichedReservationPlace) => {
    const newStatus = !item.isBooked;
    updatePlace(item.place.id, {
      reservation: {
        requirement: item.requirement,
        advanceTime: item.place.reservation?.advanceTime,
        notes: item.place.reservation?.notes,
        bookingUrl: item.place.reservation?.bookingUrl,
        confirmationNumber: item.place.reservation?.confirmationNumber,
        isBooked: newStatus,
      },
    });

    if (newStatus) {
      toast.success(`Marked "${item.place.name}" as confirmed/booked!`, "Reservation Confirmed");
    } else {
      toast.info(`Marked "${item.place.name}" as pending.`, "Reservation Pending");
    }
  };

  const handleCopyChecklist = async () => {
    try {
      const markdown = generateBookingChecklist(allReservationPlaces, startDate, dayTitles);
      await navigator.clipboard.writeText(markdown);
      setCopiedChecklist(true);
      toast.success("Reservation checklist copied to clipboard!", "Copied");
      setTimeout(() => setCopiedChecklist(false), 2500);
    } catch {
      toast.error("Failed to copy checklist to clipboard.", "Copy Failed");
    }
  };

  const handleCopyCode = async (code: string, placeId: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(placeId);
      toast.success(`Copied confirmation code: ${code}`, "Copied");
      setTimeout(() => setCopiedCodeId(null), 2000);
    } catch {
      toast.error("Failed to copy code.", "Copy Failed");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18 }}
          className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] border border-surface-200 dark:border-surface-700 transition-colors"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-surface-900 dark:text-white">
                    Reservations & Booking Hub
                  </h2>
                  {urgentCount > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 animate-pulse flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {urgentCount} Action Needed
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Track advance booking windows, reservation deadlines, links & confirmation codes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyChecklist}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-100 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 border border-surface-200 dark:border-surface-600 transition-colors"
                title="Copy markdown checklist to notes or reminders"
              >
                {copiedChecklist ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Checklist</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-full transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-surface-50/40 dark:bg-surface-900/30 border-b border-surface-200/80 dark:border-surface-700/80">
            <div className="bg-white dark:bg-surface-800/90 rounded-xl p-3 border border-surface-200 dark:border-surface-700 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-surface-500 dark:text-surface-400 flex items-center gap-1">
                <Ticket className="w-3.5 h-3.5 text-indigo-500" /> Total Places
              </span>
              <span className="text-xl font-extrabold text-surface-900 dark:text-white mt-1">
                {totalCount}
              </span>
            </div>

            <div className="bg-white dark:bg-surface-800/90 rounded-xl p-3 border border-surface-200 dark:border-surface-700 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-surface-500 dark:text-surface-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" /> Pending Action
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
                  {pendingCount}
                </span>
                {urgentCount > 0 && (
                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    ({urgentCount} urgent)
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-surface-800/90 rounded-xl p-3 border border-surface-200 dark:border-surface-700 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-surface-500 dark:text-surface-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Booked & Confirmed
              </span>
              <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {bookedCount}
              </span>
            </div>

            <div className="bg-white dark:bg-surface-800/90 rounded-xl p-3 border border-surface-200 dark:border-surface-700 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-semibold text-surface-500 dark:text-surface-400">
                <span>Trip Readiness</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Controls Bar: Filters, Search, Sort */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-5 py-3 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setActiveTab("pending")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === "pending"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600"
                }`}
              >
                <span>Pending ({pendingCount})</span>
                {urgentCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("booked")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                  activeTab === "booked"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600"
                }`}
              >
                Booked ({bookedCount})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("required")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                  activeTab === "required"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600"
                }`}
              >
                Res. Required ({requiredCount})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("recommended")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                  activeTab === "recommended"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600"
                }`}
              >
                Res. Recommended ({recommendedCount})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("walk_in")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === "walk_in"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600"
                }`}
              >
                Walk-in / No Res. ({walkInCount})
              </button>
            </div>

            {/* Search & Sort */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search reservations..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <label className="relative flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-700 dark:text-surface-300 cursor-pointer focus-within:ring-2 focus-within:ring-indigo-500 transition-colors hover:bg-surface-100 dark:hover:bg-surface-800">
                <ArrowUpDown className="w-3.5 h-3.5 text-surface-400 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="appearance-none bg-transparent border-none outline-none text-xs font-semibold text-surface-900 dark:text-white cursor-pointer pr-1"
                  title="Sort places"
                >
                  <option value="urgency">Urgency First</option>
                  <option value="schedule">Trip Day Order</option>
                  <option value="name">Place Name (A-Z)</option>
                </select>
              </label>
            </div>
          </div>

          {/* Places List Body */}
          <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 space-y-3 bg-surface-50/50 dark:bg-surface-900/40">
            {totalCount === 0 ? (
              <div className="py-12 px-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 mx-auto flex items-center justify-center border border-indigo-200/60 dark:border-indigo-900/40">
                  <CalendarClock className="w-7 h-7" />
                </div>
                <div className="max-w-md mx-auto">
                  <h3 className="text-base font-bold text-surface-900 dark:text-white">
                    No Reservations Scheduled Yet
                  </h3>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-1.5 leading-relaxed">
                    Places will automatically appear here when they have reservation requirements (e.g. popular restaurants, museums, exhibitions) or when you set a locked custom arrival time.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 p-3 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl text-xs text-indigo-800 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-900/30 text-left max-w-md">
                  <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>
                    <strong>Pro Tip:</strong> Click any place in your schedule or Places to Visit list, click "Edit", and set the Reservation status or locked time to track it here.
                  </span>
                </div>
              </div>
            ) : displayedPlaces.length === 0 ? (
              <div className="py-10 text-center text-surface-500 dark:text-surface-400 space-y-2">
                <AlertCircle className="w-8 h-8 mx-auto text-surface-400" />
                <p className="text-sm font-semibold">No reservations found</p>
                <p className="text-xs">Try adjusting your filter or search query.</p>
              </div>
            ) : (
              displayedPlaces.map((item) => {
                const { place, visitDate, targetBookingDate, urgency, countdownLabel, isBooked, requirement } = item;

                // Urgency badge styling
                let urgencyBadgeClass = "bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-300 border-surface-200 dark:border-surface-600";
                if (isBooked) {
                  urgencyBadgeClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80";
                } else if (urgency === "urgent") {
                  urgencyBadgeClass = "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-900/80 animate-pulse";
                } else if (urgency === "soon") {
                  urgencyBadgeClass = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900/60";
                } else if (urgency === "future") {
                  urgencyBadgeClass = "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/60";
                }

                // Requirement badge label
                const reqBadgeMap: Record<string, { label: string; color: string }> = {
                  required: { label: "🔴 Reservation Required", color: "text-rose-600 dark:text-rose-400" },
                  recommended: { label: "🟡 Reservation Recommended", color: "text-amber-600 dark:text-amber-400" },
                  walk_ins_only: { label: "🔵 Walk-in Only", color: "text-blue-600 dark:text-blue-400" },
                  not_needed: { label: "🟢 Not Needed", color: "text-emerald-600 dark:text-emerald-400" },
                };
                const reqBadge = reqBadgeMap[requirement] || { label: "Custom Time Lock", color: "text-indigo-600 dark:text-indigo-400" };

                // Scheduled visit label
                const scheduledDayText =
                  place.dayIndex !== null && place.dayIndex !== undefined
                    ? formatDayIndexLabel(place.dayIndex, startDate, dayTitles)
                    : "Flexible Day (Unassigned)";

                return (
                  <div
                    key={place.id}
                    className={`p-4 rounded-xl transition-all border ${
                      isBooked
                        ? "bg-white/70 dark:bg-surface-800/70 border-surface-200 dark:border-surface-700 opacity-90 hover:opacity-100"
                        : urgency === "urgent"
                        ? "bg-rose-50/20 dark:bg-rose-950/10 border-rose-200/80 dark:border-rose-900/50 shadow-xs"
                        : "bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 shadow-xs"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      {/* Left: Checkbox + Place Details */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Booked Checkbox */}
                        <button
                          type="button"
                          onClick={() => handleToggleBooked(item)}
                          className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                            isBooked
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                              : "bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 text-transparent hover:border-emerald-500"
                          }`}
                          title={isBooked ? "Click to mark as pending" : "Click to mark as booked & confirmed"}
                          aria-label={`Toggle booking for ${place.name}`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </button>

                        <div className="space-y-1.5 flex-1 min-w-0">
                          {/* Title & Badges */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-base font-bold text-surface-900 dark:text-white truncate">
                              {place.name}
                            </span>
                            {place.romanizedName && (
                              <span className="text-xs text-surface-400 font-normal">
                                ({place.romanizedName})
                              </span>
                            )}
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 font-medium">
                              {getCategoryEmoji(place.category)} {getCategoryLabel(place.category)}
                            </span>
                            {place.customTime && (
                              <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-900/50 flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                {place.customTime}
                              </span>
                            )}
                          </div>

                          {/* Scheduled Visit Time */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-600 dark:text-surface-300">
                            <span className="flex items-center gap-1 font-medium">
                              <CalendarDays className="w-3.5 h-3.5 text-surface-400" />
                              <span>{scheduledDayText}</span>
                            </span>

                            {visitDate && (
                              <span className="text-surface-400 dark:text-surface-500">
                                • {format(visitDate, "EEE, MMM d, yyyy")}
                              </span>
                            )}

                            <span className={`font-semibold ${reqBadge.color}`}>
                              • {reqBadge.label}
                            </span>
                          </div>

                          {/* Advance Timing & Notes Guidance */}
                          {(place.reservation?.advanceTime || place.reservation?.notes || place.highlight) && (
                            <div className="text-xs space-y-1 pt-1 text-surface-600 dark:text-surface-300">
                              {place.reservation?.advanceTime && (
                                <div className="flex items-center gap-1.5">
                                  <CalendarClock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                  <span className="font-semibold text-surface-800 dark:text-surface-200">
                                    Notice Rule:
                                  </span>
                                  <span>{place.reservation.advanceTime}</span>
                                </div>
                              )}
                              {place.reservation?.notes && (
                                <div className="flex items-center gap-1.5 text-surface-500 dark:text-surface-400 italic">
                                  <Info className="w-3.5 h-3.5 text-surface-400 shrink-0" />
                                  <span>Note: {place.reservation.notes}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Confirmation Code (if present) */}
                          {place.reservation?.confirmationNumber && (
                            <div className="pt-1 flex items-center gap-2">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300">
                                <Hash className="w-3.5 h-3.5" />
                                <span>Ref: {place.reservation.confirmationNumber}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(place.reservation!.confirmationNumber!, place.id)}
                                className="p-1 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 rounded transition-colors"
                                title="Copy confirmation reference"
                              >
                                {copiedCodeId === place.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Booking Window Status & Actions */}
                      <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-surface-100 dark:border-surface-700/60">
                        {/* Booking Window Badge */}
                        <div
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${urgencyBadgeClass}`}
                        >
                          {isBooked ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : urgency === "urgent" ? (
                            <Clock className="w-3.5 h-3.5 text-rose-500" />
                          ) : (
                            <CalendarClock className="w-3.5 h-3.5" />
                          )}
                          <span>{countdownLabel}</span>
                        </div>

                        {targetBookingDate && !isBooked && (
                          <span className="text-[11px] text-surface-500 dark:text-surface-400">
                            Target: {format(targetBookingDate, "MMM d, yyyy")}
                          </span>
                        )}

                        {/* Action buttons: Booking link & Edit place */}
                        <div className="flex items-center gap-1.5 mt-1">
                          {place.reservation?.bookingUrl && (
                            <a
                              href={
                                place.reservation.bookingUrl.startsWith("http")
                                  ? place.reservation.bookingUrl
                                  : `https://${place.reservation.bookingUrl}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors"
                              title="Open booking website in new tab"
                            >
                              <span>Book</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => setEditingPlaceId(place.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface-100 hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-200 transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Bar */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/70 text-xs text-surface-500 dark:text-surface-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Target booking opening dates automatically compute from your trip schedule.</span>
            </span>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-surface-200 hover:bg-surface-300 dark:bg-surface-700 dark:hover:bg-surface-600 text-surface-800 dark:text-white font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Embedded Place Editor when requested */}
      {editingPlaceId && (
        <EditPlaceModal
          placeId={editingPlaceId}
          onClose={() => setEditingPlaceId(null)}
        />
      )}
    </div>
  );
};
