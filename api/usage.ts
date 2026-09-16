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

// Execute Redis command via Upstash REST API
const redisCommand = async (command: string[], config: { url: string; token: string }) => {
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      console.warn("Redis REST API error:", res.statusText);
      return null;
    }
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error("Failed to execute Redis command:", err);
    return null;
  }
};

export default async function handler(req: Request) {
  const redis = getRedisConfig();
  const today = getTodayDateString();

  // If Redis is not configured, return an informative response
  if (!redis.isConfigured) {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          isConfigured: false,
          date: today,
          message: "Upstash Redis / Vercel KV not configured. Running in local fallback mode.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        isConfigured: false,
        success: true,
        message: "Logged locally.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const { url, token } = redis as { url: string; token: string };

  if (req.method === "GET") {
    try {
      // Pipeline fetch for all counters of today
      const keys = [
        `reroute:usage:${today}:mapsSearch`,
        `reroute:usage:${today}:mapsPhoto`,
        `reroute:usage:${today}:mapsRoute`,
        `reroute:usage:${today}:gemini`,
        `reroute:usage:${today}:ekispert`,
        `reroute:usage:${today}:cacheHits`,
      ];

      const res = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(keys.map((k) => ["GET", k])),
      });

      if (!res.ok) throw new Error("Failed to fetch pipeline from Redis");
      const results = await res.json();

      const stats = {
        isConfigured: true,
        date: today,
        mapsSearchCalls: parseInt(results[0]?.result || "0", 10),
        mapsPhotoCalls: parseInt(results[1]?.result || "0", 10),
        mapsRouteCalls: parseInt(results[2]?.result || "0", 10),
        geminiCalls: parseInt(results[3]?.result || "0", 10),
        ekispertCalls: parseInt(results[4]?.result || "0", 10),
        cacheHits: parseInt(results[5]?.result || "0", 10),
      };

      return new Response(JSON.stringify(stats), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch (e: any) {
      return new Response(
        JSON.stringify({ isConfigured: true, error: e.message || "Failed to fetch stats" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const { type, isByok, count = 1 } = body;

      // If user is using their own BYOK key, do not increment host's public quota
      if (isByok) {
        return new Response(
          JSON.stringify({ isConfigured: true, success: true, byok: true }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      let field = "";
      if (type === "maps_search") field = "mapsSearch";
      else if (type === "maps_photo") field = "mapsPhoto";
      else if (type === "maps_route") field = "mapsRoute";
      else if (type === "gemini") field = "gemini";
      else if (type === "ekispert") field = "ekispert";
      else if (type === "cache_hit") field = "cacheHits";

      if (!field) {
        return new Response(JSON.stringify({ error: "Invalid counter type" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const key = `reroute:usage:${today}:${field}`;
      // Increment counter and set 48-hour expiration for automatic cleanup
      await redisCommand(["INCRBY", key, count.toString()], { url, token });
      await redisCommand(["EXPIRE", key, "172800"], { url, token });

      return new Response(JSON.stringify({ isConfigured: true, success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
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
