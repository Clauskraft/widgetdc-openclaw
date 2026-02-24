---
name: rlm-events
description: "RLM Engine Intelligence Events listener — real-time learning, health changes, circuit breakers via SSE"
user-invocable: true
metadata: {"openclaw": {"emoji": "📡", "primaryEnv": "RLM_ENGINE_URL"}}
---

# RLM Events — Intelligence Event Listener 📡

Real-time listener for RLM Engine events via Server-Sent Events (SSE).

## Kommandoer

- `/rlm-events start` — Start event listener
- `/rlm-events stop` — Stop event listener
- `/rlm-events status` — Vis listener status
- `/rlm-events history [limit]` — Vis seneste events

## Events der lyttes til

| Event | Handling |
|-------|----------|
| `learning_update` | Gem til AgentMemory |
| `q_learning_updated` | Gem til QLearningEvent node |
| `health_change` | Alert ved degraded status |
| `circuit_breaker_triggered` | Log + alert |
| `context_folded` | Log compression stats |
| `quality_scored` | Gem til QualityEvent node |
| `agent_memory_persisted` | Log confirmation |
| `error` | Log + alert ved kritiske fejl |

## Integration

Events gemmes automatisk til:
- `AgentMemory` nodes (learning)
- `QLearningEvent` nodes (Q-learning feedback)
- `HealthEvent` nodes (health changes)
- Slack alerts (#agent-status) ved kritiske events

## Auto-start

Listener startes automatisk ved gateway boot via cron:

```json
{
  "cron": [{
    "id": "rlm-events-listener",
    "schedule": "@reboot",
    "skill": "rlm-events",
    "action": "start"
  }]
}
```
