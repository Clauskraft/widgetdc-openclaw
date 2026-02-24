---
name: health
description: "Fuld WidgeTDC platform-status: Backend API, RLM Engine, Context Folding, Neo4j graph + Agent status og hourly reports"
user-invocable: true
metadata: {"openclaw": {"emoji": "❤️"}}
---

# Health — WidgeTDC Platform Status

## Kommandoer

- `/health` — fuld check (alle 5 services parallelt inkl. context_folding.health)
- `/health quick` — kun Backend + RLM (2-3s)
- `/health agents` — status for alle 12 agenter
- `/health hourly` — generer hourly report (sendes til #agent-status)

## Services der checkes

1. **Backend API** — neo4j, redis, postgres, LLMs
2. **RLM Engine** — repl_manager, autonomous_agent, mcp_bridge
3. **Context Folding** — RLM context compression health
4. **Consulting Frontend** — UI availability
5. **Neo4j Graph** — connectivity + node count

## Agent Status

Tracker alle 12 agenter:
- 🦞 Kaptajn Klo (main)
- 🤠 Repo Sherif (github)
- 🐙 Graf-Oktopus (data)
- 🦾 Jernfod (infra)
- 🐻 Stor-Bjørn (strategist)
- 🐍 Cyber-Vipera (security)
- 📊 Tal-Trold (analyst)
- 🦈 Kodehaj (coder)
- 🎼 Dirigenten (orchestrator)
- 📚 Arkivar-Rex (documentalist)
- 🌀 Støvsugeren (harvester)
- 📋 Kontrakt-Karen (contracts)

## Hourly Reports

Automatisk rapport hver time til `#agent-status` Slack kanal med:
- Platform health status
- Service latencies
- Agent aktivitet
- Issues og warnings
