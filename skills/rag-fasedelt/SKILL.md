---
name: rag-fasedelt
description: "3-fase RAG: Discovery → Targeted Query → Synthesis. Bruger RLM context folding ved store kontekster. Reducerer latency og øger præcision mod WidgeTDC knowledge graph"
user-invocable: true
metadata: {"openclaw": {"emoji": "🔍"}}
---

# rag-fasedelt — 3-Fase RAG + RLM Context Folding

Optimeret RAG-pipeline med RLM Engine integration.

## Pipeline

1. **Discovery** — Find relevante domæner (parallel)
2. **Dual Query** — kg_rag.query + graph.read_cypher (parallel)
3. **Synthesis** — Destiller til max 4K tokens
4. **Context Fold** — Ved >4K tegn: RLM Engine komprimerer via `/cognitive/fold`

## Kommandoer

- `/rag-fasedelt <query>` — Kør 3-fase RAG mod knowledge graph
