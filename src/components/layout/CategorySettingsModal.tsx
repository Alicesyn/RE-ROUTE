import React, { useEffect, useState } from "react";
import {
  Settings,
  Timer,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  PlaneLanding,
  PlaneTakeoff,
  Sun,
  Moon,
  Image,
  ImageOff,
  Calendar,
  Plus,
  Trash2,
  Utensils,
} from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { useRouteStore } from "../../store/useRouteStore";
import { ALL_CATEGORIES } from "../../utils/categoryConstants";
import { getCategoryEmoji, getCategoryLabel } from "../../utils/categoryUtils";
import { PlaceCategory, CategoryConfig, CategoryDayOverride } from "../../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CategorySettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    categoryDurations, setCategoryDuration,
    categoryConfigs, setCategoryConfig,
    applyCategoryDurationsToPlaces,
    distanceUnit, setDistanceUnit,
    timeFormat, setTimeFormat,
    theme, setTheme,
    showImages, setShowImages,
    days,
    startDate,
    dateMode,
  } = useRouteStore();

  // Local state for inputs to allow empty strings while typing
  const [localDurations, setLocalDurations] = useState<Record<string, string>>({});
  const [localMin, setLocalMin] = useState<Record<string, string>>({});
  const [localMax, setLocalMax] = useState<Record<string, string>>({});
  const [localFirstMin, setLocalFirstMin] = useState<Record<string, string>>({});
  const [localFirstMax, setLocalFirstMax] = useState<Record<string, string>>({});
  const [localLastMin, setLocalLastMin] = useState<Record<string, string>>({});
  const [localLastMax, setLocalLastMax] = useState<Record<string, string>>({});
  const [localMinSpacing, setLocalMinSpacing] = useState<Record<string, string>>({});
  const [localCustomMin, setLocalCustomMin] = useState<Record<string, string>>({});
  const [localCustomMax, setLocalCustomMax] = useState<Record<string, string>>({});
  const [newDaySelect, setNewDaySelect] = useState<Record<string, string>>({});
  const [customDayNumberInput, setCustomDayNumberInput] = useState<Record<string, string>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Sync with store on open
  useEffect(() => {
    if (isOpen) {
      setLocalDurations({});
      setLocalMin({});
      setLocalMax({});
      setLocalFirstMin({});
      setLocalFirstMax({});
      setLocalLastMin({});
      setLocalLastMax({});
      setLocalMinSpacing({});
      setLocalCustomMin({});
      setLocalCustomMax({});
      setNewDaySelect({});
      setCustomDayNumberInput({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleExpanded = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleDurationChange = (category: PlaceCategory, value: string) => {
    setLocalDurations((prev) => ({ ...prev, [category]: value }));
    const duration = parseInt(value, 10);
    if (!isNaN(duration) && duration >= 5) {
      setCategoryDuration(category, duration);
    }
  };

  const handleMinChange = (category: PlaceCategory, value: string) => {
    setLocalMin((prev) => ({ ...prev, [category]: value }));
    if (value === "") {
      setCategoryConfig(category, { minPerDay: null });
    } else {
      const min = parseInt(value, 10);
      if (!isNaN(min) && min >= 0) setCategoryConfig(category, { minPerDay: min });
    }
  };

  const handleMaxChange = (category: PlaceCategory, value: string) => {
    setLocalMax((prev) => ({ ...prev, [category]: value }));
    if (value === "") {
      setCategoryConfig(category, { maxPerDay: null });
    } else {
      const max = parseInt(value, 10);
      if (!isNaN(max) && max >= 0) setCategoryConfig(category, { maxPerDay: max });
    }
  };

  const handleMinSpacingChange = (category: PlaceCategory, value: string) => {
    setLocalMinSpacing((prev) => ({ ...prev, [category]: value }));
    if (value === "") {
      setCategoryConfig(category, { minTimeBetween: null });
    } else {
      const spacing = parseInt(value, 10);
      if (!isNaN(spacing) && spacing >= 0) setCategoryConfig(category, { minTimeBetween: spacing });
    }
  };

  const handleOverrideChange = (
    category: PlaceCategory,
    dayType: "firstDayOverride" | "lastDayOverride",
    field: keyof CategoryDayOverride,
    value: string,
    setLocal: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  ) => {
    setLocal((prev) => ({ ...prev, [category]: value }));
    const existing = categoryConfigs?.[category]?.[dayType] || {};
    if (value === "") {
      setCategoryConfig(category, { [dayType]: { ...existing, [field]: null } });
    } else {
      const num = parseInt(value, 10);
      if (!isNaN(num) && num >= 0) {
        setCategoryConfig(category, { [dayType]: { ...existing, [field]: num } });
      }
    }
  };

  const handleCustomOverrideChange = (
    category: PlaceCategory,
    dayIndex: number,
    field: keyof CategoryDayOverride,
    value: string,
  ) => {
    const key = `${category}_${dayIndex}`;
    if (field === "minPerDay") {
      setLocalCustomMin((prev) => ({ ...prev, [key]: value }));
    } else {
      setLocalCustomMax((prev) => ({ ...prev, [key]: value }));
    }

    const currentConfig = categoryConfigs?.[category] || {};
    const currentOverrides = { ...(currentConfig.customDayOverrides || {}) };
    const dayOverride = currentOverrides[dayIndex] || {};

    if (value === "") {
      currentOverrides[dayIndex] = { ...dayOverride, [field]: null };
    } else {
      const num = parseInt(value, 10);
      if (!isNaN(num) && num >= 0) {
        currentOverrides[dayIndex] = { ...dayOverride, [field]: num };
      }
    }
    setCategoryConfig(category, { customDayOverrides: currentOverrides });
  };

  const handleAddCustomDay = (category: PlaceCategory, dayIndex: number) => {
    if (isNaN(dayIndex) || dayIndex < 0) return;
    const currentConfig = categoryConfigs?.[category] || {};
    const currentOverrides = { ...(currentConfig.customDayOverrides || {}) };
    if (currentOverrides[dayIndex] !== undefined) return;
    currentOverrides[dayIndex] = { minPerDay: null, maxPerDay: null };
    setCategoryConfig(category, { customDayOverrides: currentOverrides });
  };

  const handleRemoveCustomDay = (category: PlaceCategory, dayIndex: number) => {
    const currentConfig = categoryConfigs?.[category] || {};
    const currentOverrides = { ...(currentConfig.customDayOverrides || {}) };
    delete currentOverrides[dayIndex];
    const key = `${category}_${dayIndex}`;
    setLocalCustomMin((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setLocalCustomMax((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCategoryConfig(category, { customDayOverrides: currentOverrides });
  };

  const handleBlurDuration = (category: PlaceCategory) => {
    const val = localDurations[category];
    if (val !== undefined) {
      const duration = parseInt(val, 10);
      if (isNaN(duration) || duration < 5) {
        setLocalDurations((prev) => {
          const newVals = { ...prev };
          delete newVals[category];
          return newVals;
        });
      }
    }
  };

  const overrideInputClass = "w-14 px-2 py-1 text-xs font-bold text-center bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white placeholder:text-surface-300 dark:placeholder:text-surface-600";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-900/50">
          <div>
            <h2 className="text-xl font-black text-surface-900 dark:text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary-500" />
              Settings
            </h2>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
              Configure global preferences and category-specific rules.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 rounded-full hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-grow no-scrollbar pb-6">

          {/* General Settings */}
          <div className="px-6 py-6 border-b border-surface-200 dark:border-surface-700 space-y-4">
            <h3 className="text-sm font-bold text-surface-900 dark:text-white uppercase tracking-wider mb-2">
              General
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Appearance / Theme */}
              <div className="p-3 bg-surface-50 dark:bg-surface-700/30 rounded-xl border border-surface-200 dark:border-surface-700/50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-surface-700 dark:text-surface-300 block">Appearance</span>
                  <span className="text-[10px] text-surface-400">Theme mode</span>
                </div>
                <div className="flex items-center gap-1 bg-surface-200 dark:bg-surface-800 p-1 rounded-lg">
                  <button
                    onClick={() => setTheme("light")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold transition-all ${theme === "light"
                        ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-xs"
                        : "text-surface-500 hover:text-surface-900 dark:hover:text-white"
                      }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    Light
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold transition-all ${theme === "dark"
                        ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-xs"
                        : "text-surface-500 hover:text-surface-900 dark:hover:text-white"
                      }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-surface-400" />
                    Dark
                  </button>
                </div>
              </div>

              {/* Photo Previews */}
              <div className="p-3 bg-surface-50 dark:bg-surface-700/30 rounded-xl border border-surface-200 dark:border-surface-700/50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-surface-700 dark:text-surface-300 block">Place Photos</span>
                  <span className="text-[10px] text-surface-400">Display location preview cards</span>
                </div>
                <div className="flex items-center gap-1 bg-surface-200 dark:bg-surface-800 p-1 rounded-lg">
                  <button
                    onClick={() => setShowImages(true)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-all ${showImages
                        ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-xs"
                        : "text-surface-500 hover:text-surface-900 dark:hover:text-white"
                      }`}
                  >
                    <Image className="w-3.5 h-3.5" />
                    On
                  </button>
                  <button
                    onClick={() => setShowImages(false)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition-all ${!showImages
                        ? "bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-xs"
                        : "text-surface-500 hover:text-surface-900 dark:hover:text-white"
                      }`}
                  >
                    <ImageOff className="w-3.5 h-3.5" />
                    Off
                  </button>
                </div>
              </div>

              {/* Distance Unit */}
              <div className="p-3 bg-surface-50 dark:bg-surface-700/30 rounded-xl border border-surface-200 dark:border-surface-700/50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-surface-700 dark:text-surface-300 block">Distance Format</span>
                  <span className="text-[10px] text-surface-400">Kilometers vs. Miles</span>
                </div>
                <div className="flex items-center gap-1 bg-surface-200 dark:bg-surface-800 p-1 rounded-lg">
                  <button
                    onClick={() => setDistanceUnit("metric")}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${distanceUnit === "metric"
                        ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-xs"
                        : "text-surface-500 hover:text-surface-900 dark:hover:text-white"
                      }`}
                  >
                    km
                  </button>
                  <button
                    onClick={() => setDistanceUnit("imperial")}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${distanceUnit === "imperial"
                        ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-xs"
                        : "text-surface-500 hover:text-surface-900 dark:hover:text-white"
                      }`}
                  >
                    miles
                  </button>
                </div>
              </div>

              {/* Time Format */}
              <div className="p-3 bg-surface-50 dark:bg-surface-700/30 rounded-xl border border-surface-200 dark:border-surface-700/50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-surface-700 dark:text-surface-300 block">Clock Format</span>
                  <span className="text-[10px] text-surface-400">12-hour (AM/PM) vs. 24-hour</span>
                </div>
                <div className="flex items-center gap-1 bg-surface-200 dark:bg-surface-800 p-1 rounded-lg">
                  <button
                    onClick={() => setTimeFormat("12h")}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${timeFormat === "12h"
                        ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-xs"
                        : "text-surface-500 hover:text-surface-900 dark:hover:text-white"
                      }`}
                  >
                    12h (AM/PM)
                  </button>
                  <button
                    onClick={() => setTimeFormat("24h")}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${timeFormat === "24h"
                        ? "bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-xs"
                        : "text-surface-500 hover:text-surface-900 dark:hover:text-white"
                      }`}
                  >
                    24-hour
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3 pb-3 border-b border-surface-200 dark:border-surface-700 text-xs font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider sticky top-0 bg-white dark:bg-surface-800 z-10 pt-6 px-6">
            <div className="col-span-4 flex flex-col">
              <span>Category Limits</span>
            </div>
            <div className="col-span-2 text-center flex items-center justify-center gap-1"><Timer className="w-3 h-3" /> Default Duration</div>
            <div className="col-span-2 text-center flex items-center justify-center gap-1" title="Minimum minutes between visits of this category on the same day"><Utensils className="w-3 h-3" /> Min Spacing</div>
            <div className="col-span-2 text-center flex items-center justify-center gap-1"><Minimize2 className="w-3 h-3" /> Min/Day</div>
            <div className="col-span-2 text-center flex items-center justify-center gap-1"><Maximize2 className="w-3 h-3" /> Max/Day</div>
          </div>

          <div className="mt-2 space-y-1 px-6 pb-6">
            {ALL_CATEGORIES.map((category) => {
              const config = categoryConfigs[category] || {} as CategoryConfig;
              const isExpanded = expandedCategories.has(category);
              const firstOverride = config.firstDayOverride || {};
              const lastOverride = config.lastDayOverride || {};
              const customOverrides = config.customDayOverrides || {};
              const hasCustomOverrides = Object.keys(customOverrides).length > 0;
              const hasOverrides =
                firstOverride.minPerDay != null || firstOverride.maxPerDay != null ||
                lastOverride.minPerDay != null || lastOverride.maxPerDay != null ||
                hasCustomOverrides;

              return (
                <div key={category} className="rounded-xl overflow-hidden">
                  {/* Main category row */}
                  <div className="grid grid-cols-12 gap-3 items-center p-3 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors group">
                    <div className="col-span-4 flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => toggleExpanded(category)}
                        className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                        title="Toggle day exceptions"
                      >
                        <div className="w-8 h-8 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center text-sm shadow-sm group-hover:scale-110 transition-transform shrink-0">
                          {getCategoryEmoji(category)}
                        </div>
                        <span className="text-sm font-semibold text-surface-700 dark:text-surface-200 whitespace-nowrap">
                          {getCategoryLabel(category)}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 shrink-0 transition-transform text-surface-400 ${isExpanded ? "rotate-180" : ""} ${hasOverrides ? "text-primary-500" : ""}`}
                        />
                      </button>
                      {hasOverrides && !isExpanded && (
                        <span className="text-[9px] font-black uppercase tracking-wide text-primary-500 bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded-full shrink-0">
                          Exceptions
                        </span>
                      )}
                    </div>

                    {/* Duration Input */}
                    <div className="col-span-2 flex justify-center">
                      <div className="relative">
                        <input
                          type="number"
                          min="5"
                          step="5"
                          value={localDurations[category] ?? categoryDurations?.[category] ?? 60}
                          onChange={(e) => handleDurationChange(category, e.target.value)}
                          onBlur={() => handleBlurDuration(category)}
                          className="w-20 px-3 py-1.5 text-sm font-bold text-center bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-surface-400 pointer-events-none">m</span>
                      </div>
                    </div>

                    {/* Min Spacing Input */}
                    <div className="col-span-2 flex justify-center">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="15"
                          placeholder="—"
                          value={localMinSpacing[category] ?? (config.minTimeBetween != null ? config.minTimeBetween : (category === "restaurant" ? 180 : ""))}
                          onChange={(e) => handleMinSpacingChange(category, e.target.value)}
                          title="Minimum minutes between visits of this category on the same day (e.g. 180 min between meals)"
                          className="w-16 px-2 py-1.5 text-sm font-bold text-center bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-surface-900 dark:text-white placeholder:text-surface-300 dark:placeholder:text-surface-600"
                        />
                        {(localMinSpacing[category] !== "" && (localMinSpacing[category] !== undefined ? localMinSpacing[category] !== "" : (config.minTimeBetween != null || category === "restaurant"))) && (
                          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-surface-400 pointer-events-none">m</span>
                        )}
                      </div>
                    </div>

                    {/* Min Per Day Input */}
                    <div className="col-span-2 flex justify-center">
                      <input
                        type="number"
                        min="0"
                        placeholder="—"
                        value={localMin[category] ?? (config.minPerDay != null ? config.minPerDay : "")}
                        onChange={(e) => handleMinChange(category, e.target.value)}
                        className="w-16 px-2 py-1.5 text-sm font-bold text-center bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-surface-900 dark:text-white placeholder:text-surface-300 dark:placeholder:text-surface-600"
                      />
                    </div>

                    {/* Max Per Day Input */}
                    <div className="col-span-2 flex justify-center items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        placeholder="—"
                        value={localMax[category] ?? (config.maxPerDay != null ? config.maxPerDay : "")}
                        onChange={(e) => handleMaxChange(category, e.target.value)}
                        className="w-16 px-2 py-1.5 text-sm font-bold text-center bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-surface-900 dark:text-white placeholder:text-surface-300 dark:placeholder:text-surface-600"
                      />
                    </div>
                  </div>

                  {/* Expanded day exception rows */}
                  {isExpanded && (
                    <div className="bg-surface-50/70 dark:bg-surface-900/40 border border-surface-100 dark:border-surface-700/50 rounded-xl mx-2 mb-2 overflow-hidden divide-y divide-surface-100 dark:divide-surface-700/50">
                      {/* Column header */}
                      <div className="grid grid-cols-12 gap-4 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-surface-400">
                        <div className="col-span-4">Day Type</div>
                        <div className="col-span-4 text-center">Min/Day Override</div>
                        <div className="col-span-4 text-center">Max/Day Override</div>
                      </div>

                      {/* First Day row */}
                      <div className="grid grid-cols-12 gap-4 items-center px-4 py-2.5">
                        <div className="col-span-4 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                            <PlaneTakeoff className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span className="text-xs font-bold text-surface-700 dark:text-surface-300">First Day</span>
                        </div>
                        <div className="col-span-4 flex justify-center">
                          <input
                            type="number"
                            min="0"
                            placeholder="inherit"
                            value={localFirstMin[category] ?? (firstOverride.minPerDay != null ? firstOverride.minPerDay : "")}
                            onChange={(e) =>
                              handleOverrideChange(category, "firstDayOverride", "minPerDay", e.target.value, setLocalFirstMin)
                            }
                            className={`${overrideInputClass} focus:ring-emerald-500`}
                          />
                        </div>
                        <div className="col-span-4 flex justify-center">
                          <input
                            type="number"
                            min="0"
                            placeholder="inherit"
                            value={localFirstMax[category] ?? (firstOverride.maxPerDay != null ? firstOverride.maxPerDay : "")}
                            onChange={(e) =>
                              handleOverrideChange(category, "firstDayOverride", "maxPerDay", e.target.value, setLocalFirstMax)
                            }
                            className={`${overrideInputClass} focus:ring-emerald-500`}
                          />
                        </div>
                      </div>

                      {/* Last Day row */}
                      <div className="grid grid-cols-12 gap-4 items-center px-4 py-2.5">
                        <div className="col-span-4 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                            <PlaneLanding className="w-3 h-3 text-red-600 dark:text-red-400" />
                          </div>
                          <span className="text-xs font-bold text-surface-700 dark:text-surface-300">Last Day</span>
                        </div>
                        <div className="col-span-4 flex justify-center">
                          <input
                            type="number"
                            min="0"
                            placeholder="inherit"
                            value={localLastMin[category] ?? (lastOverride.minPerDay != null ? lastOverride.minPerDay : "")}
                            onChange={(e) =>
                              handleOverrideChange(category, "lastDayOverride", "minPerDay", e.target.value, setLocalLastMin)
                            }
                            className={`${overrideInputClass} focus:ring-red-500`}
                          />
                        </div>
                        <div className="col-span-4 flex justify-center">
                          <input
                            type="number"
                            min="0"
                            placeholder="inherit"
                            value={localLastMax[category] ?? (lastOverride.maxPerDay != null ? lastOverride.maxPerDay : "")}
                            onChange={(e) =>
                              handleOverrideChange(category, "lastDayOverride", "maxPerDay", e.target.value, setLocalLastMax)
                            }
                            className={`${overrideInputClass} focus:ring-red-500`}
                          />
                        </div>
                      </div>

                      {/* Custom Days (User-inputted specific days) */}
                      {Object.entries(customOverrides)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([dayStr, override]) => {
                          const d = parseInt(dayStr, 10);
                          const dayNum = d + 1;
                          let dayDateLabel = "";
                          if (dateMode === "fixed" && startDate) {
                            try {
                              dayDateLabel = ` (${format(addDays(parseISO(startDate), d), "MMM d")})`;
                            } catch { }
                          }
                          const customKey = `${category}_${d}`;

                          return (
                            <div key={d} className="grid grid-cols-12 gap-4 items-center px-4 py-2.5 bg-purple-50/30 dark:bg-purple-950/10">
                              <div className="col-span-4 flex items-center justify-between gap-1 pr-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                                    <Calendar className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                  </div>
                                  <span className="text-xs font-bold text-surface-700 dark:text-surface-300 truncate">
                                    Day {dayNum}{dayDateLabel}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleRemoveCustomDay(category, d)}
                                  className="p-1 text-surface-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-surface-200 dark:hover:bg-surface-700 rounded transition-colors shrink-0"
                                  title={`Remove Day ${dayNum} limit override`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="col-span-4 flex justify-center">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="inherit"
                                  value={localCustomMin[customKey] ?? (override?.minPerDay != null ? override.minPerDay : "")}
                                  onChange={(e) =>
                                    handleCustomOverrideChange(category, d, "minPerDay", e.target.value)
                                  }
                                  className={`${overrideInputClass} focus:ring-purple-500`}
                                />
                              </div>
                              <div className="col-span-4 flex justify-center">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="inherit"
                                  value={localCustomMax[customKey] ?? (override?.maxPerDay != null ? override.maxPerDay : "")}
                                  onChange={(e) =>
                                    handleCustomOverrideChange(category, d, "maxPerDay", e.target.value)
                                  }
                                  className={`${overrideInputClass} focus:ring-purple-500`}
                                />
                              </div>
                            </div>
                          );
                        })}

                      {/* Add Custom Day Limit Control */}
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-surface-100/60 dark:bg-surface-800/50 border-t border-surface-100 dark:border-surface-700/60">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-surface-600 dark:text-surface-300">
                          <Plus className="w-3.5 h-3.5 text-primary-500" />
                          <span>Add Day Limit:</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={newDaySelect[category] ?? ""}
                            onChange={(e) => setNewDaySelect((prev) => ({ ...prev, [category]: e.target.value }))}
                            className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-600 rounded-lg px-2.5 py-1 text-xs font-semibold text-surface-800 dark:text-surface-200 outline-none focus:ring-1 focus:ring-primary-500"
                          >
                            <option value="">Select a day...</option>
                            {Array.from({ length: Math.max(days || 1, 1) }, (_, i) => i).map((i) => {
                              const isAdded = customOverrides[i] !== undefined;
                              let label = `Day ${i + 1}`;
                              if (dateMode === "fixed" && startDate) {
                                try {
                                  label += ` (${format(addDays(parseISO(startDate), i), "MMM d")})`;
                                } catch { }
                              }
                              return (
                                <option key={i} value={i} disabled={isAdded}>
                                  {label}{isAdded ? " (added)" : ""}
                                </option>
                              );
                            })}
                            <option value="custom">Other Day #...</option>
                          </select>

                          {newDaySelect[category] === "custom" && (
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-bold text-surface-400">Day:</span>
                              <input
                                type="number"
                                min="1"
                                max="99"
                                placeholder="e.g. 4"
                                value={customDayNumberInput[category] ?? ""}
                                onChange={(e) => setCustomDayNumberInput((prev) => ({ ...prev, [category]: e.target.value }))}
                                className="w-16 px-2 py-1 text-xs font-bold text-center bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-600 rounded-lg focus:ring-1 focus:ring-primary-500 text-surface-900 dark:text-white"
                              />
                            </div>
                          )}

                          <button
                            onClick={() => {
                              const selected = newDaySelect[category];
                              let targetDayIndex: number | null = null;
                              if (selected === "custom") {
                                const rawNum = parseInt(customDayNumberInput[category] || "", 10);
                                if (!isNaN(rawNum) && rawNum >= 1) {
                                  targetDayIndex = rawNum - 1;
                                }
                              } else if (selected !== undefined && selected !== "") {
                                targetDayIndex = parseInt(selected, 10);
                              }

                              if (targetDayIndex !== null) {
                                handleAddCustomDay(category, targetDayIndex);
                                setNewDaySelect((prev) => ({ ...prev, [category]: "" }));
                                setCustomDayNumberInput((prev) => ({ ...prev, [category]: "" }));
                              }
                            }}
                            disabled={
                              !newDaySelect[category] ||
                              (newDaySelect[category] === "custom" && !customDayNumberInput[category])
                            }
                            className="px-2.5 py-1 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:pointer-events-none rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>

                      <p className="px-4 py-2 text-[10px] text-surface-400 dark:text-surface-500 italic">
                        Leave blank to inherit the global limit. Set to 0 to block this category entirely on that day.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/80 flex justify-between items-center">
          <button
            onClick={() => {
              applyCategoryDurationsToPlaces();
              onClose();
            }}
            className="px-4 py-2 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
          >
            Apply Category Defaults to Current PTVs
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold rounded-full shadow-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
