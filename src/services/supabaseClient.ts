import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL?.trim() || "";
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY?.trim() || "";

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith("https://") &&
    supabaseAnonKey.length > 20
  );
};

let clientInstance: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  try {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
  }
}

export const supabase = clientInstance;
