/**
 * RLM Events Skill — Full Intelligence Event Listener (100% coverage)
 *
 * Lytter til ALLE 12 RLM Engine Intelligence Events:
 * 1. context_folded — Context compression completed
 * 2. routing_decision — Model/provider routing decision made
 * 3. recommendation_ready — Cognitive recommendation generated
 * 4. learning_update — Agent learning event
 * 5. health_change — Service health status change
 * 6. quality_scored — Response quality evaluation
 * 7. q_learning_updated — Q-learning feedback loop
 * 8. meta_learning_applied — Meta-learning pattern applied
 * 9. agent_memory_persisted — Memory successfully saved
 * 10. attention_fold_complete — Attention mechanism folding done
 * 11. circuit_breaker_triggered — Circuit breaker activated
 * 12. sse_bridge_connected — SSE connection established
 * 13. error — Error event
 *
 * Features:
 * - Real-time SSE streaming (with polling fallback)
 * - Neo4j event persistence for all event types
 * - Slack alerts for critical events
 * - Event statistics and analytics
 * - Agent-specific event routing
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const RLM_URL = process.env.RLM_ENGINE_URL || 'https://rlm-engine-production.up.railway.app';
const BACKEND_URL = process.env.WIDGETDC_BACKEND_URL || 'https://backend-production-d3da.up.railway.app';

// ─── Types ────────────────────────────────────────────────────────────────

type IntelligenceEventType =
  | 'context_folded'
  | 'routing_decision'
  | 'recommendation_ready'
  | 'learning_update'
  | 'health_change'
  | 'quality_scored'
  | 'q_learning_updated'
  | 'meta_learning_applied'
  | 'agent_memory_persisted'
  | 'attention_fold_complete'
  | 'circuit_breaker_triggered'
  | 'sse_bridge_connected'
  | 'error';

interface IntelligenceEvent {
  type: IntelligenceEventType | string;
  payload: Record<string, unknown>;
  trace_id?: string;
  timestamp: string;
  source?: 'rlm-engine' | 'backend' | 'frontend' | string;
}

interface ListenerState {
  active: boolean;
  mode: 'sse' | 'polling' | 'idle';
  startedAt: string | null;
  eventsReceived: number;
  eventsByType: Record<string, number>;
  lastEventAt: string | null;
  errors: number;
  reconnects: number;
}

interface EventStats {
  total: number;
  byType: Record<string, number>;
  byHour: Record<string, number>;
  avgPerMinute: number;
}

// ─── State ────────────────────────────────────────────────────────────────

let listenerState: ListenerState = {
  active: false,
  mode: 'idle',
  startedAt: null,
  eventsReceived: 0,
  eventsByType: {},
  lastEventAt: null,
  errors: 0,
  reconnects: 0,
};

const eventHistory: IntelligenceEvent[] = [];
const MAX_HISTORY = 500;

// Event stats tracking
const hourlyStats: Record<string, number> = {};

// ─── Event Handlers (ALL 12 + error) ──────────────────────────────────────

async function handleContextFolded(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:ContextFoldEvent {
          timestamp: datetime(),
          traceId: $traceId,
          originalTokens: $originalTokens,
          foldedTokens: $foldedTokens,
          compressionRatio: $compressionRatio,
          domain: $domain,
          agentId: $agentId
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        originalTokens: event.payload.original_tokens ?? null,
        foldedTokens: event.payload.folded_tokens ?? null,
        compressionRatio: event.payload.compression_ratio ?? null,
        domain: event.payload.domain ?? null,
        agentId: event.payload.agentId ?? 'rlm',
      },
    });

    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: (event.payload.agentId as string) ?? 'rlm',
      content: `Context folded: ${event.payload.original_tokens ?? '?'} → ${event.payload.folded_tokens ?? '?'} tokens (${event.payload.compression_ratio ?? '?'}x compression)`,
      type: 'context_fold',
    });
  } catch (e) {
    console.warn(`[rlm-events] handleContextFolded error: ${e}`);
  }
}

async function handleRoutingDecision(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:RoutingDecisionEvent {
          timestamp: datetime(),
          traceId: $traceId,
          provider: $provider,
          model: $model,
          domain: $domain,
          latencyMs: $latencyMs,
          cost: $cost,
          reason: $reason
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        provider: event.payload.provider ?? null,
        model: event.payload.model ?? null,
        domain: event.payload.domain ?? null,
        latencyMs: event.payload.latency_ms ?? null,
        cost: event.payload.cost ?? null,
        reason: event.payload.reason ?? null,
      },
    });
  } catch (e) {
    console.warn(`[rlm-events] handleRoutingDecision error: ${e}`);
  }
}

async function handleRecommendationReady(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:RecommendationEvent {
          timestamp: datetime(),
          traceId: $traceId,
          confidence: $confidence,
          domain: $domain,
          reasoningMode: $reasoningMode,
          hasReasoningChain: $hasReasoningChain
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        confidence: event.payload.confidence ?? null,
        domain: event.payload.domain ?? null,
        reasoningMode: event.payload.reasoning_mode ?? null,
        hasReasoningChain: Boolean(event.payload.reasoning_chain),
      },
    });

    // Notify agent if specified
    const agentId = event.payload.agentId as string;
    if (agentId) {
      await notifyAgent(agentId, 'recommendation_ready', event);
    }
  } catch (e) {
    console.warn(`[rlm-events] handleRecommendationReady error: ${e}`);
  }
}

async function handleLearningUpdate(event: IntelligenceEvent): Promise<void> {
  try {
    const agentId = (event.payload.agentId as string) ?? 'rlm';

    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:LearningEvent {
          timestamp: datetime(),
          traceId: $traceId,
          agentId: $agentId,
          learningType: $learningType,
          insight: $insight,
          confidence: $confidence
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        agentId,
        learningType: event.payload.learning_type ?? 'general',
        insight: event.payload.insight ?? JSON.stringify(event.payload),
        confidence: event.payload.confidence ?? null,
      },
    });

    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId,
      content: JSON.stringify(event.payload),
      type: 'rlm_learning',
    });

    // Notify agent
    await notifyAgent(agentId, 'learning_update', event);
  } catch (e) {
    console.warn(`[rlm-events] handleLearningUpdate error: ${e}`);
  }
}

async function handleHealthChange(event: IntelligenceEvent): Promise<void> {
  const status = event.payload.status as string;
  const severity = status === 'degraded' || status === 'critical' ? 'high' : 'low';

  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:HealthChangeEvent {
          timestamp: datetime(),
          source: $source,
          status: $status,
          previousStatus: $previousStatus,
          severity: $severity,
          details: $details,
          affectedServices: $affectedServices
        })
      `,
      params: {
        source: event.source ?? 'rlm-engine',
        status,
        previousStatus: event.payload.previous_status ?? null,
        severity,
        details: JSON.stringify(event.payload),
        affectedServices: event.payload.affected_services ?? null,
      },
    });

    if (severity === 'high') {
      await sendSlackAlert(
        '#agent-status',
        `🚨 RLM Engine Health: ${status}`,
        JSON.stringify(event.payload, null, 2),
        'critical'
      );
    }
  } catch (e) {
    console.warn(`[rlm-events] handleHealthChange error: ${e}`);
  }
}

async function handleQualityScored(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:QualityScoreEvent {
          timestamp: datetime(),
          traceId: $traceId,
          overallScore: $overallScore,
          parsability: $parsability,
          relevance: $relevance,
          completeness: $completeness,
          domain: $domain
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        overallScore: event.payload.overall_score ?? null,
        parsability: event.payload.parsability ?? null,
        relevance: event.payload.relevance ?? null,
        completeness: event.payload.completeness ?? null,
        domain: event.payload.domain ?? null,
      },
    });

    // Track quality trends
    const score = event.payload.overall_score as number;
    if (score !== undefined && score < 0.5) {
      await sendSlackAlert(
        '#agent-status',
        `⚠️ Low Quality Score: ${(score * 100).toFixed(1)}%`,
        `Domain: ${event.payload.domain ?? 'unknown'}\nTrace: ${event.trace_id ?? 'none'}`,
        'warning'
      );
    }
  } catch (e) {
    console.warn(`[rlm-events] handleQualityScored error: ${e}`);
  }
}

async function handleQLearningUpdated(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:QLearningEvent {
          timestamp: datetime(),
          traceId: $traceId,
          agentId: $agentId,
          state: $state,
          action: $action,
          reward: $reward,
          newQValue: $newQValue,
          epsilon: $epsilon,
          learningRate: $learningRate
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        agentId: event.payload.agentId ?? 'unknown',
        state: JSON.stringify(event.payload.state ?? {}),
        action: event.payload.action ?? null,
        reward: event.payload.reward ?? 0,
        newQValue: event.payload.new_q_value ?? null,
        epsilon: event.payload.epsilon ?? null,
        learningRate: event.payload.learning_rate ?? null,
      },
    });

    // Notify agent about Q-learning update
    const agentId = event.payload.agentId as string;
    if (agentId) {
      await notifyAgent(agentId, 'q_learning_updated', event);
    }
  } catch (e) {
    console.warn(`[rlm-events] handleQLearningUpdated error: ${e}`);
  }
}

async function handleMetaLearningApplied(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:MetaLearningEvent {
          timestamp: datetime(),
          traceId: $traceId,
          patternId: $patternId,
          patternType: $patternType,
          confidence: $confidence,
          appliedTo: $appliedTo,
          improvement: $improvement
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        patternId: event.payload.pattern_id ?? null,
        patternType: event.payload.pattern_type ?? null,
        confidence: event.payload.confidence ?? null,
        appliedTo: event.payload.applied_to ?? null,
        improvement: event.payload.improvement ?? null,
      },
    });

    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'rlm',
      content: `Meta-learning applied: ${event.payload.pattern_type ?? 'unknown'} pattern (${event.payload.improvement ?? '?'}% improvement)`,
      type: 'meta_learning',
    });
  } catch (e) {
    console.warn(`[rlm-events] handleMetaLearningApplied error: ${e}`);
  }
}

async function handleAgentMemoryPersisted(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:MemoryPersistEvent {
          timestamp: datetime(),
          agentId: $agentId,
          memoryType: $memoryType,
          itemCount: $itemCount,
          success: $success
        })
      `,
      params: {
        agentId: event.payload.agentId ?? 'unknown',
        memoryType: event.payload.memory_type ?? 'general',
        itemCount: event.payload.item_count ?? 1,
        success: event.payload.success ?? true,
      },
    });

    // Notify agent
    const agentId = event.payload.agentId as string;
    if (agentId) {
      await notifyAgent(agentId, 'agent_memory_persisted', event);
    }
  } catch (e) {
    console.warn(`[rlm-events] handleAgentMemoryPersisted error: ${e}`);
  }
}

async function handleAttentionFoldComplete(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:AttentionFoldEvent {
          timestamp: datetime(),
          traceId: $traceId,
          layerCount: $layerCount,
          headCount: $headCount,
          foldedDimension: $foldedDimension,
          attentionScore: $attentionScore
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        layerCount: event.payload.layer_count ?? null,
        headCount: event.payload.head_count ?? null,
        foldedDimension: event.payload.folded_dimension ?? null,
        attentionScore: event.payload.attention_score ?? null,
      },
    });
  } catch (e) {
    console.warn(`[rlm-events] handleAttentionFoldComplete error: ${e}`);
  }
}

async function handleCircuitBreakerTriggered(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:CircuitBreakerEvent {
          timestamp: datetime(),
          service: $service,
          reason: $reason,
          duration: $duration,
          failureCount: $failureCount,
          threshold: $threshold,
          state: $state
        })
      `,
      params: {
        service: event.payload.service ?? 'rlm-engine',
        reason: event.payload.reason ?? 'unknown',
        duration: event.payload.duration ?? null,
        failureCount: event.payload.failure_count ?? null,
        threshold: event.payload.threshold ?? null,
        state: event.payload.state ?? 'open',
      },
    });

    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'system',
      content: `Circuit breaker triggered: ${event.payload.service ?? 'RLM'} - ${event.payload.reason ?? 'unknown'}`,
      type: 'circuit_breaker',
    });

    await sendSlackAlert(
      '#agent-status',
      `⚡ Circuit Breaker: ${event.payload.service ?? 'RLM Engine'}`,
      `Reason: ${event.payload.reason ?? 'Unknown'}\nFailures: ${event.payload.failure_count ?? '?'}\nState: ${event.payload.state ?? 'open'}`,
      'critical'
    );
  } catch (e) {
    console.warn(`[rlm-events] handleCircuitBreakerTriggered error: ${e}`);
  }
}

async function handleSSEBridgeConnected(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:SSEConnectionEvent {
          timestamp: datetime(),
          clientId: $clientId,
          connectionType: $connectionType,
          reconnect: $reconnect
        })
      `,
      params: {
        clientId: event.payload.client_id ?? 'openclaw',
        connectionType: event.payload.connection_type ?? 'sse',
        reconnect: event.payload.reconnect ?? false,
      },
    });

    listenerState.reconnects++;
  } catch (e) {
    console.warn(`[rlm-events] handleSSEBridgeConnected error: ${e}`);
  }
}

async function handleError(event: IntelligenceEvent): Promise<void> {
  listenerState.errors++;

  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (e:ErrorEvent {
          timestamp: datetime(),
          traceId: $traceId,
          errorType: $errorType,
          message: $message,
          severity: $severity,
          stack: $stack,
          source: $source
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        errorType: event.payload.error_type ?? 'unknown',
        message: event.payload.message ?? JSON.stringify(event.payload),
        severity: event.payload.severity ?? 'error',
        stack: event.payload.stack ?? null,
        source: event.source ?? 'rlm-engine',
      },
    });

    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'system',
      content: `RLM Error: ${event.payload.message ?? JSON.stringify(event.payload)}`,
      type: 'rlm_error',
    });

    if (event.payload.severity === 'critical') {
      await sendSlackAlert(
        '#agent-status',
        `❌ RLM Engine Error`,
        String(event.payload.message ?? JSON.stringify(event.payload)),
        'critical'
      );
    }
  } catch (e) {
    console.warn(`[rlm-events] handleError error: ${e}`);
  }
}

// ─── Agent Notification ───────────────────────────────────────────────────

async function notifyAgent(
  agentId: string,
  eventType: string,
  event: IntelligenceEvent
): Promise<void> {
  try {
    // Send to agent-specific channel
    const channel = `#agent-${agentId}`;
    await sendSlackAlert(
      channel,
      `📬 ${eventType}`,
      JSON.stringify(event.payload, null, 2).substring(0, 500),
      'info'
    );
  } catch {
    // Channel may not exist
  }
}

// ─── Slack Integration ────────────────────────────────────────────────────

async function sendSlackAlert(
  channel: string,
  title: string,
  message: string,
  level: 'info' | 'warning' | 'critical' = 'info'
): Promise<void> {
  const emoji = level === 'critical' ? '🔴' : level === 'warning' ? '🟡' : '🔵';

  try {
    // Use backend notifications endpoint (not MCP - slack.post doesn't exist)
    const res = await fetch(`${BACKEND_URL}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        title: `${emoji} ${title}`,
        message: message.substring(0, 2900),
        source: 'RLM-Events',
        channel,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[rlm-events] Slack alert failed: ${res.status}`);
    }
  } catch (e) {
    console.warn(`[rlm-events] Slack alert error: ${e}`);
  }
}

// ─── Event Dispatcher ─────────────────────────────────────────────────────

async function dispatchEvent(event: IntelligenceEvent): Promise<void> {
  // Add to history
  eventHistory.unshift(event);
  if (eventHistory.length > MAX_HISTORY) {
    eventHistory.pop();
  }

  // Update stats
  listenerState.eventsReceived++;
  listenerState.lastEventAt = new Date().toISOString();
  listenerState.eventsByType[event.type] = (listenerState.eventsByType[event.type] ?? 0) + 1;

  // Track hourly stats
  const hour = new Date().toISOString().slice(0, 13);
  hourlyStats[hour] = (hourlyStats[hour] ?? 0) + 1;

  // Dispatch to handler
  switch (event.type) {
    case 'context_folded':
      await handleContextFolded(event);
      break;
    case 'routing_decision':
      await handleRoutingDecision(event);
      break;
    case 'recommendation_ready':
      await handleRecommendationReady(event);
      break;
    case 'learning_update':
      await handleLearningUpdate(event);
      break;
    case 'health_change':
      await handleHealthChange(event);
      break;
    case 'quality_scored':
      await handleQualityScored(event);
      break;
    case 'q_learning_updated':
      await handleQLearningUpdated(event);
      break;
    case 'meta_learning_applied':
      await handleMetaLearningApplied(event);
      break;
    case 'agent_memory_persisted':
      await handleAgentMemoryPersisted(event);
      break;
    case 'attention_fold_complete':
      await handleAttentionFoldComplete(event);
      break;
    case 'circuit_breaker_triggered':
      await handleCircuitBreakerTriggered(event);
      break;
    case 'sse_bridge_connected':
      await handleSSEBridgeConnected(event);
      break;
    case 'error':
      await handleError(event);
      break;
    default:
      console.log(`[rlm-events] Unknown event type: ${event.type}`);
      // Still log unknown events
      await widgetdc_mcp('graph.write_cypher', {
        query: `
          CREATE (e:UnknownEvent {
            timestamp: datetime(),
            type: $type,
            payload: $payload
          })
        `,
        params: {
          type: event.type,
          payload: JSON.stringify(event.payload),
        },
      }).catch(() => {});
  }
}

// ─── SSE/Polling Listener ─────────────────────────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null;

async function startListener(): Promise<unknown> {
  if (listenerState.active) {
    return { success: false, error: 'Listener already active' };
  }

  listenerState = {
    active: true,
    mode: 'polling',
    startedAt: new Date().toISOString(),
    eventsReceived: 0,
    eventsByType: {},
    lastEventAt: null,
    errors: 0,
    reconnects: 0,
  };

  // Try SSE first, fallback to polling
  const sseStarted = await trySSE();
  if (!sseStarted) {
    startPolling();
  }

  return {
    success: true,
    message: `Event listener started (mode: ${listenerState.mode})`,
    state: listenerState,
  };
}

async function trySSE(): Promise<boolean> {
  try {
    // Check if SSE stream endpoint exists
    const response = await fetch(`${RLM_URL}/api/rlm/events/stream`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok || response.status === 405) {
      // SSE endpoint exists, but EventSource isn't available in Node.js
      // Fall back to polling which works reliably
      console.log('[rlm-events] SSE endpoint available, using polling for reliability');
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

function startPolling(): void {
  listenerState.mode = 'polling';

  // Track last seen event to avoid duplicates
  let lastEventTimestamp: string | null = null;

  pollInterval = setInterval(async () => {
    if (!listenerState.active) {
      if (pollInterval) clearInterval(pollInterval);
      return;
    }

    try {
      // Poll RLM events/recent endpoint (correct endpoint)
      const response = await fetch(`${RLM_URL}/api/rlm/events/recent`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        const data = await response.json() as { events?: IntelligenceEvent[]; total?: number };
        const events = data.events ?? [];

        for (const event of events) {
          // Skip already processed events
          if (lastEventTimestamp && event.timestamp <= lastEventTimestamp) {
            continue;
          }
          await dispatchEvent(event);
          lastEventTimestamp = event.timestamp;
        }
      }
    } catch (e) {
      if (listenerState.active) {
        listenerState.errors++;
        console.warn(`[rlm-events] Poll error: ${e}`);
      }
    }
  }, 3000); // Poll every 3 seconds
}

function stopListener(): unknown {
  if (!listenerState.active) {
    return { success: false, error: 'Listener not active' };
  }

  listenerState.active = false;
  listenerState.mode = 'idle';

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  return {
    success: true,
    message: 'Event listener stopped',
    finalState: { ...listenerState },
  };
}

// ─── Statistics ───────────────────────────────────────────────────────────

function getStats(): EventStats {
  const total = listenerState.eventsReceived;
  const startTime = listenerState.startedAt ? new Date(listenerState.startedAt).getTime() : Date.now();
  const runningMinutes = Math.max(1, (Date.now() - startTime) / 60000);

  return {
    total,
    byType: { ...listenerState.eventsByType },
    byHour: { ...hourlyStats },
    avgPerMinute: Math.round((total / runningMinutes) * 100) / 100,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function rlm_events(action = 'status', ...args: string[]): Promise<unknown> {
  switch (action.toLowerCase().trim()) {
    case 'start':
      return startListener();

    case 'stop':
      return stopListener();

    case 'status':
      return {
        state: listenerState,
        stats: getStats(),
        historyCount: eventHistory.length,
        rlmUrl: RLM_URL,
        backendUrl: BACKEND_URL,
      };

    case 'stats':
      return getStats();

    case 'history': {
      const limit = parseInt(args[0]) || 20;
      const typeFilter = args[1];
      let events = eventHistory;
      if (typeFilter) {
        events = events.filter(e => e.type === typeFilter);
      }
      return {
        events: events.slice(0, limit),
        total: events.length,
        filter: typeFilter ?? 'all',
      };
    }

    case 'test': {
      const eventType = args[0] || 'learning_update';
      await dispatchEvent({
        type: eventType as IntelligenceEventType,
        payload: { agentId: 'test', test: true, timestamp: Date.now() },
        timestamp: new Date().toISOString(),
        source: 'test',
      });
      return { success: true, message: `Test ${eventType} event dispatched` };
    }

    case 'test-all': {
      const allTypes: IntelligenceEventType[] = [
        'context_folded', 'routing_decision', 'recommendation_ready',
        'learning_update', 'health_change', 'quality_scored',
        'q_learning_updated', 'meta_learning_applied', 'agent_memory_persisted',
        'attention_fold_complete', 'circuit_breaker_triggered', 'sse_bridge_connected',
      ];
      for (const type of allTypes) {
        await dispatchEvent({
          type,
          payload: { test: true, agentId: 'test' },
          timestamp: new Date().toISOString(),
          source: 'test',
        });
      }
      return { success: true, message: `All ${allTypes.length} event types tested` };
    }

    default:
      return {
        help: 'RLM Events — Full Intelligence Event Listener 📡',
        commands: {
          '/rlm-events start': 'Start event listener',
          '/rlm-events stop': 'Stop event listener',
          '/rlm-events status': 'Vis listener status og stats',
          '/rlm-events stats': 'Vis kun event statistik',
          '/rlm-events history [limit] [type]': 'Vis seneste events',
          '/rlm-events test [type]': 'Send test event',
          '/rlm-events test-all': 'Test alle 12 event types',
        },
        eventTypes: [
          'context_folded', 'routing_decision', 'recommendation_ready',
          'learning_update', 'health_change', 'quality_scored',
          'q_learning_updated', 'meta_learning_applied', 'agent_memory_persisted',
          'attention_fold_complete', 'circuit_breaker_triggered', 'sse_bridge_connected',
          'error',
        ],
        coverage: '100% (13/13 event types)',
      };
  }
}

export default rlm_events;
