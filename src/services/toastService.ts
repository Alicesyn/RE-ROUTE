import { onApiError } from "./apiErrorBus";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number; // in ms. 0 = persistent (does not disappear until dismissed)
  persistent?: boolean;
}

type ToastHandler = (toast: ToastMessage) => void;
const toastHandlers = new Set<ToastHandler>();

export const showToast = (
  toastData: Omit<ToastMessage, "id"> & { id?: string },
) => {
  const isError = toastData.type === "error";
  const isExplicitPersistent = toastData.persistent || toastData.duration === 0;
  // Errors default to persistent (0). Others default to longer comfortable reading times.
  const defaultDuration = isError ? 0 : toastData.type === "warning" ? 12000 : 9000;
  const duration = toastData.duration !== undefined ? toastData.duration : defaultDuration;
  const persistent = isExplicitPersistent || duration === 0;

  const toast: ToastMessage = {
    ...toastData,
    id: toastData.id || `toast_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    duration,
    persistent,
  };
  toastHandlers.forEach((h) => h(toast));
  return toast.id;
};

export const onToast = (handler: ToastHandler) => {
  toastHandlers.add(handler);
};

export const offToast = (handler: ToastHandler) => {
  toastHandlers.delete(handler);
};

export const toast = {
  success: (message: string, title?: string, duration: number = 9000) =>
    showToast({ type: "success", message, title, duration }),
  error: (message: string, title?: string, duration: number = 0) =>
    showToast({ type: "error", message, title, duration, persistent: true }),
  warning: (message: string, title?: string, duration?: number) =>
    showToast({
      type: "warning",
      message,
      title,
      duration: duration ?? 12000,
      persistent: duration === 0,
    }),
  info: (message: string, title?: string, duration: number = 9000) =>
    showToast({ type: "info", message, title, duration }),
  persistent: (type: ToastType, message: string, title?: string) =>
    showToast({ type, message, title, duration: 0, persistent: true }),
};

// Automatically bridge API errors from apiErrorBus into toast system
onApiError((err) => {
  const sourceLabel =
    err.source === "google-maps"
      ? "Google Maps API"
      : err.source === "gemini"
        ? "Gemini AI API"
        : err.source;

  const isHighDemand =
    err.kind === "high_demand" ||
    err.message.includes("high demand") ||
    err.message.includes("503");

  if (err.isQuota || err.kind === "quota") {
    // Critical quota error: persistent (0) so user does not miss it
    toast.error(
      "Daily API quota exhausted. Some live features will be limited until reset.",
      `Quota Exceeded · ${sourceLabel}`,
      0,
    );
  } else if (isHighDemand) {
    // High demand error: persistent (0) so user knows why suggestions or features are waiting
    showToast({
      type: "warning",
      message: "Gemini AI is currently experiencing high demand (503). Retrying with backup models...",
      title: `Server High Demand · ${sourceLabel}`,
      duration: 0,
      persistent: true,
    });
  } else {
    showToast({
      type: "warning",
      message: "Too many requests. Backing off and retrying automatically...",
      title: `Rate Limited · ${sourceLabel}`,
      duration: 0,
      persistent: true,
    });
  }
});
