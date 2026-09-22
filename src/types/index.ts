export type PlaceCategory =
  | "museum"
  | "restaurant"
  | "coffee_shop"
  | "park"
  | "landmark"
  | "shopping"
  | "entertainment"
  | "beach"
  | "religious_site"
  | "nightlife"
  | "other";

export interface CategoryDayOverride {
  minPerDay?: number | null;
  maxPerDay?: number | null;
}

export interface CategoryConfig {
  minPerDay?: number | null;
  maxPerDay?: number | null;
  minTimeBetween?: number | null; // Minimum minutes between visits of this category (e.g. 180 for restaurant)
  firstDayOverride?: CategoryDayOverride;
  lastDayOverride?: CategoryDayOverride;
  customDayOverrides?: Record<number, CategoryDayOverride>;
}

export interface PlaceHighlight {
  label: string; // e.g., "Must-Try", "Best Photo Spot", "Best Time to Go", "Pro Tip"
  text: string;  // e.g., "Signature tonkotsu ramen with seasoned egg", "View from east observation deck at sunset"
}

export type ReservationRequirement =
  | "required"
  | "recommended"
  | "not_needed"
  | "walk_ins_only";

export interface ReservationInfo {
  requirement: ReservationRequirement;
  advanceTime?: string; // e.g. "Reserve 1 month in advance", "Opens 30 days prior at midnight", "Walk-ins only, peak wait 30m"
  notes?: string;       // e.g. "Online ticket lottery", "Via TableCheck/Tabelog"
  isBooked?: boolean;   // Whether the reservation has been confirmed/completed
  bookingUrl?: string;  // Direct booking link (e.g. TableCheck, Klook, official ticket URL)
  confirmationNumber?: string; // Optional booking reference / confirmation code
}

export interface Place {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  description: string;
  descriptionSource: "user" | "ai" | "mock";
  category: PlaceCategory;
  estimatedDuration: number; // minutes
  dayIndex: number | null; // 0-indexed day
  orderInDay: number | null;
  pinnedToDay: boolean; // true if user manually assigned to a day; optimizer won't move pinned places
  notes?: string;
  openingHours?: string[]; // e.g. ["Monday: 9:00 AM – 5:00 PM", ...]
  unfeasibleReason?: string;
  editorialSummary?: string; // Fallback description from Google Maps
  photoUrl?: string;
  isDisabled?: boolean; // If true, excluded from routing/schedule but kept in reserve
  romanizedName?: string; // English/romanized transliteration for foreign script names
  highlight?: PlaceHighlight; // Contextual highlight (Must-Try for restaurants, Photo Spot, Advice, etc.)
  googlePlaceId?: string; // Original Google Maps Place ID for deduplication and syncing
  priceEstimate?: string; // Estimated cost per person or admission (e.g. "Free", "$15 - $25", "¥800")
  reservation?: ReservationInfo; // Reservation requirements and advance booking timing
  customTime?: string; // Optional locked arrival/reservation time in "HH:mm" format (e.g. "13:30", "19:00")
  isStarred?: boolean; // If true, optimizer will force this place into the schedule (never leave unassigned)
  dismissedDuplicate?: boolean; // If true, user manually removed/dismissed the duplicate flag for this place
  allowedDayRanges?: DayRangeConstraint[]; // Multiple disjoint day range constraints (e.g., Oct 3–6 AND Oct 9–12)
  allowedTimeRange?: TimeRangeConstraint; // User-defined scheduling time window (e.g., only visit between 7 AM – 5 PM)
  addedAt?: number; // Unix timestamp (ms) when place was added/saved
}

export interface TimeRangeConstraint {
  startTime: string; // "HH:mm" format (e.g. "07:00")
  endTime: string;   // "HH:mm" format (e.g. "17:00")
}

export interface DayRangeConstraint {
  startDay: number; // 0-indexed day index (e.g. 0 for Day 1)
  endDay: number;   // 0-indexed day index (e.g. 6 for Day 7)
}

export interface Hotel {
  dayIndex: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export type TravelMode = "walking" | "transit" | "driving";

export interface CustomBuffer {
  id: string; // e.g. "custom-buffer-1712345678"
  dayIndex: number;
  duration: number; // in minutes
  label?: string;
}

export interface TransitLegBreakdown {
  walkToStationMin?: number;
  trainMin?: number;
  walkFromStationMin?: number;
  totalMin?: number;
  summary?: string;
}

export interface RouteSegment {
  distance: number;
  time: number; // in seconds (active time used in routing & schedule)
  travelMode: TravelMode;
  isHeuristic?: boolean;
  heuristicReason?: string;
  customDuration?: number; // in seconds, set when user customizes transit time
  originalTime?: number; // in seconds, original calculated/estimated duration
  fromId?: string; // ID of the origin place/hotel/flight
  toId?: string; // ID of the destination place/hotel/flight
  transitUrl?: string; // Link to official timetable (e.g., Ekispert roote.ekispert.net)
  stationFrom?: string; // Origin nearest transit station name
  stationTo?: string; // Destination nearest transit station name
  transitDetails?: TransitLegBreakdown;
}

export interface DayRoute {
  day: number;
  title?: string;
  startHotel: Hotel | null;
  endHotel: Hotel | null;
  stops: Place[];
  segments: RouteSegment[];
  totalDistance: number; // in meters
  totalTime: number; // in seconds (travel only)
  totalVisitTime: number; // in seconds (visit durations)
  manualSequence?: Array<string>; // IDs of stops, hotels, and flights in order
}

export interface OptimizationResult {
  success: boolean;
  days: DayRoute[];
  totalDistance: number;
  totalTime: number;
  unassignedPlaces?: Place[];
}

export interface ItinerarySnapshot {
  id: string;
  title: string;
  days: number;
  startDate?: string;
  endDate?: string;
  dateMode?: "fixed" | "duration";
  dayStartTime?: string;
  dayEndTime?: string;
  showFlights?: boolean;
  arrivalFlight?: {
    time: string;
    buffer: number;
    location: Place | null;
  } | null;
  departureFlight?: {
    time: string;
    buffer: number;
    location: Place | null;
  } | null;
  travelMode: TravelMode;
  dailyBudget?: number;
  strictBudget?: boolean;
  avoidClosedHours?: boolean;
  places: Place[];
  hotels: Hotel[];
  missingPlaces?: string[];
  categoryDurations?: Record<PlaceCategory, number>;
  categoryConfigs?: Record<PlaceCategory, CategoryConfig>;
  customBuffers?: CustomBuffer[];
  dayTitles?: Record<number, string>;
  exemptDays?: number[];
  customTransitTimes?: Record<string, number>;
  optimizedRoutes: DayRoute[];
  savedAt: number;
  cloudId?: string; // ID in Supabase trips table
  version?: number; // Monotonic counter for cross-device sync
  updatedAt?: number; // Last remote modification timestamp
  isCloudSynced?: boolean;
  isQuickSave?: boolean;
  quickSaveUserEmail?: string;
}

export interface TripExportFile {
  version: 1;
  app: "RE-ROUTE";
  exportedAt: string;
  trip: ItinerarySnapshot;
}

export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface CloudTripRecord {
  id: string;
  user_id: string;
  title: string;
  data: ItinerarySnapshot;
  version: number;
  created_at: string;
  updated_at: string;
}

