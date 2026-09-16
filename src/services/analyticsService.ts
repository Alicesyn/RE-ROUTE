/**
 * RE-ROUTE Client Analytics & Telemetry Service
 * 
 * Captures privacy-preserving visitor metadata (geo cues, device, referrer),
 * tracks high-level user engagement (optimizations, exports, destination cities),
 * and syncs with /api/analytics edge endpoint.
 * 
 * In local dev mode, telemetry is safely isolated in localStorage to avoid
 * skewing production statistics.
 */

import { isLocalDev } from "../utils/envUtils";

export interface GeoData {
  country?: string;
  countryName?: string;
  region?: string;
  city?: string;
  timezone?: string;
  language?: string;
}

export interface ClientDeviceInfo {
  deviceType: "desktop" | "mobile" | "tablet";
  browser: string;
  os: string;
  screenResolution: string;
  language: string;
  timezone: string;
  referrer: string;
}

export interface AnalyticsSummary {
  totalVisitors: number;
  todayVisitors: number;
  countries: { code: string; name: string; count: number; percentage: number }[];
  topCities: { city: string; count: number }[];
  devices: { device: string; count: number; percentage: number }[];
  browsers: { browser: string; count: number }[];
  referrers: { source: string; count: number }[];
  topDestinations: { destination: string; count: number }[];
  events: Record<string, number>;
  lastUpdated: number;
  isLiveCloud: boolean;
}

const STORAGE_KEY_ANALYTICS_LOCAL = "reroute_local_analytics_v1";
const STORAGE_KEY_VISITOR_ID = "reroute_anonymous_visitor_id";
const STORAGE_KEY_OPT_OUT = "reroute_analytics_opt_out";

// Generate or retrieve persistent pseudonymous visitor ID
const getAnonymousVisitorId = (): string => {
  try {
    let id = localStorage.getItem(STORAGE_KEY_VISITOR_ID);
    if (!id) {
      id = "v_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
      localStorage.setItem(STORAGE_KEY_VISITOR_ID, id);
    }
    return id;
  } catch {
    return "v_ephemeral_" + Math.random().toString(36).substring(2, 9);
  }
};

// Detect client device, browser, and environment cues
export const getClientDeviceInfo = (): ClientDeviceInfo => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      deviceType: "desktop",
      browser: "unknown",
      os: "unknown",
      screenResolution: "unknown",
      language: "en",
      timezone: "UTC",
      referrer: "direct",
    };
  }

  const ua = navigator.userAgent;
  
  // Device category
  let deviceType: "desktop" | "mobile" | "tablet" = "desktop";
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    deviceType = "tablet";
  } else if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
    deviceType = "mobile";
  }

  // Browser detection
  let browser = "Other";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/") && !ua.includes("Chromium/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari";
  else if (ua.includes("OPR/") || ua.includes("Opera/")) browser = "Opera";

  // Operating System detection
  let os = "Other";
  if (ua.includes("Win")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("like Mac")) os = "iOS";

  // Screen resolution
  const screenResolution = `${window.screen?.width || 0}x${window.screen?.height || 0}`;

  // Timezone & Language
  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {}

  const language = navigator.language || "en";

  // Referrer source parsing
  let referrer = "direct";
  if (document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      const host = refUrl.hostname.toLowerCase();
      if (host.includes("google")) referrer = "Google";
      else if (host.includes("bing")) referrer = "Bing";
      else if (host.includes("reddit")) referrer = "Reddit";
      else if (host.includes("github")) referrer = "GitHub";
      else if (host.includes("twitter") || host.includes("x.com")) referrer = "Twitter / X";
      else if (host.includes("linkedin")) referrer = "LinkedIn";
      else if (host.includes("facebook")) referrer = "Facebook";
      else if (host === window.location.hostname) referrer = "internal";
      else referrer = host.replace(/^www\./, "");
    } catch {
      referrer = "external";
    }
  }

  return {
    deviceType,
    browser,
    os,
    screenResolution,
    language,
    timezone,
    referrer,
  };
};

