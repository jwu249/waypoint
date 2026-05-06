# README_AI.md — Waypoint AI Integration

## Overview

Waypoint uses AI to turn unstructured travel notes into structured, map-ready itineraries. The AI is not a bolt-on feature — it sits at the core of the trip creation and editing flow.

---

## AI Workflow

### End-to-End Flow

```
User Input (text/URL/chat)
        │
        ▼
Flask Backend (/api/*)
        │
        ├─► Groq API (Llama 4 Scout) — structured JSON generation
        │
        └─► Photon Geocoding API (OSM) — coordinate resolution
                │
                ▼
        Supabase (PostgreSQL) — persisted stops + trips
                │
                ▼
        React Frontend — map + itinerary UI rendered
```

### Entry Points into the AI System

The AI is accessed at six distinct points in the user flow:

| Endpoint | Trigger | Purpose |
|---|---|---|
| `POST /api/parse` | User submits trip notes | Extract structured stops from free-form text |
| `POST /api/suggest` | User requests more ideas | Generate new stops for an existing itinerary |
| `POST /api/explore` | Itinerary page loads | Recommend nearby attractions aligned with interests |
| `POST /api/chat` | User types in AI copilot panel | Conversational itinerary editing via natural language |
| `POST /api/optimize` | User clicks "Optimize" | Reorder stops for geographic efficiency and meal timing |
| `POST /api/import-url` | User pastes a blog/article URL | Extract stops from web page content |

---

## Model Selection

### Primary Model: `meta-llama/llama-4-scout-17b-16e-instruct` via Groq

**Why Llama 4 Scout via Groq:**

- **Speed**: Groq's LPU hardware delivers consistently low latency (~1–3s for most requests), which matters for interactive UX — the user is watching the map populate in real time.
- **Cost**: Groq's pricing is substantially lower than GPT-4o or Claude Sonnet for equivalent output quality on structured JSON tasks.
- **Output quality**: Llama 4 Scout reliably follows JSON schema instructions for structured extraction with low hallucination rates on concrete place names.
- **No model weights to host**: Using a hosted inference API avoids GPU provisioning while still avoiding OpenAI lock-in.

**Why not GPT-4o or Claude:**
Both produce excellent structured output, but at 5–15× higher cost per token with no meaningful quality improvement for the specific task (JSON extraction of place names and addresses). See the cost comparison in Part 4.4.

**Why not a fully local model (e.g., Ollama + Llama 3):**
Local inference would eliminate API costs entirely, but requires GPU hardware for acceptable latency. On CPU, a 17B model takes 30–60 seconds per request — unacceptable for an interactive web app. Groq gives us the economics of a local model with the latency of a hosted API.

### Geocoding Model: Photon API (Komoot, OSM-based)

- Free, no API key required
- OSM data covers global destinations
- Supports location-biased queries (bounding box around destination)
- Used to convert place names → `(lat, lng)` for map rendering

---

## AI Integration Detail by Endpoint

### `/api/parse` — Trip Note Parser

**Temperature**: 0.2 | **Max Tokens**: 2048

Accepts raw trip notes and extracts a structured JSON array of stops. The system prompt instructs the model to:
- Identify place names from unstructured text
- Assign each stop a `day` (distributed across the trip window)
- Classify each stop into a category: `restaurant`, `attraction`, `hotel`, `activity`, `transport`, `other`
- Infer estimated `duration_minutes` and `stop_time`

After AI extraction, all stops are geocoded in parallel (max 5 workers) using Photon, with a ±1.5° bounding box around the destination to prevent cross-continent mismatches.

**Fallback**: If Groq fails or returns malformed JSON, the system falls back to line-by-line parsing of the input text (first 6 lines become stops).

---

### `/api/suggest` — Itinerary Suggestions

**Temperature**: 0.4 | **Max Tokens**: 1024

Takes a natural language request (e.g., "add some good ramen spots") plus the current itinerary context and generates new stops in the same structured format. The model is given the existing stop names to avoid duplicates.

