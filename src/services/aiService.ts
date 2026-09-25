import { PlaceCategory, ReservationInfo, TabelogInfo } from "../types";
import { isLocalDev } from "../utils/envUtils";
import { formatDescriptionWithTabelog } from "../utils/tabelogUtils";
import { hasNonLatinScript } from "../utils/textUtils";
import { emitApiError } from "./apiErrorBus";
import { apiUsageService } from "./apiUsageService";

const FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-flash-lite-latest",
];

export interface AISummary {
  description: string;
  category: PlaceCategory;
  estimatedDuration: number;
  romanizedName?: string | null;
  highlight?: { label: string; text: string } | null;
  priceEstimate?: string;
  reservation?: ReservationInfo;
  tabelog?: TabelogInfo | null;
}

const parseJsonResponse = <T>(rawText: string): T => {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
};

const callGeminiDirectWithFallback = async (
  apiKey: string,
  payload: any,
  signal?: AbortSignal
): Promise<any> => {
  let lastError: Error | null = null;

  for (let i = 0; i < FALLBACK_MODELS.length; i++) {
    const model = FALLBACK_MODELS[i];
    try {
      apiUsageService.recordCall("gemini");
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
        }
      );

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response from Gemini");
        return parseJsonResponse(text);
      }

      let errorMessage = `Failed with status ${response.status}`;
      let isQuota = response.status === 429;
      try {
        const errJson = await response.json();
        errorMessage = errJson.error?.message || errorMessage;
        if (errorMessage.includes("Quota exceeded")) isQuota = true;
      } catch (e) {}

      // If we have more fallback models available, log warning and try next
      if (i < FALLBACK_MODELS.length - 1) {
        console.warn(
          `[Gemini] Model ${model} returned ${response.status} (${errorMessage}). Trying fallback model ${FALLBACK_MODELS[i + 1]}...`
        );
        // Delay briefly if rate-limited or experiencing server demand spike
        if (response.status === 503 || response.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        continue;
      }

      lastError = new Error(errorMessage);
      emitApiError({ source: "gemini", message: errorMessage, isQuota });
      throw lastError;
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
      lastError = err;
      if (i < FALLBACK_MODELS.length - 1) {
        continue;
      }
    }
  }

  if (lastError) {
    emitApiError({ source: "gemini", message: lastError.message, isQuota: false });
  }
  throw lastError || new Error("All Gemini model attempts failed");
};

