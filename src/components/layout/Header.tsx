import React, { useState } from "react";
import { useRouteStore } from "../../store/useRouteStore";
import {
  Map,
  Download,
  Save,
  Upload,
  FolderOpen,
  FileText,
  List,
  Settings,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  Loader2,
  Activity,
  Key,
  HelpCircle,
  RotateCcw,
  Cloud,
  LogOut,
  Zap,
  Ticket,
} from "lucide-react";

const ImportModal = React.lazy(() =>
  import("../trip-builder/ImportModal").then((m) => ({ default: m.ImportModal }))
);
const ReservationsModal = React.lazy(() =>
  import("../schedule/ReservationsModal").then((m) => ({ default: m.ReservationsModal }))
);
const CategorySettingsModal = React.lazy(() =>
  import("./CategorySettingsModal").then((m) => ({ default: m.CategorySettingsModal }))
);
const LoadTripModal = React.lazy(() =>
  import("./LoadTripModal").then((m) => ({ default: m.LoadTripModal }))
);
const ApiBudgetModal = React.lazy(() =>
  import("./ApiBudgetModal").then((m) => ({ default: m.ApiBudgetModal }))
);
const AboutModal = React.lazy(() =>
  import("./AboutModal").then((m) => ({ default: m.AboutModal }))
);
const ResetTripModal = React.lazy(() =>
  import("./ResetTripModal").then((m) => ({ default: m.ResetTripModal }))
);
import { AuthModal } from "../auth/AuthModal";
const SaveTripModal = React.lazy(() =>
  import("./SaveTripModal").then((m) => ({ default: m.SaveTripModal }))
);
import { isReservationRelevant } from "../../utils/reservationUtils";
import { analyticsService } from "../../services/analyticsService";
import { toast } from "../../services/toastService";
import { apiUsageService, ApiUsageStats, ApiBudgetLimits } from "../../services/apiUsageService";
import { authService } from "../../services/authService";

const UserAvatar: React.FC<{
  user: { avatarUrl?: string; displayName?: string; email?: string };
  size?: "sm" | "md";
}> = ({ user, size = "sm" }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClass = size === "sm" ? "w-5 h-5 sm:w-6 sm:h-6" : "w-10 h-10";
  const textClass = size === "sm" ? "text-[10px] sm:text-[11px]" : "text-sm";

  if (user.avatarUrl && !imgFailed) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.displayName || "User avatar"}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setImgFailed(true)}
        className={`${sizeClass} rounded-full object-cover border border-surface-200 dark:border-surface-600 shrink-0`}
      />
    );
  }

  const initial = (user.displayName || user.email || "U")[0].toUpperCase();
  return (
    <div
      className={`${sizeClass} rounded-full bg-primary-600 text-white flex items-center justify-center font-bold ${textClass} shrink-0`}
    >
      {initial}
    </div>
  );
};

