export const config = {
  runtime: "edge",
};

const MODEL = "gemini-3.8-flash";

const callGeminiWithRetry = async (apiKey: string, body: any, retries = 2): Promise<Response> => {
  const models = [MODEL, "gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3-flash-preview", "gemini-3.5-flash-lite", "gemini-3.7-flash"];
  let lastRes: Response | null = null;
  
  for (let i = 0; i <= retries; i++) {
    const currentModel = models[i % models.length];
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) return res;
      lastRes = res;

      // Retry on 503 (High Demand) or 429 (Rate limit)
      if ((res.status === 503 || res.status === 429) && i < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return lastRes!;
};

const parseJsonResponse = <T>(rawText: string): T => {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
};

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured on the server" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { lat, lng, rejectedNames = [], type = "sights" } = body;

    if (lat === undefined || lng === undefined) {
      return new Response(
        JSON.stringify({ error: "Missing lat or lng coordinates" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const isFood = type === "food";
    const prompt = isFood
      ? `
      You are a professional culinary travel expert, food critic, and local guide. I need 8 to 10 highly rated, iconic restaurants, authentic local eateries, famous food stalls, street markets, or specialty cafes near latitude ${lat}, longitude ${lng}.
      DO NOT recommend any of these places: ${(rejectedNames || []).join(", ") || "None"}.
      
      CRITICAL OPERATIONAL REQUIREMENT:
      - ONLY suggest places that are currently OPEN and fully OPERATIONAL as of today.
      - Absolutely DO NOT suggest any places that have permanently closed, ceased operations, temporarily closed, shut down, gone out of business, or relocated.
      - If a well-known establishment is no longer in business, skip it entirely and provide a current, active, open alternative.

      Focus on places celebrated for distinct must-try dishes, beloved local classics, or exceptional dining experiences.
      
      For each place, provide:
      - 3-7 comma-separated, punchy phrases highlighting the core food vibe, specialties, and dining atmosphere in "description".
      - Categorize into one of: restaurant, coffee_shop, nightlife, shopping.
      - Estimated dining/visit duration in minutes in "estimatedDuration" (typically 45-90 mins).
      - If name contains foreign characters (Japanese Kanji/Kana, etc.), provide clean romanized/English name in "romanizedName", otherwise null.
      - Typical cost per person in local currency (e.g. "¥1,000 - ¥2,500", "$15 - $35 / person") in "priceEstimate".
      - Operating hours in "openingHours" as an array of strings e.g. ["Monday: 11:30 AM – 2:30 PM, 5:30 – 9:30 PM", "Tuesday: ..."] or ["11:00 AM – 9:00 PM daily"].
      - CRITICAL HIGHLIGHT GUIDELINES in "highlight": { "label": "Must-Try" | "Must-Order", "text": "Exact signature dish name, specialty cut of meat, noodle broth, dessert, or drink this venue is famous for" }.
      - RESERVATION GUIDELINES in "reservation":
        {
          "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
          "advanceTime": <string with concrete timing, e.g. "Walk-ins only; line forms 15m before opening", "Walk-ins only; peak wait 30m at dinner", "Reserve 1 month ahead via official site", "No reservation needed">,
          "notes": <string or null>
        }
      - TABELOG GUIDELINES (FOR RESTAURANTS/CAFES IN JAPAN):
        If this venue is in Japan, provide its official Tabelog (食べログ) URL and award:
        "tabelog": {
          "rating": null,
          "url": <string official Tabelog url e.g. "https://tabelog.com/...", or null>,
          "award": <string e.g. "Hyakumeiten 2024", "Bronze", or null>
        }
        CRITICAL: DO NOT AI-GENERATE OR GUESS RATINGS. Always set "rating" to null.
        NEVER put star ratings, numbers, or Tabelog prefixes into the "description" field. Keep "description" purely focused on food, dishes, and atmosphere.
        If not in Japan, set "tabelog" to null.

      Return ONLY a JSON array of objects with this exact structure:
      [
        {
          "name": "Exact Place Name",
          "romanizedName": "string or null",
          "description": "Short punchy description highlighting food vibe and famous dishes.",
          "category": "restaurant" | "coffee_shop" | "nightlife" | "shopping",
          "lat": number,
          "lng": number,
          "estimatedDuration": number,
          "priceEstimate": "string",
          "openingHours": ["string"],
          "highlight": {
            "label": "Must-Try" | "Must-Order",
            "text": "Exact dish name"
          },
          "reservation": {
            "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
            "advanceTime": "string",
            "notes": "string or null"
          },
          "tabelog": {
            "rating": null,
            "url": "https://tabelog.com/...",
            "award": "Hyakumeiten 2024"
          }
        }
      ]
    `
      : `
      You are a professional travel planner. I need 8 to 10 highly recommended tourist attractions near latitude ${lat}, longitude ${lng}.
      DO NOT recommend any of these places: ${(rejectedNames || []).join(", ") || "None"}.
      
      CRITICAL OPERATIONAL REQUIREMENT:
      - ONLY suggest attractions and sights that are currently OPEN, accessible, and fully OPERATIONAL as of today.
      - Absolutely DO NOT suggest any places, attractions, theme parks, markets, or museums that have permanently closed, ceased operations, temporarily closed, shut down, or gone out of business.
      - If a well-known spot has closed or relocated, skip it entirely and recommend an active, open alternative.
      
      For each place, provide:
      - 3-7 comma-separated, punchy phrases highlighting the core vibe and what it's famous for in "description".
      - Categorize into one of: museum, restaurant, coffee_shop, park, landmark, shopping, entertainment, beach, religious_site, nightlife, other.
      - Estimated visit duration in minutes in "estimatedDuration".
      - If name contains non-Latin characters, provide clean romanized/English transliteration in "romanizedName", otherwise null.
      - Typical cost or admission fee per person in local currency (e.g. "Free", "¥600", "$15 - $25 / person") in "priceEstimate".
        If admission or access is completely free, explicitly set "priceEstimate" to "Free".
      - Typical operating hours in "openingHours" as an array of strings e.g. ["Monday: 9:00 AM – 5:00 PM", ...] or ["Open 24 hours"].
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
          "advanceTime": <string with concrete timing, e.g. "Reserve 1 month in advance", "Opens 30 days prior at midnight", "Walk-ins only; line forms 15m before opening", "No reservation needed">,
          "notes": <string or null>
        }

      Return ONLY a JSON array of objects with this exact structure:
      [
        {
          "name": "Exact Place Name",
          "romanizedName": "string or null",
          "description": "Short punchy description highlighting vibe and what it is famous for.",
          "category": "museum" | "restaurant" | "coffee_shop" | "park" | "landmark" | "shopping" | "entertainment" | "beach" | "religious_site" | "nightlife" | "other",
          "lat": number,
          "lng": number,
          "estimatedDuration": number,
          "priceEstimate": "string",
          "openingHours": ["string"],
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

    const geminiRes = await callGeminiWithRetry(apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    if (!geminiRes.ok) {
      const errorData = await geminiRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          error: errorData.error?.message || "Gemini API request failed",
          isQuota: geminiRes.status === 429,
        }),
        {
          status: geminiRes.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data = await geminiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return new Response(JSON.stringify({ error: "Empty response from Gemini" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsed = parseJsonResponse(rawText);
    const stripPrefix = (desc?: string | null) => {
      if (!desc) return "";
      return desc.replace(/^(?:\[Tabelog\s*[^\]]*\]|★\s*\d+(?:\.\d+)?(?:\s*stars?)?(?:\s*Tabelog)?(?:\s*\([^)]*\))?|(?:★\s*)?Tabelog(?:\s*★)?(?:\s*\d+(?:\.\d+)?)?(?:\s*\([^)]*\))?)\s*[•—–|\-:]?\s*/i, "").trim();
    };

    if (Array.isArray(parsed)) {
      parsed.forEach((item: any) => {
        if (item && item.description) {
          item.description = stripPrefix(item.description);
        }
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