export const summarizePlace = async (
  name: string,
  address: string,
  types: string[],
  _retries = 3,
  signal?: AbortSignal
): Promise<AISummary> => {
  const customKey = apiUsageService.getCustomGeminiKey();
  const activeKey = apiUsageService.getActiveGeminiKey();

  // 1. If no custom key and running on Vercel deployment, try secure serverless proxy first
  if (!customKey && !isLocalDev()) {
    try {
      apiUsageService.recordCall("gemini");
      const proxyRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place: { name, address, types } }),
        signal,
      });

      if (proxyRes.ok) {
        return await proxyRes.json();
      }

      if (proxyRes.status !== 404 && proxyRes.status !== 500) {
        const errData = await proxyRes.json().catch(() => ({}));
        const msg = errData.error || "Failed to summarize place";
        emitApiError({ source: "gemini", message: msg, isQuota: proxyRes.status === 429 });
        throw new Error(msg);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
      if (!activeKey) {
        throw err;
      }
    }
  }

  // 2. Direct client fallback / Custom BYOK Key execution
  if (!activeKey) {
    throw new Error("Gemini API is not configured. Please add an API key in API Budget / BYOK.");
  }

  const prompt = `
    Analyze the following place: "${name}" at "${address}".
    Google Maps types: ${types.join(", ")}.

    Provide 3-7 comma-separated, punchy phrases highlighting the core vibe and what it's famous for (e.g. "Best matcha in Kyoto, quiet atmosphere, historic architecture"). 
    IMPORTANT: Make it sound natural, casual, and straight to the point. NO fluff, NO typical AI marketing speak (avoid words like "bustling", "vibrant", "unforgettable").
    Also, categorize it into one of these: museum, restaurant, coffee_shop, park, landmark, shopping, entertainment, beach, religious_site, nightlife, other.
    Suggest a typical visit duration in minutes.
    If the place name contains foreign or non-Latin scripts (Japanese Kanji/Kana, Chinese Hanzi, Thai, Korean Hangul, etc.), provide its common English/romanized transliteration in "romanizedName" (e.g. "Senso-ji" for "浅草寺", "Wat Phra Kaew" for "วัดพระแก้ว"). If already English/Latin, return null.

    Also estimate the typical cost or admission fee per person in local currency (e.g. "Free", "¥600", "$15 - $25 / person").
    If admission or access is completely free (such as public parks, temples/shrines with no admission fee, walking streets, beaches, viewpoints), explicitly set "priceEstimate" to "Free".
    For restaurants and cafes, estimate average price per person (e.g. "¥1,000 - ¥2,000", "$15 - $25").

    CRITICAL HIGHLIGHT GUIDELINES:
    Highlights must NEVER be generic or vague (DO NOT say "try the signature dish", "explore various shops", "try their coffee", or "sample street food"). Provide ultra-specific, concrete recommendations:
    - For restaurant: label="Must-Try", text=<Name the EXACT dish name(s) or signature menu item this venue is famous for, e.g. "Tsukemen with rich pork-seafood dipping broth", "A5 Miyazaki Wagyu Sukiyaki set", "Truffle Xiao Long Bao", "Crispy Berkshire pork katsu">
    - For coffee_shop: label="Must-Order", text=<Name the EXACT specialty brew, signature drink, or pastry, e.g. "Single-origin Geisha pour-over and pistachio croissant", "Kyoto Uji Matcha Latte with warabimochi">
    - For landmark/museum: label="Best Photo Spot" or "Must-See", text=<Name the EXACT vantage point, angle, specific room, or exhibit, e.g. "8th floor observation deck across the street at the Culture Center for unobstructed aerial views", "Room 204 Impressionist gallery">
    - For park/beach: label="Best Time to Visit" or "Scenic Spot", text=<Name the EXACT spot or optimal timing, e.g. "North pond garden early in the morning", "West rock viewpoint 30 mins before sunset">
    - For religious_site: label="Visitor Tip" or "Must-See", text=<Specific inner garden, tranquil courtyard, or etiquette, e.g. "Walk past the crowded main hall to the quiet back garden and pagoda">
    - For shopping (malls, markets, street markets): label="Where to Go" or "What to Buy", text=<Name the EXACT store, stall number, famous vendor, or floor, e.g. "Stall #24 for freshly grilled scallops on skewers", "B1 Depachika food hall for fresh seasonal mochi", "6th floor character & anime specialty shops">
    - For nightlife/entertainment: label="Best Time to Go" or "Top Experience", text=<Specific peak time, signature cocktail, or booking tip>
    - For other: label="Pro Tip" or "Advice", text=<Actionable, concrete insider advice with specific names/details>
    RESERVATION GUIDELINES:
    Determine if reservations or advance tickets are needed/recommended, and provide actionable booking window guidance:
    - "reservation": {
        "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
        "advanceTime": <string with concrete timing. For walk_ins_only ALWAYS include queue timing if applicable, e.g. "Walk-ins only; arrive 15–20 min before opening to queue", "Walk-ins only; no queue needed, opens 10:00 AM daily". For reservations: "Reserve 1 month in advance", "Book 2-4 weeks ahead via official website", "Opens 30 days prior at midnight". For no reservation: "No reservation needed">,
        "notes": <string or null, e.g. "Online timed-entry ticket required", "Book via TableCheck/Tabelog", or null>
      }

    TABELOG GUIDELINES (FOR RESTAURANTS IN JAPAN):
    If this place is a restaurant in Japan:
    - Identify its official Tabelog (食べログ) listing if available.
    - "tabelog": {
        "rating": <number e.g. 3.74, or null if unknown>,
        "url": <string official Tabelog url e.g. "https://tabelog.com/...", or null>,
        "award": <string e.g. "Hyakumeiten 2024", "Bronze", or null>
      }
    - If a Tabelog rating is identified (e.g. 3.74), PREPEND it to the beginning of the "description" field in the exact format:
      "★ 3.74 Tabelog • <description text>"
    If not a restaurant in Japan, set "tabelog" to null.

    Return ONLY a JSON object in this format:
    {
      "description": "string",
      "category": "string",
      "estimatedDuration": number,
      "romanizedName": "string or null",
      "priceEstimate": "string",
      "highlight": {
        "label": "string",
        "text": "string"
      },
      "reservation": {
        "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
        "advanceTime": "string",
        "notes": "string or null"
      },
      "tabelog": {
        "rating": "number or null",
        "url": "string or null",
        "award": "string or null"
      }
    }
  `;

  const rawResult = await callGeminiDirectWithFallback(
    activeKey,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    },
    signal
  );

  if (rawResult && rawResult.tabelog?.rating) {
    rawResult.description = formatDescriptionWithTabelog(
      rawResult.description,
      rawResult.tabelog.rating,
      rawResult.tabelog.award
    );
  }

  return rawResult;
};

