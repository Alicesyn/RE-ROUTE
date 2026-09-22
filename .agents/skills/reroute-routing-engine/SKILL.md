---
name: reroute-routing-engine
description: >-
  Use this skill whenever working on route optimization, the Traveling Salesperson Problem (TSP) solver,
  multi-day clustering, time budget calculations, flight deadline constraints, or distance/time estimation in RE-ROUTE.
---

# RE-ROUTE Routing & Itinerary Engine

This skill guides development and debugging of the core routing algorithms, itinerary scheduling, and multi-day clustering in RE-ROUTE.

## Core Architectural Components

- **`src/services/tspSolver.ts`**: The algorithmic heart of RE-ROUTE:
  - `solveTSP`: Multi-day optimizer. Clusters places across days, enforces strict/soft time budgets, handles arrival/departure flight anchors, and calls `solveSingleDay`.
  - `clusterPlaces`: Distributes unassigned places across days based on geographic proximity to day anchors (hotels or airport flights) while respecting daily available minutes and category limits.
  - `solveSingleDay`: Solves TSP for a single day using 2-opt heuristic when unconstrained, or preserves user's `manualSequence` when manually reordered.
  - `fetchAccurateRouteTimes`: Enriches routes with Google Maps Directions API segments or falls back to haversine/walking/transit formulas.
- **`src/utils/distance.ts`**:
  - `getDistance`: Haversine formula distance between coordinates (in km).
  - `estimateTime`: Estimated travel duration in seconds based on travel mode (`walking`, `transit`, `driving`).
- **`src/utils/timeUtils.ts`**: Schedule conflict detection, opening hours validation, and visit duration formatting.

---

## Critical Routing Rules & Invariants

1. **Excluded / Disabled Places (`isDisabled: true`)**:
   - Disabled places MUST NEVER be passed to `solveTSP` or `solveSingleDay`.
   - Always filter with `places.filter(p => !p.isDisabled)` before solving or scheduling.
2. **Pinned Places (`pinnedToDay: true`)**:
   - When user pins a place to Day `N`, the clustering algorithm in `clusterPlaces` MUST NOT move it to another day.
   - Pinned places take priority in daily time budget consumption.
3. **Flight Anchor Constraints**:
   - Day 1: If `showFlights` is enabled and `arrivalFlight` exists, Day 1 starts at `arrivalFlight.location` after `arrivalFlight.time + buffer`.
   - Last Day: If `showFlights` is enabled and `departureFlight` exists, the day must terminate at `departureFlight.location` before `departureFlight.time - buffer`.
   - On flight days, budget eviction is strictly enforced so travelers never miss their flights.
4. **Hotel Anchors**:
   - Each day starts at `startHotel` and ends at `endHotel`. If no hotel is set, route calculates between stops without hotel penalty.
5. **Manual Sequence Preservation**:
   - If a day route has `manualSequence` defined (user manually dragged stops in `DailySchedule`), `solveSingleDay` MUST preserve that exact stop order and only recompute segments and times.

---

## Verification & Testing

Whenever you modify routing algorithms:

1. Run `npm run build` to verify type safety.
2. Verify with edge cases:
   - 0 places (solver should exit gracefully).
   - 1 place with hotel.
   - All places disabled.
   - More places than can fit within daily budgets (verify `unassignedPlaces` handling).
   - Overnight time range (e.g., 20:00 to 02:00).
3. Do **NOT** run in-browser testing or launch browser subagents to confirm changes unless explicitly requested by the user (conserves API quota).
