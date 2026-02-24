---
name: slack-bridge
description: "Send Slack notifications via WidgeTDC backend. Alert team, share RAG summaries, health alerts."
user-invocable: true
metadata: {"openclaw": {"emoji": "💬", "primaryEnv": "WIDGETDC_BACKEND_URL"}}
---

# Slack Bridge

Sender notifikationer til Slack via WidgeTDC Backend (`/api/notifications/send`).

## Krav

- Backend skal have `SLACK_WEBHOOK_URL` konfigureret på Railway.

## Funktioner

- `notify({ level, title, message, source?, fields? })` — Generisk notifikation
- `alertCritical(title, message, fields?)` — Kritisk alert
- `alertSuccess(title, message, fields?)` — Succes-bekræftelse
- `shareRagSummary(query, summary, domains)` — Del RAG-resultat til Slack

## Eksempler

```
notify({ level: 'info', title: 'Task Complete', message: 'Dirigenten har fuldført orchestration.' })
alertCritical('Health Degraded', 'RLM Engine svarer ikke', { score: '45%' })
shareRagSummary('digital transformation', 'Top 5 insights...', ['strategy', 'technology'])
```
