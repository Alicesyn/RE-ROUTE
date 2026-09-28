---
name: reroute-api-governance
description: >-
  Use this skill whenever working with external APIs (Google Maps Platform, Google Gemini AI, Ekispert transit, Upstash Redis),
  serverless functions in api/, API rate limits, budget quotas, BYOK keys, or environment sensing (local vs Vercel).
---

# RE:ROUTE API Governance & External Services

This skill outlines the strict rules and patterns for integrating, securing, and caching external APIs in RE:ROUTE.

## External Services & Endpoints

| Service              | Client Key / Config              | Server / Edge Secret                                 | Primary File(s)                                                   |
| :------------------- | :------------------------------- | :--------------------------------------------------- | :---------------------------------------------------------------- |
| **Google Maps**      | `VITE_GOOGLE_MAPS_API_KEY`       | None (Client direct)                                 | `src/services/mapsService.ts`                                     |
| **Gemini AI**        | `VITE_GEMINI_API_KEY`            | `GEMINI_API_KEY`                                     | `src/services/aiService.ts`, `api/summarize.ts`, `api/suggest.ts` |
| **Ekispert Transit** | `VITE_EKISPERT_API_KEY`          | None (Client direct)                                 | `src/services/ekispertService.ts`                                 |
| **Upstash Redis**    | None (NEVER prefix with `VITE_`) | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | `api/usage.ts`, `src/services/apiUsageService.ts`                 |

---

## Strict Implementation Rules

### 1. Local Dev vs. Vercel Serverless Isolation (`src/utils/envUtils.ts`)

- Vite dev server (`npm run dev` on `localhost:5173`) does NOT execute Vercel Edge functions (`/api/*`).
- Always check `isLocalDev()` before making any `fetch("/api/...")` call.
- In local development:
  - Usage tracking falls back to browser `localStorage` silently with 0 network calls.
  - AI budget displayed locally reflects local session counters, while `reroute.tools` queries Upstash Redis cloud counters. This ensures local testing never drains production quotas or skews live metrics.
  - AI summarization calls Gemini directly using `activeKey`.
  - Cloud synchronization activates automatically when deployed to Vercel.

### 2. Upstash Redis & Vercel KV Security

- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are server-only secrets.
- **NEVER** add the `VITE_` prefix to Upstash credentials; this prevents leaking database tokens into the frontend bundle.
- In the Vercel Dashboard, paste values **WITHOUT quotation marks** (quotes are saved as literal characters).
- Do **NOT** enable IP whitelisting in Upstash because Vercel Edge functions run on dynamic global IP pools.

### 3. Google Gemini AI Model Selection & Fallback Chain

- Use the active 3.x series models:
  1. `gemini-3.5-flash-lite` (Default primary — lowest latency and cost)
  2. `gemini-3.7-flash`
  3. `gemini-3.5-flash`
  4. `gemini-3.8-flash`
  5. `gemini-3.6-flash`
- Do **NOT** use retired models (`gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-2.5-flash` for new accounts), as they return HTTP 404.
- If Gemini returns HTTP 503 (temporary high demand spike) or HTTP 429, wait 800ms before trying the next model in the fallback array.
- Only emit an API error toast if ALL fallback models fail.

### 4. AI Prompt Engineering & Output Standards (`src/services/aiService.ts`, `api/summarize.ts`)

- **Hyper-Specific Highlights**: Prompts must instruct the model to produce actionable, specific recommendations:
  - Restaurants: Signature dish names (e.g., _"Tsukemen special"_, _"Wagyu beef bowl"_, never generic _"try noodles"_).
  - Markets / Shopping: Specific stall numbers or shop names (e.g., _"Stall #14 for tamagoyaki"_).
  - Attractions: Specific viewpoint, room, or best photo angle.
- **Reservation Intelligence**:
  - Must return `required: boolean` and `recommended: boolean`.
  - Must specify `bookingWindow` (e.g., _"1 month in advance"_, _"7 days prior at 10 AM"_, _"Walk-in only"_).
- **Price Estimates**:
  - Always return concise dual currency if possible (e.g., _"$15 - $30 / ¥2,000 - ¥4,000"_) or _"Free"_.

### 5. Ekispert Web Service & Japan Transit API Blackout

- **The Google Maps Japan Transit Developer Blackout**:
  - Google Maps Platform APIs (`Directions API`, `Routes API`, `Distance Matrix API`) strictly return `ZERO_RESULTS` when queried with `mode=transit` in Japan.
  - This is a documented commercial licensing restriction between Google, Zenrin, and Japanese rail operators (JR Group, Tokyo Metro, etc.). The consumer Google Maps mobile app shows transit, but third-party developer APIs are forbidden from distributing this data.
  - Never expect Google Maps APIs to resolve transit legs in Japan.
- **Ekispert Domestic Integration**:
  - Use the **Station Spato API Free Plan** key (NOT the Route Map key).
  - Free plan keys are domain-restricted to the registered domain (`reroute.tools`).
  - **Station-to-Station Routing**: Ekispert computes routes between designated train stations, not street addresses. Pair station courses with pedestrian walking legs for the first and last mile.
  - **Megastation Padding**: Stations like Shinjuku (200+ exits) and Tokyo Station (Keiyo line underground transfer takes 12–15 minutes) require transfer time padding.
  - If Ekispert is unavailable or domain-blocked on localhost, fall back to walking/driving estimation or heuristic transit calculation with user notification, rather than querying Google Maps transit.

### 6. Google Maps Caching & Quota Protection

- Google Maps search and photo requests are cached in IndexedDB / localStorage.
- Always check cache before hitting `places.googleapis.com` or `routes.googleapis.com`.
- Respect user-configured daily limits in `src/services/apiUsageService.ts`.
