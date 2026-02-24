---
name: widgetdc-mcp
description: "WidgeTDC Intelligence Platform \u2014 335 MCP tools across 30+ namespaces. Optimized with TTL caching, connection pooling, and gzip compression."
metadata: {"openclaw": {"primaryEnv": "WIDGETDC_MCP_ENDPOINT", "emoji": "\uD83E\uDDE0"}}
---

# WidgeTDC MCP Tools (335 tools)

You have access to 335 tools from the WidgeTDC Intelligence Platform.

## How to call tools

Use the `widgetdc_mcp` function (exported from `{baseDir}/index.ts`) to call any tool:

```
widgetdc_mcp("graph.stats")
widgetdc_mcp("graph.read_cypher", { query: "MATCH (n) RETURN labels(n) AS label, count(*) AS cnt ORDER BY cnt DESC LIMIT 10" })
widgetdc_mcp("consulting.pattern.search", { query: "digital transformation" })
widgetdc_mcp("kg_rag.query", { query: "What services does the company offer?" })
```

## Performance (Optimized)

| Feature | Detail |
|---------|--------|
| **Caching** | `graph.stats` (60s), `system_health` (30s), `kg_rag.query` (5min) |
| **Connection Pooling** | HTTP keep-alive on all requests |
| **Compression** | gzip/br accepted on responses |
| **Parallel Calls** | Agent can run 4 tools concurrently |

### Cache management

- Cached tools return instantly on repeated calls within TTL
- Use `cache_clear()` to invalidate all cached results after writes

- **Dokumenter:** 5.589 TDCDocument +

## ⚡ Command Cheatsheet

### Slash Commands

- `/act <persona>` — Skift lynhurtigt til en persona (75 graph-personas fra Neo4j)
- `/rag <query>` — Multi-vector RAG search (Knowledge Graph + Harvester)
- `/rag-fasedelt <query>` — Optimeret 3-faset RAG + RLM context folding
- `/cursor-sync rules` — Generer Cursor rules til WidgeTDC-projekter
- `/cursor-sync skill <agent>` — Generer Cursor skill for agent (main, data, coder, …)
- `/graph stats` — Quick overview of Neo4j node/relation counts
- `/health` — Full system status (Backend, RLM, Gateway)
- `/qmd <query>` — Token-optimeret RAG (destilleret svar)
- `/config` — Edit OpenClaw runtime configuration
- `/restart` — Restart the gateway process
- `/bash <cmd>` — Execute shell command (requires elevation)

### Model Aliases

Use `/model <alias>` to switch context:

| Alias | Model | Usage |
|-------|-------|-------|
| `fortsæt` | Gemini 2.0 Flash | standard/hurtig |
| `deepseek` | DeepSeek Chat | RLM/logik |
| `reasoner` | DeepSeek R1 | dyb analyse |
| `local` | Qwen 2.5 72B | offline/privat |
| `coder` | Codestral 22B | kodning |

## Tool namespaces (30+)

| Namespace | Tools | Focus |
|-----------|-------|-------|
| `graph.*` | read_cypher, write_cypher, stats | Neo4j knowledge graph |
| `consulting.*` | pattern.search, decision, insight | Consulting frameworks |
| `knowledge.*` | search_claims, entities | Knowledge retrieval |
| `kg_rag.*` | query | RAG pipeline (cached 5min) |
| `context_folding.*` | triage, fold, health, triage_keywords, domain_gaps | RLM Engine context compression |
| `agent.task.*` | create, fetch, claim, start, complete, fail, log, status | Agent task lifecycle |
| `supervisor.*` | status, pause, resume, hitl.request, hitl.response, hitl.pending, fold_context, rehydrate, diagnostics, boot_manifest | Multi-agent orchestration |
| `git.*` | status, log, diff, push, pull, commit, pr_create, clone | Git integration |
| `docgen.*` | powerpoint, word, excel, diagram | Document generation |
| `trident.*` | threat.level, harvest, engage | Cybersecurity |
| `osint.*` | investigate, graph, scan | Intelligence |
| `cve.*` | search, analyze | CVE database |
| `prometheus.*` | lsp, governance, code_dreaming | Code analysis |
| `financial.*` | trinity, forecast, macro_data | Financial analysis |
| `integration.*` | system_health, source_ingest | System monitoring |

## Domain-scoped discovery

For reduced context, discover tools by namespace:
```
widgetdc_discover_domain("graph")      // Only graph.* tools
widgetdc_discover_domain("consulting") // Only consulting.* tools
```

## Fallback: curl

```bash
curl -X POST https://backend-production-d3da.up.railway.app/api/mcp/route \
  -H "Content-Type: application/json" \
  -d '{"tool":"graph.stats","payload":{}}'
```
