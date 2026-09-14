import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { get as getIDB, set as setIDB, del as delIDB } from "idb-keyval";
import {
  Place,
  Hotel,
  TravelMode,
  DayRoute,
  ItinerarySnapshot,
  TripExportFile,
  CategoryConfig,
  CustomBuffer,
} from "../types";
import { solveSingleDay } from "../services/tspSolver";
import { estimateTime } from "../utils/distance";
import { format, addDays, parseISO, differenceInDays } from "date-fns";
import { CATEGORY_DEFAULTS, ALL_CATEGORIES } from "../utils/categoryConstants";
import { PlaceCategory } from "../types";

interface ModeData {
  places: Place[];
  hotels: Hotel[];
  missingPlaces: string[];
  optimizedRoutes: DayRoute[];
  dayTitles?: Record<number, string>;
}

interface RouteState extends ModeData {
  // Itinerary core
  title: string;
  days: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dateMode: "fixed" | "duration";
  dayStartTime: string; // HH:mm
  dayEndTime: string; // HH:mm
  showFlights: boolean;
  arrivalFlight: {
    time: string;
    buffer: number;
    location: Place | null;
  } | null;
  departureFlight: {
    time: string;
    buffer: number;
    location: Place | null;
  } | null;
  travelMode: TravelMode;
  dailyBudget: number; // minutes (user-configurable)
  strictBudget: boolean; // if true, won't assign places that exceed daily budget
  avoidClosedHours: boolean; // if true, optimizer sorts places only during open hours
  appMode: "real" | "mock" | "dropdown-mock";
  theme: "light" | "dark";
  showImages: boolean;
  distanceUnit: "metric" | "imperial";
  timeFormat: "12h" | "24h";
  categoryDurations: Record<PlaceCategory, number>;
  categoryConfigs: Record<PlaceCategory, CategoryConfig>;
  customBuffers: CustomBuffer[];
  dayTitles: Record<number, string>;
  optimizedRoutes: DayRoute[];
  savedTrips: ItinerarySnapshot[];
  isCalculating: boolean;
  calculatingText: string;

  // Per-mode persistence
  mockData: ModeData;
  realData: ModeData;

  // Actions
  setTitle: (title: string) => void;
  setDays: (days: number) => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setDateMode: (mode: "fixed" | "duration") => void;
  setDayTimes: (start: string, end: string) => void;
  setShowFlights: (show: boolean) => void;
  setArrivalFlight: (
    flight: { time: string; buffer: number; location: Place | null } | null,
  ) => void;
  setDepartureFlight: (
    flight: { time: string; buffer: number; location: Place | null } | null,
  ) => void;
  setTravelMode: (mode: TravelMode) => void;
  setDailyBudget: (minutes: number) => void;
  setStrictBudget: (strict: boolean) => void;
  setAvoidClosedHours: (avoid: boolean) => void;
  setAppMode: (mode: "real" | "mock" | "dropdown-mock") => void;
  setTheme: (theme: "light" | "dark") => void;
  setShowImages: (show: boolean) => void;
  setDistanceUnit: (unit: "metric" | "imperial") => void;
  setTimeFormat: (format: "12h" | "24h") => void;
  setCategoryDuration: (category: PlaceCategory, duration: number) => void;
  setCategoryConfig: (category: PlaceCategory, config: Partial<CategoryConfig>) => void;
  addCustomBuffer: (
    dayIndex: number,
    duration?: number,
    label?: string,
    insertAfterId?: string,
  ) => void;
  updateCustomBuffer: (id: string, updates: Partial<CustomBuffer>) => void;
  deleteCustomBuffer: (id: string) => void;

  // Places
  addPlace: (
    place: Omit<Place, "dayIndex" | "orderInDay" | "pinnedToDay">,
    targetDayIndex?: number,
  ) => void;
  updatePlace: (id: string, updates: Partial<Place>) => void;
  updatePlacesBulk: (
    updates: { id: string; updates: Partial<Place> }[],
  ) => void;
  removePlace: (id: string) => void;
  togglePlaceDisabled: (id: string) => Promise<void>;
  setAllPlacesDisabled: (disabled: boolean, ids?: string[]) => Promise<void>;
  reorderPlaces: (places: Place[]) => void;
  applyCategoryDurationsToPlaces: () => void;
  clearAll: () => void;
  unassignAll: () => void;
  clearOptimizedSchedule: () => void;

  // Missing Places
  addMissingPlace: (name: string) => void;
  removeMissingPlace: (name: string) => void;
  clearMissingPlaces: () => void;

  // Day assignment
  assignPlaceToDay: (placeId: string, dayIndex: number) => void;
  unassignPlace: (placeId: string) => void;

  // Hotels
  setHotelForDay: (dayIndex: number, hotel: Hotel | null) => void;
  applyHotelToAllDays: (hotel: Hotel | null) => void;
  setHotelRange: (startDay: number, endDay: number, hotel: Hotel | null) => void;
  setDayTitle: (dayIndex: number, title: string) => void;

  // Results
  setOptimizedRoutes: (routes: DayRoute[]) => void;
  updateSegmentTravelMode: (
    dayIndex: number,
    segmentIndex: number,
    mode: TravelMode,
  ) => void;

  // Per-day optimization
  optimizeDay: (dayIndex: number) => void;
  reorderDayStops: (dayIndex: number, activeId: string, overId: string) => void;

  // Trips & Export/Import
  saveTrip: () => void;
  loadTrip: (id: string) => void;
  deleteTrip: (id: string) => void;
  applyTripSnapshot: (snapshot: ItinerarySnapshot) => void;
  exportTripAsJson: (tripId?: string) => void;
  exportTripAsExcel: (tripId?: string) => Promise<void>;
  importTripFromJson: (jsonString: string) => { success: boolean; error?: string; tripTitle?: string };
  resetTrip: () => void;
}

let setTimer: any = null;
let pendingWrite: { name: string; value: string } | null = null;

