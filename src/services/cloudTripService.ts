import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { ItinerarySnapshot } from "../types";

export const cloudTripService = {
  fetchUserTrips: async (): Promise<{ trips: ItinerarySnapshot[]; error?: string }> => {
    if (!isSupabaseConfigured() || !supabase) {
      return { trips: [], error: "Supabase is not configured." };
    }

    try {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch cloud trips:", error);
        return { trips: [], error: error.message };
      }

      const trips: ItinerarySnapshot[] = (data || []).map((row: any) => {
        const snapshot = row.data as ItinerarySnapshot;
        return {
          ...snapshot,
          id: row.id,
          cloudId: row.id,
          title: row.title || snapshot.title,
          version: row.version || snapshot.version || 1,
          updatedAt: new Date(row.updated_at).getTime(),
          isCloudSynced: true,
        };
      });

      return { trips };
    } catch (err: any) {
      console.error("Unexpected error fetching trips:", err);
      return { trips: [], error: err.message || "Failed to fetch cloud trips." };
    }
  },

  saveTripToCloud: async (
    trip: ItinerarySnapshot
  ): Promise<{ success: boolean; trip?: ItinerarySnapshot; error?: string }> => {
    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, error: "Supabase is not configured." };
    }

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        return { success: false, error: "Must be signed in to save to cloud." };
      }

      const tripId = trip.cloudId || trip.id || `trip_${Date.now()}`;
      const nextVersion = (trip.version || 0) + 1;
      const now = Date.now();

      const sanitizedSnapshot: ItinerarySnapshot = {
        ...trip,
        id: tripId,
        cloudId: tripId,
        version: nextVersion,
        updatedAt: now,
        isCloudSynced: true,
      };

      const payload = {
        id: tripId,
        user_id: userData.user.id,
        title: trip.title || "Untitled Trip",
        data: sanitizedSnapshot,
        version: nextVersion,
        updated_at: new Date(now).toISOString(),
      };

      const { error } = await supabase.from("trips").upsert(payload, {
        onConflict: "id",
      });

      if (error) {
        console.error("Failed to upsert cloud trip:", error);
        return { success: false, error: error.message };
      }

      return { success: true, trip: sanitizedSnapshot };
    } catch (err: any) {
      console.error("Unexpected error saving trip:", err);
      return { success: false, error: err.message || "Failed to save trip to cloud." };
    }
  },

  deleteTripFromCloud: async (tripId: string): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, error: "Supabase is not configured." };
    }

    try {
      const { error } = await supabase.from("trips").delete().eq("id", tripId);
      if (error) {
        console.error("Failed to delete cloud trip:", error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      console.error("Unexpected error deleting trip:", err);
      return { success: false, error: err.message || "Failed to delete cloud trip." };
    }
  },

  renameTripInCloud: async (tripId: string, newTitle: string): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, error: "Supabase is not configured." };
    }

    try {
      const { data: currentData, error: fetchErr } = await supabase
        .from("trips")
        .select("data")
        .eq("id", tripId)
        .single();

      if (fetchErr) {
        return { success: false, error: fetchErr.message };
      }

      const updatedData = {
        ...(currentData?.data || {}),
        title: newTitle,
        updatedAt: Date.now(),
      };

      const { error: updateErr } = await supabase
        .from("trips")
        .update({
          title: newTitle,
          data: updatedData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tripId);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }

      return { success: true };
    } catch (err: any) {
      console.error("Unexpected error renaming cloud trip:", err);
      return { success: false, error: err.message || "Failed to rename cloud trip." };
    }
  },
};
