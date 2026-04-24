# BuildwellAI Compliance API Server

Express.js server that performs UK Building Regulations compliance assessment using Claude Sonnet with prompt caching.

## Overview

`POST /check` accepts building parameters and regulation domains, returns a structured compliance report covering Approved Documents A, B, C, E, F, G, H, K, L, M, O, P, Q, R, S and SAP 10.2.

The full UK Approved Documents reference is loaded as a cached system prompt — Claude reuses the cache across requests, reducing cost and latency.

## Quick Start

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... node server.js
```

Server starts on port 3001 (or `$PORT`).

## API

### `GET /health`
```json
{ "status": "ok", "version": "1.0.0" }
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
  "domains": ["fire_safety", "ventilation", "structural", "energy"],
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

## Prompt Caching

The full UK Approved Documents reference (~3000 tokens) is cached using `cache_control: { type: 'ephemeral' }`. Cache TTL is 5 minutes. On cache hits, API cost and latency are significantly reduced — optimal for repeated compliance checks in a session.
