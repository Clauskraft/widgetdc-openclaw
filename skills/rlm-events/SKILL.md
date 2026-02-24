---
name: rlm-events
description: "RLM Engine Intelligence Events — 100% coverage af alle 13 event types med Neo4j persistence"
user-invocable: true
metadata: {"openclaw": {"emoji": "📡", "primaryEnv": "RLM_ENGINE_URL"}}
---

# RLM Events — Full Intelligence Event Listener 📡

Real-time listener for ALLE RLM Engine Intelligence Events med 100% coverage.

## Kommandoer

- `/rlm-events start` — Start event listener
- `/rlm-events stop` — Stop event listener
- `/rlm-events status` — Vis listener status og statistik
- `/rlm-events stats` — Vis kun event statistik
- `/rlm-events history [limit] [type]` — Vis seneste events (filter by type)
- `/rlm-events test [type]` — Send test event
- `/rlm-events test-all` — Test alle 13 event types

## Event Types (100% Coverage)

| # | Event | Neo4j Node | Slack Alert |
|---|-------|------------|-------------|
| 1 | `context_folded` | `ContextFoldEvent` | ❌ |
| 2 | `routing_decision` | `RoutingDecisionEvent` | ❌ |
| 3 | `recommendation_ready` | `RecommendationEvent` | Agent-specific |
| 4 | `learning_update` | `LearningEvent` | Agent-specific |
| 5 | `health_change` | `HealthChangeEvent` | ✅ (critical) |
| 6 | `quality_scored` | `QualityScoreEvent` | ⚠️ (low score) |
| 7 | `q_learning_updated` | `QLearningEvent` | Agent-specific |
| 8 | `meta_learning_applied` | `MetaLearningEvent` | ❌ |
| 9 | `agent_memory_persisted` | `MemoryPersistEvent` | Agent-specific |
| 10 | `attention_fold_complete` | `AttentionFoldEvent` | ❌ |
| 11 | `circuit_breaker_triggered` | `CircuitBreakerEvent` | ✅ (always) |
| 12 | `sse_bridge_connected` | `SSEConnectionEvent` | ❌ |
| 13 | `error` | `ErrorEvent` | ✅ (critical) |

## Neo4j Node Types

Alle events persisteres til Neo4j med dedikerede node types:

```cypher
// Context Folding
(:ContextFoldEvent {timestamp, traceId, originalTokens, foldedTokens, compressionRatio, domain, agentId})

// Routing
(:RoutingDecisionEvent {timestamp, traceId, provider, model, domain, latencyMs, cost, reason})

// Recommendations
(:RecommendationEvent {timestamp, traceId, confidence, domain, reasoningMode, hasReasoningChain})

// Learning
(:LearningEvent {timestamp, traceId, agentId, learningType, insight, confidence})

// Health
(:HealthChangeEvent {timestamp, source, status, previousStatus, severity, details, affectedServices})

// Quality
(:QualityScoreEvent {timestamp, traceId, overallScore, parsability, relevance, completeness, domain})

// Q-Learning
(:QLearningEvent {timestamp, traceId, agentId, state, action, reward, newQValue, epsilon, learningRate})

// Meta-Learning
(:MetaLearningEvent {timestamp, traceId, patternId, patternType, confidence, appliedTo, improvement})

// Memory Persistence
(:MemoryPersistEvent {timestamp, agentId, memoryType, itemCount, success})

// Attention
(:AttentionFoldEvent {timestamp, traceId, layerCount, headCount, foldedDimension, attentionScore})

// Circuit Breaker
(:CircuitBreakerEvent {timestamp, service, reason, duration, failureCount, threshold, state})

// SSE Connection
(:SSEConnectionEvent {timestamp, clientId, connectionType, reconnect})

// Errors
(:ErrorEvent {timestamp, traceId, errorType, message, severity, stack, source})
```

## Agent-Specific Notifications

Events med `agentId` payload sender automatisk notifikationer til agent-specifikke Slack kanaler:

- `learning_update` → `#agent-{agentId}`
- `recommendation_ready` → `#agent-{agentId}`
- `q_learning_updated` → `#agent-{agentId}`
- `agent_memory_persisted` → `#agent-{agentId}`

## Statistics Tracking

Listener tracker automatisk:
- Total events received
- Events by type (breakdown)
- Events by hour (time series)
- Average events per minute
- Error count
- Reconnection count

## Listener Modes

| Mode | Beskrivelse |
|------|-------------|
| `sse` | Real-time Server-Sent Events (foretrukket) |
| `polling` | Fallback polling hver 3. sekund |
| `idle` | Listener stoppet |

## Integration

Events gemmes automatisk til:
- **Neo4j**: Alle 13 event types med dedikerede node labels
- **AgentMemory**: Learning, context folds, errors
- **Slack**: Kritiske alerts til `#agent-status`, agent-specifikke til `#agent-{id}`

## Auto-start

Listener startes automatisk ved gateway boot:

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

## Environment Variables

- `RLM_ENGINE_URL` — RLM Engine endpoint (default: https://rlm-engine-production.up.railway.app)
- `WIDGETDC_BACKEND_URL` — Backend for buffered events (default: https://backend-production-d3da.up.railway.app)

## Funktioner (programmatisk)

```javascript
// Listener control
rlm_events('start')
rlm_events('stop')
rlm_events('status')
rlm_events('stats')
rlm_events('history', limit?, typeFilter?)
rlm_events('test', eventType?)
rlm_events('test-all')
```
