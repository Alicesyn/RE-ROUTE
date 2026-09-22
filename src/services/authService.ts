import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { User } from "../types";
import { toast } from "./toastService";

export const mapSupabaseUser = (sbUser: any): User | null => {
  if (!sbUser) return null;
  const meta = sbUser.user_metadata || {};
  const identityMeta = sbUser.identities?.[0]?.identity_data || {};
  const avatarUrl =
    meta.avatar_url ||
    meta.picture ||
    identityMeta.avatar_url ||
    identityMeta.picture ||
    "";
  return {
    id: sbUser.id,
    email: sbUser.email || "",
    displayName:
      meta.full_name ||
      meta.name ||
      identityMeta.full_name ||
      identityMeta.name ||
      sbUser.email?.split("@")[0] ||
      "User",
    avatarUrl,
    createdAt: sbUser.created_at,
  };
};

export const authService = {
  isConfigured: (): boolean => {
    return isSupabaseConfigured();
  },

  signInWithGoogle: async (): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured() || !supabase) {
      toast.error(
        "Supabase credentials are missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env",
        "Setup Required"
      );
      return {
        success: false,
        error: "Supabase not configured.",
      };
    }

    try {
      const redirectOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectOrigin,
        },
      });

      if (error) {
        toast.error(error.message, "Sign In Failed");
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      const msg = err?.message || "Google sign-in encountered an error.";
      toast.error(msg, "Sign In Error");
      return { success: false, error: msg };
    }
  },

  signOut: async (): Promise<{ success: boolean }> => {
    if (!supabase) return { success: true };
    try {
      await supabase.auth.signOut();
      toast.info("Signed out of your account.", "Signed Out");
      return { success: true };
    } catch (err: any) {
      console.error("Sign out error:", err);
      return { success: false };
    }
  },

  getSessionUser: async (): Promise<User | null> => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.user) return null;
      return mapSupabaseUser(data.session.user);
    } catch {
      return null;
    }
  },

  onAuthStateChange: (callback: (user: User | null) => void) => {
    if (!supabase) {
      callback(null);
      return () => {};
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: any, session: any) => {
        const user = session?.user ? mapSupabaseUser(session.user) : null;
        callback(user);
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  },
};
