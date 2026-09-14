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

export interface RouteSegment {
  distance: number;
  time: number;
  travelMode: TravelMode;
  isHeuristic?: boolean;
  heuristicReason?: string;
}

export interface DayRoute {
  day: number;
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
  optimizedRoutes: DayRoute[];
  savedAt: number;
}

export interface TripExportFile {
  version: 1;
  app: "RE-ROUTE";
  exportedAt: string;
  trip: ItinerarySnapshot;
}

