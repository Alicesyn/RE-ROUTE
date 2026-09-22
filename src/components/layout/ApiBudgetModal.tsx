import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  Sparkles,
  MapPin,
  Database,
  ExternalLink,
  RotateCcw,
  Check,
  Eye,
  EyeOff,
  HelpCircle,
  Activity,
  Shield,
  Cloud,
  CloudOff,
  Globe,
  Smartphone,
  Laptop,
  Tablet,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  Share2,
  Compass,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  apiUsageService,
  ApiUsageStats,
  ApiBudgetLimits,
} from "../../services/apiUsageService";
import {
  analyticsService,
  AnalyticsSummary,
  getCountryDetails,
} from "../../services/analyticsService";
import { toast } from "../../services/toastService";
import { isLocalDev } from "../../utils/envUtils";

interface ApiBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "overview" | "geography" | "budget" | "activity" | "byok" | "guide";

export const ApiBudgetModal: React.FC<ApiBudgetModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [stats, setStats] = useState<ApiUsageStats>(apiUsageService.getStats());
  const [limits, setLimits] = useState<ApiBudgetLimits>(apiUsageService.getLimits());
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(
    apiUsageService.isCloudSyncEnabled()
  );
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  const [customMapsKey, setCustomMapsKey] = useState(
    apiUsageService.getCustomMapsKey()
  );
  const [customGeminiKey, setCustomGeminiKey] = useState(
    apiUsageService.getCustomGeminiKey()
  );

  const [showMapsKey, setShowMapsKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isTestingMaps, setIsTestingMaps] = useState(false);
  const [isTestingGemini, setIsTestingGemini] = useState(false);

  useEffect(() => {
    const unsub = apiUsageService.subscribe((newStats) => {
      setStats(newStats);
      setLimits(apiUsageService.getLimits());
      setCloudSyncEnabled(apiUsageService.isCloudSyncEnabled());
    });
    return unsub;
  }, []);

  // Fetch analytics summary when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsLoadingAnalytics(true);
      analyticsService
        .getAnalyticsSummary()
        .then((data) => setAnalytics(data))
        .catch(() => {})
        .finally(() => setIsLoadingAnalytics(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalMapsCalls =
    stats.mapsSearchCalls + stats.mapsPhotoCalls + stats.mapsRouteCalls;
  const mapsPercent = Math.min(
    100,
    Math.round((totalMapsCalls / limits.dailyMapsLimit) * 100)
  );
  const geminiPercent = Math.min(
    100,
    Math.round((stats.geminiCalls / limits.dailyGeminiLimit) * 100)
  );
  const ekispertPercent = Math.min(
    100,
    Math.round((stats.ekispertCalls / (limits.dailyEkispertLimit || 1000)) * 100)
  );

  const totalApiInvocations =
    totalMapsCalls + stats.geminiCalls + stats.ekispertCalls;
  const cacheEfficiency = apiUsageService.getCacheEfficiencyRatio();
  const estimatedSavings = apiUsageService.getEstimatedSavingsUsd();

  const getProgressColor = (percent: number) => {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const handleSaveCustomKeys = () => {
    apiUsageService.setCustomMapsKey(customMapsKey);
    apiUsageService.setCustomGeminiKey(customGeminiKey);
    analyticsService.trackEvent("byok_configured");
    toast.success("API keys updated successfully.", "BYOK Saved");
  };

  const handleResetUsage = () => {
    apiUsageService.resetStats();
    toast.info("Daily API usage stats reset.", "Stats Reset");
  };

  const handleTestMapsKey = async () => {
    const keyToTest = customMapsKey.trim() || apiUsageService.getActiveMapsKey();
    if (!keyToTest) {
      toast.error("Please enter a Google Maps API key to test.", "Missing Key");
      return;
    }
    setIsTestingMaps(true);
    try {
      const res = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": keyToTest,
            "X-Goog-FieldMask": "places.id,places.displayName",
          },
          body: JSON.stringify({ textQuery: "Tokyo Station" }),
        }
      );
      if (res.ok) {
        toast.success("Google Maps API Key is valid and working!", "Key Valid");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(
          err.error?.message || `Failed with HTTP ${res.status}`,
          "Key Test Failed"
        );
      }
    } catch (e: any) {
      toast.error(e.message || "Network test failed", "Key Test Failed");
    } finally {
      setIsTestingMaps(false);
    }
  };

  const handleTestGeminiKey = async () => {
    const keyToTest = customGeminiKey.trim() || apiUsageService.getActiveGeminiKey();
    if (!keyToTest) {
      toast.error("Please enter a Gemini API key to test.", "Missing Key");
      return;
    }
    setIsTestingGemini(true);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${keyToTest}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Respond with: ok" }] }],
          }),
        }
      );
      if (res.ok) {
        toast.success("Gemini API Key is valid and working!", "Key Valid");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(
          err.error?.message || `Failed with HTTP ${res.status}`,
          "Key Test Failed"
        );
      }
    } catch (e: any) {
      toast.error(e.message || "Network test failed", "Key Test Failed");
    } finally {
      setIsTestingGemini(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-surface-900/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] border border-surface-200 dark:border-surface-700 transition-colors"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700 bg-surface-50/70 dark:bg-surface-800/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 flex items-center justify-center shadow-xs">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-surface-900 dark:text-white">
                    Analytics & API Intelligence
                  </h2>
                  <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300">
                    Live Monitor
                  </span>
                </div>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Real-time visitor origins, API quotas, cache economics & travel telemetry
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-full transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-surface-200 dark:border-surface-700 px-4 sm:px-6 bg-surface-50/40 dark:bg-surface-900/30 overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === "overview"
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab("geography")}
              className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === "geography"
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
              }`}
            >
              <Globe className="w-4 h-4" />
              Audience & Geography
            </button>
            <button
              onClick={() => setActiveTab("budget")}
              className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === "budget"
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
              }`}
            >
              <Activity className="w-4 h-4" />
              API Stats & Budget
            </button>
            <button
              onClick={() => setActiveTab("activity")}
              className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === "activity"
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
              }`}
            >
              <Compass className="w-4 h-4" />
              Product Activity
            </button>
            <button
              onClick={() => setActiveTab("byok")}
              className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === "byok"
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
              }`}
            >
              <Key className="w-4 h-4" />
              BYOK Keys
              {(customMapsKey || customGeminiKey) && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("guide")}
              className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === "guide"
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              Free Keys Guide
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
            {/* TAB 1: OVERVIEW */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* 4 Core KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  <div className="bg-surface-50 dark:bg-surface-900/50 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-xs font-medium text-surface-500 dark:text-surface-400 flex items-center gap-1">
                      <Globe className="w-3.5 h-3.5 text-primary-500" /> Visitors Today
                    </span>
                    <div className="mt-2">
                      <div className="text-2xl font-black text-surface-900 dark:text-white font-mono">
                        {analytics?.todayVisitors ?? 1}
                      </div>
                      <span className="text-[11px] text-surface-400">
                        {analytics?.totalVisitors ?? 1} total tracked
                      </span>
                    </div>
                  </div>

                  <div className="bg-surface-50 dark:bg-surface-900/50 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-xs font-medium text-surface-500 dark:text-surface-400 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-purple-500" /> API Calls Today
                    </span>
                    <div className="mt-2">
                      <div className="text-2xl font-black text-surface-900 dark:text-white font-mono">
                        {totalApiInvocations}
                      </div>
                      <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                        {stats.geminiCalls} AI / {totalMapsCalls} Maps
                      </span>
                    </div>
                  </div>

                  <div className="bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" /> Cache Efficiency
                    </span>
                    <div className="mt-2">
                      <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono">
                        {cacheEfficiency}%
                      </div>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        {stats.cacheHits} cached hits
                      </span>
                    </div>
                  </div>

                  <div className="bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" /> Est. Cost Saved
                    </span>
                    <div className="mt-2">
                      <div className="text-2xl font-black text-amber-700 dark:text-amber-300 font-mono">
                        ${estimatedSavings}
                      </div>
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        vs un-cached calls
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cloud & Edge Status Strip */}
                <div className="p-3.5 rounded-xl bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        stats.isCloudSynced
                          ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                          : "bg-surface-200 dark:bg-surface-700 text-surface-500"
                      }`}
                    >
                      {stats.isCloudSynced ? <Cloud className="w-4 h-4" /> : <CloudOff className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-surface-900 dark:text-white">
                          {stats.isCloudSynced
                            ? "Production Edge Database (Upstash Redis)"
                            : isLocalDev()
                            ? (cloudSyncEnabled ? "Connecting to Cloud..." : "Local Dev Isolated Storage")
                            : "Local Storage Mode"}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            stats.isCloudSynced ? "bg-emerald-500 animate-pulse" : "bg-surface-400"
                          }`}
                        />
                      </div>
                      <p className="text-[11px] text-surface-500 dark:text-surface-400">
                        {stats.isCloudSynced
                          ? "Synchronized with global counters across all active users."
                          : "Metrics collected locally in browser without skewing production quotas."}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setIsLoadingAnalytics(true);
                      const res = await apiUsageService.syncWithCloud();
                      const summary = await analyticsService.getAnalyticsSummary();
                      setAnalytics(summary);
                      setIsLoadingAnalytics(false);
                      if (res.success) {
                        toast.success("Synchronized stats with cloud.", "Live Sync");
                      } else {
                        toast.info(res.message || "Local mode refreshed.", "Sync Status");
                      }
                    }}
                    className="p-1.5 px-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isLoadingAnalytics ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Quick Previews: Top Countries & Top Planned Cities */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Top Countries Preview */}
                  <div className="bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-surface-700 dark:text-surface-300 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-primary-500" /> Top Visitor Origins
                      </span>
                      <button
                        onClick={() => setActiveTab("geography")}
                        className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        View all &rarr;
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(analytics?.countries || [
                        { code: "US", name: "United States", count: 1, percentage: 100 },
                      ])
                        .slice(0, 4)
                        .map((c) => {
                          const info = getCountryDetails(c.code);
                          return (
                            <div key={c.code} className="space-y-1">
                              <div className="flex items-center justify-between text-xs font-medium">
                                <span className="flex items-center gap-1.5">
                                  <span>{info.flag}</span>
                                  <span className="text-surface-800 dark:text-surface-200">{info.name}</span>
                                </span>
                                <span className="text-surface-500 dark:text-surface-400 font-mono">
                                  {c.count} ({c.percentage}%)
                                </span>
                              </div>
                              <div className="w-full bg-surface-200 dark:bg-surface-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-primary-500 h-full rounded-full transition-all"
                                  style={{ width: `${Math.max(8, c.percentage)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Top Destinations Preview */}
                  <div className="bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-surface-700 dark:text-surface-300 flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-emerald-500" /> Top Planned Destinations
                      </span>
                      <button
                        onClick={() => setActiveTab("activity")}
                        className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        View details &rarr;
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(analytics?.topDestinations && analytics.topDestinations.length > 0
                        ? analytics.topDestinations
                        : [
                            { destination: "Tokyo", count: 1 },
                            { destination: "Kyoto", count: 1 },
                            { destination: "Osaka", count: 1 },
                          ]
                      ).map((dest) => (
                        <div
                          key={dest.destination}
                          className="px-2.5 py-1 rounded-lg bg-surface-200/70 dark:bg-surface-700/60 text-xs font-medium text-surface-800 dark:text-surface-200 flex items-center gap-1.5"
                        >
                          <span>{dest.destination}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-300 font-mono">
                            {dest.count}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-surface-200/60 dark:border-surface-700/60 flex items-center justify-between text-[11px] text-surface-500">
                      <span>API Health Status</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {stats.errorCalls === 0
                          ? "100% Operational"
                          : `${stats.errorCalls} Errors Detected`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: AUDIENCE & GEOGRAPHY ("Where my users are from") */}
            {activeTab === "geography" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-surface-900 dark:text-white flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary-500" />
                      Geographic Distribution
                    </h3>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      Zero-overhead edge geolocation resolved directly via Vercel Edge headers
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold px-2 py-1 rounded bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800/50">
                    {analytics?.countries?.length || 1} Countries Tracked
                  </span>
                </div>

                {/* Country Breakdown Table / Cards */}
                <div className="bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 rounded-xl p-5 space-y-3.5">
                  <h4 className="text-xs font-bold text-surface-700 dark:text-surface-300 uppercase tracking-wider">
                    Countries & Regions
                  </h4>
                  <div className="space-y-3">
                    {(analytics?.countries || [
                      { code: "US", name: "United States", count: 1, percentage: 100 },
                    ]).map((country) => {
                      const details = getCountryDetails(country.code);
                      return (
                        <div key={country.code} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{details.flag}</span>
                              <span className="font-semibold text-surface-800 dark:text-surface-200">
                                {details.name}
                              </span>
                              <span className="text-[10px] font-mono text-surface-400">
                                ({country.code})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 font-mono">
                              <span className="font-bold text-surface-900 dark:text-white">
                                {country.count}
                              </span>
                              <span className="text-surface-400 text-[11px]">
                                ({country.percentage}%)
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-surface-200 dark:bg-surface-700 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-primary-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(4, country.percentage)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Devices & Browsers Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Device Categories */}
                  <div className="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-bold text-surface-700 dark:text-surface-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Laptop className="w-3.5 h-3.5 text-blue-500" /> Device Breakdown
                    </h4>
                    <div className="space-y-2.5">
                      {(analytics?.devices || [
                        { device: "desktop", count: 1, percentage: 100 },
                      ]).map((dev) => (
                        <div key={dev.device} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 text-surface-700 dark:text-surface-300 capitalize">
                            {dev.device === "desktop" && <Laptop className="w-3.5 h-3.5 text-surface-400" />}
                            {dev.device === "mobile" && <Smartphone className="w-3.5 h-3.5 text-surface-400" />}
                            {dev.device === "tablet" && <Tablet className="w-3.5 h-3.5 text-surface-400" />}
                            <span>{dev.device}</span>
                          </div>
                          <span className="font-mono font-bold text-surface-900 dark:text-white">
                            {dev.count} ({dev.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Referrer Sources */}
                  <div className="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-bold text-surface-700 dark:text-surface-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5 text-purple-500" /> Traffic Sources
                    </h4>
                    <div className="space-y-2.5">
                      {(analytics?.referrers || [
                        { source: "direct", count: 1 },
                      ]).map((ref) => (
                        <div key={ref.source} className="flex items-center justify-between text-xs">
                          <span className="text-surface-700 dark:text-surface-300 capitalize">
                            {ref.source === "direct" ? "Direct / Bookmark" : ref.source}
                          </span>
                          <span className="font-mono font-bold text-surface-900 dark:text-white">
                            {ref.count} visits
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: API STATS & BUDGET */}
            {activeTab === "budget" && (
              <div className="space-y-6">
                {/* Latency & Error Health Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700">
                    <span className="text-[11px] font-medium text-surface-500 dark:text-surface-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-blue-500" /> Average Latency
                    </span>
                    <div className="mt-1 text-xl font-bold font-mono text-surface-900 dark:text-white">
                      {stats.averageLatencyMs > 0 ? `${stats.averageLatencyMs}ms` : "Fast (~120ms)"}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700">
                    <span className="text-[11px] font-medium text-surface-500 dark:text-surface-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Success Rate
                    </span>
                    <div className="mt-1 text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {stats.errorCalls === 0 ? "100%" : `${Math.round((totalApiInvocations / (totalApiInvocations + stats.errorCalls)) * 100)}%`}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700">
                    <span className="text-[11px] font-medium text-surface-500 dark:text-surface-400 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-amber-500" /> Cache Savings
                    </span>
                    <div className="mt-1 text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                      ${estimatedSavings}
                    </div>
                  </div>
                </div>

                {/* Progress Gauges */}
                <div className="space-y-4 bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 rounded-xl p-5">
                  <h3 className="text-xs font-bold text-surface-700 dark:text-surface-300 uppercase tracking-wider">
                    Daily Quota Consumption ({stats.date})
                  </h3>

                  {/* Maps Progress */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-surface-700 dark:text-surface-200 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-primary-500" /> Google Maps API
                      </span>
                      <span className="font-mono text-surface-500 dark:text-surface-400">
                        {totalMapsCalls} / {limits.dailyMapsLimit} ({mapsPercent}%)
                      </span>
                    </div>
                    <div className="w-full bg-surface-200 dark:bg-surface-700 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getProgressColor(
                          mapsPercent
                        )}`}
                        style={{ width: `${mapsPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Gemini Progress */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-surface-700 dark:text-surface-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-500" /> Google Gemini AI
                      </span>
                      <span className="font-mono text-surface-500 dark:text-surface-400">
                        {stats.geminiCalls} / {limits.dailyGeminiLimit} ({geminiPercent}%)
                      </span>
                    </div>
                    <div className="w-full bg-surface-200 dark:bg-surface-700 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getProgressColor(
                          geminiPercent
                        )}`}
                        style={{ width: `${geminiPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Ekispert Progress */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-surface-700 dark:text-surface-200 flex items-center gap-1.5">
                        <span className="text-base leading-none">🚆</span> Ekispert Transit API
                      </span>
                      <span className="font-mono text-surface-500 dark:text-surface-400">
                        {stats.ekispertCalls} / {limits.dailyEkispertLimit || 1000} ({ekispertPercent}%)
                      </span>
                    </div>
                    <div className="w-full bg-surface-200 dark:bg-surface-700 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getProgressColor(ekispertPercent)}`}
                        style={{ width: `${ekispertPercent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-1">
                      Free plan domain-restricted to reroute.tools. Station & route lookups are cached for 30 days.
                    </p>
                  </div>
                </div>

                {/* Detailed Breakdown */}
                <div className="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-surface-700 dark:text-surface-300 uppercase tracking-wider">
                    Endpoint Call Breakdown
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-surface-50 dark:bg-surface-900/40">
                      <span className="text-surface-500 dark:text-surface-400 block">Places Search</span>
                      <span className="text-base font-bold text-surface-900 dark:text-white font-mono">
                        {stats.mapsSearchCalls}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-50 dark:bg-surface-900/40">
                      <span className="text-surface-500 dark:text-surface-400 block">Photo Fetches</span>
                      <span className="text-base font-bold text-surface-900 dark:text-white font-mono">
                        {stats.mapsPhotoCalls}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-50 dark:bg-surface-900/40">
                      <span className="text-surface-500 dark:text-surface-400 block">Route Matrices</span>
                      <span className="text-base font-bold text-surface-900 dark:text-white font-mono">
                        {stats.mapsRouteCalls}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-50 dark:bg-surface-900/40">
                      <span className="text-surface-500 dark:text-surface-400 block">AI Summaries</span>
                      <span className="text-base font-bold text-surface-900 dark:text-white font-mono">
                        {stats.geminiCalls}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-50 dark:bg-surface-900/40">
                      <span className="text-surface-500 dark:text-surface-400 block">Transit (Ekispert)</span>
                      <span className="text-base font-bold text-surface-900 dark:text-white font-mono">
                        {stats.ekispertCalls}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-surface-400">
                    Daily counters reset automatically at 00:00 UTC.
                  </span>
                  <button
                    onClick={handleResetUsage}
                    className="flex items-center gap-1.5 text-xs font-semibold text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 px-3 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Daily Counters
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: PRODUCT & ITINERARY ACTIVITY */}
            {activeTab === "activity" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-surface-900 dark:text-white flex items-center gap-2">
                    <Compass className="w-4 h-4 text-emerald-500" />
                    Trip & Feature Activity
                  </h3>
                  <p className="text-xs text-surface-500 dark:text-surface-400">
                    High-level usage metrics on destinations planned and tools utilized
                  </p>
                </div>

                {/* Top Destinations Grid */}
                <div className="bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 rounded-xl p-5 space-y-3">
                  <h4 className="text-xs font-bold text-surface-700 dark:text-surface-300 uppercase tracking-wider">
                    Most Planned Destination Cities
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {(analytics?.topDestinations && analytics.topDestinations.length > 0
                      ? analytics.topDestinations
                      : [
                          { destination: "Tokyo", count: 3 },
                          { destination: "Kyoto", count: 2 },
                          { destination: "Osaka", count: 1 },
                        ]
                    ).map((dest) => (
                      <div
                        key={dest.destination}
                        className="p-3 rounded-lg bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 flex items-center justify-between"
                      >
                        <span className="text-xs font-semibold text-surface-800 dark:text-surface-200">
                          {dest.destination}
                        </span>
                        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {dest.count} trips
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Actions Log */}
                <div className="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-surface-700 dark:text-surface-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary-500" /> Feature Interactions Today
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/40">
                      <span className="text-surface-500 block">Route Optimizations</span>
                      <span className="text-base font-bold text-surface-900 dark:text-white font-mono">
                        {analytics?.events?.["trip_optimized"] || 0}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/40">
                      <span className="text-surface-500 block">Itinerary Exports</span>
                      <span className="text-base font-bold text-surface-900 dark:text-white font-mono">
                        {analytics?.events?.["trip_exported"] || 0}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-surface-50 dark:bg-surface-900/40">
                      <span className="text-surface-500 block">BYOK Users</span>
                      <span className="text-base font-bold text-surface-900 dark:text-white font-mono">
                        {customMapsKey || customGeminiKey ? 1 : 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: BRING YOUR OWN KEY (BYOK) */}
            {activeTab === "byok" && (
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex items-start gap-3">
                  <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900 dark:text-blue-200 space-y-1">
                    <p className="font-bold">Your keys remain 100% private in your browser</p>
                    <p className="text-blue-700 dark:text-blue-300">
                      Keys entered here are stored strictly in your browser's{" "}
                      <code className="bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded">
                        localStorage
                      </code>{" "}
                      and are never transmitted to our servers.
                    </p>
                  </div>
                </div>

                {/* Google Maps Key Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-surface-700 dark:text-surface-200 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-primary-500" />
                      Google Maps API Key
                    </label>
                    <span className="text-[11px] font-semibold text-surface-400">
                      {customMapsKey ? "🟢 Custom Key Active" : "🌐 Default Key Active"}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showMapsKey ? "text" : "password"}
                      value={customMapsKey}
                      onChange={(e) => setCustomMapsKey(e.target.value)}
                      placeholder="AIzaSy... (leave blank to use default public key)"
                      className="w-full h-10 text-xs bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl px-3 pr-20 text-surface-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowMapsKey(!showMapsKey)}
                        className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
                      >
                        {showMapsKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleTestMapsKey}
                        disabled={isTestingMaps}
                        className="text-[10px] font-bold bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 px-2 py-1 rounded text-surface-700 dark:text-surface-200 transition-colors"
                      >
                        {isTestingMaps ? "Testing..." : "Test"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Gemini AI Key Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-surface-700 dark:text-surface-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      Google Gemini API Key
                    </label>
                    <span className="text-[11px] font-semibold text-surface-400">
                      {customGeminiKey ? "🟢 Custom Key Active" : "🌐 Default Key Active"}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? "text" : "password"}
                      value={customGeminiKey}
                      onChange={(e) => setCustomGeminiKey(e.target.value)}
                      placeholder="AIzaSy... (leave blank to use default public key)"
                      className="w-full h-10 text-xs bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl px-3 pr-20 text-surface-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
                      >
                        {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleTestGeminiKey}
                        disabled={isTestingGemini}
                        className="text-[10px] font-bold bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 px-2 py-1 rounded text-surface-700 dark:text-surface-200 transition-colors"
                      >
                        {isTestingGemini ? "Testing..." : "Test"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Local Development Sync Toggle */}
                {isLocalDev() && (
                  <div className="p-3 rounded-xl bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-surface-700 dark:text-surface-300">
                        Sync with Production Redis Cloud
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 font-mono font-semibold">
                        reroute.tools
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cloudSyncEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCloudSyncEnabled(checked);
                          apiUsageService.setCloudSyncEnabled(checked);
                          if (checked) {
                            toast.info(
                              "Connecting to https://reroute.tools Redis database...",
                              "Cloud Sync Enabled"
                            );
                          } else {
                            toast.info(
                              "Local storage isolated from production database.",
                              "Cloud Sync Disabled"
                            );
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-surface-300 peer-focus:outline-none rounded-full peer dark:bg-surface-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-surface-100 dark:border-surface-700">
                  <button
                    onClick={() => {
                      setCustomMapsKey("");
                      setCustomGeminiKey("");
                      apiUsageService.setCustomMapsKey("");
                      apiUsageService.setCustomGeminiKey("");
                      toast.info("Cleared custom keys. Reverted to default.", "Reset to Default");
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
                  >
                    Clear Keys
                  </button>
                  <button
                    onClick={handleSaveCustomKeys}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" /> Save API Keys
                  </button>
                </div>
              </div>
            )}

            {/* TAB 6: HOW TO GET FREE KEYS GUIDE */}
            {activeTab === "guide" && (
              <div className="space-y-6 text-xs text-surface-700 dark:text-surface-300">
                {/* Gemini Guide */}
                <div className="bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-purple-900 dark:text-purple-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      1. How to Get a Free Google Gemini API Key (1 Minute)
                    </h3>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline"
                    >
                      Open AI Studio <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-surface-600 dark:text-surface-300 pl-1">
                    <li>
                      Visit{" "}
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 dark:text-purple-400 font-semibold hover:underline"
                      >
                        Google AI Studio (aistudio.google.com)
                      </a>{" "}
                      and sign in with your Google account.
                    </li>
                    <li>
                      Click the blue <span className="font-bold text-surface-900 dark:text-white">"Create API Key"</span> button.
                    </li>
                    <li>
                      Select <span className="italic">"Create key in new project"</span> and copy your generated API key.
                    </li>
                    <li>
                      Paste the key into the <span className="font-bold">BYOK</span> tab above and click <span className="font-bold">Save API Keys</span>.
                    </li>
                  </ol>
                  <p className="text-[11px] text-purple-700 dark:text-purple-300 font-medium">
                    ✨ Free Tier includes <strong>1,500 requests per day</strong> at zero cost.
                  </p>
                </div>

                {/* Google Maps Guide */}
                <div className="bg-primary-50/60 dark:bg-primary-950/20 border border-primary-200 dark:border-primary-900/40 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-primary-900 dark:text-primary-300 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary-500" />
                      2. How to Get a Free Google Maps API Key
                    </h3>
                    <a
                      href="https://console.cloud.google.com/google/maps-apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Cloud Console <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-surface-600 dark:text-surface-300 pl-1">
                    <li>
                      Go to the{" "}
                      <a
                        href="https://console.cloud.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 dark:text-primary-400 font-semibold hover:underline"
                      >
                        Google Cloud Console
                      </a>{" "}
                      and create or select a project.
                    </li>
                    <li>
                      Navigate to <span className="font-bold text-surface-900 dark:text-white">APIs & Services &gt; Library</span>, then search for and enable:
                      <ul className="list-disc list-inside pl-4 mt-1 space-y-0.5 font-medium">
                        <li><strong>Places API (New)</strong></li>
                        <li><strong>Routes API</strong></li>
                      </ul>
                    </li>
                    <li>
                      Go to <span className="font-bold text-surface-900 dark:text-white">APIs & Services &gt; Credentials</span>, click <span className="font-bold">Create Credentials &gt; API Key</span>.
                    </li>
                    <li>
                      Copy your key and paste it into the <span className="font-bold">BYOK</span> tab above.
                    </li>
                  </ol>
                  <p className="text-[11px] text-primary-700 dark:text-primary-300 font-medium">
                    💳 Google Cloud provides a recurring <strong>$200 monthly free credit</strong> (~10,000 requests/month) for Maps APIs.
                  </p>
                </div>

                {/* Cloud Counter Guide */}
                <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-emerald-500" />
                      3. How to Enable Global Shared Cloud Counter (Free Upstash Redis)
                    </h3>
                    <a
                      href="https://console.upstash.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Upstash Console <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-surface-600 dark:text-surface-300 pl-1">
                    <li>
                      Create a free account at{" "}
                      <a
                        href="https://console.upstash.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                      >
                        Upstash Redis
                      </a>{" "}
                      (Free tier: 10,000 requests/day).
                    </li>
                    <li>
                      Click <span className="font-bold text-surface-900 dark:text-white">"Create Database"</span> and choose your preferred region.
                    </li>
                    <li>
                      Scroll down to the <span className="font-bold text-surface-900 dark:text-white">"REST API"</span> section and copy:
                      <ul className="list-disc list-inside pl-4 mt-1 space-y-0.5 font-mono text-[11px]">
                        <li>UPSTASH_REDIS_REST_URL</li>
                        <li>UPSTASH_REDIS_REST_TOKEN</li>
                      </ul>
                    </li>
                    <li>
                      Add them to your project's <span className="font-mono font-bold">.env</span> file or your Vercel Environment Variables.
                    </li>
                  </ol>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                    ⚡ Instantaneous atomic counters sync stats across all users globally.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