const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (pendingWrite && pendingWrite.name === name) {
      return pendingWrite.value;
    }
    const value = await getIDB(name);
    if (value) {
      return value;
    }
    // Fallback to localStorage for migration
    const localValue = localStorage.getItem(name);
    if (localValue) {
      await setIDB(name, localValue);
      return localValue;
    }
    return null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    pendingWrite = { name, value };
    if (setTimer) clearTimeout(setTimer);
    setTimer = setTimeout(async () => {
      try {
        if (pendingWrite) {
          await setIDB(pendingWrite.name, pendingWrite.value);
          pendingWrite = null;
        }
      } catch (e) {
        console.error("Failed to save to IndexedDB:", e);
      }
    }, 250);
  },
  removeItem: async (name: string): Promise<void> => {
    if (setTimer) clearTimeout(setTimer);
    pendingWrite = null;
    await delIDB(name);
  },
};

export const useRouteStore = create<RouteState>()(
  persist(
    (set, get) => ({
      title: "RE:ROUTE",

      days: 3,
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: format(addDays(new Date(), 2), "yyyy-MM-dd"),
      dateMode: "duration",
      dayStartTime: "09:00",
      dayEndTime: "21:00",
      showFlights: false,
      arrivalFlight: null,
      departureFlight: null,
      travelMode: "driving",
      dailyBudget: 720, // 12 hours default
      strictBudget: true,
      avoidClosedHours: true,
      places: [],
      hotels: [],
      missingPlaces: [],
      appMode: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? "real" : "mock",
      theme: "light",
      showImages: true,
      distanceUnit: "metric",
      timeFormat: "12h",
      categoryDurations: ALL_CATEGORIES.reduce(
        (acc, cat) => ({
          ...acc,
          [cat]: CATEGORY_DEFAULTS[cat]?.duration || 60,
        }),
        {} as Record<PlaceCategory, number>,
      ),
      categoryConfigs: ALL_CATEGORIES.reduce(
        (acc, cat) => ({
          ...acc,
          [cat]: CATEGORY_DEFAULTS[cat] || {},
        }),
        {} as Record<PlaceCategory, CategoryConfig>,
      ),
      customBuffers: [],
      dayTitles: {},
      optimizedRoutes: [],
      savedTrips: [],
      isCalculating: false,
      calculatingText: "",
      mockData: {
        places: [],
        hotels: [],
        missingPlaces: [],
        optimizedRoutes: [],
        dayTitles: {},
      },
      realData: {
        places: [],
        hotels: [],
        missingPlaces: [],
        optimizedRoutes: [],
        dayTitles: {},
      },

      setTitle: (title) => set({ title }),
      setDays: (days) =>
        set((state) => {
          // Adjust hotels array if days shrink
          const newHotels = state.hotels.filter((h) => h.dayIndex < days);
          // If a hotel exists for day 0, propagate it to any new days that don't have one
          const baseHotel = state.hotels.find((h) => h.dayIndex === 0);
          if (baseHotel) {
            for (let i = 0; i < days; i++) {
              if (!newHotels.find((h) => h.dayIndex === i)) {
                newHotels.push({ ...baseHotel, dayIndex: i });
              }
            }
          }
          // Reset dayIndex on places that exceed the new days limit
          const newPlaces = state.places.map((p) =>
            p.dayIndex !== null && p.dayIndex >= days
              ? { ...p, dayIndex: null, orderInDay: null, pinnedToDay: false }
              : p,
          );
          const newEndDate = format(
            addDays(parseISO(state.startDate), days - 1),
            "yyyy-MM-dd",
          );
          return {
            days,
            hotels: newHotels,
            places: newPlaces,
            endDate: newEndDate,
          };
        }),
      setStartDate: (startDate) =>
        set((state) => {
          if (state.dateMode === "fixed") {
            let endDate = state.endDate;
            if (parseISO(startDate) > parseISO(state.endDate)) {
              endDate = startDate;
            }
            const days = differenceInDays(parseISO(endDate), parseISO(startDate)) + 1;
            return { startDate, endDate, days: Math.max(1, days) };
          } else {
            const endDate = format(
              addDays(parseISO(startDate), state.days - 1),
              "yyyy-MM-dd",
            );
            return { startDate, endDate };
          }
        }),
      setEndDate: (endDate) =>
        set((state) => {
          const days =
            differenceInDays(parseISO(endDate), parseISO(state.startDate)) + 1;
          return { endDate, days: Math.max(1, days) };
        }),
      setDateMode: (dateMode) => set({ dateMode }),
      setDayTimes: (dayStartTime, dayEndTime) =>
        set({ dayStartTime, dayEndTime }),
      setShowFlights: (showFlights) =>
        set((state) => ({
          showFlights,
          arrivalFlight:
            showFlights && !state.arrivalFlight
              ? { time: "12:00", buffer: 30, location: null }
              : state.arrivalFlight,
          departureFlight:
            showFlights && !state.departureFlight
              ? { time: "18:00", buffer: 90, location: null }
              : state.departureFlight,
        })),
      setArrivalFlight: (arrivalFlight) => set({ arrivalFlight }),
      setDepartureFlight: (departureFlight) => set({ departureFlight }),
      setTravelMode: (travelMode) => set({ travelMode }),
      setDailyBudget: (dailyBudget) => set({ dailyBudget }),
      setStrictBudget: (strictBudget) => set({ strictBudget }),
      setAvoidClosedHours: (avoidClosedHours) => set({ avoidClosedHours }),

      addCustomBuffer: (dayIndex, duration = 30, label = "Custom Buffer", insertAfterId) =>
        set((state) => {
          const newId = `custom-buffer-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const newBuffer: CustomBuffer = {
            id: newId,
            dayIndex,
            duration: Math.max(0, duration),
            label,
          };

          const newCustomBuffers = [...state.customBuffers, newBuffer];

          const routes = [...state.optimizedRoutes];
          const routeIdx = routes.findIndex((r) => r.day === dayIndex);
          if (routeIdx >= 0) {
            const route = routes[routeIdx];
            let seq: string[] = [];
            if (route.manualSequence && route.manualSequence.length > 0) {
              seq = [...route.manualSequence];
            } else {
              if (dayIndex === 0 && state.showFlights && state.arrivalFlight) seq.push("arrival");
              if (route.startHotel) seq.push("start-hotel");
              route.stops.forEach((s) => seq.push(s.id));
              if (route.endHotel && dayIndex < state.days - 1) seq.push("end-hotel");
              if (dayIndex === state.days - 1 && state.showFlights && state.departureFlight) seq.push("departure");
            }

            if (insertAfterId) {
              const insertIdx = seq.indexOf(insertAfterId);
              if (insertIdx >= 0) {
                seq.splice(insertIdx + 1, 0, newId);
              } else {
                seq.push(newId);
              }
            } else {
              const endIdx = seq.findIndex((id) => id === "end-hotel" || id === "departure");
              if (endIdx >= 0) {
                seq.splice(endIdx, 0, newId);
              } else {
                seq.push(newId);
              }
            }

            routes[routeIdx] = {
              ...route,
              manualSequence: seq,
            };
          }

          return {
            customBuffers: newCustomBuffers,
            optimizedRoutes: routes,
          };
        }),

      updateCustomBuffer: (id, updates) =>
        set((state) => ({
          customBuffers: state.customBuffers.map((b) =>
            b.id === id ? { ...b, ...updates, duration: updates.duration !== undefined ? Math.max(0, updates.duration) : b.duration } : b,
          ),
        })),

      deleteCustomBuffer: (id) =>
        set((state) => {
          const newCustomBuffers = state.customBuffers.filter((b) => b.id !== id);
          const routes = state.optimizedRoutes.map((r) => ({
            ...r,
            manualSequence: r.manualSequence ? r.manualSequence.filter((seqId) => seqId !== id) : undefined,
          }));
          return {
            customBuffers: newCustomBuffers,
            optimizedRoutes: routes,
          };
        }),
      setAppMode: (newMode) =>
        set((state) => {
          const oldMode = state.appMode;
          if (oldMode === newMode) return state;

          // 1. Save current state into the storage for the old mode
          const currentItinerary: ModeData = {
            places: state.places,
            hotels: state.hotels,
            missingPlaces: state.missingPlaces,
            optimizedRoutes: state.optimizedRoutes,
            dayTitles: state.dayTitles,
          };

          const isOldModeReal = oldMode === "real";
          const updatedMockData = isOldModeReal
            ? state.mockData
            : currentItinerary;
          const updatedRealData = isOldModeReal
            ? currentItinerary
            : state.realData;

          // 2. Load state from the storage for the new mode
          const isNewModeReal = newMode === "real";
          const targetData = isNewModeReal ? updatedRealData : updatedMockData;

          return {
            appMode: newMode,
            mockData: updatedMockData,
            realData: updatedRealData,
            dayTitles: targetData.dayTitles || {},
            ...targetData,
          };
        }),
      setTheme: (theme) => set({ theme }),
      setShowImages: (showImages) => set({ showImages }),
      setDistanceUnit: (distanceUnit) => set({ distanceUnit }),
      setTimeFormat: (timeFormat) => set({ timeFormat }),
      setCategoryDuration: (category, duration) =>
        set((state) => ({
          categoryDurations: { ...state.categoryDurations, [category]: duration },
        })),
      setCategoryConfig: (category, config) =>
        set((state) => ({
          categoryConfigs: {
            ...state.categoryConfigs,
            [category]: {
              ...state.categoryConfigs[category],
              ...config,
            },
          },
        })),

      addPlace: (place, targetDayIndex) =>
        set((state) => {
          const newPlace: Place = {
            ...place,
            dayIndex: targetDayIndex !== undefined ? targetDayIndex : null,
            orderInDay:
              targetDayIndex !== undefined
                ? state.places.filter((p) => p.dayIndex === targetDayIndex)
                  .length
                : null,
            pinnedToDay: targetDayIndex !== undefined,
          };
          return { places: [...state.places, newPlace] };
        }),

      updatePlace: (id, updates) =>
        set((state) => ({
          places: state.places.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
          optimizedRoutes: state.optimizedRoutes.map((r) => ({
            ...r,
            stops: r.stops.map((s) => (s.id === id ? { ...s, ...updates } : s)),
          })),
        })),

      updatePlacesBulk: (updates) =>
        set((state) => ({
          places: state.places.map((p) => {
            const update = updates.find((u) => u.id === p.id);
            return update ? { ...p, ...update.updates } : p;
          }),
          optimizedRoutes: state.optimizedRoutes.map((r) => ({
            ...r,
            stops: r.stops.map((s) => {
              const update = updates.find((u) => u.id === s.id);
              return update ? { ...s, ...update.updates } : s;
            }),
          })),
        })),

      removePlace: (id) =>
        set((state) => ({
          places: state.places.filter((p) => p.id !== id),
        })),

      togglePlaceDisabled: async (placeId) => {
        const state = get();
        const target = state.places.find((p) => p.id === placeId);
        if (!target) return;

        const willBeDisabled = !target.isDisabled;

        if (willBeDisabled) {
          // If place is assigned to a day, unassign it and re-solve that day
          const dayIndex = target.dayIndex;
          const newPlaces = state.places.map((p) =>
            p.id === placeId
              ? { ...p, isDisabled: true, dayIndex: null, orderInDay: null, pinnedToDay: false, unfeasibleReason: undefined }
              : p,
          );

          if (dayIndex !== null && dayIndex !== undefined) {
            set({ isCalculating: true, calculatingText: "Updating routes..." });
            try {
              let newRoutes = [...state.optimizedRoutes];
              const dayPlaces = newPlaces.filter((p) => p.dayIndex === dayIndex && !p.isDisabled);
              const idx = newRoutes.findIndex((r) => r.day === dayIndex);
              let manualSequence: string[] | undefined = undefined;
              if (idx >= 0 && newRoutes[idx].manualSequence) {
                manualSequence = newRoutes[idx].manualSequence.filter((id) => id !== placeId);
              }

              const result = await solveSingleDay(
                dayPlaces,
                state.hotels,
                dayIndex,
                state.travelMode,
                dayIndex === 0 && state.showFlights ? state.arrivalFlight?.location : null,
                dayIndex === state.days - 1 && state.showFlights ? state.departureFlight?.location : null,
                !!manualSequence,
                manualSequence,
                state.startDate,
                state.dayStartTime,
                state.avoidClosedHours,
                dayIndex === state.days - 1,
                dayIndex === 0 && state.showFlights ? state.arrivalFlight : null,
                dayIndex === state.days - 1 && state.showFlights ? state.departureFlight : null,
                state.categoryConfigs,
              );
              if (idx >= 0) newRoutes[idx] = result;
              set({ places: newPlaces, optimizedRoutes: newRoutes, isCalculating: false });
            } catch (e) {
              console.error(e);
              set({ places: newPlaces, isCalculating: false });
            }
          } else {
            set({ places: newPlaces });
          }
        } else {
          // Re-enabling place: restore it to active unassigned pool
          const newPlaces = state.places.map((p) =>
            p.id === placeId ? { ...p, isDisabled: false } : p,
          );
          set({ places: newPlaces });
        }
      },

      setAllPlacesDisabled: async (disabled, ids) => {
        const state = get();
        const idSet = ids ? new Set(ids) : null;
        const affectedPlaces = state.places.filter(
          (p) => (!idSet || idSet.has(p.id)) && p.isDisabled !== disabled
        );

        if (affectedPlaces.length === 0) return;

        if (disabled) {
          const affectedDays = new Set(
            affectedPlaces
              .map((p) => p.dayIndex)
              .filter((d): d is number => d !== null && d !== undefined)
          );

          const newPlaces = state.places.map((p) => {
            if (!idSet || idSet.has(p.id)) {
              return { ...p, isDisabled: true, dayIndex: null, orderInDay: null, pinnedToDay: false };
            }
            return p;
          });

          if (affectedDays.size > 0) {
            set({ isCalculating: true, calculatingText: "Updating routes..." });
            try {
              let newRoutes = [...state.optimizedRoutes];
              for (const dayIndex of affectedDays) {
                const dayPlaces = newPlaces.filter((p) => p.dayIndex === dayIndex && !p.isDisabled);
                const idx = newRoutes.findIndex((r) => r.day === dayIndex);
                let manualSequence: string[] | undefined = undefined;
                if (idx >= 0 && newRoutes[idx].manualSequence) {
                  manualSequence = newRoutes[idx].manualSequence.filter(
                    (id) => !affectedPlaces.some((ap) => ap.id === id)
                  );
                }

                const result = await solveSingleDay(
                  dayPlaces,
                  state.hotels,
                  dayIndex,
                  state.travelMode,
                  dayIndex === 0 && state.showFlights ? state.arrivalFlight?.location : null,
                  dayIndex === state.days - 1 && state.showFlights ? state.departureFlight?.location : null,
                  !!manualSequence,
                  manualSequence,
                  state.startDate,
                  state.dayStartTime,
                  state.avoidClosedHours,
                  dayIndex === state.days - 1,
                  dayIndex === 0 && state.showFlights ? state.arrivalFlight : null,
                  dayIndex === state.days - 1 && state.showFlights ? state.departureFlight : null,
                  state.categoryConfigs,
                );
                if (idx >= 0) newRoutes[idx] = result;
              }
              set({ places: newPlaces, optimizedRoutes: newRoutes, isCalculating: false });
            } catch (e) {
              console.error(e);
              set({ places: newPlaces, isCalculating: false });
            }
          } else {
            set({ places: newPlaces });
          }
        } else {
          const newPlaces = state.places.map((p) => {
            if (!idSet || idSet.has(p.id)) {
              return { ...p, isDisabled: false };
            }
            return p;
          });
          set({ places: newPlaces });
        }
      },

      reorderPlaces: (places) => set({ places }),

      applyCategoryDurationsToPlaces: () =>
        set((state) => {
          const newPlaces = state.places.map((p) => ({
            ...p,
            estimatedDuration: state.categoryDurations[p.category] || p.estimatedDuration,
          }));
          return { places: newPlaces };
        }),

      clearAll: () => {
        console.log("Zustand clearAll executed");
        set({ places: [], hotels: [], missingPlaces: [], optimizedRoutes: [], customBuffers: [], dayTitles: {} });
      },

      resetTrip: () => {
        const today = new Date();
        const startStr = format(today, "yyyy-MM-dd");
        const endStr = format(addDays(today, 2), "yyyy-MM-dd");

        set((state) => {
          const emptyModeData: ModeData = {
            places: [],
            hotels: [],
            missingPlaces: [],
            optimizedRoutes: [],
            dayTitles: {},
          };

          return {
            title: "RE:ROUTE",
            days: 3,
            startDate: startStr,
            endDate: endStr,
            dateMode: "duration",
            dayStartTime: "09:00",
            dayEndTime: "21:00",
            showFlights: false,
            arrivalFlight: null,
            departureFlight: null,
            travelMode: "driving",
            isCalculating: false,
            calculatingText: "",
            places: [],
            hotels: [],
            missingPlaces: [],
            optimizedRoutes: [],
            customBuffers: [],
            dayTitles: {},
            mockData: state.appMode === "real" ? state.mockData : emptyModeData,
            realData: state.appMode === "real" ? emptyModeData : state.realData,
          };
        });
      },

      unassignAll: () =>
        set((state) => ({
          places: state.places.map((p) => ({
            ...p,
            dayIndex: null,
            orderInDay: null,
            pinnedToDay: false,
            unfeasibleReason: undefined,
          })),
          optimizedRoutes: [],
          customBuffers: [],
        })),

      clearOptimizedSchedule: () =>
        set((state) => ({
          places: state.places.map((p) => ({
            ...p,
            dayIndex: null,
            orderInDay: null,
            pinnedToDay: false,
            unfeasibleReason: undefined,
          })),
          optimizedRoutes: [],
          customBuffers: [],
        })),

      addMissingPlace: (name) =>
        set((state) => ({
          missingPlaces: state.missingPlaces.includes(name)
            ? state.missingPlaces
            : [...state.missingPlaces, name],
        })),
      removeMissingPlace: (name) =>
        set((state) => ({
          missingPlaces: state.missingPlaces.filter((n) => n !== name),
        })),
      clearMissingPlaces: () => set({ missingPlaces: [] }),

      // Day assignment actions
      assignPlaceToDay: async (placeId, dayIndex) => {
        set({ isCalculating: true, calculatingText: "Calculating routes..." });
        try {
          const state = get();
          const newPlaces = state.places.map((p) =>
            p.id === placeId
              ? {
                ...p,
                isDisabled: false, // Auto-enable if explicitly assigned to a day
                dayIndex,
                orderInDay: state.places.filter(
                  (pl) => pl.dayIndex === dayIndex && !pl.isDisabled,
                ).length,
                pinnedToDay: true,
                unfeasibleReason: undefined,
              }
              : p,
          );

          let newRoutes = [...state.optimizedRoutes];
          const dayPlaces = newPlaces.filter((p) => p.dayIndex === dayIndex && !p.isDisabled);

          const idx = newRoutes.findIndex((r) => r.day === dayIndex);
          let manualSequence: string[] | undefined = undefined;

          if (idx >= 0 && newRoutes[idx].manualSequence) {
            manualSequence = [...newRoutes[idx].manualSequence, placeId];
          }

          const result = await solveSingleDay(
            dayPlaces,
            state.hotels,
            dayIndex,
            state.travelMode,
            dayIndex === 0 && state.showFlights ? state.arrivalFlight?.location : null,
            dayIndex === state.days - 1 && state.showFlights ? state.departureFlight?.location : null,
            !!manualSequence,
            manualSequence,
            state.startDate,
            state.dayStartTime,
            state.avoidClosedHours,
            dayIndex === state.days - 1,
            dayIndex === 0 && state.showFlights ? state.arrivalFlight : null,
            dayIndex === state.days - 1 && state.showFlights ? state.departureFlight : null,
            state.categoryConfigs,
          );

          if (idx >= 0) {
            newRoutes[idx] = result;
          } else {
            newRoutes.push(result);
            newRoutes.sort((a, b) => a.day - b.day);
          }

          set({ places: newPlaces, optimizedRoutes: newRoutes, isCalculating: false });
        } catch (e) {
          console.error(e);
          set({ isCalculating: false });
        }
      },

      unassignPlace: async (placeId) => {
        set({ isCalculating: true, calculatingText: "Updating routes..." });
        try {
          const state = get();
          const place = state.places.find((p) => p.id === placeId);
          const dayIndex = place?.dayIndex;

          const newPlaces = state.places.map((p) =>
            p.id === placeId
              ? { ...p, dayIndex: null, orderInDay: null, pinnedToDay: false, unfeasibleReason: undefined }
              : p,
          );

          let newRoutes = [...state.optimizedRoutes];
          if (dayIndex !== null && dayIndex !== undefined) {
            const dayPlaces = newPlaces.filter((p) => p.dayIndex === dayIndex && !p.isDisabled);

            const idx = newRoutes.findIndex((r) => r.day === dayIndex);
            let manualSequence: string[] | undefined = undefined;
            if (idx >= 0 && newRoutes[idx].manualSequence) {
              manualSequence = newRoutes[idx].manualSequence.filter(id => id !== placeId);
            }

            const result = await solveSingleDay(
              dayPlaces,
              state.hotels,
              dayIndex,
              state.travelMode,
              dayIndex === 0 && state.showFlights
                ? state.arrivalFlight?.location
                : null,
              dayIndex === state.days - 1 && state.showFlights
                ? state.departureFlight?.location
                : null,
              !!manualSequence,
              manualSequence,
              state.startDate,
              state.dayStartTime,
              state.avoidClosedHours,
              dayIndex === state.days - 1,
              dayIndex === 0 && state.showFlights ? state.arrivalFlight : null,
              dayIndex === state.days - 1 && state.showFlights ? state.departureFlight : null,
              state.categoryConfigs,
            );
            if (idx >= 0) newRoutes[idx] = result;
          }

          set({ places: newPlaces, optimizedRoutes: newRoutes, isCalculating: false });
        } catch (e) {
          console.error(e);
          set({ isCalculating: false });
        }
      },

      setHotelForDay: (dayIndex, hotel) =>
        set((state) => {
          const existing = state.hotels.filter((h) => h.dayIndex !== dayIndex);
          if (hotel) {
            existing.push({ ...hotel, dayIndex });
          }
          return { hotels: existing.sort((a, b) => a.dayIndex - b.dayIndex) };
        }),

      applyHotelToAllDays: (hotel) =>
        set((state) => {
          if (!hotel) return { hotels: [] };
          const hotels = Array.from({ length: state.days }).map((_, i) => ({
            ...hotel,
            dayIndex: i,
          }));
          return { hotels };
        }),

      setHotelRange: (startDay, endDay, hotel) =>
        set((state) => {
          let existing = state.hotels.filter(
            (h) => h.dayIndex < startDay || h.dayIndex > endDay
          );
          if (hotel) {
            for (let i = startDay; i <= endDay; i++) {
              existing.push({ ...hotel, dayIndex: i });
            }
          }
          return { hotels: existing.sort((a, b) => a.dayIndex - b.dayIndex) };
        }),

      setDayTitle: (dayIndex: number, title: string) => {
        const trimmed = title.trim();
        set((state) => {
          const newDayTitles = { ...state.dayTitles };
          if (trimmed) {
            newDayTitles[dayIndex] = trimmed;
          } else {
            delete newDayTitles[dayIndex];
          }
          const updatedRoutes = state.optimizedRoutes.map((r, i) =>
            i === dayIndex || r.day === dayIndex
              ? { ...r, title: trimmed || undefined }
              : r
          );
          return {
            dayTitles: newDayTitles,
            optimizedRoutes: updatedRoutes,
          };
        });
      },

      setOptimizedRoutes: (optimizedRoutes) =>
        set((state) => ({
          optimizedRoutes: optimizedRoutes.map((r, idx) => {
            const dayIdx = r.day ?? idx;
            return {
              ...r,
              title: r.title || state.dayTitles[dayIdx] || undefined,
            };
          }),
        })),

      updateSegmentTravelMode: (dayIndex, segmentIndex, mode) =>
        set((state) => {
          const newRoutes = [...state.optimizedRoutes];
          const routeIdx = newRoutes.findIndex((r) => r.day === dayIndex);
          if (routeIdx >= 0) {
            const route = { ...newRoutes[routeIdx] };
            const segments = [...route.segments];
            if (segments[segmentIndex]) {
              const seg = { ...segments[segmentIndex] };
              seg.travelMode = mode;
              seg.time = estimateTime(seg.distance, mode);
              seg.isHeuristic = true;
              if (mode === "transit") {
                seg.heuristicReason = "Transit time recalculated using geometric velocity heuristic.";
              }
              segments[segmentIndex] = seg;

              // Recalculate total time
              route.segments = segments;
              route.totalTime = segments.reduce((sum, s) => sum + s.time, 0);
              newRoutes[routeIdx] = route;
            }
          }
          return { optimizedRoutes: newRoutes };
        }),

      // Per-day optimization
      optimizeDay: async (dayIndex) => {
        set({ isCalculating: true, calculatingText: "Optimizing day..." });
        try {
          const state = get();
          const dayPlaces = state.places.filter((p) => p.dayIndex === dayIndex && !p.isDisabled);
          if (dayPlaces.length === 0) {
            set({ isCalculating: false });
            return;
          }

          const result = await solveSingleDay(
            dayPlaces,
            state.hotels,
            dayIndex,
            state.travelMode,
            dayIndex === 0 && state.showFlights
              ? state.arrivalFlight?.location
              : null,
            dayIndex === state.days - 1 && state.showFlights
              ? state.departureFlight?.location
              : null,
            false,
            undefined,
            state.startDate,
            state.dayStartTime,
            state.avoidClosedHours,
            dayIndex === state.days - 1,
            dayIndex === 0 && state.showFlights ? state.arrivalFlight : null,
            dayIndex === state.days - 1 && state.showFlights ? state.departureFlight : null,
            state.categoryConfigs,
          );

          const newRoutes = [...state.optimizedRoutes];
          const existingIdx = newRoutes.findIndex((r) => r.day === dayIndex);
          const existingTitle = state.dayTitles[dayIndex] || (existingIdx >= 0 ? newRoutes[existingIdx]?.title : undefined);
          const resultWithTitle = { ...result, title: existingTitle };
          if (existingIdx >= 0) {
            newRoutes[existingIdx] = resultWithTitle;
          } else {
            newRoutes.push(resultWithTitle);
            newRoutes.sort((a, b) => a.day - b.day);
          }

          const updatedPlaces = state.places.map((p) => {
            if (p.dayIndex !== dayIndex) return p;
            const stopIdx = result.stops.findIndex((s) => s.id === p.id);
            return stopIdx >= 0
              ? { ...p, orderInDay: stopIdx }
              : {
                  ...p,
                  dayIndex: null,
                  orderInDay: null,
                  unfeasibleReason: "Closed during scheduled visiting hours.",
                };
          });

          set({ optimizedRoutes: newRoutes, places: updatedPlaces, isCalculating: false });
        } catch (e) {
          console.error(e);
          set({ isCalculating: false });
        }
      },

      reorderDayStops: async (dayIndex, activeId, overId) => {
        set({ isCalculating: true, calculatingText: "Updating route..." });
        try {
          const state = get();
          const routes = [...state.optimizedRoutes];
          const routeIdx = routes.findIndex((r) => r.day === dayIndex);
          if (routeIdx === -1) {
            set({ isCalculating: false });
            return;
          }

          const route = routes[routeIdx];

          let currentOrder: string[] = [];
          if (route.manualSequence) {
            currentOrder = dayIndex === state.days - 1
              ? route.manualSequence.filter((id) => id !== "end-hotel")
              : [...route.manualSequence];
          } else {
            if (dayIndex === 0 && state.showFlights && state.arrivalFlight)
              currentOrder.push("arrival");
            if (route.startHotel) currentOrder.push("start-hotel");
            route.stops.forEach((s) => currentOrder.push(s.id));
            if (route.endHotel && dayIndex < state.days - 1) currentOrder.push("end-hotel");
            if (
              dayIndex === state.days - 1 &&
              state.showFlights &&
              state.departureFlight
            )
              currentOrder.push("departure");
          }

          const dayCustomBuffers = (state.customBuffers || []).filter((b) => b.dayIndex === dayIndex);
          dayCustomBuffers.forEach((b) => {
            if (!currentOrder.includes(b.id)) {
              const endIdx = currentOrder.findIndex((id) => id === "end-hotel" || id === "departure");
              if (endIdx >= 0) {
                currentOrder.splice(endIdx, 0, b.id);
              } else {
                currentOrder.push(b.id);
              }
            }
          });

          const oldIndex = currentOrder.findIndex((id) => String(id) === String(activeId));
          const newIndex = currentOrder.findIndex((id) => String(id) === String(overId));

          if (oldIndex === -1 || newIndex === -1) {
            set({ isCalculating: false });
            return;
          }

          const newSequence = [...currentOrder];
          const [movedItem] = newSequence.splice(oldIndex, 1);
          newSequence.splice(newIndex, 0, movedItem);

          // Build complete day places including any stop currently in route.stops
          const dayPlaceMap = new Map<string, Place>();
          state.places
            .filter((p) => p.dayIndex === dayIndex && !p.isDisabled)
            .forEach((p) => dayPlaceMap.set(String(p.id), p));
          route.stops.forEach((s) => {
            if (!dayPlaceMap.has(String(s.id))) {
              dayPlaceMap.set(String(s.id), s);
            }
          });
          const dayPlaces = Array.from(dayPlaceMap.values());

          const result = await solveSingleDay(
            dayPlaces,
            state.hotels,
            dayIndex,
            state.travelMode,
            dayIndex === 0 && state.showFlights
              ? state.arrivalFlight?.location
              : null,
            dayIndex === state.days - 1 && state.showFlights
              ? state.departureFlight?.location
              : null,
            true, // manualOrder = true
            newSequence,
            state.startDate,
            state.dayStartTime,
            state.avoidClosedHours,
            dayIndex === state.days - 1,
            dayIndex === 0 && state.showFlights ? state.arrivalFlight : null,
            dayIndex === state.days - 1 && state.showFlights ? state.departureFlight : null,
            state.categoryConfigs,
          );

          const existingTitle = state.dayTitles[dayIndex] || routes[routeIdx]?.title;
          routes[routeIdx] = { ...result, title: existingTitle };

          const updatedPlaces = state.places.map((p) => {
            const stopIdx = result.stops.findIndex((s) => String(s.id) === String(p.id));
            if (stopIdx >= 0) {
              return { ...p, dayIndex, orderInDay: stopIdx, pinnedToDay: true };
            }
            return p;
          });

          set({ optimizedRoutes: routes, places: updatedPlaces, isCalculating: false });
        } catch (e) {
          console.error(e);
          set({ isCalculating: false });
        }
      },

      saveTrip: () =>
        set((state) => {
          const snapshot: ItinerarySnapshot = {
            id: `trip_${Date.now()}`,
            title: state.title,
            days: state.days,
            startDate: state.startDate,
            endDate: state.endDate,
            dateMode: state.dateMode,
            dayStartTime: state.dayStartTime,
            dayEndTime: state.dayEndTime,
            showFlights: state.showFlights,
            arrivalFlight: state.arrivalFlight,
            departureFlight: state.departureFlight,
            travelMode: state.travelMode,
            dailyBudget: state.dailyBudget,
            strictBudget: state.strictBudget,
            avoidClosedHours: state.avoidClosedHours,
            places: state.places,
            hotels: state.hotels,
            missingPlaces: state.missingPlaces,
            categoryDurations: state.categoryDurations,
            categoryConfigs: state.categoryConfigs,
            customBuffers: state.customBuffers,
            dayTitles: state.dayTitles,
            optimizedRoutes: state.optimizedRoutes,
            savedAt: Date.now(),
          };
          // Update existing trip if title matches exactly (simple heuristic), otherwise create new
          const existingIndex = state.savedTrips.findIndex(
            (t) => t.title === state.title,
          );
          if (existingIndex >= 0) {
            const newTrips = [...state.savedTrips];
            newTrips[existingIndex] = {
              ...snapshot,
              id: state.savedTrips[existingIndex].id,
            }; // keep old ID
            return { savedTrips: newTrips };
          }
          return { savedTrips: [...state.savedTrips, snapshot] };
        }),

      loadTrip: (id) =>
        set((state) => {
          const trip = state.savedTrips.find((t) => t.id === id);
          if (!trip) return state;
          return {
            title: trip.title || state.title,
            days: trip.days ?? state.days,
            startDate: trip.startDate || state.startDate,
            endDate: trip.endDate || state.endDate,
            dateMode: trip.dateMode || state.dateMode,
            dayStartTime: trip.dayStartTime || state.dayStartTime,
            dayEndTime: trip.dayEndTime || state.dayEndTime,
            showFlights: trip.showFlights ?? state.showFlights,
            arrivalFlight: trip.arrivalFlight ?? state.arrivalFlight,
            departureFlight: trip.departureFlight ?? state.departureFlight,
            travelMode: trip.travelMode || state.travelMode,
            dailyBudget: trip.dailyBudget ?? state.dailyBudget,
            strictBudget: trip.strictBudget ?? state.strictBudget,
            avoidClosedHours: trip.avoidClosedHours ?? state.avoidClosedHours,
            places: trip.places || [],
            hotels: trip.hotels || [],
            missingPlaces: trip.missingPlaces || [],
            categoryDurations: trip.categoryDurations || state.categoryDurations,
            categoryConfigs: trip.categoryConfigs || state.categoryConfigs,
            customBuffers: trip.customBuffers || [],
            dayTitles: trip.dayTitles || {},
            optimizedRoutes: trip.optimizedRoutes || [],
          };
        }),

      applyTripSnapshot: (trip) =>
        set((state) => {
          const existingIndex = state.savedTrips.findIndex(
            (t) => t.id === trip.id || t.title === trip.title,
          );
          const snapshotWithId: ItinerarySnapshot = {
            ...trip,
            id: trip.id || `trip_${Date.now()}`,
            savedAt: trip.savedAt || Date.now(),
          };
          const newSavedTrips = [...state.savedTrips];
          if (existingIndex >= 0) {
            newSavedTrips[existingIndex] = snapshotWithId;
          } else {
            newSavedTrips.push(snapshotWithId);
          }

          return {
            title: trip.title || state.title,
            days: trip.days ?? state.days,
            startDate: trip.startDate || state.startDate,
            endDate: trip.endDate || state.endDate,
            dateMode: trip.dateMode || state.dateMode,
            dayStartTime: trip.dayStartTime || state.dayStartTime,
            dayEndTime: trip.dayEndTime || state.dayEndTime,
            showFlights: trip.showFlights ?? state.showFlights,
            arrivalFlight: trip.arrivalFlight ?? state.arrivalFlight,
            departureFlight: trip.departureFlight ?? state.departureFlight,
            travelMode: trip.travelMode || state.travelMode,
            dailyBudget: trip.dailyBudget ?? state.dailyBudget,
            strictBudget: trip.strictBudget ?? state.strictBudget,
            avoidClosedHours: trip.avoidClosedHours ?? state.avoidClosedHours,
            places: trip.places || [],
            hotels: trip.hotels || [],
            missingPlaces: trip.missingPlaces || [],
            categoryDurations: trip.categoryDurations || state.categoryDurations,
            categoryConfigs: trip.categoryConfigs || state.categoryConfigs,
            customBuffers: trip.customBuffers || [],
            dayTitles: trip.dayTitles || {},
            optimizedRoutes: trip.optimizedRoutes || [],
            savedTrips: newSavedTrips,
          };
        }),

      exportTripAsJson: (tripId?: string) => {
        const state = get();
        let tripToExport: ItinerarySnapshot;
        if (tripId) {
          const found = state.savedTrips.find((t) => t.id === tripId);
          if (!found) return;
          tripToExport = found;
        } else {
          tripToExport = {
            id: `trip_${Date.now()}`,
            title: state.title,
            days: state.days,
            startDate: state.startDate,
            endDate: state.endDate,
            dateMode: state.dateMode,
            dayStartTime: state.dayStartTime,
            dayEndTime: state.dayEndTime,
            showFlights: state.showFlights,
            arrivalFlight: state.arrivalFlight,
            departureFlight: state.departureFlight,
            travelMode: state.travelMode,
            dailyBudget: state.dailyBudget,
            strictBudget: state.strictBudget,
            avoidClosedHours: state.avoidClosedHours,
            places: state.places,
            hotels: state.hotels,
            missingPlaces: state.missingPlaces,
            categoryDurations: state.categoryDurations,
            categoryConfigs: state.categoryConfigs,
            customBuffers: state.customBuffers,
            dayTitles: state.dayTitles,
            optimizedRoutes: state.optimizedRoutes,
            savedAt: Date.now(),
          };
        }

        const exportPayload: TripExportFile = {
          version: 1,
          app: "RE-ROUTE",
          exportedAt: new Date().toISOString(),
          trip: tripToExport,
        };

        const jsonStr = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const sanitizedTitle = (tripToExport.title || "Trip")
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, "_");
        const dateStr = format(new Date(), "yyyy-MM-dd");
        a.download = `RE-ROUTE_${sanitizedTitle}_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },

      exportTripAsExcel: async (tripId?: string) => {
        const state = get();
        let tripToExport: ItinerarySnapshot;
        if (tripId) {
          const found = state.savedTrips.find((t) => t.id === tripId);
          if (!found) return;
          tripToExport = found;
        } else {
          tripToExport = {
            id: `trip_${Date.now()}`,
            title: state.title,
            days: state.days,
            startDate: state.startDate,
            endDate: state.endDate,
            dateMode: state.dateMode,
            dayStartTime: state.dayStartTime,
            dayEndTime: state.dayEndTime,
            showFlights: state.showFlights,
            arrivalFlight: state.arrivalFlight,
            departureFlight: state.departureFlight,
            travelMode: state.travelMode,
            dailyBudget: state.dailyBudget,
            strictBudget: state.strictBudget,
            avoidClosedHours: state.avoidClosedHours,
            places: state.places,
            hotels: state.hotels,
            missingPlaces: state.missingPlaces,
            categoryDurations: state.categoryDurations,
            categoryConfigs: state.categoryConfigs,
            customBuffers: state.customBuffers,
            dayTitles: state.dayTitles,
            optimizedRoutes: state.optimizedRoutes,
            savedAt: Date.now(),
          };
        }

        const { exportTripToExcel } = await import("../services/excelExportService");
        await exportTripToExcel(tripToExport, {
          distanceUnit: state.distanceUnit,
          timeFormat: state.timeFormat,
        });
      },

      importTripFromJson: (jsonString: string) => {
        try {
          const parsed = JSON.parse(jsonString);
          let trip: ItinerarySnapshot | null = null;

          if (parsed && typeof parsed === "object") {
            if (parsed.trip && typeof parsed.trip === "object") {
              trip = parsed.trip as ItinerarySnapshot;
            } else if (parsed.state && typeof parsed.state === "object") {
              trip = parsed.state as ItinerarySnapshot;
            } else if (Array.isArray(parsed.places) || typeof parsed.title === "string") {
              trip = parsed as ItinerarySnapshot;
            }
          }

          if (!trip || (!Array.isArray(trip.places) && typeof trip.days !== "number" && !trip.title)) {
            return {
              success: false,
              error: "Invalid file format. Please upload a valid RE-ROUTE trip JSON file.",
            };
          }

          // Apply default fallbacks
          const snapshot: ItinerarySnapshot = {
            id: trip.id || `trip_${Date.now()}`,
            title: trip.title || "Imported Trip",
            days: typeof trip.days === "number" && trip.days > 0 ? trip.days : 3,
            startDate: trip.startDate || format(new Date(), "yyyy-MM-dd"),
            endDate: trip.endDate || format(addDays(new Date(), 2), "yyyy-MM-dd"),
            dateMode: trip.dateMode || "duration",
            dayStartTime: trip.dayStartTime || "09:00",
            dayEndTime: trip.dayEndTime || "21:00",
            showFlights: Boolean(trip.showFlights),
            arrivalFlight: trip.arrivalFlight || null,
            departureFlight: trip.departureFlight || null,
            travelMode: trip.travelMode || "driving",
            dailyBudget: trip.dailyBudget ?? 720,
            strictBudget: trip.strictBudget ?? true,
            avoidClosedHours: trip.avoidClosedHours ?? true,
            places: Array.isArray(trip.places) ? trip.places : [],
            hotels: Array.isArray(trip.hotels) ? trip.hotels : [],
            missingPlaces: Array.isArray(trip.missingPlaces) ? trip.missingPlaces : [],
            categoryDurations:
              trip.categoryDurations ||
              ALL_CATEGORIES.reduce(
                (acc, cat) => ({
                  ...acc,
                  [cat]: CATEGORY_DEFAULTS[cat]?.duration || 60,
                }),
                {} as Record<PlaceCategory, number>,
              ),
            categoryConfigs:
              trip.categoryConfigs ||
              ALL_CATEGORIES.reduce(
                (acc, cat) => ({
                  ...acc,
                  [cat]: CATEGORY_DEFAULTS[cat] || {},
                }),
                {} as Record<PlaceCategory, CategoryConfig>,
              ),
            customBuffers: Array.isArray(trip.customBuffers) ? trip.customBuffers : [],
            dayTitles: trip.dayTitles && typeof trip.dayTitles === "object" ? trip.dayTitles : {},
            optimizedRoutes: Array.isArray(trip.optimizedRoutes)
              ? trip.optimizedRoutes
              : [],
            savedAt: trip.savedAt || Date.now(),
          };

          get().applyTripSnapshot(snapshot);
          return { success: true, tripTitle: snapshot.title };
        } catch (err: any) {
          console.error("Failed to parse trip JSON:", err);
          return {
            success: false,
            error: err?.message || "Failed to parse JSON file.",
          };
        }
      },

      deleteTrip: (id) =>
        set((state) => ({
          savedTrips: state.savedTrips.filter((t) => t.id !== id),
        })),
    }),
    {
      name: "reroute-storage",
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        title: state.title,
        days: state.days,
        startDate: state.startDate,
        endDate: state.endDate,
        dateMode: state.dateMode,
        dayStartTime: state.dayStartTime,
        dayEndTime: state.dayEndTime,
        showFlights: state.showFlights,
        arrivalFlight: state.arrivalFlight,
        departureFlight: state.departureFlight,
        travelMode: state.travelMode,
        dailyBudget: state.dailyBudget,
        strictBudget: state.strictBudget,
        avoidClosedHours: state.avoidClosedHours,
        customBuffers: state.customBuffers,
        dayTitles: state.dayTitles,
        places: state.places,
        hotels: state.hotels,
        missingPlaces: state.missingPlaces,
        categoryDurations: state.categoryDurations,
        categoryConfigs: state.categoryConfigs,
        optimizedRoutes: state.optimizedRoutes,
        savedTrips: state.savedTrips,
        appMode: state.appMode,
        theme: state.theme,
        showImages: state.showImages,
        distanceUnit: state.distanceUnit,
        timeFormat: state.timeFormat,
        mockData: state.mockData,
        realData: state.realData,
      }),
    },
  ),
);