export const Header: React.FC = React.memo(() => {
  const appMode = useRouteStore((s) => s.appMode);
  const setAppMode = useRouteStore((s) => s.setAppMode);
  const title = useRouteStore((s) => s.title);
  const setTitle = useRouteStore((s) => s.setTitle);
  const exportTripAsJson = useRouteStore((s) => s.exportTripAsJson);
  const exportTripAsExcel = useRouteStore((s) => s.exportTripAsExcel);

  const user = useRouteStore((s) => s.user);
  const setUser = useRouteStore((s) => s.setUser);
  const syncStatus = useRouteStore((s) => s.syncStatus);
  const isAutoSyncEnabled = useRouteStore((s) => s.isAutoSyncEnabled);
  const setAutoSyncEnabled = useRouteStore((s) => s.setAutoSyncEnabled);
  const cloudTrips = useRouteStore((s) => s.cloudTrips);
  const quickSave = useRouteStore((s) => s.quickSave);
  const loadQuickSave = useRouteStore((s) => s.loadQuickSave);
  const places = useRouteStore((s) => s.places);

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = React.useRef<HTMLDivElement>(null);

  const [isReservationsOpen, setIsReservationsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isLoadOpen, setIsLoadOpen] = useState(false);
  const [loadModalTab, setLoadModalTab] = useState<"all" | "cloud" | "local">("all");
  const [isCategorySettingsOpen, setIsCategorySettingsOpen] = useState(false);
  const [isApiBudgetOpen, setIsApiBudgetOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveModalMode, setSaveModalMode] = useState<"local" | "cloud">("local");
  const exportMenuRef = React.useRef<HTMLDivElement>(null);

  const handleOpenSaveModal = (mode: "local" | "cloud" = "local") => {
    setSaveModalMode(mode);
    setIsSaveModalOpen(true);
  };

  const reservationPlaces = React.useMemo(() => {
    return places.filter((p) => !p.isDisabled && isReservationRelevant(p));
  }, [places]);

  const pendingReservationsCount = React.useMemo(() => {
    return reservationPlaces.filter((p) => !p.reservation?.isBooked).length;
  }, [reservationPlaces]);

  // Close export dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    if (isExportMenuOpen || isAccountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isExportMenuOpen, isAccountMenuOpen]);

  // Restore auth session & subscribe to OAuth redirects
  React.useEffect(() => {
    authService.getSessionUser().then((u) => {
      if (u) setUser(u);
    });
    const unsub = authService.onAuthStateChange((u) => {
      const current = useRouteStore.getState().user;
      if (u?.id !== current?.id) {
        setUser(u);
      }
    });
    return unsub;
  }, [setUser]);

  // Sync #about and #about-limitations URL hash
  React.useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === "#about" || window.location.hash.startsWith("#about")) {
        setIsAboutOpen(true);
      }
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  const handleCloseAbout = () => {
    setIsAboutOpen(false);
    if (window.location.hash.startsWith("#about")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  const [apiStats, setApiStats] = useState<ApiUsageStats>(apiUsageService.getStats());
  const [apiLimits, setApiLimits] = useState<ApiBudgetLimits>(apiUsageService.getLimits());

  React.useEffect(() => {
    return apiUsageService.subscribe((stats) => {
      setApiStats(stats);
      setApiLimits(apiUsageService.getLimits());
    });
  }, []);

  const totalMaps = apiStats.mapsSearchCalls + apiStats.mapsPhotoCalls + apiStats.mapsRouteCalls;
  const mapsPercent = Math.min(100, Math.round((totalMaps / apiLimits.dailyMapsLimit) * 100));
  const geminiPercent = Math.min(100, Math.round((apiStats.geminiCalls / apiLimits.dailyGeminiLimit) * 100));
  const maxPercent = Math.max(mapsPercent, geminiPercent);
  const hasCustomKey = apiUsageService.isUsingCustomMapsKey() || apiUsageService.isUsingCustomGeminiKey();

  const [isExporting, setIsExporting] = useState(false);
  const [exportingType, setExportingType] = useState<"json" | "excel" | "txt" | "names" | null>(null);

  const handleExportTripExcel = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportingType("excel");
    try {
      await new Promise((r) => setTimeout(r, 150));
      await exportTripAsExcel();
      analyticsService.trackExport("excel");
      toast.success(`Exported "${title || "Trip"}" to Excel spreadsheet.`, "Export Complete");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export Excel spreadsheet", "Export Error");
    } finally {
      setIsExporting(false);
      setExportingType(null);
    }
  };

  const handleExportTripJson = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportingType("json");
    try {
      await new Promise((r) => setTimeout(r, 250));
      exportTripAsJson();
      analyticsService.trackExport("geojson");
      toast.success(`Exported "${title || "Trip"}" to JSON file.`, "Export Complete");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export trip file", "Export Error");
    } finally {
      setIsExporting(false);
      setExportingType(null);
    }
  };

  const handleExportTxt = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportingType("txt");
    try {
      await new Promise((r) => setTimeout(r, 250));
      const placesList = useRouteStore.getState().places;
      const textContent = placesList
        .map((p, i) => `${i + 1}. ${p.name}\n   ${p.address}`)
        .join("\n\n");
      const blob = new Blob([`Places to Visit - ${title}\n\n${textContent}`], {
        type: "text/plain",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Wanderlog_Places_${title.replace(/\s+/g, "_")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      analyticsService.trackExport("txt");
      toast.success("Places list exported to text file.", "Export Complete");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export text file", "Export Error");
    } finally {
      setIsExporting(false);
      setExportingType(null);
    }
  };

  const handleExportNamesTxt = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportingType("names");
    try {
      await new Promise((r) => setTimeout(r, 250));
      const placesList = useRouteStore.getState().places;
      const textContent = placesList.map((p) => p.name).join("\n");
      const blob = new Blob([textContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `RE-ROUTE_Import_${title.replace(/\s+/g, "_")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      analyticsService.trackExport("txt");
      toast.success("Place names exported to text file.", "Export Complete");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export names file", "Export Error");
    } finally {
      setIsExporting(false);
      setExportingType(null);
    }
  };



  return (
    <header className="bg-white dark:bg-surface-800 border-b border-gray-200 dark:border-surface-700 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between sticky top-0 z-50 transition-colors safe-pt flex-wrap gap-2 sm:gap-4">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="bg-primary-500 p-1.5 sm:p-2 rounded-lg shrink-0">
          <Map className="text-white w-5 h-5 sm:w-6 h-6" />
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-lg sm:text-2xl font-bold text-surface-900 dark:text-white tracking-tight bg-transparent border-none outline-none focus:ring-0 focus:border-b focus:border-primary-500 transition-all p-0 w-36 sm:w-64 truncate"
          placeholder="Trip Title..."
        />
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
        <div className="relative">
          <select
            value={appMode}
            onChange={(e) =>
              setAppMode(e.target.value as "real" | "mock" | "dropdown-mock")
            }
            className={`appearance-none flex items-center gap-1.5 pl-3 pr-8 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all border cursor-pointer outline-none focus:ring-2 focus:ring-primary-500 shadow-2xs ${
              appMode === "real"
                ? "bg-emerald-50 hover:bg-emerald-100/80 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-600/70"
                : "bg-amber-100 hover:bg-amber-200/80 dark:bg-amber-950/70 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-600/70"
            }`}
          >
            <option value="real" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white py-1">
              🌐 Real Mode
            </option>
            <option value="mock" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white py-1">
              ⚡ Mock Mode
            </option>
            <option value="dropdown-mock" className="bg-white dark:bg-surface-800 text-surface-900 dark:text-white py-1">
              📋 Dropdown Mock
            </option>
          </select>
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <ChevronDown
              className={`w-3.5 h-3.5 transition-colors ${
                appMode === "real"
                  ? "text-emerald-600 dark:text-emerald-300"
                  : "text-amber-700 dark:text-amber-300"
              }`}
            />
          </div>
        </div>

        {/* API Budget & Usage Button */}
        <button
          onClick={() => setIsApiBudgetOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-xs font-bold transition-all border outline-none focus:ring-2 focus:ring-primary-500 shadow-2xs ${
            hasCustomKey
              ? "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800/60 hover:bg-purple-100"
              : maxPercent >= 90
                ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800/60 hover:bg-red-100 animate-pulse"
                : maxPercent >= 70
                  ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800/60 hover:bg-amber-100"
                  : "bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-700"
          }`}
          title="Open Analytics, Visitor Geolocation & API Monitor / BYOK"
        >
          {hasCustomKey ? (
            <>
              <Key className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>BYOK Key</span>
            </>
          ) : (
            <>
              <span
                className={`w-2 h-2 rounded-full ${
                  maxPercent >= 90
                    ? "bg-red-500"
                    : maxPercent >= 70
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
              />
              <Activity className="w-3.5 h-3.5 text-surface-400 dark:text-surface-500" />
              <span className="hidden sm:inline">Analytics & API</span>
              <span>({maxPercent}%)</span>
            </>
          )}
        </button>

        {/* Cloud Account & Sync Dropdown */}
        <div className="relative" ref={accountMenuRef}>
          {user ? (
            <button
              onClick={() => setIsAccountMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 sm:py-1.5 rounded-full text-xs font-semibold border outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-700 transition-all shadow-2xs cursor-pointer"
              title="Manage Account & Multi-Device Cloud Sync"
            >
              <UserAvatar user={user} size="sm" />
              <span className="hidden sm:inline max-w-[90px] truncate text-xs font-bold text-surface-800 dark:text-surface-100">
                {user.displayName?.split(" ")[0] || "Account"}
              </span>
              <div className="flex items-center">
                {syncStatus === "syncing" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />
                ) : (
                  <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                )}
              </div>
            </button>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-xs font-bold transition-all border outline-none focus:ring-2 focus:ring-primary-500 bg-primary-50 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800/80 hover:bg-primary-100 dark:hover:bg-primary-900/60 shadow-2xs cursor-pointer"
              title="Sign in with Google to sync your trip across devices"
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign In</span>
            </button>
          )}

          {/* User Dropdown Menu */}
          {user && isAccountMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-surface-800 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-700 py-3 z-50 animate-in fade-in zoom-in-95 duration-100">
              {/* Profile Header */}
              <div className="px-4 pb-3 border-b border-surface-100 dark:border-surface-700/80 flex items-center gap-3">
                <UserAvatar user={user} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-surface-900 dark:text-white truncate">
                    {user.displayName}
                  </div>
                  <div className="text-xs text-surface-500 dark:text-surface-400 truncate">
                    {user.email}
                  </div>
                </div>
              </div>

              {/* Cloud Sync Status & Manual Save */}
              <div className="p-3 bg-surface-50/70 dark:bg-surface-900/40 m-2 rounded-xl border border-surface-200/60 dark:border-surface-700/60 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-surface-600 dark:text-surface-300 flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5 text-primary-500" />
                    Cloud Sync
                  </span>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                    syncStatus === "syncing"
                      ? "bg-primary-100 dark:bg-primary-950/60 text-primary-600"
                      : syncStatus === "error"
                      ? "bg-red-100 dark:bg-red-950/60 text-red-600"
                      : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600"
                  }`}>
                    {syncStatus === "syncing" ? "Syncing..." : syncStatus === "error" ? "Error" : "Synced"}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    handleOpenSaveModal("cloud");
                  }}
                  disabled={syncStatus === "syncing"}
                  className="w-full py-2 px-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {syncStatus === "syncing" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5" />
                  )}
                  <span>Save to Cloud</span>
                </button>

                {/* Auto-sync Toggle (Off by default, user can toggle on demand) */}
                <div className="flex items-center justify-between pt-1 border-t border-surface-200/50 dark:border-surface-700/50">
                  <div>
                    <div className="text-xs font-semibold text-surface-800 dark:text-surface-200">
                      Auto-sync changes
                    </div>
                    <div className="text-[10px] text-surface-400 dark:text-surface-500">
                      Sync edits in background
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAutoSyncEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAutoSyncEnabled(checked);
                        if (checked) {
                          toast.success("Auto-sync enabled. Edits will sync to cloud.", "Auto-Sync On");
                        } else {
                          toast.info("Auto-sync disabled. Use 'Save to Cloud' button.", "Manual Save");
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-surface-300 peer-focus:outline-none rounded-full peer dark:bg-surface-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>

              {/* Quick Save Status in Account Menu */}
              {quickSave && (
                <div className="p-2.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl mx-2 mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Zap className="w-3.5 h-3.5 fill-current" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200 truncate">
                        Google Quick Save
                      </div>
                      <div
                        className="text-[10px] text-surface-500 dark:text-surface-400 truncate"
                        title={`Exact auto-save time: ${new Date(quickSave.updatedAt || quickSave.savedAt).toLocaleString()}`}
                      >
                        {quickSave.places.length} places • {new Date(quickSave.updatedAt || quickSave.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} • {new Date(quickSave.updatedAt || quickSave.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      loadQuickSave();
                    }}
                    className="px-2 py-1 text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors cursor-pointer shrink-0 shadow-2xs"
                    title="Restore your Google Quick Save"
                  >
                    Restore
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="px-2 pt-1 space-y-1">
                <button
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    setLoadModalTab("cloud");
                    setIsLoadOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="w-3.5 h-3.5 text-surface-400" />
                    My Cloud Trips
                  </span>
                  <span className="text-[10px] bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 font-bold px-1.5 py-0.5 rounded">
                    {cloudTrips.length}
                  </span>
                </button>

                <button
                  onClick={async () => {
                    setIsAccountMenuOpen(false);
                    await authService.signOut();
                    setUser(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsCategorySettingsOpen(true)}
          className="flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors border outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-700"
          title="Trip Settings"
        >
          <Settings className="w-4 h-4 text-surface-400 dark:text-surface-500" />
          <span className="hidden sm:inline">Settings</span>
        </button>

        <button
          onClick={() => {
            setIsAboutOpen(true);
            window.location.hash = "about";
          }}
          className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors border outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-700"
          title="About RE-ROUTE, Algorithms, Documentation & Open Source"
        >
          <HelpCircle className="w-4 h-4 text-surface-400 dark:text-surface-500" />
          <span className="hidden sm:inline">About</span>
        </button>

        <button
          onClick={() => handleOpenSaveModal("local")}
          className="flex items-center gap-1.5 font-medium text-xs sm:text-sm transition-all px-2 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer"
          title="Save trip to device or cloud"
        >
          <Save className="w-4 h-4" />
          <span className="hidden sm:inline">Save</span>
        </button>

        <button
          onClick={() => {
            setLoadModalTab("all");
            setIsLoadOpen(true);
          }}
          className="flex items-center gap-1.5 text-surface-600 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 font-medium text-xs sm:text-sm transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700"
          title="Load saved trips"
        >
          <FolderOpen className="w-4 h-4" /> <span className="hidden sm:inline">Load</span>
        </button>

        {/* Reservations & Booking Hub Button */}
        <button
          onClick={() => setIsReservationsOpen(true)}
          className={`flex items-center gap-1.5 font-semibold text-xs sm:text-sm transition-all px-2.5 py-1.5 rounded-lg border ${
            pendingReservationsCount > 0
              ? "bg-indigo-50 hover:bg-indigo-100/90 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800 shadow-2xs"
              : "text-surface-600 dark:text-surface-300 hover:text-indigo-600 dark:hover:text-indigo-400 border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700"
          }`}
          title="Open Reservations & Booking Hub"
        >
          <Ticket className={`w-4 h-4 ${pendingReservationsCount > 0 ? "text-indigo-600 dark:text-indigo-400" : ""}`} />
          <span className="hidden sm:inline">Reservations</span>
          {reservationPlaces.length > 0 && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                pendingReservationsCount > 0
                  ? "bg-amber-500 text-white"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              }`}
            >
              {pendingReservationsCount > 0 ? pendingReservationsCount : "✓"}
            </span>
          )}
        </button>

        <button
          onClick={() => setIsResetOpen(true)}
          className="flex items-center gap-1.5 text-surface-600 dark:text-surface-300 hover:text-red-600 dark:hover:text-red-400 font-medium text-xs sm:text-sm transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
          title="Reset current trip itinerary"
        >
          <RotateCcw className="w-4 h-4 text-surface-400 dark:text-surface-500 hover:text-red-500" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        <button
          onClick={() => setIsImportOpen(true)}
          className="flex items-center gap-1.5 text-surface-600 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 font-medium text-xs sm:text-sm transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700"
          title="Import trip from Wanderlog, Google Maps, or CSV"
        >
          <Upload className="w-4 h-4" /> <span className="hidden sm:inline">Import</span>
        </button>

        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setIsExportMenuOpen((prev) => !prev)}
            disabled={isExporting}
            className="btn-secondary flex items-center gap-1.5 py-1.5 px-3 text-xs sm:text-sm disabled:opacity-75 transition-all"
            aria-haspopup="true"
            aria-expanded={isExportMenuOpen}
            title="Choose export format"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                <span className="hidden sm:inline">Exporting...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className={`w-3.5 h-3.5 opacity-60 ml-0.5 transition-transform duration-200 ${isExportMenuOpen ? "rotate-180" : ""}`} />
              </>
            )}
          </button>

          {/* Dropdown for export formats on click */}
          {isExportMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleExportTripExcel();
                }}
                disabled={isExporting}
                className="w-full text-left px-4 py-3 text-sm text-surface-800 dark:text-surface-100 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-start gap-3 transition-colors border-b border-surface-100 dark:border-surface-700 disabled:opacity-50"
              >
                {exportingType === "excel" ? (
                  <Loader2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                )}
                <div>
                  <div className="font-semibold flex items-center gap-1.5">
                    Export to Excel (.xlsx)
                    <span className="text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-700/60">
                      Aesthetic
                    </span>
                  </div>
                  <div className="text-[11px] text-surface-500 dark:text-surface-400">
                    Multi-sheet itinerary, overview & places catalog
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleExportTripJson();
                }}
                disabled={isExporting}
                className="w-full text-left px-4 py-3 text-sm text-surface-800 dark:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-700 hover:text-primary-600 dark:hover:text-primary-400 flex items-start gap-3 transition-colors border-b border-surface-100 dark:border-surface-700 disabled:opacity-50"
              >
                {exportingType === "json" ? (
                  <Loader2 className="w-4 h-4 shrink-0 mt-0.5 text-primary-500 animate-spin" />
                ) : (
                  <FileJson className="w-4 h-4 shrink-0 mt-0.5 text-primary-500" />
                )}
                <div>
                  <div className="font-semibold flex items-center gap-1.5">
                    Export Entire Trip (.json)
                    <span className="text-[9px] font-bold bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded border border-primary-200 dark:border-primary-700/60">
                      Full
                    </span>
                  </div>
                  <div className="text-[11px] text-surface-500 dark:text-surface-400">
                    PTVs, Stay, Schedule, Flights & Settings
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsExportMenuOpen(false);
                  window.print();
                }}
                disabled={isExporting}
                className="w-full text-left px-4 py-2.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 hover:text-surface-900 dark:hover:text-white flex items-center gap-3 transition-colors border-b border-surface-100 dark:border-surface-700 font-medium disabled:opacity-50"
              >
                <Download className="w-4 h-4 shrink-0 text-surface-400" />
                Export PDF / Print
              </button>

              <button
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleExportTxt();
                }}
                disabled={isExporting}
                className="w-full text-left px-4 py-2.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 hover:text-surface-900 dark:hover:text-white flex items-center gap-3 transition-colors border-b border-surface-100 dark:border-surface-700 font-medium disabled:opacity-50"
              >
                {exportingType === "txt" ? (
                  <Loader2 className="w-4 h-4 shrink-0 text-primary-500 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 shrink-0 text-surface-400" />
                )}
                Export Text (Full Details)
              </button>

              <button
                onClick={() => {
                  setIsExportMenuOpen(false);
                  handleExportNamesTxt();
                }}
                disabled={isExporting}
                className="w-full text-left px-4 py-2.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 hover:text-surface-900 dark:hover:text-white flex items-center gap-3 transition-colors font-medium disabled:opacity-50"
              >
                {exportingType === "names" ? (
                  <Loader2 className="w-4 h-4 shrink-0 text-primary-500 animate-spin" />
                ) : (
                  <List className="w-4 h-4 shrink-0 text-surface-400" />
                )}
                Export Place Names List
              </button>
            </div>
          )}
        </div>
      </div>

      {isImportOpen && (
        <React.Suspense fallback={null}>
          <ImportModal
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
          />
        </React.Suspense>
      )}
      {isReservationsOpen && (
        <React.Suspense fallback={null}>
          <ReservationsModal
            isOpen={isReservationsOpen}
            onClose={() => setIsReservationsOpen(false)}
          />
        </React.Suspense>
      )}
      {isLoadOpen && (
        <React.Suspense fallback={null}>
          <LoadTripModal
            isOpen={isLoadOpen}
            onClose={() => setIsLoadOpen(false)}
            defaultTab={loadModalTab}
          />
        </React.Suspense>
      )}
      {isCategorySettingsOpen && (
        <React.Suspense fallback={null}>
          <CategorySettingsModal
            isOpen={isCategorySettingsOpen}
            onClose={() => setIsCategorySettingsOpen(false)}
          />
        </React.Suspense>
      )}
      {isApiBudgetOpen && (
        <React.Suspense fallback={null}>
          <ApiBudgetModal
            isOpen={isApiBudgetOpen}
            onClose={() => setIsApiBudgetOpen(false)}
          />
        </React.Suspense>
      )}
      {isAboutOpen && (
        <React.Suspense fallback={null}>
          <AboutModal
            isOpen={isAboutOpen}
            onClose={handleCloseAbout}
          />
        </React.Suspense>
      )}
      {isResetOpen && (
        <React.Suspense fallback={null}>
          <ResetTripModal
            isOpen={isResetOpen}
            onClose={() => setIsResetOpen(false)}
          />
        </React.Suspense>
      )}
      {isAuthOpen && (
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
        />
      )}
      {isSaveModalOpen && (
        <React.Suspense fallback={null}>
          <SaveTripModal
            isOpen={isSaveModalOpen}
            onClose={() => setIsSaveModalOpen(false)}
            defaultMode={saveModalMode}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        </React.Suspense>
      )}
    </header>
  );
});