export const summarizePlacesBatch = async (
  places: { id: string; name: string; address: string; types: string[] }[],
  _retries = 3,
  signal?: AbortSignal
): Promise<(AISummary & { id: string })[]> => {
  const customKey = apiUsageService.getCustomGeminiKey();
  const activeKey = apiUsageService.getActiveGeminiKey();

  // 1. If no custom key and running on Vercel deployment, try secure serverless proxy first
  if (!customKey && !isLocalDev()) {
    try {
      apiUsageService.recordCall("gemini");
      const proxyRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ places }),
        signal,
      });

      if (proxyRes.ok) {
        const batchResults = await proxyRes.json();
        if (Array.isArray(batchResults)) {
          return batchResults.map((r: any) => {
            if (r.tabelog?.rating) {
              r.description = formatDescriptionWithTabelog(
                r.description,
                r.tabelog.rating,
                r.tabelog.award
              );
            }
            return r;
          });
        }
        return batchResults;
      }

      if (proxyRes.status !== 404 && proxyRes.status !== 500) {
        const errData = await proxyRes.json().catch(() => ({}));
        const msg = errData.error || "Failed to batch summarize places";
        emitApiError({ source: "gemini", message: msg, isQuota: proxyRes.status === 429 });
        throw new Error(msg);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
      if (!activeKey) {
        throw err;
      }
    }
  }

  // 2. Direct client fallback / Custom BYOK Key execution
  if (!activeKey) {
    throw new Error("Gemini API is not configured. Please add an API key in API Budget / BYOK.");
  }

  const prompt = `
    Analyze the following list of places. For each place, provide 3-7 comma-separated, punchy phrases highlighting the core vibe and what it's famous for. 
    IMPORTANT: Make it sound natural, casual, and straight to the point. NO fluff, NO typical AI marketing speak (avoid words like "bustling", "vibrant", "unforgettable").
    Also, categorize each into one of these: museum, restaurant, coffee_shop, park, landmark, shopping, entertainment, beach, religious_site, nightlife, other.
    Suggest a typical visit duration in minutes.
    If the place name contains foreign or non-Latin scripts (Japanese Kanji/Kana, Chinese Hanzi, Thai, Korean Hangul, etc.), provide its clean English/romanized transliteration in "romanizedName" (e.g. "Senso-ji" for "浅草寺", "Wat Phra Kaew" for "วัดพระแก้ว"). If already in English/Latin, return null.

    Also estimate the typical cost or admission fee per person in local currency (e.g. "Free", "¥600", "$15 - $25 / person").
    If admission or access is completely free (such as public parks, temples/shrines with no admission fee, walking streets, beaches, viewpoints), explicitly set "priceEstimate" to "Free".
    For restaurants and cafes, estimate average price per person (e.g. "¥1,000 - ¥2,000", "$15 - $25").

    CRITICAL HIGHLIGHT GUIDELINES:
    Highlights must NEVER be generic or vague (DO NOT say "try the signature dish", "explore various shops", "try their coffee", or "sample street food"). Provide ultra-specific, concrete recommendations:
    - For restaurant: label="Must-Try", text=<Name the EXACT dish name(s) or signature menu item this venue is famous for, e.g. "Tsukemen with rich pork-seafood dipping broth", "A5 Miyazaki Wagyu Sukiyaki set", "Truffle Xiao Long Bao", "Crispy Berkshire pork katsu">
    - For coffee_shop: label="Must-Order", text=<Name the EXACT specialty brew, signature drink, or pastry, e.g. "Single-origin Geisha pour-over and pistachio croissant", "Kyoto Uji Matcha Latte with warabimochi">
    - For landmark/museum: label="Best Photo Spot" or "Must-See", text=<Name the EXACT vantage point, angle, specific room, or exhibit, e.g. "8th floor observation deck across the street at the Culture Center for unobstructed aerial views", "Room 204 Impressionist gallery">
    - For park/beach: label="Best Time to Visit" or "Scenic Spot", text=<Name the EXACT spot or optimal timing, e.g. "North pond garden early in the morning", "West rock viewpoint 30 mins before sunset">
    - For religious_site: label="Visitor Tip" or "Must-See", text=<Specific inner garden, tranquil courtyard, or etiquette, e.g. "Walk past the crowded main hall to the quiet back garden and pagoda">
    - For shopping (malls, markets, street markets): label="Where to Go" or "What to Buy", text=<Name the EXACT store, stall number, famous vendor, or floor, e.g. "Stall #24 for freshly grilled scallops on skewers", "B1 Depachika food hall for fresh seasonal mochi", "6th floor character & anime specialty shops">
    - For nightlife/entertainment: label="Best Time to Go" or "Top Experience", text=<Specific peak time, signature cocktail, or booking tip>
    - For other: label="Pro Tip" or "Advice", text=<Actionable, concrete insider advice with specific names/details>
    RESERVATION GUIDELINES:
    Determine if reservations or advance tickets are needed/recommended, and provide actionable booking window guidance:
    - "reservation": {
        "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
        "advanceTime": <string with concrete timing. For walk_ins_only ALWAYS include queue timing if applicable, e.g. "Walk-ins only; arrive 15–20 min before opening to queue", "Walk-ins only; no queue needed, opens 10:00 AM daily", "Walk-ins only; peak wait 30–45 min at lunch". For reservations: "Reserve 1 month in advance", "Book 2-4 weeks ahead via official website". For no reservation: "No reservation needed">,
        "notes": <string or null, e.g. "Online timed-entry ticket required", "Book via TableCheck/Tabelog", or null>
      }

    TABELOG GUIDELINES (FOR RESTAURANTS IN JAPAN):
    If a place is a restaurant in Japan:
    - Identify its official Tabelog (食べログ) listing if available.
    - "tabelog": {
        "rating": <number e.g. 3.74, or null if unknown>,
        "url": <string official Tabelog url e.g. "https://tabelog.com/...", or null>,
        "award": <string e.g. "Hyakumeiten 2024", "Bronze", or null>
      }
    - If a Tabelog rating is identified (e.g. 3.74), PREPEND it to the beginning of the "description" field in the exact format:
      "★ 3.74 Tabelog • <description text>"
    If not a restaurant in Japan, set "tabelog" to null.

    Places:
    ${places.map(p => `ID: "${p.id}", Name: "${p.name}", Address: "${p.address}", Types: ${p.types.join(", ")}`).join("\n\n")}

    Return ONLY a JSON array of objects, with each object in this exact format:
    [
      {
        "id": "Exact ID provided above",
        "description": "string",
        "category": "string",
        "estimatedDuration": number,
        "romanizedName": "string or null",
        "priceEstimate": "string",
        "highlight": {
          "label": "string",
          "text": "string"
        },
        "reservation": {
          "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
          "advanceTime": "string",
          "notes": "string or null"
        },
        "tabelog": {
          "rating": "number or null",
          "url": "string or null",
          "award": "string or null"
        }
      }
    ]
  `;

  const rawBatchResults = await callGeminiDirectWithFallback(
    activeKey,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    },
    signal
  );

  if (Array.isArray(rawBatchResults)) {
    return rawBatchResults.map((r: any) => {
      if (r.tabelog?.rating) {
        r.description = formatDescriptionWithTabelog(
          r.description,
          r.tabelog.rating,
          r.tabelog.award
        );
      }
      return r;
    });
  }

  return rawBatchResults;
};

