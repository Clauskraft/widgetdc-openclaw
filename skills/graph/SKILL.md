---
name: graph
description: "Neo4j Knowledge Graph adgang — stats, Cypher queries, schema, labels og agent capabilities (137K+ noder, 1.1M+ relationer)"
user-invocable: true
metadata: {"openclaw": {"emoji": "🕸️"}}
---

# Graph — Neo4j Knowledge Graph

Direkte adgang til WidgeTDC knowledge graph.

## Kommandoer

- `/graph` — stats (default)
- `/graph stats` — node/relation counts + top 10 labels
- `/graph query <cypher>` — kør read-only Cypher query
- `/graph schema` — labels + relationship types
- `/graph labels` — alle labels med count
- `/graph caps [role]` — HAS_CAPABILITY tools (default: CORE)
- `/graph health` — connectivity check
