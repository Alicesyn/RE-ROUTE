import { Place, Hotel, PlaceCategory } from "../types";
import { searchPlaces, resolvePhotoUrl, fetchFreshPhoto } from "./mapsService";
import { apiUsageService } from "./apiUsageService";
import { getDistance } from "../utils/distance";
import { isDuplicatePlace } from "../utils/duplicateUtils";
import { isPlaceClosed } from "../utils/statusUtils";
import { suggestSights } from "./aiService";
import {
  getSpecificMockHighlight,
  getSpecificMockPrice,
  getSpecificMockReservation,
} from "../utils/mockAiUtils";
import { formatDescriptionWithTabelog, stripTabelogPrefix } from "../utils/tabelogUtils";

// Curated top sights for Kyoto (expanded pool for fresh suggestions on refresh)
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
    priceEstimate: "¥1,000 - ¥2,500",
    highlight: { label: "Must-Try", text: "Tako Tamago (baby octopus skewers stuffed with quail egg) and fresh dashi tamagoyaki" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Walk-in food stalls; peak crowds 11 AM - 3 PM" },
  },
  {
    id: "rec_kyoto_nijo",
    name: "Nijo Castle",
    address: "541 Nijojocho, Nakagyo Ward, Kyoto",
    lat: 35.0142,
    lng: 135.7482,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 90,
    description: "Historic 17th-century flatland castle featuring nightingale squeaking floors and beautiful Ninomaru palace gardens.",
    types: ["tourist_attraction", "castle"],
    priceEstimate: "¥1,030",
    highlight: { label: "Must-See", text: "Nightingale floors in Ninomaru Palace designed to chirp like birds when stepped on" },
    reservation: { requirement: "not_needed" as const, advanceTime: "On-site ticket kiosks" },
  },
  {
    id: "rec_kyoto_ginkaku",
    name: "Ginkaku-ji (Silver Pavilion)",
    address: "2 Ginkakujicho, Sakyo Ward, Kyoto",
    lat: 35.0272,
    lng: 135.7982,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 60,
    description: "Elegant Zen temple famed for its sculpted sand garden, sea of silver sand, and moss garden walking trail.",
    types: ["tourist_attraction", "place_of_worship"],
    priceEstimate: "¥500",
    highlight: { label: "Scenic Spot", text: "Hillside moss trail behind the pavilion overlooking the temple grounds" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Tickets purchased at gate" },
  },
  {
    id: "rec_kyoto_yasaka",
    name: "Yasaka Shrine",
    address: "625 Gionmachi Kitagawa, Higashiyama Ward, Kyoto",
    lat: 35.0037,
    lng: 135.7785,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 45,
    description: "One of Kyoto's most beloved shrines, glowing with hundreds of lanterns at night at the eastern end of Shijo-dori.",
    types: ["tourist_attraction", "place_of_worship"],
    priceEstimate: "Free",
    highlight: { label: "Best Time to Visit", text: "Evening after sunset when the central dance stage lanterns are fully lit" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Open 24 hours" },
  },
  {
    id: "rec_kyoto_tenryuji",
    name: "Tenryu-ji Temple",
    address: "68 Saga Tenryuji Susukinobabacho, Ukyo Ward, Kyoto",
    lat: 35.0158,
    lng: 135.6776,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 60,
    description: "Head Zen temple of the Tenryu branch featuring a 14th-century pond garden framed by the Arashiyama mountains.",
    types: ["tourist_attraction", "temple"],
    priceEstimate: "¥500",
    highlight: { label: "Scenic Spot", text: "Sogenchi garden pond reflecting the autumn foliage or spring cherry blossoms" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Purchased at entrance" },
  },
  {
    id: "rec_kyoto_ryoanji",
    name: "Ryoan-ji Temple",
    address: "13 Ryoanji Goryonoshitacho, Ukyo Ward, Kyoto",
    lat: 35.0345,
    lng: 135.7182,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 45,
    description: "World-famous Zen temple housing Japan's most enigmatic karesansui rock garden of 15 boulders on white gravel.",
    types: ["tourist_attraction", "place_of_worship"],
    priceEstimate: "¥600",
    highlight: { label: "Visitor Tip", text: "Sit along the wooden veranda to count the 15 stones — only 14 are visible from any single angle" },
    reservation: { requirement: "not_needed" as const, advanceTime: "No reservation needed" },
  },
  {
    id: "rec_kyoto_palace",
    name: "Kyoto Imperial Palace",
    address: "3 Kyotogyoen, Kamigyo Ward, Kyoto",
    lat: 35.0254,
    lng: 135.7621,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 75,
    description: "Former ruling residence of Japan's Emperor until 1869, nestled inside the peaceful, expansive Kyoto Gyoen National Garden.",
    types: ["tourist_attraction", "park"],
    priceEstimate: "Free",
    highlight: { label: "Must-See", text: "Shishinden hall where historic enthronement ceremonies took place" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Free entry via security check at Seisho-mon Gate" },
  },
  {
    id: "rec_kyoto_nanzenji",
    name: "Nanzen-ji Temple & Aqueduct",
    address: "86 Nanzenji Fukuchicho, Sakyo Ward, Kyoto",
    lat: 35.0113,
    lng: 135.7939,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 60,
    description: "Sprawling Zen temple complex famous for its monumental Sanmon gate and Roman-style red brick water aqueduct.",
    types: ["tourist_attraction", "place_of_worship"],
    priceEstimate: "¥600",
    highlight: { label: "Best Photo Spot", text: "Red-brick Suirokaku aqueduct arches framed by lush maple forest" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Grounds free; ticket for Hojo garden" },
  },
  {
    id: "rec_kyoto_heian",
    name: "Heian Jingu Shrine",
    address: "97 Okazaki Nishitennocho, Sakyo Ward, Kyoto",
    lat: 35.0160,
    lng: 135.7824,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 60,
    description: "Vibrant vermilion shrine built for Kyoto's 1100th anniversary with an enormous torii gate and weeping cherry gardens.",
    types: ["tourist_attraction", "place_of_worship"],
    priceEstimate: "Free",
    highlight: { label: "Must-See", text: "Shin-en stroll garden featuring stepping stones across the iris pond" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Garden fee ¥600; main grounds free" },
  },
  {
    id: "rec_kyoto_sanjusangen",
    name: "Sanjusangendo Temple",
    address: "657 Sanjusangendomawari, Higashiyama Ward, Kyoto",
    lat: 34.9879,
    lng: 135.7717,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 45,
    description: "Awe-inspiring 120-meter wooden temple hall housing 1,001 life-sized statues of the Thousand-Armed Kannon.",
    types: ["tourist_attraction", "temple"],
    priceEstimate: "¥600",
    highlight: { label: "Must-See", text: "Main wooden hall displaying all 1,001 gleaming gilded Kannon statues" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Purchased at entrance gate" },
  },
  {
    id: "rec_kyoto_kamogawa",
    name: "Kamogawa Riverfront Promenade",
    address: "Kamogawa Riverbank, Nakagyo Ward, Kyoto",
    lat: 35.0062,
    lng: 135.7725,
    category: "park" as PlaceCategory,
    estimatedDuration: 60,
    description: "Scenic riverside pedestrian path where locals and visitors stroll, picnic, and dine on elevated summer kawayuka patios.",
    types: ["tourist_attraction", "park"],
    priceEstimate: "Free",
    highlight: { label: "Best Walk", text: "Stepping stone turtle crossings near Demachiyanagi confluence" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Open public riverbank path" },
  },
];

// Curated top sights for Tokyo (expanded pool for fresh suggestions on refresh)
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
    priceEstimate: "Free",
    highlight: { label: "Where to Go", text: "Radio Kaikan multi-floor hobby center and retro gaming shops along Chuo Dori" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Stores open around 10:00 - 11:00 AM" },
  },
  {
    id: "rec_tokyo_tower",
    name: "Tokyo Tower",
    address: "4-2-8 Shibakoen, Minato City, Tokyo",
    lat: 35.6586,
    lng: 139.7454,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 90,
    description: "Iconic red-and-white communications tower modeled after the Eiffel Tower, offering 360-degree observation decks.",
    types: ["tourist_attraction", "observation_deck"],
    priceEstimate: "¥1,200",
    highlight: { label: "Best Photo Spot", text: "Lookdown window on Main Deck looking 145m straight down" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Tickets on-site or online" },
  },
  {
    id: "rec_tokyo_tsukiji",
    name: "Tsukiji Outer Market",
    address: "4-16-2 Tsukiji, Chuo City, Tokyo",
    lat: 35.6655,
    lng: 139.7708,
    category: "shopping" as PlaceCategory,
    estimatedDuration: 90,
    description: "Bustling foodie haven of narrow alleys brimming with fresh sushi bars, grilled wagyu skewers, and seafood delicacies.",
    types: ["tourist_attraction", "food"],
    priceEstimate: "¥1,500 - ¥3,500",
    highlight: { label: "Must-Try", text: "Fresh sea urchin (uni) bowls and warm tamagoyaki rolled omelet on a stick" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Morning market; best between 8 AM - 1 PM" },
  },
  {
    id: "rec_tokyo_ueno",
    name: "Ueno Park & Museums",
    address: "Uenokoen, Taito City, Tokyo",
    lat: 35.7140,
    lng: 139.7741,
    category: "park" as PlaceCategory,
    estimatedDuration: 120,
    description: "Expansive cultural park home to the Tokyo National Museum, Shinobazu Pond, cherry blossom groves, and Ueno Zoo.",
    types: ["tourist_attraction", "park"],
    priceEstimate: "Free",
    highlight: { label: "Best Walk", text: "Shinobazu lotus pond path and Bentendo temple island" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Park grounds open freely daily" },
  },
  {
    id: "rec_tokyo_teamlab",
    name: "teamLab Planets TOKYO",
    address: "6-1-16 Toyosu, Koto City, Tokyo",
    lat: 35.6491,
    lng: 139.7898,
    category: "entertainment" as PlaceCategory,
    estimatedDuration: 90,
    description: "Immersive barefoot digital art museum where visitors walk through water and massive interactive projection gardens.",
    types: ["tourist_attraction", "art_gallery"],
    priceEstimate: "¥3,800",
    highlight: { label: "Must-See", text: "Infinite Crystal Universe room and the Floating Flower Garden" },
    reservation: { requirement: "required" as const, advanceTime: "Advance timed entry ticket required 2-4 weeks prior" },
  },
  {
    id: "rec_tokyo_roppongi",
    name: "Roppongi Hills Mori Tower",
    address: "6-10-1 Roppongi, Minato City, Tokyo",
    lat: 35.6605,
    lng: 139.7292,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 90,
    description: "Skyscraper complex featuring Tokyo City View open-air sky deck and the acclaimed Mori Art Museum.",
    types: ["tourist_attraction", "observation_deck"],
    priceEstimate: "¥2,000",
    highlight: { label: "Best Vantage", text: "Rooftop Sky Deck for unobstructed views of Tokyo Tower against the skyline" },
    reservation: { requirement: "recommended" as const, advanceTime: "Online booking recommended for sunset slots" },
  },
  {
    id: "rec_tokyo_ginza",
    name: "Ginza Shopping Promenade",
    address: "Ginza, Chuo City, Tokyo",
    lat: 35.6719,
    lng: 139.7648,
    category: "shopping" as PlaceCategory,
    estimatedDuration: 120,
    description: "Tokyo's premier luxury shopping and dining district with architectural flagship stores and historic department stores.",
    types: ["tourist_attraction", "shopping_mall"],
    priceEstimate: "Free",
    highlight: { label: "Where to Go", text: "Pedestrian paradise along Chuo-dori on weekend afternoons" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Weekend pedestrian mall 12 PM - 5 PM" },
  },
  {
    id: "rec_tokyo_odaiba",
    name: "Odaiba Seaside Park & Gundam",
    address: "1-4 Daiba, Minato City, Tokyo",
    lat: 35.6298,
    lng: 139.7745,
    category: "entertainment" as PlaceCategory,
    estimatedDuration: 90,
    description: "Futuristic waterfront entertainment district with sandy beach, Rainbow Bridge views, and the life-sized Unicorn Gundam.",
    types: ["tourist_attraction", "park"],
    priceEstimate: "Free",
    highlight: { label: "Must-See", text: "Life-sized Unicorn Gundam transformation show in front of DiverCity Tokyo" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Outdoor light shows daily at dusk" },
  },
  {
    id: "rec_tokyo_nezu",
    name: "Nezu Shrine",
    address: "1-28-9 Nezu, Bunkyo City, Tokyo",
    lat: 35.7203,
    lng: 139.7607,
    category: "religious_site" as PlaceCategory,
    estimatedDuration: 45,
    description: "Tranquil historic shrine dating back over 1,900 years, renowned for its hill of thousands of vermilion mini-torii tunnels.",
    types: ["tourist_attraction", "place_of_worship"],
    priceEstimate: "Free",
    highlight: { label: "Scenic Spot", text: "Hillside tunnel of vermilion torii gates winding through azalea bushes" },
    reservation: { requirement: "not_needed" as const, advanceTime: "No reservation needed" },
  },
  {
    id: "rec_tokyo_omotesando",
    name: "Omotesando Hills & Cat Street",
    address: "4-12-10 Jingumae, Shibuya City, Tokyo",
    lat: 35.6672,
    lng: 139.7099,
    category: "shopping" as PlaceCategory,
    estimatedDuration: 90,
    description: "Architectural tree-lined boulevard lined with cutting-edge boutiques, street fashion, and specialty espresso bars.",
    types: ["tourist_attraction", "shopping_mall"],
    priceEstimate: "Free",
    highlight: { label: "Where to Go", text: "Pedestrian Cat Street connecting Omotesando to Shibuya for independent boutiques" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Shops generally open 11:00 AM - 8:00 PM" },
  },
  {
    id: "rec_tokyo_yanaka",
    name: "Yanaka Ginza Retro District",
    address: "3-13-1 Yanaka, Taito City, Tokyo",
    lat: 35.7275,
    lng: 139.7689,
    category: "shopping" as PlaceCategory,
    estimatedDuration: 75,
    description: "Charming historic old-town shopping street preserved from post-war Tokyo, famed for cat culture, croquettes, and sunset views.",
    types: ["tourist_attraction", "neighborhood"],
    priceEstimate: "Free",
    highlight: { label: "Best Vantage", text: "Yuyake Dandan (Sunset Steps) looking down into the bustling retro market" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Best visited mid-afternoon" },
  },
];

// Generates fallback mock sights for other areas (expanded pool for rotation)
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
    priceEstimate: "Free",
    highlight: { label: "Best Photo Spot", text: "Observation deck pointing west toward the setting sun" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Public viewpoint" },
  },
  {
    id: "rec_gen_sight4",
    name: "Grand Cultural Museum",
    address: "100 Museum Row",
    lat: lat + 0.004,
    lng: lng - 0.007,
    category: "museum" as PlaceCategory,
    estimatedDuration: 120,
    description: "Celebrated regional museum featuring historical artifacts, interactive exhibits, and rotating fine art galleries.",
    types: ["tourist_attraction", "museum"],
    priceEstimate: "$15 - $22",
    highlight: { label: "Must-See", text: "Central rotunda exhibition hall and historical antiquities wing" },
    reservation: { requirement: "recommended" as const, advanceTime: "Timed tickets recommended on weekends" },
  },
  {
    id: "rec_gen_sight5",
    name: "Riverside Waterfront Promenade",
    address: "Harbor Esplanade",
    lat: lat - 0.006,
    lng: lng - 0.006,
    category: "landmark" as PlaceCategory,
    estimatedDuration: 60,
    description: "Pedestrian-only boardwalk running along the river with open-air cafes, street performers, and water taxis.",
    types: ["tourist_attraction"],
    priceEstimate: "Free",
    highlight: { label: "Best Time to Visit", text: "Sunset hour for dining outdoors and sunset boat viewing" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Open public promenade" },
  },
  {
    id: "rec_gen_sight6",
    name: "Artisan Crafts Market",
    address: "Market Square Plaza",
    lat: lat - 0.003,
    lng: lng + 0.007,
    category: "shopping" as PlaceCategory,
    estimatedDuration: 75,
    description: "Lively public bazaar showcasing local handmade jewelry, organic produce, baked pastries, and specialty coffees.",
    types: ["tourist_attraction", "market"],
    priceEstimate: "Free",
    highlight: { label: "Where to Go", text: "North arcade row for local culinary tastings and artisan pottery" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Free public access" },
  },
];

export type RecommendationType = "sights" | "food";

// Curated top food & dining spots for Kyoto (restaurants, specialty cafes & food markets)
const KYOTO_FOOD = [
  {
    id: "rec_kyoto_food_inoichi",
    name: "Menya Inoichi",
    address: "417 Ebisunocho, Shimogyo Ward, Kyoto",
    lat: 35.0019,
    lng: 135.7678,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 60,
    description: "Michelin Bib Gourmand ramen shop famous for its delicate, crystal-clear dashi broth and shaved tororo kombu.",
    types: ["restaurant", "food"],
    priceEstimate: "¥1,300 - ¥1,800",
    openingHours: [
      "Monday: 11:00 AM – 2:30 PM, 5:30 – 9:00 PM",
      "Tuesday: 11:00 AM – 2:30 PM, 5:30 – 9:00 PM",
      "Wednesday: 11:00 AM – 2:30 PM, 5:30 – 9:00 PM",
      "Thursday: 11:00 AM – 2:30 PM, 5:30 – 9:00 PM",
      "Friday: 11:00 AM – 2:30 PM, 5:30 – 9:00 PM",
      "Saturday: 11:00 AM – 2:30 PM, 5:30 – 9:00 PM",
      "Sunday: 11:00 AM – 2:30 PM, 5:30 – 9:00 PM"
    ],
    highlight: { label: "Must-Try", text: "Special White Soy Sauce (Shiro Shoyu) Ramen with A5 Wagyu slices" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Queue 20-30 min before opening at lunch or dinner" },
    tabelog: {
      rating: 3.66,
      url: "https://tabelog.com/kyoto/A2601/A260201/26032368/",
      award: "Hyakumeiten 2024 / Michelin Bib Gourmand"
    },
  },
  {
    id: "rec_kyoto_food_chaochao",
    name: "Chao Chao Gyoza Shijo-Kawaramachi",
    address: "312-1 Inaricho, Shimogyo Ward, Kyoto",
    lat: 35.0033,
    lng: 135.7709,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 50,
    description: "Lively, award-winning casual gyoza specialty bar serving crispy pan-fried gyoza with golden lattice wings.",
    types: ["restaurant", "food"],
    priceEstimate: "¥1,000 - ¥2,000",
    openingHours: [
      "Monday: 11:30 AM – 2:30 PM, 5:00 – 11:00 PM",
      "Tuesday: 11:30 AM – 2:30 PM, 5:00 – 11:00 PM",
      "Wednesday: 11:30 AM – 2:30 PM, 5:00 – 11:00 PM",
      "Thursday: 11:30 AM – 2:30 PM, 5:00 – 11:00 PM",
      "Friday: 11:30 AM – 2:30 PM, 5:00 – 11:30 PM",
      "Saturday: 11:30 AM – 11:30 PM",
      "Sunday: 11:30 AM – 11:00 PM"
    ],
    highlight: { label: "Must-Try", text: "Signature Chao Chao Gyoza wings & shrimp gyoza with cold draft beer" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Walk-in only; casual fast turnaround" },
    tabelog: {
      rating: 3.45,
      url: "https://tabelog.com/kyoto/A2601/A260201/26002778/"
    },
  },
  {
    id: "rec_kyoto_food_katsukura",
    name: "Katsukura Tonkatsu Sanjo",
    address: "16 Sanjodori Kawaramachi Higashiiru, Nakagyo Ward, Kyoto",
    lat: 35.0090,
    lng: 135.7705,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 60,
    description: "Kyoto's legendary tonkatsu institution serving premium Sangenton pork with freshly ground sesame sauce.",
    types: ["restaurant", "food"],
    priceEstimate: "¥1,800 - ¥2,800",
    openingHours: [
      "Monday: 11:00 AM – 9:30 PM",
      "Tuesday: 11:00 AM – 9:30 PM",
      "Wednesday: 11:00 AM – 9:30 PM",
      "Thursday: 11:00 AM – 9:30 PM",
      "Friday: 11:00 AM – 9:30 PM",
      "Saturday: 11:00 AM – 9:30 PM",
      "Sunday: 11:00 AM – 9:30 PM"
    ],
    highlight: { label: "Must-Try", text: "Kurobuta Hirekatsu (pork tenderloin cutlet) with unlimited barley rice and shredded cabbage" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Walk-in; wait times 15-25 min during peak dinner" },
    tabelog: {
      rating: 3.49,
      url: "https://tabelog.com/kyoto/A2601/A260202/26000456/"
    },
  },
  {
    id: "rec_kyoto_food_kichikichi",
    name: "Kichi Kichi Omurice",
    address: "185-4 Zaimokucho, Nakagyo Ward, Kyoto",
    lat: 35.0076,
    lng: 135.7712,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 60,
    description: "World-famous cozy eatery where Chef Motokichi slices molten fluffy omelets over chicken fried rice with theatrical flair.",
    types: ["restaurant", "food"],
    priceEstimate: "¥2,700 - ¥3,500",
    openingHours: [
      "Monday: 5:00 – 9:00 PM",
      "Tuesday: 5:00 – 9:00 PM",
      "Wednesday: Closed",
      "Thursday: 5:00 – 9:00 PM",
      "Friday: 5:00 – 9:00 PM",
      "Saturday: 12:00 – 2:00 PM, 5:00 – 9:00 PM",
      "Sunday: 12:00 – 2:00 PM, 5:00 – 9:00 PM"
    ],
    highlight: { label: "Must-Try", text: "Signature Fluffy Demi-Glace Omurice sliced open live at the counter" },
    reservation: { requirement: "required" as const, advanceTime: "Online booking opens every Sunday for the coming week" },
    tabelog: {
      rating: 3.23,
      url: "https://tabelog.com/kyoto/A2601/A260301/26000226/"
    },
  },
  {
    id: "rec_kyoto_food_arabica",
    name: "% Arabica Kyoto Higashiyama",
    address: "87-5 Hoshinocho, Higashiyama Ward, Kyoto",
    lat: 34.9984,
    lng: 135.7797,
    category: "coffee_shop" as PlaceCategory,
    estimatedDuration: 30,
    description: "Minimalist world-renowned specialty espresso bar situated on the scenic cobblestone approach to Yasaka Pagoda.",
    types: ["cafe", "coffee_shop"],
    priceEstimate: "¥550 - ¥750",
    openingHours: [
      "Monday: 9:00 AM – 6:00 PM",
      "Tuesday: 9:00 AM – 6:00 PM",
      "Wednesday: 9:00 AM – 6:00 PM",
      "Thursday: 9:00 AM – 6:00 PM",
      "Friday: 9:00 AM – 6:00 PM",
      "Saturday: 9:00 AM – 6:00 PM",
      "Sunday: 9:00 AM – 6:00 PM"
    ],
    highlight: { label: "Must-Order", text: "Kyoto Latte with condensed milk and single-origin pour-over" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Walk-in takeaway; lines move steadily" },
    tabelog: {
      rating: 3.60,
      url: "https://tabelog.com/kyoto/A2601/A260301/26024220/"
    },
  },
  {
    id: "rec_kyoto_food_tsujiri",
    name: "Gion Tsujiri Honten & Saryo Tsujiri",
    address: "573-3 Gionmachi Minamigawa, Higashiyama Ward, Kyoto",
    lat: 35.0036,
    lng: 135.7758,
    category: "coffee_shop" as PlaceCategory,
    estimatedDuration: 45,
    description: "Historic 1860 teahouse legendary for premium Uji matcha sweets, elaborate green tea parfaits, and roasted hojicha.",
    types: ["cafe", "food"],
    priceEstimate: "¥1,200 - ¥1,800",
    openingHours: [
      "Monday: 10:00 AM – 8:00 PM",
      "Tuesday: 10:00 AM – 8:00 PM",
      "Wednesday: 10:00 AM – 8:00 PM",
      "Thursday: 10:00 AM – 8:00 PM",
      "Friday: 10:00 AM – 8:00 PM",
      "Saturday: 10:00 AM – 8:00 PM",
      "Sunday: 10:00 AM – 8:00 PM"
    ],
    highlight: { label: "Must-Order", text: "Tsujiri Tokusen Matcha Parfait layered with chiffon cake, warabimochi, and matcha soft serve" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Walk-in only; popular afternoons 2 PM - 5 PM" },
    tabelog: {
      rating: 3.55,
      url: "https://tabelog.com/kyoto/A2601/A260301/26001099/"
    },
  },
];

// Curated top food & dining spots for Tokyo (ramen, beef cutlets, markets, yakitori)
const TOKYO_FOOD = [
  {
    id: "rec_tokyo_food_rokurinsha",
    name: "Rokurinsha (Tokyo Station)",
    address: "1-9-1 Marunouchi, Chiyoda City, Tokyo (Tokyo Ramen Street B1)",
    lat: 35.6812,
    lng: 139.7671,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 50,
    description: "Pioneering dipping noodle titan serving ultra-rich tonkotsu-seafood broth with thick, chewy handmade noodles.",
    types: ["restaurant", "food"],
    priceEstimate: "¥1,050 - ¥1,400",
    openingHours: [
      "Monday: 7:30 – 9:30 AM, 10:00 AM – 10:30 PM",
      "Tuesday: 7:30 – 9:30 AM, 10:00 AM – 10:30 PM",
      "Wednesday: 7:30 – 9:30 AM, 10:00 AM – 10:30 PM",
      "Thursday: 7:30 – 9:30 AM, 10:00 AM – 10:30 PM",
      "Friday: 7:30 – 9:30 AM, 10:00 AM – 10:30 PM",
      "Saturday: 7:30 – 9:30 AM, 10:00 AM – 10:30 PM",
      "Sunday: 7:30 – 9:30 AM, 10:00 AM – 10:30 PM"
    ],
    highlight: { label: "Must-Try", text: "Tokusei Tsukemen with seasoned ajitama egg and pork chashu, finished with soup-wari" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Ticket vending machine; queue averages 15-30 mins" },
    tabelog: {
      rating: 3.77,
      url: "https://tabelog.com/tokyo/A1302/A130201/13093047/",
      award: "Hyakumeiten 2024"
    },
  },
  {
    id: "rec_tokyo_food_motomura",
    name: "Gyukatsu Motomura Shibuya",
    address: "3-18-10 Shibuya, Shibuya City, Tokyo",
    lat: 35.6578,
    lng: 139.7032,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 60,
    description: "Beloved deep-fried beef cutlet eatery where diners sear rare Wagyu cutlets on individual sizzling stone grills.",
    types: ["restaurant", "food"],
    priceEstimate: "¥1,900 - ¥2,600",
    openingHours: [
      "Monday: 11:00 AM – 10:00 PM",
      "Tuesday: 11:00 AM – 10:00 PM",
      "Wednesday: 11:00 AM – 10:00 PM",
      "Thursday: 11:00 AM – 10:00 PM",
      "Friday: 11:00 AM – 10:00 PM",
      "Saturday: 11:00 AM – 10:00 PM",
      "Sunday: 11:00 AM – 10:00 PM"
    ],
    highlight: { label: "Must-Try", text: "Gyukatsu set with grated mountain yam (tororo) and wasabi soy sauce" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Arrive 20-30 min before opening to avoid lengthy queues" },
    tabelog: {
      rating: 3.58,
      url: "https://tabelog.com/tokyo/A1303/A130301/13153325/"
    },
  },
  {
    id: "rec_tokyo_food_hikiniku",
    name: "Hikiniku to Come Shibuya",
    address: "2-28-1 Dogenzaka, Shibuya City, Tokyo",
    lat: 35.6593,
    lng: 139.6967,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 50,
    description: "Famous theater-style counter serving 100% freshly ground Japanese beef patties grilled over charcoal onto rice.",
    types: ["restaurant", "food"],
    priceEstimate: "¥1,800",
    openingHours: [
      "Monday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Tuesday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Wednesday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Thursday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Friday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Saturday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Sunday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM"
    ],
    highlight: { label: "Must-Try", text: "Charcoal-grilled hamburg steak set with unlimited hagama rice and fresh raw egg" },
    reservation: { requirement: "required" as const, advanceTime: "Numbered ticket distribution begins at 9:00 AM daily, or book weekly on TableCheck" },
    tabelog: {
      rating: 3.66,
      url: "https://tabelog.com/tokyo/A1303/A130301/13253775/"
    },
  },
  {
    id: "rec_tokyo_food_afuri",
    name: "AFURI Harajuku",
    address: "3-63-1 Sendagaya, Shibuya City, Tokyo",
    lat: 35.6713,
    lng: 139.7042,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 45,
    description: "Modern, hip ramen joint renowned for light golden dashi broth scented with aromatic Japanese yuzu citrus.",
    types: ["restaurant", "food"],
    priceEstimate: "¥1,200 - ¥1,600",
    openingHours: [
      "Monday: 10:00 AM – 11:00 PM",
      "Tuesday: 10:00 AM – 11:00 PM",
      "Wednesday: 10:00 AM – 11:00 PM",
      "Thursday: 10:00 AM – 11:00 PM",
      "Friday: 10:00 AM – 11:00 PM",
      "Saturday: 10:00 AM – 11:00 PM",
      "Sunday: 10:00 AM – 11:00 PM"
    ],
    highlight: { label: "Must-Try", text: "Yuzu Shio Ramen with charcoal-grilled chashu and bamboo shoots" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Self-service ticket kiosk; steady turnover" },
    tabelog: {
      rating: 3.55,
      url: "https://tabelog.com/tokyo/A1306/A130601/13092289/"
    },
  },
  {
    id: "rec_tokyo_food_fuunji",
    name: "Fuunji Shinjuku",
    address: "2-14-3 Yoyogi, Shibuya City, Tokyo",
    lat: 35.6865,
    lng: 139.6975,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 45,
    description: "Legendary counter noodle shop famous for its velvety chicken and fish powder tsukemen dipping broth.",
    types: ["restaurant", "food"],
    priceEstimate: "¥1,000 - ¥1,300",
    openingHours: [
      "Monday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Tuesday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Wednesday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Thursday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Friday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Saturday: 11:00 AM – 3:00 PM, 5:00 – 9:00 PM",
      "Sunday: Closed"
    ],
    highlight: { label: "Must-Try", text: "Special Tsukemen (Tokusei) with mountain of bonito fish powder" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Line forms around the block; fast 15-20 min line turnover" },
    tabelog: {
      rating: 3.78,
      url: "https://tabelog.com/tokyo/A1304/A130401/13044070/",
      award: "Hyakumeiten 2024"
    },
  },
  {
    id: "rec_tokyo_food_omoidiyokocho",
    name: "Omoide Yokocho (Memory Lane)",
    address: "1-2 Nishi-Shinjuku, Shinjuku City, Tokyo",
    lat: 35.6934,
    lng: 139.6997,
    category: "nightlife" as PlaceCategory,
    estimatedDuration: 75,
    description: "Atmospheric post-war lantern-lit alleyway packed with intimate yakitori stalls, cold beer, and charcoal grills.",
    types: ["restaurant", "bar", "food"],
    priceEstimate: "¥2,000 - ¥3,500",
    openingHours: [
      "Monday: 4:00 PM – 12:00 AM",
      "Tuesday: 4:00 PM – 12:00 AM",
      "Wednesday: 4:00 PM – 12:00 AM",
      "Thursday: 4:00 PM – 12:00 AM",
      "Friday: 4:00 PM – 12:00 AM",
      "Saturday: 4:00 PM – 12:00 AM",
      "Sunday: 4:00 PM – 12:00 AM"
    ],
    highlight: { label: "Must-Try", text: "Charcoal-grilled chicken yakitori skewers, tsukune meatballs, and highballs" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Walk into any stall with empty stools after 5:00 PM" },
  },
];

// Generates fallback mock dining recommendations for other areas
const getGenericFood = (lat: number, lng: number) => [
  {
    id: "rec_gen_food_1",
    name: "Artisan Bakery & Specialty Espresso",
    address: "Central Market Boulevard",
    lat: lat + 0.003,
    lng: lng + 0.004,
    category: "coffee_shop" as PlaceCategory,
    estimatedDuration: 45,
    description: "Charming neighborhood bakery crafting naturally leavened sourdough, flaky pastries, and single-origin pour-overs.",
    types: ["cafe", "bakery", "food"],
    priceEstimate: "$8 - $16",
    highlight: { label: "Must-Order", text: "Warm almond croissant & house cardamom vanilla latte" },
    reservation: { requirement: "not_needed" as const, advanceTime: "Walk-in daily" },
  },
  {
    id: "rec_gen_food_2",
    name: "Heritage Trattoria & Pasta Bar",
    address: "Old Town Corner",
    lat: lat - 0.004,
    lng: lng + 0.005,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 75,
    description: "Intimate rustic dining spot hand-rolling fresh pasta daily with regional heirloom recipes and natural wines.",
    types: ["restaurant", "food"],
    priceEstimate: "$25 - $45 / person",
    highlight: { label: "Must-Try", text: "Handmade Cacio e Pepe tossed in aged pecorino wheel & wood-fired focaccia" },
    reservation: { requirement: "recommended" as const, advanceTime: "Reserve 3-7 days in advance for dinner tables" },
  },
  {
    id: "rec_gen_food_3",
    name: "Harbor Seafood & Oyster House",
    address: "Waterfront Pier Esplanade",
    lat: lat + 0.006,
    lng: lng - 0.003,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 75,
    description: "Vibrant coastal eatery serving fresh daily catches, cold shellfish platters, and grilled whole fish.",
    types: ["restaurant", "food"],
    priceEstimate: "$30 - $60 / person",
    highlight: { label: "Must-Try", text: "Fresh local oyster sampler with mignonette and crispy beer-battered fish & chips" },
    reservation: { requirement: "recommended" as const, advanceTime: "Recommended for patio sunset seating" },
  },
  {
    id: "rec_gen_food_4",
    name: "Classic Craft Ramen & Gyoza",
    address: "Lantern Arcade",
    lat: lat - 0.005,
    lng: lng - 0.004,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 45,
    description: "Atmospheric noodle shop simmering pork and chicken bones for 16 hours for deeply comforting noodle bowls.",
    types: ["restaurant", "food"],
    priceEstimate: "$14 - $20",
    highlight: { label: "Must-Try", text: "Rich Tonkotsu Black Garlic ramen with soft-boiled nitamago and crispy pan-fried gyoza" },
    reservation: { requirement: "walk_ins_only" as const, advanceTime: "Walk-in only; 10-15m wait during dinner rush" },
  },
  {
    id: "rec_gen_food_5",
    name: "Farm-to-Table Brunch Kitchen",
    address: "Greenway Walk",
    lat: lat + 0.002,
    lng: lng - 0.006,
    category: "restaurant" as PlaceCategory,
    estimatedDuration: 60,
    description: "Bright sunlit cafe featuring locally sourced organic produce, signature breakfast skillets, and fresh juices.",
    types: ["restaurant", "cafe", "food"],
    priceEstimate: "$18 - $28",
    highlight: { label: "Must-Order", text: "Smoked salmon eggs benedict on toasted brioche and ricotta lemon pancakes" },
    reservation: { requirement: "recommended" as const, advanceTime: "Walk-ins welcome, reservation recommended on weekends" },
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
  flights: (Place | null)[] = [],
  forceRefresh: boolean = false,
  type: RecommendationType = "sights"
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
    const cacheKeyV7 = `re_route_suggestions_v7_${type}_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cacheKeyV6 = `re_route_suggestions_v6_${type}_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cacheKeyV5 = `re_route_suggestions_v5_${type}_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cacheKeyV4 = `re_route_suggestions_v4_${type}_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cacheKeyV3 = `re_route_suggestions_v3_${type}_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    let candidateSights: any[] = [];

    if (forceRefresh) {
      try {
        localStorage.removeItem(cacheKeyV7);
        sessionStorage.removeItem(cacheKeyV7);
        localStorage.removeItem(cacheKeyV6);
        sessionStorage.removeItem(cacheKeyV6);
        localStorage.removeItem(cacheKeyV5);
        sessionStorage.removeItem(cacheKeyV5);
        localStorage.removeItem(cacheKeyV4);
        sessionStorage.removeItem(cacheKeyV4);
        localStorage.removeItem(cacheKeyV3);
        sessionStorage.removeItem(cacheKeyV3);
      } catch (e) {
        console.warn("Failed to clear suggestions cache on forceRefresh", e);
      }
    }

    if (appMode === "real" && !forceRefresh) {
      // Check persistent localStorage first, then sessionStorage (v7, then v6)
      const cachedData =
        localStorage.getItem(cacheKeyV7) ||
        sessionStorage.getItem(cacheKeyV7) ||
        localStorage.getItem(cacheKeyV6) ||
        sessionStorage.getItem(cacheKeyV6);

      if (cachedData) {
        try {
          candidateSights = JSON.parse(cachedData);
          const validCached = candidateSights.filter(
            (s) => !isDuplicate(s.name, s.lat, s.lng) && !isPlaceClosed(s)
          );
          if (validCached.length < 3) candidateSights = [];
          else candidateSights = validCached;
        } catch (e) {
          console.warn("Failed to parse cached suggestions", e);
        }
      }
    }

    let aiErrorOccurred: Error | null = null;
    if (appMode === "real" && candidateSights.length === 0) {
      try {
        const aiSuggestions = await suggestSights(
          anchor.lat,
          anchor.lng,
          [
            ...Array.from(existingNames),
            ...rejectedNames,
            ...Array.from(seenSuggestionNames),
          ],
          type
        );

        const enrichedSuggestions = await Promise.all(
          aiSuggestions.map(async (suggestion, idx) => {
            const fallbackHighlight = suggestion.highlight || getSpecificMockHighlight(suggestion);
            const fallbackPrice = suggestion.priceEstimate || getSpecificMockPrice(suggestion);
            const fallbackReservation = suggestion.reservation || getSpecificMockReservation(suggestion);

            // Pre-check raw suggestion for closures
            if (isPlaceClosed(suggestion)) {
              console.warn(
                `[AI Suggestions] Discarding place flagged as closed in suggestion: "${suggestion.name}"`
              );
              rejectedNames.push(suggestion.name);
              seenSuggestionNames.add(suggestion.name.toLowerCase());
              return null;
            }

            try {
              const mapsResult = await searchPlaces(suggestion.name, {
                lat: suggestion.lat,
                lng: suggestion.lng,
              });
              if (mapsResult && mapsResult.length > 0) {
                // Filter out any matches that are closed on Google Maps
                const operationalMatches = mapsResult.filter((m) => !isPlaceClosed(m));
                if (operationalMatches.length === 0) {
                  console.warn(
                    `[AI Suggestions] Discarding closed place: "${suggestion.name}" (Google status: ${mapsResult[0].businessStatus || "CLOSED"})`
                  );
                  rejectedNames.push(suggestion.name);
                  seenSuggestionNames.add(suggestion.name.toLowerCase());
                  return null;
                }

                const bestMatch = operationalMatches[0];
                let photoUrl = bestMatch.photoUrl;
                if (bestMatch.photoReference) {
                  try {
                    const apiKey = apiUsageService.getActiveMapsKey();
                    if (apiKey) {
                      const directUrl = await resolvePhotoUrl(bestMatch.photoReference, apiKey);
                      if (directUrl) photoUrl = directUrl;
                    }
                  } catch (e) {
                    console.warn("Failed to resolve photo for suggestion:", e);
                  }
                }
                return {
                  id: `rec_ai_${idx}_${Date.now()}`,
                  name: bestMatch.name,
                  romanizedName: suggestion.romanizedName,
                  address: bestMatch.address,
                  lat: bestMatch.lat,
                  lng: bestMatch.lng,
                  category: suggestion.category,
                  estimatedDuration: suggestion.estimatedDuration,
                  description: suggestion.tabelog?.rating
                    ? formatDescriptionWithTabelog(suggestion.description, suggestion.tabelog.rating, suggestion.tabelog.award)
                    : suggestion.description,
                  types: bestMatch.types,
                  photoReference: bestMatch.photoReference,
                  photoUrl,
                  highlight: fallbackHighlight,
                  priceEstimate: bestMatch.priceEstimate || fallbackPrice,
                  reservation: fallbackReservation,
                  businessStatus: bestMatch.businessStatus,
                  googlePlaceId: bestMatch.id,
                  openingHours: (bestMatch.openingHours && bestMatch.openingHours.length > 0)
                    ? bestMatch.openingHours
                    : suggestion.openingHours,
                  tabelog: suggestion.tabelog,
                };
              }
            } catch (e) {
              console.warn(`Failed to fetch Google Maps data for ${suggestion.name}`, e);
            }

            // If Maps search didn't find the place, ensure the raw suggestion isn't closed
            if (isPlaceClosed(suggestion)) {
              return null;
            }

            return {
              id: `rec_ai_${idx}_${Date.now()}`,
              name: suggestion.name,
              romanizedName: suggestion.romanizedName,
              address: "Location in the area",
              lat: suggestion.lat,
              lng: suggestion.lng,
              category: suggestion.category,
              estimatedDuration: suggestion.estimatedDuration,
              description: suggestion.tabelog?.rating
                ? formatDescriptionWithTabelog(suggestion.description, suggestion.tabelog.rating, suggestion.tabelog.award)
                : suggestion.description,
              types: [],
              photoUrl: undefined,
              highlight: fallbackHighlight,
              priceEstimate: fallbackPrice,
              reservation: fallbackReservation,
              businessStatus: "OPERATIONAL",
              openingHours: suggestion.openingHours,
              tabelog: suggestion.tabelog,
            };
          })
        );

        candidateSights = (enrichedSuggestions.filter(Boolean) as Place[]).filter(
          (p) => !isPlaceClosed(p)
        );

        try {
          localStorage.setItem(cacheKeyV7, JSON.stringify(candidateSights));
        } catch {
          sessionStorage.setItem(cacheKeyV7, JSON.stringify(candidateSights));
        }
      } catch (err: any) {
        aiErrorOccurred = err;
        console.warn("Failed to fetch suggestions from Gemini API, falling back to local dataset:", err);
      }
    }

    // Fallback to mock data if needed (or if in mock mode)
    if (candidateSights.length === 0) {
      const isKyoto = Math.abs(anchor.lat - 35.01) < 0.3 && Math.abs(anchor.lng - 135.76) < 0.3;
      const isTokyo = Math.abs(anchor.lat - 35.68) < 0.4 && Math.abs(anchor.lng - 139.76) < 0.4;
      const pool =
        type === "food"
          ? isKyoto
            ? KYOTO_FOOD
            : isTokyo
              ? TOKYO_FOOD
              : getGenericFood(anchor.lat, anchor.lng)
          : isKyoto
            ? KYOTO_SIGHTS
            : isTokyo
              ? TOKYO_SIGHTS
              : getGenericSights(anchor.lat, anchor.lng);

      const rejectedSet = new Set(rejectedNames.map((n) => n.toLowerCase()));
      const available = pool.filter(
        (s) =>
          !existingNames.has(s.name.toLowerCase()) &&
          !rejectedSet.has(s.name.toLowerCase())
      );

      const seen = pool.filter(
        (s) =>
          !existingNames.has(s.name.toLowerCase()) &&
          rejectedSet.has(s.name.toLowerCase())
      );

      // If user explicitly requested refresh in real mode and AI threw an error,
      // and no fresh fallback sights exist, surface the AI error to caller
      if (forceRefresh && appMode === "real" && aiErrorOccurred && available.length === 0) {
        throw aiErrorOccurred;
      }

      // Prioritize fresh sights first; fill remaining slots from seen (shuffled)
      const shuffledAvailable = [...available].sort(() => Math.random() - 0.5);
      const shuffledSeen = [...seen].sort(() => Math.random() - 0.5);
      candidateSights = [...shuffledAvailable, ...shuffledSeen];
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

  // Prioritize unrejected/fresh suggestions first, then closest to any hotel
  const rejectedSet = new Set(rejectedNames.map((n) => n.toLowerCase()));
  allSuggestions.sort((a, b) => {
    const aRej = rejectedSet.has(a.name.toLowerCase()) ? 1 : 0;
    const bRej = rejectedSet.has(b.name.toLowerCase()) ? 1 : 0;
    if (aRej !== bRej) return aRej - bRej;
    return a._nearestHotelDistanceM - b._nearestHotelDistanceM;
  });

  const topSuggestions = allSuggestions.slice(0, 10);

  if (appMode === "real") {
    await Promise.all(
      topSuggestions.map(async (s) => {
        if (!s.photoUrl) {
          try {
            const freshUrl = await fetchFreshPhoto({
              id: s.id,
              name: s.name,
              address: s.address,
              lat: s.lat,
              lng: s.lng,
            });
            if (freshUrl) s.photoUrl = freshUrl;
          } catch {
            s.photoUrl = undefined;
          }
        }
      })
    );
  }

  return topSuggestions.map((s) => ({
    id: s.id,
    name: s.name,
    romanizedName: s.romanizedName,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    category: s.category,
    estimatedDuration: s.estimatedDuration,
    description: s.tabelog?.rating
      ? formatDescriptionWithTabelog(s.description, s.tabelog.rating, s.tabelog.award)
      : stripTabelogPrefix(s.description),
    descriptionSource: "ai" as const,
    dayIndex: null,
    orderInDay: null,
    pinnedToDay: false,
    photoUrl: s.photoUrl || undefined,
    highlight: s.highlight || getSpecificMockHighlight(s),
    priceEstimate: s.priceEstimate || getSpecificMockPrice(s),
    reservation: s.reservation || getSpecificMockReservation(s),
    nearestHotel: s._nearestHotelName
      ? { name: s._nearestHotelName, distanceM: s._nearestHotelDistanceM }
      : undefined,
    openingHours: s.openingHours,
    tabelog: s.tabelog,
    businessStatus: s.businessStatus,
    types: s.types,
    googlePlaceId: s.googlePlaceId,
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
  flights: (Place | null)[] = [],
  type: RecommendationType = "sights"
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
    const cacheKeyV7 = `re_route_suggestions_v7_${type}_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cacheKeyV6 = `re_route_suggestions_v6_${type}_${anchor.lat.toFixed(2)}_${anchor.lng.toFixed(2)}`;
    const cachedData =
      localStorage.getItem(cacheKeyV7) ||
      sessionStorage.getItem(cacheKeyV7) ||
      localStorage.getItem(cacheKeyV6) ||
      sessionStorage.getItem(cacheKeyV6);
    if (!cachedData) return null; // not cached yet

    try {
      const candidateSights: any[] = JSON.parse(cachedData);
      for (const s of candidateSights) {
        if (isPlaceClosed(s)) continue;
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

