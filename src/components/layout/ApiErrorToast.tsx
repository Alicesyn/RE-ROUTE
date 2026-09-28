import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, X, WifiOff } from "lucide-react";
import { onApiError, offApiError, ApiError } from "../../services/apiErrorBus";

const SOURCE_LABELS: Record<string, string> = {
  "google-maps": "Google Maps API",
  "gemini": "Gemini AI API",
};

export const ApiErrorToast: React.FC = () => {
  const [errors, setErrors] = useState<(ApiError & { id: number })[]>([]);

  const handleError = useCallback((err: ApiError) => {
    const id = Date.now() + Math.random();
    setErrors((prev) => [...prev, { ...err, id }]);
  }, []);

  useEffect(() => {
    onApiError(handleError);
    return () => offApiError(handleError);
  }, [handleError]);

  const dismiss = (id: number) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  };

  if (errors.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {errors.map((err) => {
        const isHighDemand =
          err.kind === "high_demand" ||
          err.message.includes("high demand") ||
          err.message.includes("503");

        return (
          <div
            key={err.id}
            className="pointer-events-auto flex items-start gap-3 bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-xl shadow-lg px-4 py-3 animate-in slide-in-from-right-4 fade-in duration-300"
            role="alert"
          >
            <div className="shrink-0 mt-0.5">
              {err.isQuota ? (
                <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-0.5">
                {err.isQuota
                  ? "API Quota Exceeded"
                  : isHighDemand
                    ? "Server High Demand (503)"
                    : "API Rate Limited"}{" "}
                · {SOURCE_LABELS[err.source] ?? err.source}
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug line-clamp-3">
                {err.isQuota
                  ? "You've used up today's API quota. Some features will be unavailable until it resets (usually midnight PT)."
                  : isHighDemand
                    ? "Google's Gemini servers are experiencing high demand right now. Please try again in a few moments."
                    : "Too many requests right now. The app will retry automatically — please wait a moment."}
              </p>
            </div>
          <button
            onClick={() => dismiss(err.id)}
            className="shrink-0 p-1 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    })}
    </div>
  );
};
