---
name: log-collector
description: "Railway log collector: samler, gemmer og analyserer fejllogs fra alle Railway services med faste intervaller"
user-invocable: true
metadata: {"openclaw": {"emoji": "📡"}}
---

# Log Collector — Railway Error Intelligence

## Kommandoer

- `/log-collector` — kig alle services for fejl (sidste 5 min)
- `/log-collector sweep` — fuld sweep alle services (sidste 30 min)
- `/log-collector patterns` — vis kendte fejlmonstre og frekvens
- `/log-collector history [service]` — fejlhistorik for specifik service
- `/log-collector alert-rules` — vis aktive alert-regler

## Services der overvages

| Service | Railway Slug | Endpoint |
|---------|-------------|----------|
| Backend | backend-production | backend-production-d3da.up.railway.app |
| RLM Engine | rlm-engine-production | rlm-engine-production.up.railway.app |
| Consulting Frontend | consulting-production | consulting-production-b5d8.up.railway.app |
| OpenClaw | openclaw-production | openclaw-production-9570.up.railway.app |
| Arch MCP | arch-mcp-server-production | arch-mcp-server-production.up.railway.app |

## Hvad der samles

- ERROR og WARN log entries fra alle services
- HTTP 4xx/5xx responses
- Uhandlede exceptions og rejections
- Service restarts og crash loops
- MCP tool failures
- Auth failures (401/403)

## Analyse

- **Pattern Detection**: Grupperer lignende fejl via fuzzy matching
- **Frequency Spikes**: Detecter >5x normal rate
- **Cross-Service Correlation**: Fejl i service A der foraarsager fejl i service B
- **Trend Analysis**: Stigende/faldende fejlrater over tid

## Alert Regler

| Severity | Trigger | Aktion |
|----------|---------|--------|
| P0 | Service nede (ingen logs 10 min) | Slack alert + Neo4j incident |
| P1 | Error spike (>10/min) | Slack alert |
| P2 | Nyt fejlmonster (aldrig set for) | Log + optional alert |
| P3 | Kendt gentagende fejl | Increment counter, ugentlig opsamling |

## Storage

- **Neo4j**: ErrorPattern, ErrorLog, ServiceIncident noder
- **Agent Memory**: Trending data for historisk analyse