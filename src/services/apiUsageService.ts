/**
 * Service to track real-time API usage, calculate daily budget consumption,
 * track cache savings, manage Bring Your Own Key (BYOK) custom keys,
 * and synchronize with a shared global cloud counter (Upstash Redis / Vercel KV).
 */

import { isLocalDev } from "../utils/envUtils";
import { analyticsService } from "./analyticsService";

export interface ApiUsageStats {
  date: string; // YYYY-MM-DD
  mapsSearchCalls: number;
  mapsPhotoCalls: number;
  mapsRouteCalls: number;
  geminiCalls: number;
  ekispertCalls: number;
  cacheHits: number;
  errorCalls: number;
  averageLatencyMs: number;
  lastResetTime: number;
  isCloudSynced?: boolean;
}

export interface ApiBudgetLimits {
  dailyMapsLimit: number;    // default ~1,000 queries/day
  dailyGeminiLimit: number;  // default ~1,500 queries/day (free tier)
  dailyEkispertLimit: number; // default 1,000 queries/day (free plan)
}

const STORAGE_KEY_USAGE = "reroute_api_usage_stats_v2";
const STORAGE_KEY_CUSTOM_MAPS = "reroute_custom_maps_key";
const STORAGE_KEY_CUSTOM_GEMINI = "reroute_custom_gemini_key";
const STORAGE_KEY_LIMITS = "reroute_api_budget_limits_v1";
const STORAGE_KEY_CLOUD_SYNC = "reroute_cloud_sync_enabled_v1";

const DEFAULT_LIMITS: ApiBudgetLimits = {
  dailyMapsLimit: 1000,
  dailyGeminiLimit: 1500,
  dailyEkispertLimit: 1000,
};

export const isCloudSyncActive = (): boolean => {
  if (!isLocalDev()) {
    // In production (Vercel deployment), cloud sync is always active
    return true;
  }
  // In local development, check localStorage override first
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CLOUD_SYNC);
    if (stored !== null) {
      return stored === "true";
    }
  } catch (e) {}

  // Fall back to environment variable VITE_SYNC_CLOUD_REDIS
  return import.meta.env.VITE_SYNC_CLOUD_REDIS === "true";
};

const getTodayDateString = () => new Date().toISOString().split("T")[0];

const getInitialStats = (): ApiUsageStats => {
  const today = getTodayDateString();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === today) {
        return {
          ...parsed,
          ekispertCalls: parsed.ekispertCalls || 0,
          errorCalls: parsed.errorCalls || 0,
          averageLatencyMs: parsed.averageLatencyMs || 0,
          isCloudSynced: false,
        };
      }
    }
  } catch (e) {
    console.warn("Failed to load API usage from localStorage:", e);
  }
  return {
    date: today,
    mapsSearchCalls: 0,
    mapsPhotoCalls: 0,
    mapsRouteCalls: 0,
    geminiCalls: 0,
    ekispertCalls: 0,
    cacheHits: 0,
    errorCalls: 0,
    averageLatencyMs: 0,
    lastResetTime: Date.now(),
    isCloudSynced: false,
  };
};

let currentStats: ApiUsageStats = getInitialStats();
let totalLatencySum = 0;
let totalLatencyCount = 0;

type UsageListener = (stats: ApiUsageStats) => void;
const listeners = new Set<UsageListener>();

const persistAndNotify = () => {
  try {
    localStorage.setItem(STORAGE_KEY_USAGE, JSON.stringify(currentStats));
  } catch (e) {
    console.warn("Failed to persist API usage:", e);
  }
  listeners.forEach((fn) => fn({ ...currentStats }));
};

const checkDayRollover = () => {
  const today = getTodayDateString();
  if (currentStats.date !== today) {
    currentStats = {
      date: today,
      mapsSearchCalls: 0,
      mapsPhotoCalls: 0,
      mapsRouteCalls: 0,
      geminiCalls: 0,
      ekispertCalls: 0,
      cacheHits: 0,
      errorCalls: 0,
      averageLatencyMs: 0,
      lastResetTime: Date.now(),
      isCloudSynced: currentStats.isCloudSynced,
    };
    totalLatencySum = 0;
    totalLatencyCount = 0;
    persistAndNotify();
  }
};

