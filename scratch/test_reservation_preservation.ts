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

  console.log("=== Testing Reservation Preservation During AI Updates ===");

  const initialPlace: any = {
    id: "rest-1",
    name: "Sukiyabashi Jiro",
    category: "restaurant",
    address: "Ginza, Tokyo",
    coordinates: { lat: 35.67, lng: 139.76 },
    dayIndex: 0,
    orderInDay: 0,
    pinnedToDay: true,
    isDisabled: false,
    reservation: {
      requirement: "required",
      advanceTime: "Reserve 1 month ahead",
      notes: "Booked table at 6pm",
      isBooked: true,
      bookingUrl: "https://omakase.in/jiro",
      confirmationNumber: "CONF-12345",
      whosInterested: "Alice, Bob",
    },
  };

  useRouteStore.setState({ places: [initialPlace] });

  let place = useRouteStore.getState().places[0];
  console.log("1. Initial Place Reservation:", place.reservation);
  if (!place.reservation?.isBooked) throw new Error("Expected initial place to be booked");
  if (place.reservation?.confirmationNumber !== "CONF-12345") throw new Error("Expected confirmation number");

  // Simulate AI Describe / Regenerate AI payload (which has no isBooked or bookingUrl)
  console.log("\n2. Simulating AI Describe / Regenerate update...");
  useRouteStore.getState().updatePlacesBulk([
    {
      id: "rest-1",
      updates: {
        description: "World famous 3-star sushi restaurant",
        descriptionSource: "ai",
        reservation: {
          requirement: "required",
          advanceTime: "Opens 1st of month at 9am JST",
        },
      },
    },
  ]);

  place = useRouteStore.getState().places[0];
  console.log("   Updated Place Reservation:", place.reservation);

  if (place.reservation?.isBooked !== true) {
    throw new Error("FAILED: isBooked was wiped out by AI describe!");
  }
  if (place.reservation?.confirmationNumber !== "CONF-12345") {
    throw new Error("FAILED: confirmationNumber was wiped out by AI describe!");
  }
  if (place.reservation?.bookingUrl !== "https://omakase.in/jiro") {
    throw new Error("FAILED: bookingUrl was wiped out by AI describe!");
  }
  if (place.reservation?.whosInterested !== "Alice, Bob") {
    throw new Error("FAILED: whosInterested was wiped out by AI describe!");
  }
  if (place.reservation?.advanceTime !== "Opens 1st of month at 9am JST") {
    throw new Error("FAILED: advanceTime was not updated!");
  }
  console.log("   SUCCESS: isBooked, confirmationNumber, bookingUrl, whosInterested preserved!");

  // Simulate user explicitly unchecking the reservation in Reservations Hub
  console.log("\n3. Simulating user explicitly unchecking reservation (isBooked: false)...");
  await useRouteStore.getState().updatePlace("rest-1", {
    reservation: {
      ...place.reservation,
      isBooked: false,
    },
  });

  place = useRouteStore.getState().places[0];
  console.log("   Place Reservation after unchecking:", place.reservation);
  if (place.reservation?.isBooked !== false) {
    throw new Error("FAILED: Explicit unchecking failed!");
  }
  console.log("   SUCCESS: Explicit unchecking worked as expected!");

  // Simulate user re-checking reservation
  console.log("\n4. Simulating user explicitly re-checking reservation (isBooked: true)...");
  await useRouteStore.getState().updatePlace("rest-1", {
    reservation: {
      ...place.reservation,
      isBooked: true,
    },
  });

  place = useRouteStore.getState().places[0];
  if (place.reservation?.isBooked !== true) {
    throw new Error("FAILED: Explicit re-checking failed!");
  }
  console.log("   SUCCESS: Explicit re-checking worked!");

  console.log("\n=== ALL RESERVATION PRESERVATION TESTS PASSED! ===");
}

main().catch(console.error);