/**
 * Direct lookup for Tabelog rating and URL for a restaurant in Japan.
 */
export const fetchTabelogInfo = async (
  name: string,
  address: string,
  romanizedName?: string,
  signal?: AbortSignal
): Promise<TabelogInfo | null> => {
  const activeKey = apiUsageService.getActiveGeminiKey();
  if (!activeKey) return null;

  const prompt = `
    Find the official Tabelog (食べログ - tabelog.com) restaurant listing and current score for:
    Name: "${name}"
    ${romanizedName ? `Romanized Name: "${romanizedName}"` : ""}
    Address: "${address}"

    Tabelog is Japan's premier restaurant review website.
    Return ONLY a JSON object:
    {
      "rating": <number e.g. 3.74, or null if not found>,
      "url": <direct string URL e.g. "https://tabelog.com/tokyo/A1301/...", or null>,
      "award": <string e.g. "Hyakumeiten 2024", "The Tabelog Award 2024 Bronze", or null>
    }
  `;

  try {
    const res = await callGeminiDirectWithFallback(
      activeKey,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      },
      signal
    );

    if (res && (typeof res.rating === "number" || typeof res.url === "string")) {
      return {
        rating: typeof res.rating === "number" ? res.rating : undefined,
        url: typeof res.url === "string" ? res.url : undefined,
        award: typeof res.award === "string" ? res.award : undefined,
        savedAt: Date.now(),
      };
    }
    return null;
  } catch (err) {
    console.error("fetchTabelogInfo error:", err);
    return null;
  }
};