// Sync with global cloud counter endpoint
const fetchCloudStats = async () => {
  if (!isCloudSyncActive()) {
    return;
  }

  try {
    const res = await fetch("/api/usage", {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.isConfigured) {
      currentStats = {
        date: data.date || getTodayDateString(),
        mapsSearchCalls: Math.max(currentStats.mapsSearchCalls, data.mapsSearchCalls || 0),
        mapsPhotoCalls: Math.max(currentStats.mapsPhotoCalls, data.mapsPhotoCalls || 0),
        mapsRouteCalls: Math.max(currentStats.mapsRouteCalls, data.mapsRouteCalls || 0),
        geminiCalls: Math.max(currentStats.geminiCalls, data.geminiCalls || 0),
        ekispertCalls: Math.max(currentStats.ekispertCalls, data.ekispertCalls || 0),
        cacheHits: Math.max(currentStats.cacheHits, data.cacheHits || 0),
        errorCalls: Math.max(currentStats.errorCalls, data.errorCalls || 0),
        averageLatencyMs: currentStats.averageLatencyMs || data.averageLatencyMs || 0,
        lastResetTime: currentStats.lastResetTime,
        isCloudSynced: true,
      };
      persistAndNotify();
    }
  } catch (err) {
    // Graceful fallback to local counter
  }
};

// Initiate background cloud sync
if (typeof window !== "undefined") {
  if (isCloudSyncActive()) {
    setTimeout(() => fetchCloudStats(), 300);
  }
}

export const apiUsageService = {
  getStats: (): ApiUsageStats => {
    checkDayRollover();
    return { ...currentStats };
  },

  isCloudSyncEnabled: (): boolean => {
    return isCloudSyncActive();
  },

  setCloudSyncEnabled: (enabled: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY_CLOUD_SYNC, String(enabled));
    } catch (e) {}

    if (enabled) {
      fetchCloudStats();
    } else {
      currentStats = { ...currentStats, isCloudSynced: false };
      persistAndNotify();
    }
  },

  getLimits: (): ApiBudgetLimits => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LIMITS);
      if (raw) return { ...DEFAULT_LIMITS, ...JSON.parse(raw) };
    } catch (e) {}
    return { ...DEFAULT_LIMITS };
  },

  setLimits: (limits: Partial<ApiBudgetLimits>) => {
    const newLimits = { ...apiUsageService.getLimits(), ...limits };
    localStorage.setItem(STORAGE_KEY_LIMITS, JSON.stringify(newLimits));
    persistAndNotify();
  },

  syncWithCloud: async (): Promise<{ success: boolean; message?: string }> => {
    if (!isCloudSyncActive()) {
      return {
        success: false,
        message: "Cloud sync is disabled (enable in settings or set VITE_SYNC_CLOUD_REDIS=true).",
      };
    }
    await fetchCloudStats();
    return { success: true };
  },

  recordCall: (
    type: "maps_search" | "maps_photo" | "maps_route" | "gemini" | "ekispert",
    latencyMs?: number
  ) => {
    checkDayRollover();
    const isByok =
      type.startsWith("maps")
        ? apiUsageService.isUsingCustomMapsKey()
        : type === "gemini"
          ? apiUsageService.isUsingCustomGeminiKey()
          : false;

    if (type === "maps_search") currentStats.mapsSearchCalls++;
    else if (type === "maps_photo") currentStats.mapsPhotoCalls++;
    else if (type === "maps_route") currentStats.mapsRouteCalls++;
    else if (type === "gemini") currentStats.geminiCalls++;
    else if (type === "ekispert") currentStats.ekispertCalls++;

    if (latencyMs && latencyMs > 0) {
      totalLatencySum += latencyMs;
      totalLatencyCount += 1;
      currentStats.averageLatencyMs = Math.round(totalLatencySum / totalLatencyCount);
    }

    persistAndNotify();

    // Send high-level product telemetry
    analyticsService.trackEvent("api_call", { type, isByok, latencyMs });

    // Asynchronously report to cloud counter (when cloud sync is active)
    if (isCloudSyncActive()) {
      try {
        fetch("/api/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, isByok }),
        }).catch(() => {});
      } catch (e) {}
    }
  },

  recordError: (type: string, errorMsg?: string) => {
    checkDayRollover();
    currentStats.errorCalls++;
    persistAndNotify();
    analyticsService.trackEvent("api_error", { type, error: errorMsg });
  },

  recordCacheHit: (count = 1) => {
    checkDayRollover();
    currentStats.cacheHits += count;
    persistAndNotify();

    analyticsService.trackEvent("cache_hit", { count });

    if (isCloudSyncActive()) {
      try {
        fetch("/api/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "cache_hit", count, isByok: false }),
        }).catch(() => {});
      } catch (e) {}
    }
  },

  /**
   * Calculates estimated USD cost saved from cache hits based on Google Maps & Gemini pricing
   */
  getEstimatedSavingsUsd: (): number => {
    // Average Google Maps search ($0.017) + Photo ($0.007) + Route ($0.005) blended ~$0.012/hit
    const savings = currentStats.cacheHits * 0.012;
    return Number(savings.toFixed(2));
  },

  /**
   * Calculates overall cache hit efficiency percentage
   */
  getCacheEfficiencyRatio: (): number => {
    const totalCalls =
      currentStats.mapsSearchCalls +
      currentStats.mapsPhotoCalls +
      currentStats.mapsRouteCalls +
      currentStats.geminiCalls +
      currentStats.ekispertCalls;
    const total = totalCalls + currentStats.cacheHits;
    if (total === 0) return 0;
    return Math.round((currentStats.cacheHits / total) * 100);
  },

  resetStats: () => {
    currentStats = {
      date: getTodayDateString(),
      mapsSearchCalls: 0,
      mapsPhotoCalls: 0,
      mapsRouteCalls: 0,
      geminiCalls: 0,
      ekispertCalls: 0,
      cacheHits: 0,
      errorCalls: 0,
      averageLatencyMs: 0,
      lastResetTime: Date.now(),
      isCloudSynced: currentStats.isCloudSynced,
    };
    totalLatencySum = 0;
    totalLatencyCount = 0;
    persistAndNotify();
  },

  subscribe: (listener: UsageListener) => {
    listeners.add(listener);
    listener({ ...currentStats });
    return () => {
      listeners.delete(listener);
    };
  },

  // BYOK (Bring Your Own Key) helpers
  getCustomMapsKey: (): string => {
    return localStorage.getItem(STORAGE_KEY_CUSTOM_MAPS) || "";
  },

  setCustomMapsKey: (key: string) => {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_MAPS, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_CUSTOM_MAPS);
    }
    persistAndNotify();
  },

  getCustomGeminiKey: (): string => {
    return localStorage.getItem(STORAGE_KEY_CUSTOM_GEMINI) || "";
  },

  setCustomGeminiKey: (key: string) => {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_GEMINI, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_CUSTOM_GEMINI);
    }
    persistAndNotify();
  },

  getActiveMapsKey: (): string => {
    const custom = apiUsageService.getCustomMapsKey();
    if (custom) return custom;
    return import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || "";
  },

  getActiveGeminiKey: (): string => {
    const custom = apiUsageService.getCustomGeminiKey();
    if (custom) return custom;
    return import.meta.env?.VITE_GEMINI_API_KEY || "";
  },

  isUsingCustomMapsKey: (): boolean => {
    return !!apiUsageService.getCustomMapsKey();
  },

  isUsingCustomGeminiKey: (): boolean => {
    return !!apiUsageService.getCustomGeminiKey();
  },
};
