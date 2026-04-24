# BuildwellAI Compliance API Server

Express.js server that performs UK Building Regulations compliance assessment using Claude Sonnet with prompt caching.

## Overview

`POST /check` accepts building parameters and regulation domains, returns a structured compliance report covering all 16 UK Approved Document domains: A, B, C, E, F, G, H, K, L, M, O, P, Q, R, S and SAP 10.2.

The full UK Approved Documents reference (~3000 tokens) is cached as a system prompt — Claude reuses the cache across requests, reducing cost and latency significantly.

## Quick Start

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... node server.js
```

Server starts on port 3001 (or `$PORT`).

## API

### `GET /health`
```json
{ "status": "ok", "version": "1.2.0", "endpoints": ["/health", "/domains", "/check", "/check/stream", "/analyze"] }
```

### `GET /domains`

Returns all supported domain keys and their corresponding Approved Document titles.

```json
{
  "domains": [
    { "key": "fire_safety", "document": "Approved Document B (Fire Safety)" },
    { "key": "structural",  "document": "Approved Document A (Structure)" },
    { "key": "ev_charging", "document": "Approved Document S (Infrastructure for the Charging of Electric Vehicles)" }
  ]
}
```

### `POST /check`

Request body (`ComplianceQuery`):
```json
{
  "buildingParameters": {
    "buildingUse": "Residential",
    "constructionType": "Masonry",
    "numberOfStoreys": 4,
    "floorAreaM2": 450,
    "occupancyEstimate": 30,
    "hasBasement": false,
    "hasAtrium": false
  },
  "domains": ["fire_safety", "ventilation", "structural", "energy", "ev_charging", "access"],
  "additionalContext": "Corner plot, shared boundary on east elevation"
}
```

Response (`ComplianceReport`):
```json
{
  "id": "report-<uuid>",
  "queryId": "...",
  "generatedAt": "2026-04-23T...",
  "overallStatus": "requires_review",
  "domains": [
    {
      "domain": "fire_safety",
      "label": "Fire Safety (Doc B & L)",
      "status": "compliant",
      "summary": "...",
      "items": [
        {
          "clause": "B1",
          "document": "Approved Document B",
          "title": "Means of Escape",
          "requirement": "...",
          "status": "pass",
          "notes": "..."
        }
      ]
    }
  ],
  "recommendations": ["..."],
  "regulationDocuments": ["Approved Document B (Fire Safety) 2019"]
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `PORT` | No | Server port (default: 3001) |

## Integration with SiteInspectionApp

Set `VITE_COMPLIANCE_API_URL=http://your-server:3001` in the SiteInspectionApp `.env` to switch from demo mode to live Claude-powered compliance assessment.

PR: [buildwellai/SiteInspectionApp#1](https://github.com/buildwellai/SiteInspectionApp/pull/1)

## Deployment (HPC / Railway / Fly.io)

```bash
# HPC (SLURM) — single node, 1 CPU, no GPU needed
sbatch --partition=cpu --ntasks=1 --mem=2G --wrap="ANTHROPIC_API_KEY=... node server.js"

# Railway / Fly.io — set ANTHROPIC_API_KEY as secret, push this repo
```

### `POST /analyze`

Accepts a base64-encoded architectural drawing image and returns extracted building parameters + compliance risks. Used by the SiteInspectionApp "Analyse Drawing" feature.

```json
{
  "imageBase64": "<base64 string>",
  "mediaType": "image/png"
}
```

Response:
```json
{
  "classification": { "drawing_type": "floor_plan", "confidence": 0.91, ... },
  "buildingParameters": {
    "buildingUse": "Residential",
    "constructionType": "Masonry",
    "numberOfStoreys": 3,
    "floorAreaM2": 280,
    "occupancyEstimate": 18,
    "hasBasement": false,
    "hasAtrium": false
  },
  "complianceRisks": [
    { "regulation": "Doc B §B1", "observation": "...", "riskLevel": "low", "action": "..." }
  ],
  "extractionConfidence": 0.82,
  "extractionNotes": "Scale visible at 1:100. Stair positions clear. Construction type inferred from wall hatching."
}
```

### `POST /check/stream`

Same request body as `/check`. Returns a Server-Sent Events stream so the client can show live generation progress.

**Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `start` | `{ domains, totalDomains }` | Assessment started |
| `chunk` | `{ text }` | Raw text chunk from Claude (for live display) |
| `complete` | `{ report }` | Full `ComplianceReport` object — same shape as `/check` response |
| `error` | `{ message }` | Fatal error |

**Example (fetch + ReadableStream):**

```javascript
const res = await fetch('http://localhost:3001/check/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(query),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
// parse SSE lines from reader...
```

**Example (EventSource via POST — requires a proxy or eventsource-polyfill):**

```javascript
// Simpler: POST then switch to EventSource if using a wrapper lib
```

## Supported Domains

| Key | Approved Document |
|-----|-------------------|
| `fire_safety` | Doc B — Fire Safety |
| `structural` | Doc A — Structure |
| `ventilation` | Doc F — Ventilation |
| `energy` | Doc L — Conservation of Fuel and Power |
| `overheating` | Doc O — Overheating |
| `acoustics` | Doc E — Resistance to Sound |
| `sap` | SAP 10.2 — Standard Assessment Procedure |
| `drainage` | Doc H — Drainage and Waste Disposal |
| `access` | Doc M — Access to and Use of Buildings |
| `electrical` | Doc P — Electrical Safety |
| `security` | Doc Q — Security |
| `site_prep` | Doc C — Site Preparation |
| `sanitation` | Doc G — Sanitation, Hot Water Safety |
| `falling` | Doc K — Protection from Falling |
| `broadband` | Doc R — Physical Infrastructure (Broadband) |
| `ev_charging` | Doc S — EV Charging Infrastructure |

## Prompt Caching

The full UK Approved Documents reference (~3000 tokens) is cached using `cache_control: { type: 'ephemeral' }`. Cache TTL is 5 minutes. On cache hits, API cost and latency are significantly reduced — optimal for repeated compliance checks in a session.

## Changelog

### v1.2.0
- Added `POST /analyze` — architectural drawing analysis using Claude vision (base64 image in, building parameters + compliance risks out)
- Added `POST /check/stream` — SSE streaming for live compliance generation progress

### v1.1.0
- Added `GET /domains` endpoint listing all 16 supported domain keys
- `buildUserPrompt` now includes explicit `domain_key → Approved Document` mapping — Claude correctly handles all domain keys including `ev_charging`, `site_prep`, `falling`, `broadband`

### v1.0.0
- Initial release: `POST /check` with Claude Sonnet + prompt caching