// Common Country Code to Name and Flag map
export const getCountryDetails = (code: string): { name: string; flag: string } => {
  const c = (code || "XX").toUpperCase();
  const COUNTRY_NAMES: Record<string, string> = {
    US: "United States",
    JP: "Japan",
    TW: "Taiwan",
    KR: "South Korea",
    GB: "United Kingdom",
    CA: "Canada",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
    SG: "Singapore",
    HK: "Hong Kong",
    TH: "Thailand",
    VN: "Vietnam",
    MY: "Malaysia",
    PH: "Philippines",
    IN: "India",
    BR: "Brazil",
    NL: "Netherlands",
    IT: "Italy",
    ES: "Spain",
    SE: "Sweden",
    CH: "Switzerland",
    NZ: "New Zealand",
    LOCAL: "Local Development",
  };

  // Convert 2-letter ISO to emoji flag
  let flag = "🌐";
  if (c.length === 2 && c !== "XX") {
    try {
      const codePoints = c
        .split("")
        .map((char) => 127397 + char.charCodeAt(0));
      flag = String.fromCodePoint(...codePoints);
    } catch {
      flag = "🌐";
    }
  } else if (c === "LOCAL") {
    flag = "💻";
  }

  return {
    name: COUNTRY_NAMES[c] || c,
    flag,
  };
};

// Local storage management for dev mode or fallback
interface LocalAnalyticsStore {
  totalVisitors: number;
  todayVisitors: number;
  lastDate: string;
  countries: Record<string, number>;
  topCities: Record<string, number>;
  devices: Record<string, number>;
  browsers: Record<string, number>;
  referrers: Record<string, number>;
  topDestinations: Record<string, number>;
  events: Record<string, number>;
}

const getLocalAnalyticsStore = (): LocalAnalyticsStore => {
  const today = new Date().toISOString().split("T")[0];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ANALYTICS_LOCAL);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.lastDate !== today) {
        parsed.todayVisitors = 0;
        parsed.lastDate = today;
      }
      return parsed;
    }
  } catch {}

  return {
    totalVisitors: 1,
    todayVisitors: 1,
    lastDate: today,
    countries: { LOCAL: 1 },
    topCities: { Localhost: 1 },
    devices: { desktop: 1 },
    browsers: { Chrome: 1 },
    referrers: { direct: 1 },
    topDestinations: { Tokyo: 1 },
    events: {},
  };
};

const saveLocalAnalyticsStore = (store: LocalAnalyticsStore) => {
  try {
    localStorage.setItem(STORAGE_KEY_ANALYTICS_LOCAL, JSON.stringify(store));
  } catch {}
};