export const romanizePlaceNames = async (
  places: { id: string; name: string; address?: string }[],
  signal?: AbortSignal
): Promise<{ id: string; romanizedName: string | null }[]> => {
  const activeKey = apiUsageService.getActiveGeminiKey();
  if (!activeKey) return [];

  const foreignPlaces = places.filter((p) => hasNonLatinScript(p.name));
  if (foreignPlaces.length === 0) return [];

  const prompt = `
    For the following place names that contain foreign or non-Latin scripts (Japanese Kanji/Kana, Chinese Hanzi, Thai, Korean Hangul, Arabic, Cyrillic, etc.), provide their standard English/romanized transliteration (e.g. Hepburn for Japanese, Pinyin for Chinese, RTGS for Thai). If already Latin or untranslatable, return null.

    Places:
    ${foreignPlaces.map((p) => `ID: "${p.id}", Name: "${p.name}", Address: "${p.address || ""}"`).join("\n")}

    Return ONLY a JSON array of objects:
    [
      {
        "id": "Exact ID provided above",
        "romanizedName": "English/romanized name or null"
      }
    ]
  `;

  try {
    return await callGeminiDirectWithFallback(
      activeKey,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      },
      signal
    );
  } catch (err) {
    console.warn("Failed to romanize place names:", err);
    return [];
  }
};

