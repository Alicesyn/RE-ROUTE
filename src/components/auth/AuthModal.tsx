import React, { useState } from "react";
import { X, Cloud, Smartphone, Laptop, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authService } from "../../services/authService";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isConfigured = authService.isConfigured();

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await authService.signInWithGoogle();
      if (!res.success && res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to initiate sign in.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-surface-950/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-surface-200 dark:border-surface-700 transition-colors"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-900/30">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-surface-900 dark:text-white">
                  Cloud Account & Sync
                </h3>
                <p className="text-[11px] text-surface-500 dark:text-surface-400">
                  Access and edit your itineraries on any device
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Visual device sync graphic */}
            <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-gradient-to-r from-primary-50/60 via-purple-50/40 to-primary-50/60 dark:from-primary-950/30 dark:via-purple-950/20 dark:to-primary-950/30 border border-primary-100 dark:border-primary-900/50 text-surface-700 dark:text-surface-200">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Laptop className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                <span>Laptop</span>
              </div>
              <span className="text-primary-400 font-bold">⇄</span>
              <div className="w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-xs">
                <Cloud className="w-3.5 h-3.5" />
              </div>
              <span className="text-primary-400 font-bold">⇄</span>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Smartphone className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                <span>Phone / Tablet</span>
              </div>
            </div>

            {/* Feature bullets */}
            <div className="space-y-2.5 text-xs text-surface-600 dark:text-surface-300">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Multi-Device Editing:</strong> Build on desktop, make adjustments on your phone while on the go.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Permanent Cloud Backup:</strong> Never lose your route if browser storage is cleared.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Control Your Sync:</strong> Save manually by default, or enable one-click automatic background sync.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Automatic Quick Save:</strong> Keeps an auto-saved copy of your working route, separate from your other saved trips.</span>
              </div>
            </div>

            {/* Supabase Missing Setup Warning */}
            {!isConfigured && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-200 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-100">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Supabase Keys Missing</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  To activate multi-device cloud sync, add your Supabase credentials to <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 font-mono text-[10px]">.env</code>:
                </p>
                <div className="font-mono text-[10px] bg-white/80 dark:bg-surface-900/80 p-2 rounded border border-amber-200 dark:border-amber-800/50 select-all">
                  VITE_SUPABASE_URL=https://xyz.supabase.co<br />
                  VITE_SUPABASE_ANON_KEY=eyJ...
                </div>
                <p className="text-[10px] text-amber-700 dark:text-amber-300">
                  Enable the Google provider in Supabase Dashboard → Authentication → Providers.
                </p>
              </div>
            )}

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/80 text-red-800 dark:text-red-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Sign In Failed</p>
                  <p className="text-[11px] leading-relaxed">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Google Sign-in CTA */}
            <div className="pt-2 space-y-3">
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading || !isConfigured}
                className={`w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all cursor-pointer shadow-sm ${
                  !isConfigured
                    ? "bg-surface-100 dark:bg-surface-700 text-surface-400 dark:text-surface-500 cursor-not-allowed"
                    : "bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 border border-surface-300 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-650 hover:shadow"
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              <p className="text-[11px] text-center text-surface-400 dark:text-surface-500">
                Fast & secure sign-in via official Google OAuth. No passwords to remember.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
