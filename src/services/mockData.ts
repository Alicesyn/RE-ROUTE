import { Place, Hotel } from "../types";

// Let's create a mock dataset for New York City
export const MOCK_HOTELS: Hotel[] = [
  {
    dayIndex: 0,
    name: "The Plaza",
    address: "768 5th Ave, New York, NY 10019",
    lat: 40.7644,
    lng: -73.9744,
  },
  {
    dayIndex: 1,
    name: "New York Marriott Marquis",
    address: "1535 Broadway, New York, NY 10036",
    lat: 40.7586,
    lng: -73.9862,
  },
];

export const MOCK_PLACES: Omit<
  Place,
  "dayIndex" | "orderInDay" | "pinnedToDay"
>[] = [
  {
    id: "m1",
    name: "Central Park",
    address: "New York, NY",
    lat: 40.7812,
    lng: -73.9665,
    description: "Vast urban park with walking paths, a zoo, and scenic spots.",
    descriptionSource: "mock",
    category: "park",
    estimatedDuration: 75,
    priceEstimate: "Free",
    highlight: { label: "Best Spot", text: "Bow Bridge & Bethesda Terrace in morning light" },
    reservation: { requirement: "not_needed", advanceTime: "No reservation needed" },
  },
  {
    id: "m2",
    name: "Times Square",
    address: "Manhattan, NY 10036",
    lat: 40.758,
    lng: -73.9855,
    description:
      "Bustling destination in the heart of the Theater District known for bright lights.",
    descriptionSource: "mock",
    category: "landmark",
    estimatedDuration: 45,
    priceEstimate: "Free",
    highlight: { label: "Best Vantage", text: "Red TKTS bleacher steps for 360-degree billboard views" },
    reservation: { requirement: "not_needed", advanceTime: "No reservation needed" },
  },
  {
    id: "m3",
    name: "Empire State Building",
    address: "20 W 34th St, New York, NY 10001",
    lat: 40.7484,
    lng: -73.9857,
    description:
      "Iconic art deco skyscraper offering observation decks and city views.",
    descriptionSource: "mock",
    category: "landmark",
    estimatedDuration: 60,
    openingHours: [
      "Monday: 10:00 AM – 10:00 PM",
      "Tuesday: 10:00 AM – 10:00 PM",
      "Wednesday: 10:00 AM – 10:00 PM",
      "Thursday: 10:00 AM – 10:00 PM",
      "Friday: 9:00 AM – 12:00 AM",
      "Saturday: 9:00 AM – 12:00 AM",
      "Sunday: 9:00 AM – 11:00 PM"
    ],
    priceEstimate: "$44 - $79",
    highlight: { label: "Best Photo Spot", text: "86th floor open-air observation deck facing South" },
    reservation: {
      requirement: "recommended",
      advanceTime: "Book 1-2 days ahead for sunset observation time slots",
      notes: "Skip-the-line express pass available online",
    },
  },
  {
    id: "m4",
    name: "Statue of Liberty",
    address: "New York, NY 10004",
    lat: 40.6892,
    lng: -74.0445,
    description:
      "Colossal copper statue on Liberty Island, a symbol of freedom.",
    descriptionSource: "mock",
    category: "landmark",
    estimatedDuration: 120,
    priceEstimate: "$24 - $31",
    highlight: { label: "Pro Tip", text: "Reserve pedestal access in advance; catch 8:30 AM first ferry" },
    reservation: {
      requirement: "required",
      advanceTime: "Reserve 1-3 months in advance for pedestal or crown access",
      notes: "Official booking via City Experiences",
    },
  },
  {
    id: "m5",
    name: "The Metropolitan Museum of Art",
    address: "1000 5th Ave, New York, NY 10028",
    lat: 40.7794,
    lng: -73.9632,
    description: "One of the worlds largest and finest art museums.",
    descriptionSource: "mock",
    category: "museum",
    estimatedDuration: 180,
    openingHours: [
      "Monday: Closed",
      "Tuesday: 10:00 AM – 5:00 PM",
      "Wednesday: 10:00 AM – 5:00 PM",
      "Thursday: 10:00 AM – 5:00 PM",
      "Friday: 10:00 AM – 9:00 PM",
      "Saturday: 10:00 AM – 9:00 PM",
      "Sunday: 10:00 AM – 5:00 PM"
    ],
    priceEstimate: "$30",
    highlight: { label: "Must-See", text: "The Temple of Dendur in Sackler Wing and European Paintings" },
    reservation: {
      requirement: "recommended",
      advanceTime: "Book timed entry ticket online in advance to skip lines",
    },
  },
  {
    id: "m6",
    name: "Brooklyn Bridge",
    address: "Brooklyn Bridge, New York, NY 10038",
    lat: 40.7061,
    lng: -73.9969,
    description:
      "Historic suspension bridge connecting Manhattan and Brooklyn.",
    descriptionSource: "mock",
    category: "landmark",
    estimatedDuration: 45,
    priceEstimate: "Free",
    highlight: { label: "Best Walk", text: "Manhattan-bound pedestrian walkway at golden hour from DUMBO" },
    reservation: { requirement: "not_needed", advanceTime: "No reservation needed" },
  },
  {
    id: "m7",
    name: "The High Line",
    address: "New York, NY 10011",
    lat: 40.748,
    lng: -74.0048,
    description:
      "Elevated linear park, greenway and rail trail created on a former New York Central Railroad spur.",
    descriptionSource: "mock",
    category: "park",
    estimatedDuration: 60,
    priceEstimate: "Free",
    highlight: { label: "Best Section", text: "Chelsea Thicket and 10th Avenue Square sunken overlook" },
    reservation: { requirement: "not_needed", advanceTime: "No reservation needed" },
  },
];
