const storage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
  writable: true,
  configurable: true,
});

async function main() {
  const { useRouteStore } = await import("../src/store/useRouteStore");
  const { Place } = await import("../src/types");

console.log("=== Testing Filtered Dev AI Regeneration Logic ===");

const mockPlaces: Place[] = [
  {
    id: "p1",
    name: "Sushi Dai",
    category: "restaurant",
    description: "Great sushi",
    descriptionSource: "ai",
    address: "Toyosu, Tokyo",
    coordinates: { lat: 35.64, lng: 139.79 },
    dayIndex: null,
    orderInDay: 0,
    pinnedToDay: false,
    isDisabled: false,
  },
  {
    id: "p2",
    name: "Tonkatsu Maisen",
    category: "restaurant",
    description: "My personal favorite pork cutlet",
    descriptionSource: "user", // Protected user description!
    address: "Shibuya, Tokyo",
    coordinates: { lat: 35.66, lng: 139.71 },
    dayIndex: 0,
    orderInDay: 0,
    pinnedToDay: false,
    isDisabled: false,
  },
  {
    id: "p3",
    name: "Tokyo National Museum",
    category: "museum",
    description: "Old museum",
    descriptionSource: "ai",
    address: "Ueno, Tokyo",
    coordinates: { lat: 35.71, lng: 139.77 },
    dayIndex: 1,
    orderInDay: 0,
    pinnedToDay: false,
    isDisabled: false,
  },
  {
    id: "p4",
    name: "Ramen Street",
    category: "restaurant",
    description: "Ramen spots",
    descriptionSource: "ai",
    address: "Tokyo Station",
    coordinates: { lat: 35.68, lng: 139.76 },
    dayIndex: 0,
    orderInDay: 1,
    pinnedToDay: false,
    isDisabled: true, // Excluded
  },
];

// Set places in store
useRouteStore.setState({ places: mockPlaces });

// 1. Initial State: No filters
let state = useRouteStore.getState();
console.log("1. Initial state filteredPlaceIds:", state.filteredPlaceIds);
console.log("   Initial activeFilterCategory:", state.activeFilterCategory);
console.log("   Initial hasActiveFilter:", state.hasActiveFilter);

// Candidate places when filteredPlaceIds === null
let candidatePlaces = state.filteredPlaceIds !== null
  ? state.places.filter((p) => state.filteredPlaceIds!.includes(p.id))
  : state.places;
let targetPlaces = candidatePlaces.filter((p) => p.descriptionSource !== "user");
console.log(`   Default view candidate count: ${candidatePlaces.length}, target count: ${targetPlaces.length}`);
if (targetPlaces.length !== 3) throw new Error("Expected 3 non-user places in default view");

// 2. Filter: Category Restaurant only (active places: p1)
const restaurantIds = ["p1", "p2"]; // Suppose user is on Category: Restaurant, tab: Active
state.setFilteredPlacesState({
  ids: restaurantIds,
  hasActiveFilter: true,
  category: "restaurant",
  filterDescription: "Restaurant",
});

state = useRouteStore.getState();
console.log("\n2. Filtered by Restaurant:");
console.log("   hasActiveFilter:", state.hasActiveFilter);
console.log("   activeFilterCategory:", state.activeFilterCategory);
console.log("   activeFilterDescription:", state.activeFilterDescription);

candidatePlaces = state.filteredPlaceIds !== null
  ? state.places.filter((p) => state.filteredPlaceIds!.includes(p.id))
  : state.places;
targetPlaces = candidatePlaces.filter((p) => p.descriptionSource !== "user");

console.log(`   Candidate places (${candidatePlaces.length}):`, candidatePlaces.map((p) => p.name));
console.log(`   Target places (${targetPlaces.length}) [user-written excluded]:`, targetPlaces.map((p) => p.name));

if (candidatePlaces.length !== 2) throw new Error("Expected 2 candidate restaurant places");
if (targetPlaces.length !== 1 || targetPlaces[0].id !== "p1") {
  throw new Error("Expected only Sushi Dai (p1) to be targeted for regeneration; Maisen is user-written!");
}

// 3. Filter: Museum only
state.setFilteredPlacesState({
  ids: ["p3"],
  hasActiveFilter: true,
  category: "museum",
  filterDescription: "Museum",
});

state = useRouteStore.getState();
candidatePlaces = state.filteredPlaceIds !== null
  ? state.places.filter((p) => state.filteredPlaceIds!.includes(p.id))
  : state.places;
targetPlaces = candidatePlaces.filter((p) => p.descriptionSource !== "user");
console.log("\n3. Filtered by Museum:");
console.log(`   Target places (${targetPlaces.length}):`, targetPlaces.map((p) => p.name));
if (targetPlaces.length !== 1 || targetPlaces[0].id !== "p3") {
  throw new Error("Expected only Tokyo National Museum (p3) to be targeted");
}

// 4. Filter: Tab Excluded (p4)
state.setFilteredPlacesState({
  ids: ["p4"],
  hasActiveFilter: true,
  category: "all",
  filterDescription: "Excluded",
});

state = useRouteStore.getState();
candidatePlaces = state.filteredPlaceIds !== null
  ? state.places.filter((p) => state.filteredPlaceIds!.includes(p.id))
  : state.places;
targetPlaces = candidatePlaces.filter((p) => p.descriptionSource !== "user");
console.log("\n4. Filtered by Excluded tab:");
console.log(`   Target places (${targetPlaces.length}):`, targetPlaces.map((p) => p.name));
if (targetPlaces.length !== 1 || targetPlaces[0].id !== "p4") {
  throw new Error("Expected only Ramen Street (p4) to be targeted");
}

// 5. Filter: Empty match (e.g. search query matches nothing)
state.setFilteredPlacesState({
  ids: [],
  hasActiveFilter: true,
  category: "all",
  filterDescription: 'Search "NonExistentPlace"',
});

state = useRouteStore.getState();
candidatePlaces = state.filteredPlaceIds !== null
  ? state.places.filter((p) => state.filteredPlaceIds!.includes(p.id))
  : state.places;
targetPlaces = candidatePlaces.filter((p) => p.descriptionSource !== "user");
console.log("\n5. Filtered with no matches:");
console.log(`   Candidate count: ${candidatePlaces.length}, target count: ${targetPlaces.length}`);
if (candidatePlaces.length !== 0 || targetPlaces.length !== 0) {
  throw new Error("Expected 0 candidate and 0 target places when filter matches nothing");
}

// 6. Reset on unmount
state.setFilteredPlacesState({
  ids: null,
  hasActiveFilter: false,
  category: "all",
  filterDescription: null,
});

state = useRouteStore.getState();
console.log("\n6. Reset on unmount:");
console.log("   filteredPlaceIds is null:", state.filteredPlaceIds === null);
console.log("   hasActiveFilter is false:", state.hasActiveFilter === false);

console.log("\n=== ALL UNIT TESTS PASSED SUCCESSFULLY! ===");
}

main().catch(console.error);