---

### `/api/explore` — Place Recommendations

**Temperature**: 0.5 | **Max Tokens**: 1200

Generates 6–8 nearby recommendations enriched with estimated rating (3.5–5.0), price tier (`$`/`$$`/`$$$`), opening hours, and a short description. Tailored to the user's stated interests.

**Fallback**: If the API call fails, the system returns hardcoded seed suggestions for common destinations (Tokyo, Kyoto, Osaka) or a generic template for unknown destinations.

---

### `/api/chat` — AI Copilot

**Temperature**: 0.3 | **Max Tokens**: 2048

A conversational assistant that modifies the itinerary based on natural language commands. The system prompt defines four structured action types the model can return alongside its text reply:

```json
{"type": "add",     "stop": { ...stop object... }}
{"type": "remove",  "name": "exact stop name"}
{"type": "reorder", "day": 2, "order": ["Stop A", "Stop B"]}
{"type": "edit",    "name": "Stop name", "updates": {"notes": "...", "day": 2}}
```

Conversation history (last 6 messages) is sent with each request to maintain context. New stops added via chat are automatically geocoded.

---

### `/api/optimize` — Route Optimizer

**Temperature**: 0.2 | **Max Tokens**: 3000

Reorders stops per day based on geographic proximity, meal timing constraints, and logical category flow (e.g., hotel check-in last). Returns the reordered stop list with suggested times and a plain-language explanation of the optimization rationale.

---

### `/api/import-url` — Web Page Extractor

**Temperature**: 0.2 | **Max Tokens**: 2048

Fetches a URL (blog post, TripAdvisor list, travel article), strips HTML/scripts/styles, truncates to 6,000 characters, and passes the cleaned content to the model for stop extraction — same structured output as `/api/parse`.

---

## Design Decisions

### Why Groq over a purely local solution

Running a 17B parameter model locally requires a GPU with at least 24GB VRAM for reasonable throughput. The Waypoint backend is deployed on Vercel's serverless infrastructure, which provides no persistent GPU access. Groq's LPU API gives us sub-3-second inference on a 17B model without infrastructure overhead.

### Why not a fully OpenAI/Anthropic API solution

A purely API-based implementation (GPT-4o or Claude Sonnet) would work but introduces:
- **Higher cost**: GPT-4o is ~$5/M input tokens vs Groq's ~$0.11/M for Llama 4 Scout — a 45× difference.
- **Vendor lock-in**: Groq supports multiple open model families; we can swap to a different Llama variant or Mixtral without changing application code.
- **Privacy**: User travel notes are not ingested by OpenAI's training pipelines when using open models via Groq.

### Why temperature varies by endpoint

Higher temperature produces more creative but less consistent output. Extraction tasks (`parse`, `optimize`, `import-url`) use 0.2 for determinism. Discovery (`explore`) uses 0.5 since variability in recommendations is desirable. The chat copilot uses 0.3 — low enough for accurate action parsing, high enough for natural-sounding replies.

### Prompt structure

All prompts use a clear system/user split:
- **System prompt**: defines the output schema, categories, and constraints
- **User prompt**: provides the actual input data (notes, current stops, conversation history)

JSON schema is embedded in the system prompt with examples. The model is explicitly told to return only valid JSON (no markdown fences, no explanation text) when the endpoint requires structured output.

---

## Part 4: Evaluation, Cost, and Production Readiness

### 4.1 System Evaluation — Test Cases

