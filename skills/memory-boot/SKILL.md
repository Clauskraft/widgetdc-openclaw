---
name: memory-boot
description: "Auto-load agent memory ved session start — recall memories, lessons, context folds fra Neo4j og RLM"
user-invocable: true
metadata: {"openclaw": {"emoji": "🧠", "primaryEnv": "WIDGETDC_BACKEND_URL"}}
---

# Memory Boot — Agent Hukommelse 🧠

Automatisk indlæsning af agent-hukommelse ved session start.

## Kommandoer

- `/memory-boot` — Fuld boot for aktuel agent (default: main)
- `/memory-boot <agentId>` — Boot specifik agent
- `/memory-boot quick` — Kun sidste 5 memories + 3 lessons
- `/memory-boot status` — Vis memory stats uden at loade

## Hvad den loader

1. **Agent Memories** — `consulting.agent.memory.recall`
2. **Lessons** — Neo4j `Lesson` nodes (teacher/student)
3. **Context Folds** — Sidste session's komprimerede kontekst
4. **Agent Profile** — Fra Neo4j `AgentProfile` node

## Auto-boot

Skill'en kan kaldes automatisk ved session start via OpenClaw hooks:

```json
{
  "hooks": {
    "onSessionStart": [{
      "skill": "memory-boot",
      "action": "boot"
    }]
  }
}
```

## MCP Tools brugt

- `consulting.agent.memory.recall` — Hent memories
- `consulting.agent.memory.store` — Gem ny lærdom
- `graph.read_cypher` — Lessons, ContextFold, AgentProfile
- `supervisor.rehydrate` — Gendan session state (hvis tilgængelig)
