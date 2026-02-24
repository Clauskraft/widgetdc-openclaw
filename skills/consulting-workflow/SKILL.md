---
name: consulting-workflow
description: "McKinsey/BCG process patterns: Discovery → Synthesis → Delivery → Governance. Guider agenter gennem konsulentarbejde."
user-invocable: true
metadata: {"openclaw": {"emoji": "📋"}}
---

# Consulting Workflow

4-fase konsulentproces baseret på Process Specialist Archive.

## Faser

1. **Discovery & Diagnosis** — Problem intake, RAG harvest, MECE tree, gap analysis
2. **Strategy Synthesis** — Framework, risk, strategic options
3. **Production & Delivery** — PPTX, Word, diagrammer
4. **Governance & Memory** — Decision logs, pattern capture, memory store

## Tools per fase

- Discovery: kg_rag.query, graph.read_cypher, consulting.pattern.search
- Synthesis: consulting.decision, context_folding.fold
- Delivery: docgen.powerpoint, docgen.word
- Governance: consulting.agent.memory.store, notes.create

## Brug

`consultingWorkflow("digital transformation strategi", "discovery")` — Returnerer fase, tools og næste skridt.
