---
name: slack-bridge
description: "Full Agent Communication Hub — individuelle kanaler, @mention routing, Kanban board"
user-invocable: true
metadata: {"openclaw": {"emoji": "📢", "primaryEnv": "WIDGETDC_BACKEND_URL"}}
---

# Slack Bridge — Agent Communication Hub 📢

Komplet kommunikationsplatform for alle 12 agenter med individuelle kanaler, @mention routing, og Kanban board.

## Agent Kanaler

| Kanal | Agent | Emoji |
|-------|-------|-------|
| `#agent-status` | Platform-wide status & alerts | 📊 |
| `#agent-main` | Kaptajn Klo (main agent) | 🦀 |
| `#agent-orchestrator` | Dirigenten (orchestrator) | 🎭 |
| `#agent-analyst` | Analytikeren | 📊 |
| `#agent-writer` | Skribleren | ✍️ |
| `#agent-researcher` | Forskeren | 🔬 |
| `#agent-developer` | Udvikleren | 💻 |
| `#agent-security` | Sikkerhedsvagten | 🛡️ |
| `#agent-devops` | DevOps Ninja | 🚀 |
| `#agent-qa` | QA Mesteren | 🧪 |
| `#agent-ux` | UX Designeren | 🎨 |
| `#agent-data` | Data Scientist | 📈 |
| `#agent-pm` | Projekt Manager | 📋 |

## Kommandoer

### Notifications
- `/slack notify <title> <message>` — Send notification til #agent-status
- `/slack alert <title> <message>` — Send kritisk alert

### Agent Messaging
- `/slack agents` — List alle agent kanaler
- `/slack message <agent> <message>` — Send besked til specifik agent
- `/slack broadcast <message>` — Send til alle agenter
- `/slack route <message with @mentions>` — Route @mentions til agenter
- `/slack inbox [agent]` — Vis ulæste beskeder
- `/slack history [agent] [limit]` — Vis besked historik

### Kanban Board
- `/slack board` — Vis Kanban board
- `/slack kanban-post` — Post Kanban til #agent-status
- `/slack task-create <title> [assignee] [priority]` — Opret task
- `/slack task-move <taskId> <status>` — Flyt task

## @Mention Routing

Send beskeder med @mentions for automatisk routing:

```
/slack route "Hey @developer og @qa, vi skal teste den nye feature"
```

Dette sender beskeden til både `#agent-developer` og `#agent-qa`.

Understøttede mentions:
- `@main` / `@kaptajn` → Kaptajn Klo
- `@orchestrator` / `@dirigent` → Dirigenten
- `@analyst` / `@analytiker` → Analytikeren
- `@writer` / `@skribent` → Skribleren
- `@researcher` / `@forsker` → Forskeren
- `@developer` / `@udvikler` → Udvikleren
- `@security` / `@sikkerhed` → Sikkerhedsvagten
- `@devops` → DevOps Ninja
- `@qa` → QA Mesteren
- `@ux` / `@design` → UX Designeren
- `@data` → Data Scientist
- `@pm` / `@manager` → Projekt Manager

## Agent-to-Agent Messaging

Agenter kan sende beskeder til hinanden med prioritet:

```javascript
sendAgentMessage({
  from: 'developer',
  to: 'qa',
  message: 'Feature X er klar til test',
  priority: 'high'
})
```

Prioriteter:
| Priority | Emoji | Beskrivelse |
|----------|-------|-------------|
| `urgent` | 🔴 | Kræver øjeblikkelig handling |
| `high` | 🟠 | Vigtig besked |
| `normal` | ⚪ | Standard besked |
| `low` | ⚪ | Lav prioritet |

## Kanban Status

| Status | Beskrivelse |
|--------|-------------|
| `backlog` | Ikke startet |
| `todo` | Klar til start |
| `in_progress` | Under arbejde |
| `review` | Til gennemgang |
| `done` | Færdig |

## Task Priority

| Priority | Emoji |
|----------|-------|
| `critical` | 🔴 |
| `high` | 🟠 |
| `medium` | ⚪ |
| `low` | ⚪ |

## Hourly Status Reports

Automatiske rapporter sendes til `#agent-status` hver time med:
- Platform health status
- Service latencies
- Agent aktivitet (active/idle/unknown)
- Kanban board oversigt

## Message Persistence

Alle beskeder logges til Neo4j med:
- `AgentMessage` nodes
- Timestamp, priority, thread tracking
- Read/unread status

## Krav

- Backend skal have `SLACK_WEBHOOK_URL` konfigureret på Railway
- Neo4j for message persistence

## Funktioner (programmatisk)

```javascript
// Notifications
notify({ title, message, level?, fields?, channel? })
notifyAgent(agentId, title, message, level?)
alertCritical(title, message)
alertSuccess(title, message)
shareRagSummary(query, summary, domains)
postAgentStatus(status)

// Agent Messaging
sendAgentMessage({ from, to, message, priority?, replyTo?, threadId? })
broadcastToAgents(from, message, priority?)
routeMentions(from, message)
getAgentMessages(agentId, limit?)
getUnreadMessages(agentId)
markMessageRead(messageId)

// Agent Registry
getAgent(id)
getAgentChannel(id)
listAgentChannels()

// Kanban
kanbanCreate({ title, assignee?, priority? })
kanbanMove(taskId, newStatus)
kanbanBoard()
kanbanPost()
```