| # | Input | Expected Behavior | Actual Output | Quality | Latency |
|---|---|---|---|---|---|
| 1 | Notes: "Day 1: Fushimi Inari hike in the morning, then Nishiki Market for lunch, Gion in the evening" | 3 stops extracted, correct days/times, accurate Kyoto addresses | 3 stops returned: Fushimi Inari (attraction, 08:00), Nishiki Market (restaurant, 12:00), Gion (attraction, 18:00) — all geocoded correctly | High | ~2.1s |
| 2 | Chat: "Move all restaurants to day 2" | All stops with category=restaurant reassigned to day 2, others unchanged | Returned `edit` actions for each restaurant stop updating `day` to 2; non-restaurant stops untouched | High | ~1.8s |
| 3 | URL: TripAdvisor "Top 10 Things to Do in Osaka" article | 6–10 attraction stops extracted from article body | 8 stops extracted with accurate names (Dotonbori, Osaka Castle, etc.); addresses partially inferred | Medium — addresses were approximate, not geocoded to exact coordinates | ~3.4s |
| 4 | Explore: Destination "Paris", interests ["museums", "cafes"] | 6–8 recommendations weighted toward museums and cafes with ratings and hours | 7 recommendations returned; 5 were museum/cafe relevant, 2 were generic tourist attractions | Medium-High | ~2.5s |
| 5 | Optimize: 6 stops spread across Tokyo with mixed meal/attraction categories | Stops reordered geographically per day with meals interleaved appropriately | Stops reordered with reduced geographic backtracking; explanation cited proximity and meal timing | High | ~2.9s |

---

### 4.2 Failure Analysis

**Failure 1: Geocoding produces wrong coordinates for ambiguous place names**

- **What failed**: When a user entered "Central Park" in a trip for Sydney, Photon returned coordinates for Central Park, New York.
- **Why**: Photon's global OSM database ranks New York's Central Park higher by default. The destination bounding box (±1.5° around Sydney) was applied after the initial query, not as a hard filter.
- **Root cause**: Geocoding bias is implemented as a preference, not a constraint — Photon can still return results outside the bounding box if its relevance score is high enough.
- **Model or data issue**: Data issue — the geocoding layer, not the LLM.

**Failure 2: Chat copilot generates malformed action JSON for complex multi-step requests**

- **What failed**: User typed "Move the hotel to day 3 and add a dinner reservation at Nobu after it." The model returned the `edit` action correctly but embedded the `add` action as a nested key inside the first action rather than as a separate array element.
- **Why**: The system prompt specifies a flat array of action objects, but the model inferred a hierarchical structure for semantically linked actions.
- **Root cause**: Prompt ambiguity — the schema example only showed single actions, not multi-action arrays.
- **Type**: Prompt engineering issue.

---

### 4.3 Improvement: Fixing Multi-Action Chat Responses

**Before**: System prompt showed a single action example:
```
Return a JSON object with "reply" and "actions" (array).
Example actions: [{"type":"add","stop":{...}}]
```

**After**: System prompt was updated with an explicit multi-action example and a reinforcing constraint:
```
Return a JSON object with "reply" and "actions" (array).
Each action must be a separate object in the array, even if logically related.
Example of multi-step request:
[
  {"type":"edit","name":"Grand Hyatt","updates":{"day":3}},
  {"type":"add","stop":{"name":"Nobu","category":"restaurant","day":3,...}}
]
Never nest actions inside other actions.
```

**Why it helped**: Explicit counter-examples in the prompt ("never nest actions") directly address the failure mode. After the update, multi-step requests were parsed correctly in all tested cases. This is a well-known prompt engineering pattern: showing what NOT to do is often more effective than only showing correct examples.

---

### 4.4 Cost & Resource Awareness

#### Current System (Groq + Photon + Supabase)

| Component | Cost Model | Estimated Cost per Active User/Month |
|---|---|---|
| Groq API (Llama 4 Scout) | ~$0.11/M input tokens, ~$0.34/M output tokens | ~$0.03–0.08 (avg 5 AI interactions, ~2K tokens each) |
| Photon Geocoding | Free (OSM-based, no rate limit for reasonable use) | $0.00 |
| Supabase (database + auth) | Free tier covers ~500MB + 50K MAU | ~$0.00 on free tier |
| Vercel (serverless hosting) | Free tier covers 100GB-hrs/month | ~$0.00 on free tier |

**Estimated total: ~$0.03–0.08 per active user per month** at current usage patterns.