export const generateHighlightsBatch = async (
  places: { id: string; name: string; address?: string; category?: PlaceCategory; description?: string }[],
  signal?: AbortSignal
): Promise<{ id: string; highlight: { label: string; text: string } }[]> => {
  const activeKey = apiUsageService.getActiveGeminiKey();
  if (!activeKey || places.length === 0) return [];

  const prompt = `
    CRITICAL HIGHLIGHT GUIDELINES:
    Highlights must NEVER be generic or vague (DO NOT say "try the signature dish", "explore various shops", "try their coffee", or "sample street food"). Provide ultra-specific, concrete recommendations:
    - For restaurant: label="Must-Try", text=<Name the EXACT dish name(s) or signature menu item this venue is famous for, e.g. "Tsukemen with rich pork-seafood dipping broth", "A5 Miyazaki Wagyu Sukiyaki set", "Truffle Xiao Long Bao", "Crispy Berkshire pork katsu">
    - For coffee_shop: label="Must-Order", text=<Name the EXACT specialty brew, signature drink, or pastry, e.g. "Single-origin Geisha pour-over and pistachio croissant", "Kyoto Uji Matcha Latte with warabimochi">
    - For landmark/museum: label="Best Photo Spot" or "Must-See", text=<Name the EXACT vantage point, angle, specific room, or exhibit, e.g. "8th floor observation deck across the street at the Culture Center for unobstructed aerial views", "Room 204 Impressionist gallery">
    - For park/beach: label="Best Time to Visit" or "Scenic Spot", text=<Name the EXACT spot or optimal timing, e.g. "North pond garden early in the morning", "West rock viewpoint 30 mins before sunset">
    - For religious_site: label="Visitor Tip" or "Must-See", text=<Specific inner garden, tranquil courtyard, or etiquette, e.g. "Walk past the crowded main hall to the quiet back garden and pagoda">
    - For shopping (malls, markets, street markets): label="Where to Go" or "What to Buy", text=<Name the EXACT store, stall number, famous vendor, or floor, e.g. "Stall #24 for freshly grilled scallops on skewers", "B1 Depachika food hall for fresh seasonal mochi", "6th floor character & anime specialty shops">
    - For nightlife/entertainment: label="Best Time to Go" or "Top Experience", text=<Specific peak time, signature cocktail, or booking tip>
    - For other: label="Pro Tip" or "Advice", text=<Actionable, concrete insider advice with specific names/details>
    Keep the highlight text concise (1-2 sentences), punchy, and naming concrete things.

    Places:
    ${places.map((p) => `ID: "${p.id}", Name: "${p.name}", Category: "${p.category || "other"}", Address: "${p.address || ""}", Existing Description: "${p.description || ""}"`).join("\n\n")}

    Return ONLY a JSON array of objects:
    [
      {
        "id": "Exact ID provided above",
        "highlight": {
          "label": "string",
          "text": "string"
        }
      }
    ]
  `;

  try {
    return await callGeminiDirectWithFallback(
      activeKey,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      },
      signal
    );
  } catch (err) {
    console.warn("Failed to generate highlights:", err);
    return [];
  }
};

export interface SuggestedSight {
  name: string;
  description: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  estimatedDuration: number;
  highlight?: { label: string; text: string };
  priceEstimate?: string;
  reservation?: ReservationInfo;
}

