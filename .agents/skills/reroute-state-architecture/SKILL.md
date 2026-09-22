---
name: reroute-state-architecture
description: >-
  Use this skill whenever modifying the Zustand store (useRouteStore.ts), data types (src/types/index.ts),
  IndexedDB persistence, PTV (Places To Visit) lifecycle, trip saving/loading, or JSON export/import in RE-ROUTE.
---

# RE-ROUTE State & Data Architecture

This skill guides modifications to RE-ROUTE's central state store, data types, and persistence layer.

## Core State Files

- **`src/types/index.ts`**: TypeScript definitions for `Place`, `Hotel`, `DayRoute`, `RouteSegment`, `ItinerarySnapshot`, `TripExportFile`, and `CategoryConfig`.
- **`src/store/useRouteStore.ts`**: Main Zustand store with custom `idbStorage` adapter using `idb-keyval`.

---

### 1. Place Interface Structure

```typescript
export interface PlaceHighlight {
  text: string;
  source?: "ai" | "mock" | "user";
}

export interface ReservationInfo {
  required: boolean;
  recommended?: boolean;
  bookingWindow?: string; // e.g. "1 month in advance", "2 days before at 9 AM"
  reservationUrl?: string;
  notes?: string;
  source?: "ai" | "mock" | "user";
}

export interface Place {
  id: string;
  name: string;
  romanizedName?: string;
  address: string;
  lat: number;
  lng: number;
  description: string;
  descriptionSource: "user" | "ai" | "mock";
  priceEstimate?: string; // e.g. "Free", "$15 - $30 / ¥2,000 - ¥4,000"
  highlight?: PlaceHighlight; // ultra-specific must-try item/stall/photo spot
  reservation?: ReservationInfo;
  category: PlaceCategory;
  estimatedDuration: number; // in minutes
  dayIndex: number | null; // 0-indexed day, or null if unassigned
  orderInDay: number | null; // sequence in the day
  pinnedToDay: boolean; // user manually locked to day; optimizer will not move
  isDisabled?: boolean; // excluded from routing/schedule but saved in list
  notes?: string;
  openingHours?: string[];
  photoUrl?: string;
  unfeasibleReason?: string;
}
```

### 2. Description & Highlight Preservation Invariants

- **User-Authored Content Protection**: If `place.descriptionSource === "user"`, automated features (AI batch description, Regenerate All AI) **must not overwrite** the user's custom description.
- **Specific Highlights Requirement**: Highlights must be hyper-specific (e.g. signature dish names like _"Tsukemen at Fuunji"_, not generic food advice; specific market stall names or building floor like _"Stall #14 for tamagoyaki"_, not just _"try street food"_).
- **Bulk Updates**: Always use `updatePlacesBulk(updates)` when updating multiple places at once to prevent thrashing IndexedDB persistence.

### 3. Place Disabling / Excluding Invariants

- When `togglePlaceDisabled(placeId)` is called:
  - If disabling: If the place was assigned to a day (`dayIndex !== null`), it is unassigned and the remaining route for that day is immediately re-solved. `dayIndex` and `orderInDay` become `null`, `pinnedToDay` becomes `false`.
  - If enabling: `isDisabled` is set to `false`, placing it back into the active unassigned pool.
- If a user manually assigns an excluded place to a day (`assignPlaceToDay`), the store automatically clears `isDisabled` to `false`.

### 4. Dual-Mode Data Architecture

- The store tracks both `mockData` and `realData`.
- When user toggles `appMode` (`real` vs `mock`), the active itinerary swaps cleanly without data corruption.

### 5. Trip Snapshots & Export/Import

- Saved trips are stored in `savedTrips: ItinerarySnapshot[]`.
- JSON export files wrap the snapshot in `TripExportFile` (versioned format).
- When applying a snapshot (`applyTripSnapshot`), ensure both `places` and `optimizedRoutes` are hydrated properly.

---

## Modifying the Store: Best Practices

1. **Async Route Recalculation**:
   - Actions that affect day routes (`assignPlaceToDay`, `unassignPlace`, `optimizeDay`, `togglePlaceDisabled`) are asynchronous.
   - Always wrap in `try/finally` or ensure `isCalculating: false` is set on errors so loading spinners don't freeze.
2. **Persistence Throttling**:
   - State persistence runs through `idbStorage` (`idb-keyval`).
   - Avoid dispatching hundreds of single-item updates in a loop; use `updatePlacesBulk` instead.
3. **Always Run Build Validation**:
   - Run `npm run build` after store edits to guarantee zero TypeScript or interface mismatch regressions.
4. **No In-Browser Testing**:
   - Do **NOT** perform in-browser testing or spawn browser subagents to confirm state changes unless specifically requested by the user.
