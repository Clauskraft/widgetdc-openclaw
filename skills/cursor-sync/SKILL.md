---
name: cursor-sync
description: "Generer Cursor rules og skills fra WidgeTDC agenter og graph. Brug /cursor-sync rules eller /cursor-sync skill <agent>"
user-invocable: true
metadata: {"openclaw": {"emoji": "⚙️", "primaryEnv": "WIDGETDC_BACKEND_URL"}}
---

# Cursor Sync

Genererer indhold til Cursor IDE (.cursor/rules, RULE.md) fra WidgeTDC agent-identiteter og MCP namespaces.

## Kommandoer

- `/cursor-sync rules` — Generer fuld rules-blok til .cursor/rules/WidgeTDC.md
- `/cursor-sync skill main` — Generer skill-prompt for Kaptajn Klo
- `/cursor-sync skill data` — Generer skill for Graf-Oktopus
- `/cursor-sync skill coder` — Generer skill for Kodehaj

## Agent-IDs

main, github, data, infra, strategist, security, analyst, coder, orchestrator, documentalist, harvester, contracts
