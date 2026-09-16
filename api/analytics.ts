export const config = {
  runtime: "edge",
};

const getRedisConfig = () => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.VITE_UPSTASH_REDIS_REST_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.VITE_UPSTASH_REDIS_REST_TOKEN;
  return { url, token, isConfigured: Boolean(url && token) };
};

const getTodayDateString = () => new Date().toISOString().split("T")[0];

const redisPipeline = async (commands: any[][], config: { url: string; token: string }) => {
  try {
    const res = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Redis pipeline failed:", err);
    return null;
  }
};

// Helper to convert Redis HGETALL array [k1, v1, k2, v2...] to Object
const arrayToRecord = (arr: any[]): Record<string, number> => {
  const res: Record<string, number> = {};
  if (!Array.isArray(arr)) return res;
  for (let i = 0; i < arr.length; i += 2) {
    const key = arr[i];
    const val = parseInt(arr[i + 1], 10) || 0;
    if (key) res[key] = val;
  }
  return res;
};

// Helper to parse Redis ZREVRANGE with scores [val1, score1, val2, score2...]
const parseSortedSet = (arr: any[]): { name: string; count: number }[] => {
  const list: { name: string; count: number }[] = [];
  if (!Array.isArray(arr)) return list;
  for (let i = 0; i < arr.length; i += 2) {
    const name = arr[i];
    const count = parseInt(arr[i + 1], 10) || 0;
    if (name) list.push({ name, count });
  }
  return list;
};

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  JP: "Japan",
  TW: "Taiwan",
  KR: "South Korea",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  SG: "Singapore",
  HK: "Hong Kong",
  TH: "Thailand",
  VN: "Vietnam",
  MY: "Malaysia",
  PH: "Philippines",
  IN: "India",
  BR: "Brazil",
  NL: "Netherlands",
  IT: "Italy",
  ES: "Spain",
  SE: "Sweden",
  CH: "Switzerland",
  NZ: "New Zealand",
};

