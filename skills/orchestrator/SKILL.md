---
name: orchestrator
description: "Multi-agent task orchestration — supervisor HITL, agent.task lifecycle, pause/resume. For Dirigenten og andre koordinator-agenter."
user-invocable: true
metadata: {"openclaw": {"emoji": "🎼", "primaryEnv": "WIDGETDC_BACKEND_URL"}}
---

# Orchestrator — Dirigenten 🎼

Multi-agent task orchestration via WidgeTDC MCP.

## Kommandoer

- `/supervisor status` — Supervisor status og aktive sessions
- `/supervisor pause` — Pause supervisor
- `/supervisor resume` — Genoptag supervisor
- `/task create <type> <payload>` — Opret ny agent task
- `/task fetch [agentId]` — Hent ventende tasks
- `/task claim <taskId>` — Claim task til udførelse
- `/task complete <taskId> <result>` — Marker task som færdig
- `/task fail <taskId> <reason>` — Marker task som fejlet

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
widgetdc_mcp("supervisor.diagnostics")
widgetdc_mcp("supervisor.boot_manifest")

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

Dirigenten koordinerer 12 specialistagenter. Brug supervisor til HITL (human-in-the-loop) og agent.task til at delegere og spore opgaver.
