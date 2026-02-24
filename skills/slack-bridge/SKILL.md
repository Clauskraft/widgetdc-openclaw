---
name: slack-bridge
description: "Slack notifications, agent status channel, og Kanban board via WidgeTDC Backend"
user-invocable: true
metadata: {"openclaw": {"emoji": "📢", "primaryEnv": "WIDGETDC_BACKEND_URL"}}
---

# Slack Bridge — Notifications & Kanban 📢

Send notifications til Slack og administrer Kanban board.

## Kommandoer

### Notifications
- `/slack notify <title> <message>` — Send notification
- `/slack alert <title> <message>` — Send kritisk alert

### Kanban Board
- `/slack board` — Vis Kanban board
- `/slack kanban-post` — Post Kanban til #agent-status
- `/slack task-create <title> [assignee] [priority]` — Opret task
- `/slack task-move <taskId> <status>` — Flyt task

## Kanban Status

| Status | Beskrivelse |
|--------|-------------|
| `backlog` | Ikke startet |
| `todo` | Klar til start |
| `in_progress` | Under arbejde |
| `review` | Til gennemgang |
| `done` | Færdig |

## Priority

| Priority | Emoji |
|----------|-------|
| `critical` | 🔴 |
| `high` | 🟠 |
| `medium` | ⚪ |
| `low` | ⚪ |

## Agent Status Channel

Hourly reports sendes automatisk til `#agent-status` med:
- Platform health status
- Service latencies
- Agent aktivitet
- Kanban board oversigt

## Krav

- Backend skal have `SLACK_WEBHOOK_URL` konfigureret på Railway

## Funktioner (programmatisk)

```javascript
// Notifications
notify({ title, message, level?, fields?, channel? })
alertCritical(title, message)
alertSuccess(title, message)
shareRagSummary(query, summary, domains)
postAgentStatus(status)

// Kanban
kanbanCreate({ title, assignee?, priority? })
kanbanMove(taskId, newStatus)
kanbanBoard()
kanbanPost()
```
