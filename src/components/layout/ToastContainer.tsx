import React, { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";
import {
  onToast,
  offToast,
  ToastMessage,
  ToastType,
} from "../../services/toastService";
import { motion, AnimatePresence } from "framer-motion";

const TOAST_STYLES: Record<
  ToastType,
  {
    bg: string;
    border: string;
    text: string;
    titleColor: string;
    icon: React.ReactNode;
    progressBar: string;
  }
> = {
  success: {
    bg: "bg-emerald-50 dark:bg-emerald-950/90",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-800 dark:text-emerald-200",
    titleColor: "text-emerald-900 dark:text-emerald-100",
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
    progressBar: "bg-emerald-500/60 dark:bg-emerald-400/60",
  },
  error: {
    bg: "bg-rose-50 dark:bg-rose-950/95",
    border: "border-rose-300 dark:border-rose-700 shadow-rose-500/10",
    text: "text-rose-900 dark:text-rose-100",
    titleColor: "text-rose-950 dark:text-rose-50 font-black",
    icon: <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />,
    progressBar: "bg-rose-500/60 dark:bg-rose-400/60",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-950/95",
    border: "border-amber-300 dark:border-amber-700 shadow-amber-500/10",
    text: "text-amber-900 dark:text-amber-100",
    titleColor: "text-amber-950 dark:text-amber-50 font-black",
    icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />,
    progressBar: "bg-amber-500/60 dark:bg-amber-400/60",
  },
  info: {
    bg: "bg-sky-50 dark:bg-sky-950/90",
    border: "border-sky-200 dark:border-sky-800",
    text: "text-sky-800 dark:text-sky-200",
    titleColor: "text-sky-900 dark:text-sky-100",
    icon: <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />,
    progressBar: "bg-sky-500/60 dark:bg-sky-400/60",
  },
};

const ToastItem: React.FC<{
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const isPersistent = Boolean(toast.persistent || toast.duration === 0);
  const totalDuration = !isPersistent && toast.duration && toast.duration > 0 ? toast.duration : 0;

  const [isHovered, setIsHovered] = useState(false);
  const [remainingMs, setRemainingMs] = useState(totalDuration);
  const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;

  useEffect(() => {
    if (isPersistent || totalDuration <= 0) return;

    if (isHovered) return; // Pause timer on hover

    const startTime = Date.now();
    const initialRemaining = remainingMs;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentRemaining = Math.max(0, initialRemaining - elapsed);
      setRemainingMs(currentRemaining);

      if (currentRemaining <= 0) {
        clearInterval(interval);
        onDismiss(toast.id);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isHovered, isPersistent, totalDuration, onDismiss, toast.id, remainingMs]);

  const progressPercent = totalDuration > 0 ? (remainingMs / totalDuration) * 100 : 100;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`pointer-events-auto flex flex-col rounded-xl border shadow-xl backdrop-blur-md transition-all overflow-hidden ${style.bg} ${style.border}`}
      role="status"
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="mt-0.5">{style.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            {toast.title && (
              <h4 className={`text-xs font-bold uppercase tracking-wider ${style.titleColor}`}>
                {toast.title}
              </h4>
            )}
            {isPersistent && (
              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-surface-600 dark:text-surface-300">
                Notice
              </span>
            )}
          </div>
          <p className={`text-xs font-medium leading-relaxed ${style.text}`}>
            {toast.message}
          </p>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.onClick();
                onDismiss(toast.id);
              }}
              className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold underline underline-offset-2 hover:no-underline transition-all ${style.titleColor}`}
            >
              {toast.action.label} →
            </button>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/15 transition-all text-surface-500 hover:text-surface-900 dark:hover:text-white"
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress countdown bar for auto-dismissing toasts (pauses on hover) */}
      {!isPersistent && totalDuration > 0 && (
        <div className="w-full h-1 bg-black/5 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full transition-all duration-75 ${style.progressBar}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </motion.div>
  );
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const handleToast = useCallback((newToast: ToastMessage) => {
    setToasts((prev) => [...prev, newToast]);
  }, []);

  useEffect(() => {
    onToast(handleToast);
    return () => offToast(handleToast);
  }, [handleToast]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div
      aria-live="assertive"
      className="fixed bottom-5 right-5 z-[250] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};