class AnalyticsService {
  private hasInitialized = false;
  private optOut = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.optOut = localStorage.getItem(STORAGE_KEY_OPT_OUT) === "true";
      } catch {}
    }
  }

  public isOptedOut(): boolean {
    return this.optOut;
  }

  public setOptOut(optOut: boolean) {
    this.optOut = optOut;
    try {
      localStorage.setItem(STORAGE_KEY_OPT_OUT, String(optOut));
    } catch {}
  }

  /**
   * Initialize and send initial session / pageview telemetry
   */
  public init() {
    if (this.hasInitialized || this.optOut || typeof window === "undefined") return;
    this.hasInitialized = true;

    const deviceInfo = getClientDeviceInfo();
    this.trackSessionStart(deviceInfo);
  }

  private trackSessionStart(deviceInfo: ClientDeviceInfo) {
    const visitorId = getAnonymousVisitorId();
    const payload = {
      type: "session_start",
      visitorId,
      device: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      timezone: deviceInfo.timezone,
      language: deviceInfo.language,
      referrer: deviceInfo.referrer,
      timestamp: Date.now(),
    };

    if (isLocalDev()) {
      // Local fallback recording
      const store = getLocalAnalyticsStore();
      store.totalVisitors = (store.totalVisitors || 0) + 1;
      store.todayVisitors = (store.todayVisitors || 0) + 1;
      store.devices[deviceInfo.deviceType] = (store.devices[deviceInfo.deviceType] || 0) + 1;
      store.browsers[deviceInfo.browser] = (store.browsers[deviceInfo.browser] || 0) + 1;
      store.referrers[deviceInfo.referrer] = (store.referrers[deviceInfo.referrer] || 0) + 1;
      saveLocalAnalyticsStore(store);
      return;
    }

    // Edge cloud dispatch
    this.sendBeacon("/api/analytics", payload);
  }

  /**
   * Track high-level product actions
   */
  public trackEvent(eventName: string, metadata?: Record<string, any>) {
    if (this.optOut) return;

    if (isLocalDev()) {
      const store = getLocalAnalyticsStore();
      store.events[eventName] = (store.events[eventName] || 0) + 1;
      if (metadata?.destination) {
        store.topDestinations[metadata.destination] = (store.topDestinations[metadata.destination] || 0) + 1;
      }
      saveLocalAnalyticsStore(store);
      return;
    }

    this.sendBeacon("/api/analytics", {
      type: "event",
      visitorId: getAnonymousVisitorId(),
      eventName,
      metadata,
      timestamp: Date.now(),
    });
  }

  /**
   * Helper to track planned trip destination cities
   */
  public trackDestination(cityName: string) {
    if (!cityName || cityName.trim().length < 2) return;
    const cleanCity = cityName.trim().split(",")[0].trim();
    this.trackEvent("destination_planned", { destination: cleanCity });
  }

  /**
   * Helper to track route optimizations (TSP solver runs)
   */
  public trackRouteOptimized(placeCount: number, dayCount: number) {
    this.trackEvent("trip_optimized", { placeCount, dayCount });
  }

  /**
   * Helper to track export formats (Excel, GPX, GeoJSON, TXT)
   */
  public trackExport(format: "excel" | "gpx" | "geojson" | "maps_url" | "txt") {
    this.trackEvent("trip_exported", { format });
  }

  /**
   * Non-blocking beacon or fetch
   */
  private sendBeacon(url: string, data: any) {
    try {
      const body = JSON.stringify(data);
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        const success = navigator.sendBeacon(url, blob);
        if (success) return;
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  /**
   * Fetch aggregated analytics summary for the dashboard
   */
  public async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    if (isLocalDev()) {
      const store = getLocalAnalyticsStore();
      const totalCountries = Object.values(store.countries).reduce((a, b) => a + b, 0) || 1;
      const totalDevices = Object.values(store.devices).reduce((a, b) => a + b, 0) || 1;

      return {
        totalVisitors: store.totalVisitors,
        todayVisitors: store.todayVisitors,
        countries: Object.entries(store.countries).map(([code, count]) => {
          const info = getCountryDetails(code);
          return {
            code,
            name: info.name,
            count,
            percentage: Math.round((count / totalCountries) * 100),
          };
        }),
        topCities: Object.entries(store.topCities)
          .map(([city, count]) => ({ city, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        devices: Object.entries(store.devices).map(([device, count]) => ({
          device,
          count,
          percentage: Math.round((count / totalDevices) * 100),
        })),
        browsers: Object.entries(store.browsers)
          .map(([browser, count]) => ({ browser, count }))
          .sort((a, b) => b.count - a.count),
        referrers: Object.entries(store.referrers)
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count),
        topDestinations: Object.entries(store.topDestinations)
          .map(([destination, count]) => ({ destination, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        events: store.events,
        lastUpdated: Date.now(),
        isLiveCloud: false,
      };
    }

    try {
      const res = await fetch("/api/analytics", {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          return { ...data.summary, isLiveCloud: true };
        }
      }
    } catch {}

    // Fallback if cloud request fails
    return this.getAnalyticsSummaryFallback();
  }

  private getAnalyticsSummaryFallback(): AnalyticsSummary {
    const store = getLocalAnalyticsStore();
    return {
      totalVisitors: store.totalVisitors,
      todayVisitors: store.todayVisitors,
      countries: [{ code: "US", name: "United States", count: 1, percentage: 100 }],
      topCities: [{ city: "Tokyo", count: 1 }],
      devices: [{ device: "desktop", count: 1, percentage: 100 }],
      browsers: [{ browser: "Chrome", count: 1 }],
      referrers: [{ source: "direct", count: 1 }],
      topDestinations: [{ destination: "Tokyo", count: 1 }],
      events: {},
      lastUpdated: Date.now(),
      isLiveCloud: false,
    };
  }
}

export const analyticsService = new AnalyticsService();

// Automatically initialize on browser client
if (typeof window !== "undefined") {
  setTimeout(() => analyticsService.init(), 1000);
}
