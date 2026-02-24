---
name: orchestrator
description: "Multi-agent task orchestration — supervisor HITL, agent.task lifecycle, proactive context folding, session persistence. For Dirigenten og andre koordinator-agenter."
user-invocable: true
metadata: {"openclaw": {"emoji": "🎼", "primaryEnv": "WIDGETDC_BACKEND_URL"}}
---

# Orchestrator — Dirigenten 🎼

Multi-agent task orchestration via WidgeTDC MCP med proaktiv context folding og session persistence.

## Kommandoer

### Supervisor Control
- `/supervisor status` — Supervisor status og aktive sessions
- `/supervisor pause` — Pause supervisor
- `/supervisor resume` — Genoptag supervisor
- `/supervisor diagnostics` — Fuld diagnostik
- `/supervisor boot` — Boot manifest

### Context Folding (NY!)
- `/supervisor fold <sessionId> [content]` — Proaktiv context folding via RLM Engine
- `/supervisor rehydrate <sessionId> [agentId]` — Gendan session state fra Neo4j
- `/supervisor persist <sessionId> <stateJson>` — Gem session state til Neo4j

### Task Management
- `/task create <type> <payload>` — Opret ny agent task
- `/task fetch [agentId]` — Hent ventende tasks
- `/task claim <taskId>` — Claim task til udførelse
- `/task complete <taskId> <result>` — Marker task som færdig
- `/task fail <taskId> <reason>` — Marker task som fejlet

## Context Folding

Proaktiv komprimering af lange samtaler via RLM Engine:

```javascript
// Fold automatisk ved >8K tegn
foldContext("session_123", longConversation, { agentId: "main" })

// Resultat gemmes til Neo4j:ContextFold for persistence
// Kan rehydreres ved session genoptagelse
```

## Session Persistence

```javascript
// Gem session state
persistSession("session_123", { currentTask: "...", context: "..." }, "main")

// Gendan ved næste session
rehydrateSession("session_123", "main")
// → Henter: lastFold, supervisorState, pendingTasks
```

## MCP Tools (via widgetdc_mcp)

```javascript
// Supervisor
widgetdc_mcp("supervisor.status")
widgetdc_mcp("supervisor.pause")
widgetdc_mcp("supervisor.resume")
widgetdc_mcp("supervisor.hitl_interrupt", { sessionId: "...", action: "...", reason: "...", riskLevel: "high" })
widgetdc_mcp("supervisor.hitl.request", { ... })
widgetdc_mcp("supervisor.hitl.response", { requestId: "...", response: "..." })
widgetdc_mcp("supervisor.hitl.pending")
widgetdc_mcp("supervisor.send_tool_result", { ... })
widgetdc_mcp("supervisor.fold_context", { ... })
widgetdc_mcp("supervisor.rehydrate", { agentId: "...", sessionId: "..." })
widgetdc_mcp("supervisor.diagnostics")
widgetdc_mcp("supervisor.boot_manifest")

// Context Folding (RLM Engine)
widgetdc_mcp("context_folding.fold", { task: "...", context: {...}, max_tokens: 2048 })
widgetdc_mcp("context_folding.triage", { content: "...", domain: "..." })
widgetdc_mcp("context_folding.health")

// Agent Task Lifecycle
widgetdc_mcp("agent.task.create", { type: "analysis", payload: { ... } })
widgetdc_mcp("agent.task.fetch", { agentId: "github" })
widgetdc_mcp("agent.task.claim", { taskId: "..." })
widgetdc_mcp("agent.task.start", { taskId: "..." })
widgetdc_mcp("agent.task.complete", { taskId: "...", result: { ... } })
widgetdc_mcp("agent.task.fail", { taskId: "...", reason: "..." })
widgetdc_mcp("agent.task.status", { taskId: "..." })
widgetdc_mcp("agent.task.log", { taskId: "...", message: "..." })
```

## Rolle

Dirigenten koordinerer 12 specialistagenter:
- **Supervisor HITL** — Human-in-the-loop for kritiske beslutninger
- **Task delegation** — Opret og spor opgaver på tværs af agenter
- **Context folding** — Komprimér lange samtaler for token-effektivitet
- **Session persistence** — Gem og gendan state på tværs af sessioner
