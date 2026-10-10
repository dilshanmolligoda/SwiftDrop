# apps/ai-assistant — AI Delivery Assistant (bonus +5)

A chatbot that answers questions like *"Where is my parcel?"* or *"How much to send 2 kg to
Kandy?"* by calling the SwiftDrop backend API — never the database directly, so every
access rule in the API still applies.

## Planned design

- **MCP server** exposing backend capabilities as tools:
  - `track_parcel(trackingNumber)` → `GET /api/v1/tracking/{trackingNumber}`
  - `estimate_fee(pickup, dropoff, weightKg, size)` → `POST /api/v1/pricing/estimate`
  - `list_my_deliveries()` → `GET /api/v1/parcels/me` (forwards the user's JWT)
- **Chat endpoint** `POST /chat` used by the web chat widget; runs the LLM with those tools.
- LLM provider and key come from `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`.

```text
apps/ai-assistant/src/
├── server.ts          # HTTP chat endpoint
├── mcp/               # MCP server + tool definitions
├── tools/             # thin wrappers over the backend API
└── llm/               # provider adapter
```
