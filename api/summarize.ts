export const config = {
  runtime: "edge",
};

const MODEL = "gemini-3.5-flash-lite";

const callGeminiWithRetry = async (apiKey: string, body: any, retries = 2): Promise<Response> => {
  const models = [MODEL, "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.6-flash"];
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
    const { place, places } = body;

    let prompt = "";
    if (places && Array.isArray(places)) {
      prompt = `
        Analyze the following list of places. For each place, provide 3-7 comma-separated, punchy phrases highlighting the core vibe and what it's famous for. 
        IMPORTANT: Make it sound natural, casual, and straight to the point. NO fluff, NO typical AI marketing speak (avoid words like "bustling", "vibrant", "unforgettable").
        Also, categorize each into one of these: museum, restaurant, coffee_shop, park, landmark, shopping, entertainment, beach, religious_site, nightlife, other.
        Suggest a typical visit duration in minutes.
        If the place name contains foreign or non-Latin scripts (Japanese Kanji/Kana, Chinese Hanzi, Thai, Korean Hangul, etc.), provide its clean English/romanized transliteration in "romanizedName" (e.g. "Senso-ji" for "浅草寺", "Wat Phra Kaew" for "วัดพระแก้ว"). If already English/Latin, return null.

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
        Keep the highlight text concise (1-2 sentences), punchy, and naming concrete things.

        RESERVATION GUIDELINES:
        Determine if reservations or advance tickets are needed/recommended, and provide actionable booking window guidance:
        - "reservation": {
            "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
            "advanceTime": <string with concrete timing, e.g. "Reserve 1 month in advance", "Book 2-4 weeks ahead via official website", "Opens 30 days prior at midnight", "Walk-ins only; line forms 15m before opening", "No reservation needed">,
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
        ${places
          .map(
            (p: any) =>
              `ID: "${p.id}", Name: "${p.name}", Address: "${p.address}", Types: ${(p.types || []).join(", ")}`
          )
          .join("\n\n")}

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
    } else if (place) {
      prompt = `
        Analyze the following place: "${place.name}" at "${place.address}".
        Google Maps types: ${(place.types || []).join(", ")}.

        Provide 3-7 comma-separated, punchy phrases highlighting the core vibe and what it's famous for (e.g. "Best matcha in Kyoto, quiet atmosphere, historic architecture"). 
        IMPORTANT: Make it sound natural, casual, and straight to the point. NO fluff, NO typical AI marketing speak (avoid words like "bustling", "vibrant", "unforgettable").
        Also, categorize it into one of these: museum, restaurant, coffee_shop, park, landmark, shopping, entertainment, beach, religious_site, nightlife, other.
        Suggest a typical visit duration in minutes.
        If the place name contains foreign or non-Latin scripts (Japanese Kanji/Kana, Chinese Hanzi, Thai, Korean Hangul, etc.), provide its clean English/romanized transliteration in "romanizedName" (e.g. "Senso-ji" for "浅草寺", "Wat Phra Kaew" for "วัดพระแก้ว"). If already English/Latin, return null.

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
        Keep the highlight text concise (1-2 sentences), punchy, and naming concrete things.

        RESERVATION GUIDELINES:
        Determine if reservations or advance tickets are needed/recommended, and provide actionable booking window guidance:
        - "reservation": {
            "requirement": "required" | "recommended" | "not_needed" | "walk_ins_only",
            "advanceTime": <string with concrete timing, e.g. "Reserve 1 month in advance", "Book 2-4 weeks ahead via official website", "Opens 30 days prior at midnight", "Walk-ins only; line forms 15m before opening", "No reservation needed">,
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
    } else {
      return new Response(
        JSON.stringify({ error: "Missing place or places payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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
