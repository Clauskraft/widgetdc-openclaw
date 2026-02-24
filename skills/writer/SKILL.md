---
name: writer
description: "Langt-format skriveagent — fra enkelt memo til hel bog (80K+ ord) via Neo4j Context Folding. Book Architecture Protocol med 4 faser."
user-invocable: true
metadata: {"openclaw": {"emoji": "✍️", "primaryEnv": "WIDGETDC_BACKEND_URL"}}
---

# Writer — Skribleren ✍️

Langt-format skriveagent med Neo4j-backed hukommelse.
Kan skrive alt fra et enkelt memo til en hel bog (80K+ ord) via Context Folding.

## Kommandoer

- `/writer new <titel> [genre]` — Opret ny bog/projekt i grafen
- `/writer outline <bookId>` — Vis eller generer outline
- `/writer chapter <bookId> <idx>` — Skriv kapitel N (loader kontekst fra graf)
- `/writer status <bookId>` — Fremskridt: kapitler skrevet, ordantal, %
- `/writer list` — Vis alle aktive bøger/projekter
- `/writer memo <emne>` — Kort leverance (1-pager, SCR-struktur)
- `/writer brief <emne>` — Strategibrief (Porter + graph-evidens)
