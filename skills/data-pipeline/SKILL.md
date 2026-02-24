---
name: data-pipeline
description: "Graf-Oktopus data pipeline: Harvest → Extract → Graph → RAG. Guider data-agenter gennem knowledge ingestion."
user-invocable: true
metadata: {"openclaw": {"emoji": "🐙"}}
---

# Data Pipeline

4-stadie pipeline for knowledge graph og RAG.

## Stadier

1. **Harvesting** — integration.source_ingest, TDCDocument count
2. **Extraction** — context_folding.triage, KnowledgeChunk, Evidence
3. **Graph Storage** — graph.read/write_cypher, db.labels()
4. **RAG Query** — kg_rag.query, FoldedContext

## Cypher hints

- `CALL db.labels() YIELD label RETURN label, count(*) AS cnt`
- `MATCH (i:Insight) RETURN i.domain, count(*)`
- `MATCH (h:HarvestedKnowledge) RETURN h.source, h.ingestedAt`

## Brug

`dataPipeline("tjek data freshness", "harvest")` — Returnerer stage, tools og Cypher-hint.