export default async function handler(req: Request) {
  const redis = getRedisConfig();
  const today = getTodayDateString();

  // 1. GET: Return comprehensive analytics report
  if (req.method === "GET") {
    if (!redis.isConfigured) {
      return new Response(
        JSON.stringify({
          success: true,
          isConfigured: false,
          summary: {
            totalVisitors: 1,
            todayVisitors: 1,
            countries: [{ code: "US", name: "United States", count: 1, percentage: 100 }],
            topCities: [{ city: "Local Dev", count: 1 }],
            devices: [{ device: "desktop", count: 1, percentage: 100 }],
            browsers: [{ browser: "Chrome", count: 1 }],
            referrers: [{ source: "direct", count: 1 }],
            topDestinations: [{ destination: "Tokyo", count: 1 }],
            events: {},
            lastUpdated: Date.now(),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const { url, token } = redis as { url: string; token: string };

    try {
      const results = await redisPipeline(
        [
          ["GET", "reroute:analytics:total_visits"],
          ["PFCOUNT", `reroute:analytics:uv:${today}`],
          ["HGETALL", "reroute:analytics:countries"],
          ["ZREVRANGE", "reroute:analytics:cities", "0", "9", "WITHSCORES"],
          ["HGETALL", "reroute:analytics:devices"],
          ["HGETALL", "reroute:analytics:browsers"],
          ["HGETALL", "reroute:analytics:referrers"],
          ["ZREVRANGE", "reroute:analytics:destinations", "0", "7", "WITHSCORES"],
          ["HGETALL", `reroute:analytics:events:${today}`],
        ],
        { url, token }
      );

      const totalVisits = parseInt(results?.[0]?.result || "0", 10);
      const todayUv = parseInt(results?.[1]?.result || "0", 10);
      const countriesMap = arrayToRecord(results?.[2]?.result || []);
      const citiesList = parseSortedSet(results?.[3]?.result || []);
      const devicesMap = arrayToRecord(results?.[4]?.result || []);
      const browsersMap = arrayToRecord(results?.[5]?.result || []);
      const referrersMap = arrayToRecord(results?.[6]?.result || []);
      const destinationsList = parseSortedSet(results?.[7]?.result || []);
      const eventsMap = arrayToRecord(results?.[8]?.result || []);

      const totalCountryCount = Object.values(countriesMap).reduce((a, b) => a + b, 0) || 1;
      const totalDeviceCount = Object.values(devicesMap).reduce((a, b) => a + b, 0) || 1;

      const countries = Object.entries(countriesMap)
        .map(([code, count]) => ({
          code,
          name: COUNTRY_NAMES[code.toUpperCase()] || code,
          count,
          percentage: Math.round((count / totalCountryCount) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      const devices = Object.entries(devicesMap)
        .map(([device, count]) => ({
          device,
          count,
          percentage: Math.round((count / totalDeviceCount) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      const browsers = Object.entries(browsersMap)
        .map(([browser, count]) => ({ browser, count }))
        .sort((a, b) => b.count - a.count);

      const referrers = Object.entries(referrersMap)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      const topCities = citiesList.map((c) => ({ city: c.name, count: c.count }));
      const topDestinations = destinationsList.map((d) => ({ destination: d.name, count: d.count }));

      return new Response(
        JSON.stringify({
          success: true,
          isConfigured: true,
          summary: {
            totalVisitors: Math.max(totalVisits, todayUv),
            todayVisitors: todayUv,
            countries,
            topCities,
            devices,
            browsers,
            referrers,
            topDestinations,
            events: eventsMap,
            lastUpdated: Date.now(),
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || "Failed to load analytics" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // 2. POST: Ingest incoming visitor session or custom product event
  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const { type, visitorId, device, browser, referrer, eventName, metadata } = body;

      // Extract geo from Vercel Edge Headers
      const country = (
        req.headers.get("x-vercel-ip-country") ||
        req.headers.get("cf-ipcountry") ||
        "US"
      ).toUpperCase();

      const city = req.headers.get("x-vercel-ip-city") || "";

      if (!redis.isConfigured) {
        return new Response(JSON.stringify({ success: true, isConfigured: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { url, token } = redis as { url: string; token: string };
      const pipelineCommands: any[][] = [];

      if (type === "session_start") {
        // Increment global counters
        pipelineCommands.push(["INCR", "reroute:analytics:total_visits"]);
        pipelineCommands.push(["HINCRBY", "reroute:analytics:countries", country, "1"]);

        if (city && city.trim().length > 1) {
          pipelineCommands.push(["ZINCRBY", "reroute:analytics:cities", "1", city.trim()]);
        }

        if (device) {
          pipelineCommands.push(["HINCRBY", "reroute:analytics:devices", device, "1"]);
        }

        if (browser) {
          pipelineCommands.push(["HINCRBY", "reroute:analytics:browsers", browser, "1"]);
        }

        if (referrer) {
          pipelineCommands.push(["HINCRBY", "reroute:analytics:referrers", referrer, "1"]);
        }

        // Daily Unique Visitor tracking with HyperLogLog
        const uvKey = `reroute:analytics:uv:${today}`;
        const salt = visitorId || `${country}_${device}_${Date.now()}`;
        pipelineCommands.push(["PFADD", uvKey, salt]);
        pipelineCommands.push(["EXPIRE", uvKey, "604800"]); // Retain daily HLL for 7 days
      } else if (type === "event" && eventName) {
        // Event logging
        const eventKey = `reroute:analytics:events:${today}`;
        pipelineCommands.push(["HINCRBY", eventKey, eventName, "1"]);
        pipelineCommands.push(["EXPIRE", eventKey, "604800"]);

        // Top planned destination cities
        if (eventName === "destination_planned" && metadata?.destination) {
          pipelineCommands.push([
            "ZINCRBY",
            "reroute:analytics:destinations",
            "1",
            metadata.destination.trim(),
          ]);
        }
      }

      if (pipelineCommands.length > 0) {
        await redisPipeline(pipelineCommands, { url, token });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}