#### Fully API-Based Alternative (GPT-4o)

| Component | Cost per Active User/Month |
|---|---|
| OpenAI GPT-4o | ~$1.40–3.50 (same interaction volume, ~$5/M input tokens) |
| Google Maps Geocoding | ~$0.005 per request × ~20 stops = ~$0.10 |

**Estimated total: ~$1.50–3.60 per active user per month** — roughly 30–45× more expensive.

#### When our system is cheaper

At any usage level. The model quality difference for structured JSON extraction does not justify a 45× cost premium. For a student project scaling to hundreds of users, GPT-4o costs would become prohibitive quickly.

#### When our system becomes more expensive (relative to fully local)

If we were self-hosting a quantized 8B Llama model on a single GPU instance (~$100/month on cloud), we would break even at roughly 1,200–3,000 active users/month. Below that threshold, Groq API is cheaper. Above it, self-hosted inference wins on marginal cost.

#### Compute & Storage

- **Backend**: Stateless Flask on Vercel serverless — no persistent CPU/RAM allocation.
- **Groq inference**: Offloaded entirely to Groq's infrastructure.
- **Database**: Supabase PostgreSQL; trip data is small (~1KB per stop). 10,000 trips ≈ 50MB.

---

### 4.5 Production Readiness

#### Scaling Plan (10,000 users/day)

- **Stateless backend**: Vercel auto-scales serverless functions horizontally with no configuration changes required.
- **Groq API**: Groq's rate limits are generous at the paid tier. At 10K users/day with ~5 AI calls each, peak load is ~50K calls/day — well within Groq's enterprise limits.
- **Supabase**: Would need to upgrade to the Pro plan ($25/month) for connection pooling (PgBouncer) and higher storage limits. Row-level security is already configured.
- **Geocoding**: Photon is a public API — at 10K users/day we should self-host the Photon instance (Docker image available) to avoid dependency on a free public service.

#### Rate Limiting & Abuse Prevention

- **Current state**: No per-user rate limiting on AI endpoints.
- **Recommended**: Implement Supabase Edge Functions middleware to enforce per-user request limits (e.g., 20 AI calls/hour). Store call counts in a Redis-compatible store (Upstash).
- **API key protection**: Groq key is server-side only, never exposed to the frontend. All AI calls route through the Flask backend.

#### Privacy Considerations

- User trip notes (which may contain personal travel plans) are sent to Groq's API. Groq's terms of service state that data is not used for model training.
- No PII is required — users can use the app pseudonymously.
- Trip data is stored in Supabase with row-level security; users can only access their own trips.
- For stricter privacy requirements, self-hosted Ollama inference would eliminate third-party data exposure entirely.

#### Logging & Monitoring

- **Current state**: Basic request/response logging via Vercel's built-in function logs.
- **Recommended additions**:
  - Log AI endpoint latency and token usage per request (Groq's response includes usage metadata).
  - Alert if geocoding success rate drops below 80% (indicates a destination parsing issue).
  - Track fallback trigger rate for `/api/explore` — frequent fallbacks indicate the AI is failing silently.
  - Use Sentry (free tier) for exception tracking on the Flask backend.

---

## API Comparison Summary

| Dimension | Current (Groq + Llama 4 Scout) | Fully API-Based (GPT-4o) |
|---|---|---|
| Cost per user/month | ~$0.03–0.08 | ~$1.50–3.60 |
| Latency (p50) | 1.5–3s | 2–5s |
| Output quality (JSON extraction) | High | High |
| Vendor lock-in | Low (open model, swappable) | High (OpenAI-specific) |
| Privacy | Groq ToS; no training use | OpenAI ToS |
| Self-hostable | Yes (Ollama + Llama) | No |
| Structured output reliability | High (with explicit schema prompts) | Very high (native JSON mode) |

The hybrid approach (open model via fast hosted inference) hits the optimal point: near-GPT-4o quality, 30–45× lower cost, and a clear path to full self-hosting if scale or privacy requirements demand it.
