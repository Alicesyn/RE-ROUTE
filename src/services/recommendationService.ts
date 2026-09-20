import { Place, Hotel, PlaceCategory } from "../types";
import { searchPlaces } from "./mapsService";
import { getDistance } from "../utils/distance";
import { isDuplicatePlace } from "../utils/duplicateUtils";
import { suggestSights } from "./aiService";
import {
  getSpecificMockHighlight,
  getSpecificMockPrice,
  getSpecificMockReservation,
} from "../utils/mockAiUtils";

// Curated top sights for Kyoto
const KYOTO_SIGHTS = [
  {
    id: "rec_kyoto_fushimi",
    name: "Fushimi Inari Taisha",
    address: "68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto",
    lat: 34.9671,
    lng: 135.7727,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 120,
    description: "Famous for thousands of vermilion torii gates, winding mountain trails, and sacred fox statues.",
    types: ["tourist_attraction", "place_of_worship"],
    photoUrl: "https://loremflickr.com/800/600/kyoto,temple",
    priceEstimate: "Free",
    highlight: { label: "Scenic Spot", text: "Senbon Torii path just past Okusha shrine where crowds thin out" },
    reservation: { requirement: "not_needed" as const, advanceTime: "No reservation needed" },
  },
  {
    id: "rec_kyoto_kinkaku",
    name: "Kinkaku-ji (Golden Pavilion)",
    address: "1 Kinkakujicho, Kita Ward, Kyoto",
    lat: 35.0394,
    lng: 135.7292,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 60,
    description: "Breathtaking Zen temple covered in brilliant gold leaf, reflecting beautifully across a mirror pond.",
    types: ["tourist_attraction", "temple"],
    photoUrl: "https://loremflickr.com/800/600/kyoto,pavilion",
    priceEstimate: "¥500",
    highlight: { label: "Best Photo Spot", text: "Mirror pond vantage directly facing the golden reliquary hall" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Purchase tickets on-site at entrance" },
  },
  {
    id: "rec_kyoto_gion",
    name: "Gion District",
    address: "Gionmachi Minamigawa, Higashiyama Ward, Kyoto",
    lat: 35.0037,
    lng: 135.7782,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 90,
    description: "Kyoto's historic geisha district filled with traditional wooden machiya merchant houses and teahouses.",
    types: ["tourist_attraction", "neighborhood"],
    photoUrl: "https://loremflickr.com/800/600/kyoto,geisha",
    priceEstimate: "Free",
    highlight: { label: "Best Walk", text: "Shirakawa canal stone path at twilight when lanterns illuminate" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Public historic preservation district" },
  },
  {
    id: "rec_kyoto_arashiyama",
    name: "Arashiyama Bamboo Grove",
    address: "Arashiyama, Ukyo Ward, Kyoto",
    lat: 35.0156,
    lng: 135.6715,
    category: "park" as PlaceCategory,
    estimatedDuration: 75,
    description: "A serene and towering bamboo forest with sunlight filtering through stalks and pleasant walking paths.",
    types: ["tourist_attraction", "natural_feature"],
    photoUrl: "https://loremflickr.com/800/600/kyoto,bamboo",
    priceEstimate: "Free",
    highlight: { label: "Best Time to Visit", text: "Early morning before 8:00 AM for peaceful photos without tour groups" },
    reservation: { requirement: "not_needed" as const, advanceTime: "No reservation needed" },
  },
  {
    id: "rec_kyoto_kiyomizu",
    name: "Kiyomizu-dera Temple",
    address: "1-294 Kiyomizu, Higashiyama Ward, Kyoto",
    lat: 34.9949,
    lng: 135.7850,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 90,
    description: "Historic temple famed for its massive wooden stage offering panoramic views of Kyoto without using any nails.",
    types: ["tourist_attraction", "place_of_worship"],
    photoUrl: "https://loremflickr.com/800/600/kyoto,pagoda",
    priceEstimate: "¥400",
    highlight: { label: "Must-See", text: "Main wooden stage for panoramic city views and Otowa waterfall below" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Tickets purchased at entrance gate" },
  },
  {
    id: "rec_kyoto_nishiki",
    name: "Nishiki Market",
    address: "Nakagyo Ward, Kyoto",
    lat: 35.0050,
    lng: 135.7649,
    category: "shopping" as PlaceCategory,
    estimatedDuration: 90,
    description: "A vibrant five-block narrow shopping street packed with over a hundred lively food stalls and shops.",
    types: ["tourist_attraction", "shopping_mall"],
    photoUrl: "https://loremflickr.com/800/600/kyoto,market",
    priceEstimate: "¥1,000 - ¥2,500",
    highlight: { label: "Must-Try", text: "Tako Tamago (baby octopus skewers stuffed with quail egg) and fresh dashi tamagoyaki" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Walk-in food stalls; peak crowds 11 AM - 3 PM" },
  },
];

// Curated top sights for Tokyo
const TOKYO_SIGHTS = [
  {
    id: "rec_tokyo_shibuya",
    name: "Shibuya Crossing",
    address: "Shibuya, Tokyo",
    lat: 35.6595,
    lng: 139.7005,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 45,
    description: "The world's busiest pedestrian scramble crossing, surrounded by massive neon screens and towering skyscrapers.",
    types: ["tourist_attraction", "street"],
    photoUrl: "https://loremflickr.com/800/600/tokyo,shibuya",
    priceEstimate: "Free",
    highlight: { label: "Best Vantage", text: "Sky Edge rooftop corner overlooking the scramble crossing at dusk" },
    reservation: { requirement: "not_needed" as const, advanceTime: "No reservation needed" },
  },
  {
    id: "rec_tokyo_sensoji",
    name: "Senso-ji Temple",
    address: "2-3-1 Asakusa, Taito City, Tokyo",
    lat: 35.7148,
    lng: 139.7967,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 90,
    description: "Tokyo's oldest and most iconic Buddhist temple, reached via the historic Nakamise shopping street.",
    types: ["tourist_attraction", "place_of_worship"],
    photoUrl: "https://loremflickr.com/800/600/tokyo,sensoji",
    priceEstimate: "Free",
    highlight: { label: "Must-Try", text: "Fresh jumbo melonpan from Kagetsudo and warm age-manju along Nakamise-dori" },
    reservation: { requirement: "not_needed" as const, advanceTime: "No reservation needed for grounds" },
  },
  {
    id: "rec_tokyo_skytree",
    name: "Tokyo Skytree",
    address: "1-1-2 Oshiage, Sumida City, Tokyo",
    lat: 35.7101,
    lng: 139.8107,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 120,
    description: "Futuristic broadcasting tower and observation deck offering breathtaking views extending all the way to Mt. Fuji.",
    types: ["tourist_attraction", "observation_deck"],
    photoUrl: "https://loremflickr.com/800/600/tokyo,skytree",
    priceEstimate: "¥2,100 - ¥3,100",
    highlight: { label: "Best Photo Spot", text: "Tembo Deck glass floor section at 350m looking straight down" },
    reservation: { requirement: "recommended" as const, advanceTime: "Book online 1-7 days ahead to skip the ticket queue" },
  },
  {
    id: "rec_tokyo_meiji",
    name: "Meiji Jingu Shrine",
    address: "1-1 Yoyogikamizonocho, Shibuya City, Tokyo",
    lat: 35.6764,
    lng: 139.6993,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 75,
    description: "A tranquil Shinto shrine dedicated to Emperor Meiji, nestled deep inside a dense forest in the heart of Tokyo.",
    types: ["tourist_attraction", "place_of_worship"],
    photoUrl: "https://loremflickr.com/800/600/tokyo,meiji",
    priceEstimate: "Free",
    highlight: { label: "Visitor Tip", text: "Tranquil inner garden iris pond and giant cedar Torii gate along the forest walk" },
    reservation: { requirement: "not_needed" as const, advanceTime: "No reservation needed" },
  },
  {
    id: "rec_tokyo_shinjuku",
    name: "Shinjuku Gyoen National Garden",
    address: "11 Naitomachi, Shinjuku City, Tokyo",
    lat: 35.6852,
    lng: 139.7101,
    category: "park" as PlaceCategory,
    estimatedDuration: 90,
    description: "A sprawling city park combining English, French, and traditional Japanese garden designs with peaceful ponds.",
    types: ["tourist_attraction", "park"],
    photoUrl: "https://loremflickr.com/800/600/tokyo,garden",
    priceEstimate: "¥500",
    highlight: { label: "Scenic Spot", text: "Traditional Japanese landscape garden and greenhouse pavilion" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Tickets purchased at ticket vending kiosks" },
  },
  {
    id: "rec_tokyo_akihabara",
    name: "Akihabara Electric Town",
    address: "Sotokanda, Chiyoda City, Tokyo",
    lat: 35.6997,
    lng: 139.7715,
    category: "shopping" as PlaceCategory,
    estimatedDuration: 120,
    description: "The global epicenter of anime, gaming, manga culture, and massive multi-story electronics stores.",
    types: ["tourist_attraction", "neighborhood"],
    photoUrl: "https://loremflickr.com/800/600/tokyo,akihabara",
    priceEstimate: "Free",
    highlight: { label: "Where to Go", text: "Radio Kaikan multi-floor hobby center and retro gaming shops along Chuo Dori" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Stores open around 10:00 - 11:00 AM" },
  },
];

// Generates fallback mock sights for other areas
const getGenericSights = (lat: number, lng: number) => [
  {
    id: "rec_gen_sight1",
    name: "Historic Old Town",
    address: "Central Historic Quarter",
    lat: lat + 0.005,
    lng: lng + 0.008,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 90,
    description: "Quaint historic district with cobblestone alleys, unique local boutiques, and local architecture.",
    types: ["tourist_attraction"],
    photoUrl: "https://loremflickr.com/800/600/historic,architecture",
    priceEstimate: "Free",
    highlight: { label: "Best Vantage", text: "Upper terrace balcony overlooking the grand architectural facade and skyline" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Open public district" },
  },
  {
    id: "rec_gen_sight2",
    name: "Central Botanic Gardens",
    address: "Greenway Parkway",
    lat: lat - 0.008,
    lng: lng + 0.005,
    category: "park" as PlaceCategory,
    estimatedDuration: 75,
    description: "Scenic botanic gardens featuring thousands of plant species, tranquil lakes, and pleasant walking paths.",
    types: ["tourist_attraction", "park"],
    photoUrl: "https://loremflickr.com/800/600/park,nature",
    priceEstimate: "Free",
    highlight: { label: "Best Time to Visit", text: "Early morning before 9:00 AM or golden hour right before sunset" },
    reservation: { requirement: "not_needed" as const, advanceTime: "No reservation needed" },
  },
  {
    id: "rec_gen_sight3",
    name: "City Scenic Overlook",
    address: "Observation Hill",
    lat: lat + 0.008,
    lng: lng - 0.005,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 45,
    description: "A beautiful hillside observation point offering stunning panoramic views of the city skyline.",
    types: ["tourist_attraction", "viewpoint"],
    photoUrl: "https://loremflickr.com/800/600/city,skyline",
    priceEstimate: "Free",
    highlight: { label: "Best Photo Spot", text: "Observation deck pointing west toward the setting sun" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Public viewpoint" },
  },
];

/**
 * Calculates the center point of hotels & places in the itinerary.
 * Returns null if no context is present.
 */
function getItineraryCenter(
  places: Place[],
  hotels: Hotel[],
  flights: (Place | null)[] = []
): { lat: number; lng: number } | null {
  const points: { lat: number; lng: number }[] = [...hotels];
  places.forEach((p) => points.push(p as any));
  flights.forEach((f) => {
    if (f) points.push(f);
  });

  if (points.length === 0) {
    // No context available - return null instead of hardcoded default
    return null;
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);

  lats.sort((a, b) => a - b);
  lngs.sort((a, b) => a - b);

  const medianLat = lats[Math.floor(lats.length / 2)];
  const medianLng = lngs[Math.floor(lngs.length / 2)];

  return { lat: medianLat, lng: medianLng };
}

/**
 * Returns the unique set of hotels (by lat/lng), for querying suggestions per-hotel.
 */
function getUniqueHotels(hotels: Hotel[]): Hotel[] {
  const seen = new Set<string>();
  return hotels.filter((h) => {
    const key = `${h.lat.toFixed(4)}_${h.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Main function to fetch suggested places per hotel, with nearest-hotel attribution.
 */
export async function getSuggestedPlaces(
  places: Place[],
  hotels: Hotel[],
  appMode: "real" | "mock" | "dropdown-mock",
  rejectedNames: string[] = [],
  customAnchor?: { lat: number; lng: number; label: string } | null,
  flights: (Place | null)[] = []
): Promise<(Place & { nearestHotel?: { name: string; distanceM: number } })[]> {
  // Existing place names to filter duplicates
  const existingNames = new Set(places.map((p) => p.name.toLowerCase()));

  const isDuplicate = (name: string, lat: number, lng: number) => {
    return places.some((p) => isDuplicatePlace(p, { name, lat, lng }));
  };

  // Determine anchor points — prefer custom anchor, then unique hotels, then itinerary center
  let anchors: { lat: number; lng: number; label: string }[] = [];

  if (customAnchor) {
    anchors = [customAnchor];
  } else {
    const uniqueHotels = getUniqueHotels(hotels);
    if (uniqueHotels.length > 0) {
      anchors = uniqueHotels.map((h) => ({ lat: h.lat, lng: h.lng, label: h.name }));
    } else {
      const center = getItineraryCenter(places, hotels, flights);
      if (center) {
        anchors = [{ ...center, label: "" }];
      }
    }
  }

  // If no anchor points exist at all (no hotel, place, flight, or custom anchor), don't fetch anything!
  if (anchors.length === 0) {
    return [];
  }

  // Collect all suggestions across all anchor points
  const allSuggestions: any[] = [];
  const seenSuggestionNames = new Set<string>();

  for (const anchor of anchors) {
    const cacheKeyV4 = `re_route_suggestions_v4_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cacheKeyV3 = `re_route_suggestions_v3_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    let candidateSights: any[] = [];

    if (appMode === "real") {
      // Check persistent localStorage first, then sessionStorage (try v4, then fallback to v3)
      const cachedData =
        localStorage.getItem(cacheKeyV4) ||
        sessionStorage.getItem(cacheKeyV4) ||
        localStorage.getItem(cacheKeyV3) ||
        sessionStorage.getItem(cacheKeyV3);

      if (cachedData) {
        try {
          candidateSights = JSON.parse(cachedData);
          const validCached = candidateSights.filter((s) => !isDuplicate(s.name, s.lat, s.lng));
          if (validCached.length < 3) candidateSights = [];
        } catch (e) {
          console.warn("Failed to parse cached suggestions", e);
        }
      }

      if (candidateSights.length === 0) {
        try {
          const aiSuggestions = await suggestSights(anchor.lat, anchor.lng, [
            ...Array.from(existingNames),
            ...rejectedNames,
            ...Array.from(seenSuggestionNames),
          ]);

          const enrichedSuggestions = await Promise.all(
            aiSuggestions.map(async (suggestion, idx) => {
              const fallbackHighlight = suggestion.highlight || getSpecificMockHighlight(suggestion);
              const fallbackPrice = suggestion.priceEstimate || getSpecificMockPrice(suggestion);
              const fallbackReservation = suggestion.reservation || getSpecificMockReservation(suggestion);

              try {
                const mapsResult = await searchPlaces(suggestion.name, {
                  lat: suggestion.lat,
                  lng: suggestion.lng,
                });
                if (mapsResult && mapsResult.length > 0) {
                  const bestMatch = mapsResult[0];
                  return {
                    id: `rec_ai_${idx}_${Date.now()}`,
                    name: bestMatch.name,
                    address: bestMatch.address,
                    lat: bestMatch.lat,
                    lng: bestMatch.lng,
                    category: suggestion.category,
                    estimatedDuration: suggestion.estimatedDuration,
                    description: suggestion.description,
                    types: bestMatch.types,
                    photoUrl: bestMatch.photoUrl,
                    highlight: fallbackHighlight,
                    priceEstimate: bestMatch.priceEstimate || fallbackPrice,
                    reservation: fallbackReservation,
                  };
                }
              } catch (e) {
                console.warn(`Failed to fetch Google Maps data for ${suggestion.name}`, e);
              }
              return {
                id: `rec_ai_${idx}_${Date.now()}`,
                name: suggestion.name,
                address: "Location in the area",
                lat: suggestion.lat,
                lng: suggestion.lng,
                category: suggestion.category,
                estimatedDuration: suggestion.estimatedDuration,
                description: suggestion.description,
                types: [],
                photoUrl: undefined,
                highlight: fallbackHighlight,
                priceEstimate: fallbackPrice,
                reservation: fallbackReservation,
              };
            })
          );

          candidateSights = enrichedSuggestions;
          try {
            localStorage.setItem(cacheKeyV4, JSON.stringify(candidateSights));
          } catch (_) {
            sessionStorage.setItem(cacheKeyV4, JSON.stringify(candidateSights));
          }
        } catch (err) {
          console.warn("Failed to fetch suggestions from Gemini API, falling back to local dataset:", err);
        }
      }
    }

    // Fallback to mock data if needed
    if (candidateSights.length === 0) {
      const isKyoto = Math.abs(anchor.lat - 35.01) < 0.3 && Math.abs(anchor.lng - 135.76) < 0.3;
      const isTokyo = Math.abs(anchor.lat - 35.68) < 0.4 && Math.abs(anchor.lng - 139.76) < 0.4;
      if (isKyoto) candidateSights = KYOTO_SIGHTS;
      else if (isTokyo) candidateSights = TOKYO_SIGHTS;
      else candidateSights = getGenericSights(anchor.lat, anchor.lng);
    }

    // Tag each suggestion with nearest hotel info, deduplicate across anchors
    for (const s of candidateSights) {
      if (isDuplicate(s.name, s.lat, s.lng)) continue;
      if (seenSuggestionNames.has(s.name.toLowerCase())) continue;
      seenSuggestionNames.add(s.name.toLowerCase());

      const distanceM = getDistance(s.lat, s.lng, anchor.lat, anchor.lng);
      allSuggestions.push({
        ...s,
        _nearestHotelName: anchor.label,
        _nearestHotelDistanceM: distanceM,
      });
    }
  }

  // Sort: closest to any hotel first, then cap at 10 total
  allSuggestions.sort((a, b) => a._nearestHotelDistanceM - b._nearestHotelDistanceM);

  return allSuggestions.slice(0, 10).map((s) => ({
    id: s.id,
    name: s.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    category: s.category,
    estimatedDuration: s.estimatedDuration,
    description: s.description,
    descriptionSource: "ai" as const,
    dayIndex: null,
    orderInDay: null,
    pinnedToDay: false,
    photoUrl: s.photoUrl,
    highlight: s.highlight || getSpecificMockHighlight(s),
    priceEstimate: s.priceEstimate || getSpecificMockPrice(s),
    reservation: s.reservation || getSpecificMockReservation(s),
    nearestHotel: s._nearestHotelName
      ? { name: s._nearestHotelName, distanceM: s._nearestHotelDistanceM }
      : undefined,
  }));
}

/**
 * Checks if suggestions are already cached in localStorage/sessionStorage for the current anchor.
 * Returns the cached places if present, or null if un-queried.
 * This guarantees 0 API calls.
 */
export function getCachedSuggestions(
  places: Place[],
  hotels: Hotel[],
  customAnchor?: { lat: number; lng: number; label: string } | null,
  flights: (Place | null)[] = []
): (Place & { nearestHotel?: { name: string; distanceM: number } })[] | null {
  let anchors: { lat: number; lng: number; label: string }[] = [];

  if (customAnchor) {
    anchors = [customAnchor];
  } else {
    const uniqueHotels = getUniqueHotels(hotels);
    if (uniqueHotels.length > 0) {
      anchors = uniqueHotels.map((h) => ({ lat: h.lat, lng: h.lng, label: h.name }));
    } else {
      const center = getItineraryCenter(places, hotels, flights);
      if (center) {
        anchors = [{ ...center, label: "" }];
      }
    }
  }

  if (anchors.length === 0) return null;



  const isDuplicate = (name: string, lat: number, lng: number) => {
    return places.some((p) => isDuplicatePlace(p, { name, lat, lng }));
  };

  const allSuggestions: any[] = [];
  const seenSuggestionNames = new Set<string>();

  for (const anchor of anchors) {
    const cacheKeyV4 = `re_route_suggestions_v4_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cacheKeyV3 = `re_route_suggestions_v3_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cachedData =
      localStorage.getItem(cacheKeyV4) ||
      sessionStorage.getItem(cacheKeyV4) ||
      localStorage.getItem(cacheKeyV3) ||
      sessionStorage.getItem(cacheKeyV3);
    if (!cachedData) return null; // not cached yet

    try {
      const candidateSights: any[] = JSON.parse(cachedData);
      for (const s of candidateSights) {
        if (isDuplicate(s.name, s.lat, s.lng)) continue;
        if (seenSuggestionNames.has(s.name.toLowerCase())) continue;
        seenSuggestionNames.add(s.name.toLowerCase());

        const distanceM = getDistance(s.lat, s.lng, anchor.lat, anchor.lng);
        allSuggestions.push({
          ...s,
          highlight: s.highlight || getSpecificMockHighlight(s),
          priceEstimate: s.priceEstimate || getSpecificMockPrice(s),
          reservation: s.reservation || getSpecificMockReservation(s),
          nearestHotel: anchor.label ? { name: anchor.label, distanceM } : undefined,
        });
      }
    } catch {
      return null;
    }
  }

  return allSuggestions.length > 0 ? allSuggestions.slice(0, 10) : null;
}

