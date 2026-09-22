import React, { useState, useEffect } from "react";
import {
  X,
  Map,
  Compass,
  Clock,
  Route,
  Brain,
  Sparkles,
  Github,
  Star,
  ExternalLink,
  ShieldAlert,
  Lightbulb,
  CheckCircle2,
  Calendar,
  Layers,
  Calculator,
  Sliders,
  EyeOff,
  Pin,
  FileDown,
  Key,
  Train,
  Car,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabType;
}

type TabType = "overview" | "workflow" | "algorithms" | "tips" | "limitations" | "opensource";

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, initialTab }) => {
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  useEffect(() => {
    if (isOpen) {
      if (
        window.location.hash === "#about-limitations" ||
        window.location.hash === "#limitations" ||
        initialTab === "limitations"
      ) {
        setActiveTab("limitations");
      } else if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, initialTab]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-surface-950/80 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/90 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-tr from-primary-600 to-indigo-500 rounded-xl shadow-md text-white">
                <Map className="w-5 h-5 sm:w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-surface-900 dark:text-white tracking-tight">
                    About RE-ROUTE
                  </h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full border border-primary-200 dark:border-primary-700/60">
                    Open Source
                  </span>
                </div>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Intelligent Multi-Day Travel Itinerary & TSP Route Optimizer
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              title="Close modal (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 px-4 sm:px-8 py-2.5 border-b border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-900 overflow-x-auto custom-scrollbar shrink-0">
            {[
              { id: "overview", label: "Overview", icon: Compass },
              { id: "workflow", label: "How It Works", icon: Layers },
              { id: "algorithms", label: "Routing & Math", icon: Calculator },
              { id: "tips", label: "Tips & Tricks", icon: Lightbulb },
              { id: "limitations", label: "Limitations", icon: ShieldAlert },
              { id: "opensource", label: "Open Source", icon: Github },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                    isActive
                      ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-300 border-surface-200 dark:border-surface-600 shadow-sm"
                      : "text-surface-600 dark:text-surface-400 border-transparent hover:border-surface-200 dark:hover:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-white"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-primary-600 dark:text-primary-400" : ""}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-8 custom-scrollbar text-surface-700 dark:text-surface-300 space-y-6 text-sm leading-relaxed">
            {/* TAB: OVERVIEW */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-primary-500/10 via-indigo-500/10 to-purple-500/10 border border-primary-200/80 dark:border-primary-800/60 rounded-2xl p-5 sm:p-6">
                  <h3 className="text-base sm:text-lg font-bold text-surface-900 dark:text-white mb-2 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary-500" />
                    What is RE-ROUTE?
                  </h3>
                  <p className="text-surface-700 dark:text-surface-300 text-sm leading-relaxed">
                    <strong>RE-ROUTE</strong> is an intelligent travel itinerary planning application designed to solve the real-world chaos of trip planning. Instead of guessing how to group sights or wasting hours zigzagging across a city, RE-ROUTE balances geographic proximity, time constraints, hotel bases, and daily opening hours to create the most enjoyable, stress-free schedule possible.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/60">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 border border-emerald-200 dark:border-emerald-800/60">
                      <Route className="w-4 h-4" />
                    </div>
                    <h4 className="font-bold text-surface-900 dark:text-white mb-1">No More Backtracking</h4>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">
                      Solves the Traveling Salesperson Problem (TSP) with 2-Opt local search so you visit places in a clean, logical sequence.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/60">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 border border-indigo-200 dark:border-indigo-800/60">
                      <Clock className="w-4 h-4" />
                    </div>
                    <h4 className="font-bold text-surface-900 dark:text-white mb-1">Time-Budget Aware</h4>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">
                      Honors daily active hours (e.g. 9 AM - 9 PM) and visit durations, preventing exhausting overscheduled days.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/60">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3 border border-purple-200 dark:border-purple-800/60">
                      <Brain className="w-4 h-4" />
                    </div>
                    <h4 className="font-bold text-surface-900 dark:text-white mb-1">AI Travel Intelligence</h4>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">
                      Provides ultra-specific dish recommendations, market stall pointers, reservation requirements, and booking lead times.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/40 dark:bg-surface-800/40">
                  <h4 className="font-bold text-surface-900 dark:text-white mb-3">Core Philosophy</h4>
                  <ul className="space-y-2.5 text-xs sm:text-sm">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong className="text-surface-900 dark:text-white">Privacy-First & Local Storage:</strong> All your trips and places are stored in your device's IndexedDB. No mandatory login, no tracking, and no cloud lock-in.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong className="text-surface-900 dark:text-white">Complete Interoperability:</strong> Import directly from Wanderlog, Google Maps saved lists, CSV, or plain text, and export your entire trip to JSON or print-ready PDF.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span><strong className="text-surface-900 dark:text-white">Zero-Cost Option:</strong> Fully functional in Mock Mode without needing any API keys, or plug in your own Google Maps & Gemini keys (BYOK) for live data.</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB: WORKFLOW */}
            {activeTab === "workflow" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-surface-900 dark:text-white mb-1">
                    How to Plan a Trip in 5 Easy Steps
                  </h3>
                  <p className="text-xs text-surface-500 dark:text-surface-400">
                    From a raw list of sights to an optimized day-by-day itinerary.
                  </p>
                </div>

                <div className="space-y-3.5">
                  {[
                    {
                      step: "1",
                      title: "Add Places to Visit (PTVs)",
                      desc: "Search for destinations using Google Places (in Real Mode) or instant mock suggestions. You can also click 'Import' to paste a Wanderlog export or CSV list.",
                    },
                    {
                      step: "2",
                      title: "Configure Trip Parameters",
                      desc: "Set the total number of trip days, daily active time window (e.g., 09:00 - 21:00), primary travel mode (Walking, Transit, or Driving), and optional arrival/departure flights.",
                    },
                    {
                      step: "3",
                      title: "Set Your Stay & Lodging",
                      desc: "Choose where you are staying each night. RE-ROUTE supports multi-city itineraries: you can assign different hotels to different ranges of days, and the optimizer will anchor routes to the correct hotel each morning and night.",
                    },
                    {
                      step: "4",
                      title: "Optimize Route with One Click",
                      desc: "Click 'Optimize Route'. The engine clusters places by geographic proximity, respects time budgets, and applies a 2-Opt TSP solver to eliminate criss-crossing.",
                    },
                    {
                      step: "5",
                      title: "Fine-Tune & Customize",
                      desc: "Drag-and-drop stops to reorder them manually, pin activities to fixed days, customize visit durations, check advance reservation windows, and export your finished itinerary.",
                    },
                  ].map((item) => (
                    <div key={item.step} className="flex gap-4 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40">
                      <div className="w-8 h-8 rounded-full bg-primary-600 text-white font-bold flex items-center justify-center shrink-0 text-sm shadow-sm">
                        {item.step}
                      </div>
                      <div>
                        <h4 className="font-bold text-surface-900 dark:text-white mb-1">{item.title}</h4>
                        <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: ALGORITHMS & MATH */}
            {activeTab === "algorithms" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-surface-900 dark:text-white mb-1">
                    The Math Behind the Optimization
                  </h3>
                  <p className="text-xs text-surface-500 dark:text-surface-400">
                    How RE-ROUTE calculates distance matrices, clusters multi-day trips, and solves the Traveling Salesperson Problem.
                  </p>
                </div>

                {/* 1. Multi-Day Clustering */}
                <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/50 space-y-2">
                  <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    1. Time-Budget-Aware Clustering
                  </h4>
                  <p className="text-xs text-surface-600 dark:text-surface-400">
                    Before ordering a single day's stops, RE-ROUTE must decide <em>which day</em> each place belongs to. The engine:
                  </p>
                  <ul className="list-disc list-inside text-xs space-y-1 text-surface-600 dark:text-surface-400 pl-2">
                    <li>Locks any <strong>pinned places</strong> to their designated days first.</li>
                    <li>Accounts for arrival and departure flight deadlines (e.g. flight arrival on Day 1 anchors morning departure at the airport).</li>
                    <li>Sorts unassigned places using a greedy longest-duration-first heuristic.</li>
                    <li>Evaluates candidate days by calculating marginal distance to that day's hotel anchor and already-assigned stops, while enforcing daily time ceilings and category caps (e.g., max 3 museums/day).</li>
                    <li>Places exceeding 500 km from any anchor are flagged as unfeasible so regional transitions are kept realistic.</li>
                  </ul>
                </div>

                {/* 2. TSP 2-Opt Algorithm */}
                <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/50 space-y-2">
                  <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-2">
                    <Route className="w-4 h-4 text-primary-500" />
                    2. Fixed-Endpoint 2-Opt TSP Solver
                  </h4>
                  <p className="text-xs text-surface-600 dark:text-surface-400">
                    Once places are clustered into a day, they form a graph where the route begins at the morning hotel (or arrival flight) and must conclude at the evening hotel (or departure flight).
                  </p>
                  <div className="p-3 bg-surface-900 dark:bg-surface-800 border border-surface-700 dark:border-surface-600 text-emerald-300 dark:text-emerald-300 rounded-lg font-mono text-xs overflow-x-auto">
                    Route: [Morning Hotel] → Stop A → Stop B → ... → Stop N → [Evening Hotel]
                  </div>
                  <p className="text-xs text-surface-600 dark:text-surface-400">
                    The solver runs a <strong>2-Opt local search</strong>. It iteratively removes two edges (segments) and reconnects the sub-path in reverse:
                  </p>
                  <div className="p-2.5 bg-surface-100 dark:bg-surface-800 rounded border border-surface-200 dark:border-surface-600 font-mono text-[11px] text-surface-800 dark:text-sky-300">
                    swap2Opt(route, i, k) = [...route(0..i-1), ...route(i..k).reverse(), ...route(k+1..end)]
                  </div>
                  <p className="text-xs text-surface-600 dark:text-surface-400">
                    If the swapped order reduces total cumulative distance, the route adopts the improvement and repeats until no further 2-edge swaps produce a shorter distance.
                  </p>
                </div>

                {/* 3. Distance & Travel Time Calculation */}
                <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/50 space-y-2">
                  <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-emerald-500" />
                    3. Distance & Travel Time Formulation
                  </h4>
                  <p className="text-xs text-surface-600 dark:text-surface-400">
                    Great-circle spatial distance is calculated using the <strong>Haversine Formula</strong> on Earth's mean spherical radius (R = 6,371 km):
                  </p>
                  <div className="p-2.5 bg-surface-100 dark:bg-surface-800 rounded border border-surface-200 dark:border-surface-600 font-mono text-[11px] text-surface-800 dark:text-sky-300">
                    a = sin²(Δφ/2) + cos(φ₁) · cos(φ₂) · sin²(Δλ/2)<br />
                    d = 2R · atan2(√a, √(1-a))
                  </div>
                  <p className="text-xs text-surface-600 dark:text-surface-400">
                    Travel duration is estimated through mode-specific speed factors:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                    <div className="p-2.5 bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
                      <span className="font-bold text-primary-600 dark:text-primary-400 block mb-0.5">🚶 Walking:</span>
                      <p className="text-[11px] text-surface-500 dark:text-surface-400">1.4 m/s (~5.0 km/h) constant pedestrian pacing.</p>
                    </div>
                    <div className="p-2.5 bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
                      <span className="font-bold text-primary-600 dark:text-primary-400 block mb-0.5">🚗 Driving:</span>
                      <p className="text-[11px] text-surface-500 dark:text-surface-400">8 m/s (30 km/h city) or 20 m/s (72 km/h highway &gt;50km).</p>
                    </div>
                    <div className="p-2.5 bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
                      <span className="font-bold text-primary-600 dark:text-primary-400 block mb-0.5">🚆 Transit:</span>
                      <p className="text-[11px] text-surface-500 dark:text-surface-400">5 m/s (18 km/h local) or 45 m/s (162 km/h bullet train &gt;50km).</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400 italic">
                    In Real Mode with Google Routes or Ekispert enabled, live turn-by-turn road networks and transit timetable headways replace these geometric approximations.
                  </p>
                </div>
              </div>
            )}

            {/* TAB: TIPS & TRICKS */}
            {activeTab === "tips" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-surface-900 dark:text-white mb-1">
                    Power User Tips & Tricks
                  </h3>
                  <p className="text-xs text-surface-500 dark:text-surface-400">
                    Get the most out of your planning workflow.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/60">
                    <div className="flex items-center gap-2 font-bold text-surface-900 dark:text-white mb-1">
                      <EyeOff className="w-4 h-4 text-amber-500" />
                      Exclude Instead of Deleting
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">
                      Found a great backup museum or restaurant? Click the eye icon to exclude it. It stays safely saved in your trip under the "Excluded" tab without affecting your daily route.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/60">
                    <div className="flex items-center gap-2 font-bold text-surface-900 dark:text-white mb-1">
                      <Pin className="w-4 h-4 text-indigo-500" />
                      Pin Specific Bookings
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">
                      Have a prepaid tour or timed dinner? Assign it to Day 3 and pin it. When you re-optimize, the solver will keep it on Day 3 and organize all nearby sights around it.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/60">
                    <div className="flex items-center gap-2 font-bold text-surface-900 dark:text-white mb-1">
                      <Sliders className="w-4 h-4 text-primary-500" />
                      Category Pacing Limits
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">
                      Avoid museum or temple fatigue! Open <strong>Settings</strong> to customize category limits per day (e.g. limit to maximum 2 temples and 1 shopping mall per day).
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/60">
                    <div className="flex items-center gap-2 font-bold text-surface-900 dark:text-white mb-1">
                      <Key className="w-4 h-4 text-purple-500" />
                      BYOK (Bring Your Own Key)
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">
                      Need unlimited daily searches or direct Gemini descriptions? Click the API Budget badge and enter your personal API keys for unlimited, unrestricted usage.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/60">
                    <div className="flex items-center gap-2 font-bold text-surface-900 dark:text-white mb-1">
                      <Calendar className="w-4 h-4 text-rose-500" />
                      Reservation Timing Windows
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">
                      Look for the reservation badges on popular sights. The AI detects whether reservations are mandatory and tells you when to book (e.g. "Reserve 1 month ahead").
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/60">
                    <div className="flex items-center gap-2 font-bold text-surface-900 dark:text-white mb-1">
                      <FileDown className="w-4 h-4 text-emerald-500" />
                      Backup & Sharing via JSON
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-normal">
                      Click <strong>Export &rarr; Export Entire Trip (.json)</strong> to back up your full itinerary file. You or a travel companion can re-import it anytime with full fidelity.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: LIMITATIONS */}
            {activeTab === "limitations" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-700/80 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    Important API &amp; Algorithmic Limitations
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                    RE-ROUTE is engineered to provide the smartest possible itineraries. However, travelers should be aware of fundamental API restrictions, regional transit constraints, and algorithmic boundaries when planning trips:
                  </p>
                </div>

                <div className="space-y-3.5 text-xs sm:text-sm">
                  {/* 1. Japan Transit & Mapping API Boundaries */}
                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-2">
                        <Train className="w-4 h-4 text-rose-500" />
                        1. Japan Transit Limitations &amp; The Google Maps API Blackout
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        Zero Results API Gap
                      </span>
                    </div>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">
                      While the consumer Google Maps mobile app shows public transit directions in Japan, <strong>Google Maps Platform developer APIs (Directions API, Routes API, Distance Matrix API) strictly do not support public transit routing in Japan</strong>. Calling these APIs with <code className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-1 py-0.5 rounded font-mono text-[11px]">mode=transit</code> returns <code className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-1 py-0.5 rounded font-mono text-[11px]">ZERO_RESULTS</code>. This is due to exclusive commercial licensing terms between Japanese rail operators (JR Group, Tokyo Metro, private railways), mapping partner Zenrin, and Google that forbid redistributing transit data programmatically to third-party developers.
                    </p>
                    <div className="p-3 bg-surface-100 dark:bg-surface-900/80 rounded-xl border border-surface-200 dark:border-surface-750 text-[11px] text-surface-600 dark:text-surface-400 space-y-2">
                      <p className="font-bold text-surface-900 dark:text-white">How RE-ROUTE bridges this gap &amp; what to keep in mind:</p>
                      <ul className="list-disc list-inside space-y-1 pl-1">
                        <li><strong>Domestic Japanese Transit Integration:</strong> RE-ROUTE incorporates the <strong>Ekispert Web Service</strong> (Val Laboratory), the leading domestic Japanese railway routing engine, for official train timetables and transfers.</li>
                        <li><strong>Station-to-Station vs. Door-to-Door:</strong> Japanese transit APIs calculate routes strictly between designated train/subway stations rather than exact street addresses. RE-ROUTE geocodes your sights to their nearest transit stations and bridges the first and last miles with pedestrian walking paths.</li>
                        <li><strong>The Megastation Labyrinth ("Dungeon Stations"):</strong> No navigation API in the world can accurately measure human walking times through massive multi-level Japanese hubs. Shinjuku Station has over 200 exits and serves ~3.5 million passengers daily; transferring between the Keiyo Line (Disney) and the Yamanote Line at Tokyo Station requires navigating nearly 600 meters of underground passages (12–15+ minutes of continuous walking alone). Always allow extra transfer padding in Tokyo, Osaka-Umeda, and Nagoya!</li>
                        <li><strong>Ticket Tiers &amp; Seat Reservations:</strong> Japanese rail separates base fare (IC card / Suica / Pasmo) from Limited Express surcharges (<em>Tokkyū-ken</em>) and Shinkansen reserved seats (<em>Shitei-seki</em>). Routing APIs show transit duration on the tracks, but cannot account for ticket line waits at <em>Midori-no-Madoguchi</em> ticket counters or Shinkansen oversized luggage reservation rules.</li>
                      </ul>
                    </div>
                  </div>

                  {/* 2. Transit Routing Architecture Constraints */}
                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40 space-y-2">
                    <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-500" />
                      2. Transit API Constraints: Waypoints, Headways &amp; Delays
                    </h4>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">
                      Public transit APIs have distinct technical and operational constraints compared to driving or walking engines:
                    </p>
                    <ul className="list-disc list-inside text-xs text-surface-600 dark:text-surface-400 pl-1 space-y-1">
                      <li><strong>No Intermediate Waypoints:</strong> Unlike driving routes (which accept up to 25 intermediate waypoints in a single request), transit APIs strictly forbid intermediate waypoints. Every single transit leg between stops must be requested and calculated as an independent origin-destination pair.</li>
                      <li><strong>Rural vs. Urban Departure Headways:</strong> In major metro corridors (Tokyo Yamanote Line, Paris Métro, NYC Subway), trains run every 2–3 minutes. However, in regional or countryside areas (Hakone, Nikko, rural Kyoto, Hokkaido), local trains and regional buses often run only once every 60–120 minutes. A 2-minute delay causing a missed transfer in rural areas can shift your entire day's schedule by hours.</li>
                      <li><strong>Static Timetables vs. Real-Time Discontinuity:</strong> Driving APIs rely on millions of live smartphone GPS probes to detect traffic jams instantly. In contrast, transit APIs rely on transit agencies publishing GTFS-Realtime feeds. When delays or platform changes occur, external APIs often suffer from a multi-minute "discontinuity lag" before the update propagates.</li>
                    </ul>
                  </div>

                  {/* 3. Live Traffic & Road Delays */}
                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40 space-y-1.5">
                    <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-2">
                      <Car className="w-4 h-4 text-amber-500" />
                      3. Live Road Traffic, Weather &amp; Seasonal Mountain Passes
                    </h4>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">
                      Google Routes API provides predictive travel durations based on historical traffic patterns, but cannot forecast sudden accident jams, severe weather slowdowns, holiday gridlock (such as Golden Week, Thanksgiving, or Lunar New Year getaways), or winter mountain pass road closures.
                    </p>
                  </div>

                  {/* 4. AI (Gemini) Intelligence Boundaries */}
                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40 space-y-1.5">
                    <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-500" />
                      4. AI Intelligence &amp; Private Reservation System Boundaries
                    </h4>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">
                      Google Gemini AI provides signature dish recommendations, market stall pointers, and reservation booking windows. However:
                    </p>
                    <ul className="list-disc list-inside text-xs text-surface-600 dark:text-surface-400 pl-1 space-y-1">
                      <li>The AI <strong>cannot access live private reservation engines</strong> (e.g., TableCheck, Omakase.in, Tabelog, Pocket Concierge, Disney Premier Access, or Lawson Ticket Lotteries for Ghibli Museum). It knows the official booking rules (e.g. <em>"Reservations open on the 1st of each month at 10:00 AM JST"</em>), but cannot check real-time seat availability or book on your behalf.</li>
                      <li>AI knowledge reflects broad patterns and may occasionally miss temporary holiday closures (such as Japanese New Year / <em>Oshogatsu</em> Dec 29–Jan 3, or temple renovation cycles).</li>
                      <li>Always confirm opening days and ticket releases directly on the attraction or restaurant's official website.</li>
                    </ul>
                  </div>

                  {/* 5. API Rate Limits & Shared Proxy Quotas */}
                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40 space-y-2">
                    <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-2">
                      <Key className="w-4 h-4 text-emerald-500" />
                      5. API Quotas, Caching &amp; Bring-Your-Own-Key (BYOK)
                    </h4>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">
                      To keep RE-ROUTE 100% free and open, shared public cloud proxy tokens have daily rate limits on Google Maps and Gemini AI queries. If daily limits are reached, the app continues to operate seamlessly in Mock Mode, or you can plug in your own free personal API keys via the <strong>BYOK (Bring Your Own Key)</strong> panel in the API Budget monitor for unlimited personal usage.
                    </p>
                    <ul className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed space-y-1.5 list-none pl-0">
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-emerald-500 shrink-0">✓</span>
                        <span><strong className="text-surface-800 dark:text-surface-200">Smart caching:</strong> Place searches, route times, and photo URLs are cached in your browser&apos;s localStorage. Route segments are cached for <strong>7 days</strong> with departure-time bucketing (AM / PM / Evening) so re-optimizations almost never re-hit the API.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-emerald-500 shrink-0">✓</span>
                        <span><strong className="text-surface-800 dark:text-surface-200">Lazy photo loading:</strong> Photos are only fetched when you first view a place card, and the resolved URL is cached permanently so the same photo is never re-downloaded.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-blue-500 shrink-0">🚆</span>
                        <span><strong className="text-surface-800 dark:text-surface-200">Ekispert Japan Transit:</strong> Station lookups and timetable route links are cached for <strong>30 days</strong> in localStorage. On subsequent visits, Japan transit segments load instantly with zero API calls.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-amber-500 shrink-0">⚠</span>
                        <span>Ekispert&apos;s free plan API key is <strong>domain-restricted to reroute.tools</strong> and will not function on localhost. Local builds fall back to geometric transit estimation automatically.</span>
                      </li>
                    </ul>
                    <p className="text-xs text-surface-500 dark:text-surface-500 leading-relaxed">
                      Monitor real-time quota consumption for Google Maps, Gemini AI, and Ekispert — with progress bars and daily limits — in the <strong>API Budget &amp; Usage</strong> panel (key icon in the header).
                    </p>
                  </div>


                  {/* 6. TSP NP-Hard Optimization */}
                  <div className="p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40 space-y-1.5">
                    <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-primary-500" />
                      6. Mathematical Heuristic Nature (2-Opt TSP)
                    </h4>
                    <p className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">
                      The Traveling Salesperson Problem (TSP) is NP-hard. Our 2-Opt solver converges on mathematically efficient routes in milliseconds, but personal travel preferences (such as wanting a scenic stroll, eating lunch at a specific hour, or visiting a museum early to beat queues) are easily customized by dragging and reordering stops in the itinerary.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: OPEN SOURCE */}
            {activeTab === "opensource" && (
              <div className="space-y-6">
                <div className="p-6 rounded-2xl border border-surface-200 dark:border-surface-700 bg-gradient-to-br from-surface-50 to-surface-100 dark:from-surface-900 dark:to-surface-800 text-center space-y-4">
                  <div className="inline-flex p-3 rounded-2xl bg-surface-900 text-white dark:bg-surface-700 dark:text-white shadow-md border border-surface-700 dark:border-surface-600">
                    <Github className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-surface-900 dark:text-white">
                      100% Free & Open Source
                    </h3>
                    <p className="text-xs text-surface-500 dark:text-surface-400 max-w-lg mx-auto mt-1 leading-relaxed">
                      RE-ROUTE is created by <strong>Alicesyn</strong> and licensed under the permissive <strong>MIT License</strong>. We believe trip planning tools should belong to the traveler, without tracking or paywalls.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-3 pt-2">
                    <a
                      href="https://github.com/Alicesyn/RE-ROUTE"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface-900 dark:bg-surface-700 hover:bg-surface-800 dark:hover:bg-surface-600 text-white font-bold text-xs transition-all shadow-md border border-surface-700 dark:border-surface-600"
                    >
                      <Github className="w-4 h-4" />
                      <span>View on GitHub</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </a>

                    <a
                      href="https://github.com/Alicesyn/RE-ROUTE/stargazers"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-200 font-semibold text-xs hover:bg-surface-100 dark:hover:bg-surface-700 hover:text-surface-900 dark:hover:text-white transition-colors"
                    >
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>Star Repository</span>
                    </a>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-surface-900 dark:text-white text-sm">How You Can Contribute</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40">
                      <span className="font-bold text-primary-600 dark:text-primary-400 block mb-1">🐛 Report Bugs</span>
                      <p className="text-surface-500 dark:text-surface-400">Encountered an issue or calculation quirk? Open an issue on GitHub with steps to reproduce.</p>
                    </div>
                    <div className="p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40">
                      <span className="font-bold text-primary-600 dark:text-primary-400 block mb-1">💡 Request Features</span>
                      <p className="text-surface-500 dark:text-surface-400">Have an idea for export formats, new transit integrations, or mobile apps? Let us know.</p>
                    </div>
                    <div className="p-3.5 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/40">
                      <span className="font-bold text-primary-600 dark:text-primary-400 block mb-1">💻 Submit PRs</span>
                      <p className="text-surface-500 dark:text-surface-400">Built with Vite, React 18, TypeScript, Tailwind CSS, Leaflet, and Zustand. Pull requests are welcomed!</p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-center text-xs text-surface-400">
                  <span>Built with ❤️ for globetrotters, backpackers, and weekend explorers.</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 sm:px-8 py-3.5 border-t border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/90 flex items-center justify-between shrink-0">
            <div className="text-[11px] text-surface-500 dark:text-surface-400 hidden sm:block">
              RE-ROUTE • MIT License • <a href="https://github.com/Alicesyn/RE-ROUTE" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-500">GitHub Repository</a>
            </div>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs rounded-xl transition-colors shadow-sm"
            >
              Got it, close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