export const suggestSights = async (
  lat: number,
  lng: number,
  rejectedNames: string[],
  _retries = 3
): Promise<SuggestedSight[]> => {
  const customKey = apiUsageService.getCustomGeminiKey();
  const activeKey = apiUsageService.getActiveGeminiKey();

  // 1. If no custom key and running on Vercel deployment, try secure serverless proxy first
  if (!customKey && !isLocalDev()) {
    try {
      apiUsageService.recordCall("gemini");
      const proxyRes = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, rejectedNames }),
      });

      if (proxyRes.ok) {
        return await proxyRes.json();
      }

      if (proxyRes.status !== 404 && proxyRes.status !== 500) {
        const errData = await proxyRes.json().catch(() => ({}));
        const msg = errData.error || "Failed to fetch suggestions";
        emitApiError({ source: "gemini", message: msg, isQuota: proxyRes.status === 429 });
        throw new Error(msg);
      }
    } catch (err: any) {
      if (!activeKey) {
        console.warn("Serverless suggest failed and no client key available:", err);
        return [];
      }
    }
  }

  // 2. Direct client fallback / Custom BYOK Key execution
  if (!activeKey) {
    return [];
  }

  const prompt = `
    You are a professional travel planner. I need exactly 6 highly recommended tourist attractions near latitude ${lat}, longitude ${lng}.
    DO NOT recommend any of these places: ${rejectedNames.join(", ") || "None"}.
    
    For each place, provide:
    - 3-7 comma-separated, punchy phrases highlighting the core vibe and what it's famous for in "description".
    - Categorize into one of: museum, restaurant, coffee_shop, park, landmark, shopping, entertainment, beach, religious_site, nightlife, other.
    - Estimated visit duration in minutes in "estimatedDuration".
    - Typical cost or admission fee per person in local currency (e.g. "Free", "¥600", "$15 - $25 / person") in "priceEstimate".
      If admission or access is completely free, explicitly set "priceEstimate" to "Free".
    - CRITICAL HIGHLIGHT GUIDELINES in "highlight": { "label": "string", "text": "string" }:
      Highlights must NEVER be generic. Provide ultra-specific, concrete recommendations:
      * For restaurant: label="Must-Try", text=<Name the EXACT signature dish>
      * For coffee_shop: label="Must-Order", text=<Name the EXACT specialty brew, drink, or pastry>
      * For landmark/museum: label="Best Photo Spot" or "Must-See", text=<Name the EXACT vantage point, angle, or exhibit>
      * For park/beach: label="Best Time to Visit" or "Scenic Spot", text=<Name the EXACT spot or optimal timing>
      * For religious_site: label="Visitor Tip" or "Must-See", text=<Specific inner garden, courtyard, or etiquette>
      * For shopping: label="Where to Go" or "What to Buy", text=<Name the EXACT store, stall number, or floor>
      * For nightlife/entertainment: label="Best Time to Go" or "Top Experience"
      * For other: label="Pro Tip" or "Advice"
    - RESERVATION GUIDELINES in "reservation":
      {
        "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
        "advanceTime": <string with concrete timing. For walk_ins_only ALWAYS include queue timing if applicable, e.g. "Walk-ins only; arrive 15–20 min before opening to queue", "Walk-ins only; no queue needed", "Walk-ins only; peak wait 30 min at dinner hour". For reservations: "Reserve 1 month in advance", "Opens 30 days prior at midnight". For no reservation: "No reservation needed">,
        "notes": <string or null>
      }

    Return ONLY a JSON array of objects with this exact structure:
    [
      {
        "name": "Exact Place Name",
        "description": "Short punchy description highlighting vibe and what it is famous for.",
        "category": "museum" | "restaurant" | "coffee_shop" | "park" | "landmark" | "shopping" | "entertainment" | "beach" | "religious_site" | "nightlife" | "other",
        "lat": number,
        "lng": number,
        "estimatedDuration": number,
        "priceEstimate": "string",
        "highlight": {
          "label": "string",
          "text": "string"
        },
        "reservation": {
          "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
          "advanceTime": "string",
          "notes": "string or null"
        }
      }
    ]
  `;

  try {
    return await callGeminiDirectWithFallback(
      activeKey,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }
    );
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return [];
  }
};
