/**
 * RLM Events Skill — Intelligence Event Listener
 *
 * Lytter til RLM Engine events via SSE og:
 * - Gemmer learning events til AgentMemory
 * - Logger Q-learning feedback til Neo4j
 * - Sender alerts ved health changes og circuit breakers
 * - Tracker event history for debugging
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const RLM_URL = process.env.RLM_ENGINE_URL || 'https://rlm-engine-production.up.railway.app';

// ─── Types ────────────────────────────────────────────────────────────────

interface IntelligenceEvent {
  type: string;
  payload: Record<string, unknown>;
  trace_id?: string;
  timestamp: string;
  source?: string;
}

interface ListenerState {
  active: boolean;
  startedAt: string | null;
  eventsReceived: number;
  lastEventAt: string | null;
  errors: number;
}

// ─── State ────────────────────────────────────────────────────────────────

let listenerState: ListenerState = {
  active: false,
  startedAt: null,
  eventsReceived: 0,
  lastEventAt: null,
  errors: 0,
};

const eventHistory: IntelligenceEvent[] = [];
const MAX_HISTORY = 100;

// ─── Event Handlers ───────────────────────────────────────────────────────

async function handleLearningUpdate(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: (event.payload.agentId as string) ?? 'rlm',
      content: JSON.stringify(event.payload),
      type: 'rlm_learning',
    });
  } catch (e) {
    console.warn(`[rlm-events] Failed to store learning: ${e}`);
  }
}

async function handleQLearningUpdated(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (q:QLearningEvent {
          timestamp: datetime(),
          traceId: $traceId,
          agentId: $agentId,
          action: $action,
          reward: $reward,
          state: $state,
          newQValue: $newQValue
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        agentId: event.payload.agentId ?? 'unknown',
        action: event.payload.action ?? null,
        reward: event.payload.reward ?? 0,
        state: JSON.stringify(event.payload.state ?? {}),
        newQValue: event.payload.new_q_value ?? null,
      },
    });
  } catch (e) {
    console.warn(`[rlm-events] Failed to store Q-learning: ${e}`);
  }
}

async function handleHealthChange(event: IntelligenceEvent): Promise<void> {
  const status = event.payload.status as string;
  const severity = status === 'degraded' || status === 'critical' ? 'high' : 'low';

  try {
    // Log til Neo4j
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (h:HealthEvent {
          timestamp: datetime(),
          source: 'rlm-engine',
          status: $status,
          details: $details,
          severity: $severity
        })
      `,
      params: {
        status,
        details: JSON.stringify(event.payload),
        severity,
      },
    });

    // Send Slack alert ved degraded/critical
    if (severity === 'high') {
      await sendSlackAlert(
        `🚨 RLM Engine Health: ${status}`,
        JSON.stringify(event.payload, null, 2)
      );
    }
  } catch (e) {
    console.warn(`[rlm-events] Failed to handle health change: ${e}`);
  }
}

async function handleCircuitBreaker(event: IntelligenceEvent): Promise<void> {
  try {
    // Log til memory
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'system',
      content: `Circuit breaker triggered: ${event.payload.reason ?? 'unknown'}`,
      type: 'circuit_breaker',
    });

    // Log til Neo4j
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (c:CircuitBreakerEvent {
          timestamp: datetime(),
          reason: $reason,
          service: $service,
          duration: $duration
        })
      `,
      params: {
        reason: event.payload.reason ?? 'unknown',
        service: event.payload.service ?? 'rlm-engine',
        duration: event.payload.duration ?? null,
      },
    });

    // Send Slack alert
    await sendSlackAlert(
      `⚡ Circuit Breaker Triggered`,
      `Service: ${event.payload.service ?? 'RLM Engine'}\nReason: ${event.payload.reason ?? 'Unknown'}`
    );
  } catch (e) {
    console.warn(`[rlm-events] Failed to handle circuit breaker: ${e}`);
  }
}

async function handleQualityScored(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (q:QualityEvent {
          timestamp: datetime(),
          traceId: $traceId,
          overallScore: $overallScore,
          parsability: $parsability,
          relevance: $relevance,
          completeness: $completeness
        })
      `,
      params: {
        traceId: event.trace_id ?? null,
        overallScore: event.payload.overall_score ?? null,
        parsability: event.payload.parsability ?? null,
        relevance: event.payload.relevance ?? null,
        completeness: event.payload.completeness ?? null,
      },
    });
  } catch (e) {
    console.warn(`[rlm-events] Failed to store quality score: ${e}`);
  }
}

async function handleContextFolded(event: IntelligenceEvent): Promise<void> {
  try {
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'rlm',
      content: `Context folded: ${event.payload.original_tokens ?? '?'} → ${event.payload.folded_tokens ?? '?'} tokens (${event.payload.compression_ratio ?? '?'}x)`,
      type: 'context_fold',
    });
  } catch (e) {
    console.warn(`[rlm-events] Failed to log context fold: ${e}`);
  }
}

async function handleError(event: IntelligenceEvent): Promise<void> {
  listenerState.errors++;

  try {
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'system',
      content: `RLM Error: ${event.payload.message ?? JSON.stringify(event.payload)}`,
      type: 'rlm_error',
    });

    // Alert ved kritiske fejl
    if (event.payload.severity === 'critical') {
      await sendSlackAlert(
        `❌ RLM Engine Error`,
        String(event.payload.message ?? JSON.stringify(event.payload))
      );
    }
  } catch (e) {
    console.warn(`[rlm-events] Failed to log error: ${e}`);
  }
}

// ─── Slack Integration ────────────────────────────────────────────────────

async function sendSlackAlert(title: string, message: string): Promise<void> {
  try {
    await widgetdc_mcp('slack.post', {
      channel: '#agent-status',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: title, emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '```' + message + '```' },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `_${new Date().toISOString()}_` },
          ],
        },
      ],
    });
  } catch {
    // Slack ikke konfigureret
  }
}

// ─── Event Dispatcher ─────────────────────────────────────────────────────

async function dispatchEvent(event: IntelligenceEvent): Promise<void> {
  // Add to history
  eventHistory.unshift(event);
  if (eventHistory.length > MAX_HISTORY) {
    eventHistory.pop();
  }

  listenerState.eventsReceived++;
  listenerState.lastEventAt = new Date().toISOString();

  switch (event.type) {
    case 'learning_update':
      await handleLearningUpdate(event);
      break;
    case 'q_learning_updated':
      await handleQLearningUpdated(event);
      break;
    case 'health_change':
      await handleHealthChange(event);
      break;
    case 'circuit_breaker_triggered':
      await handleCircuitBreaker(event);
      break;
    case 'quality_scored':
      await handleQualityScored(event);
      break;
    case 'context_folded':
      await handleContextFolded(event);
      break;
    case 'agent_memory_persisted':
      // Just log, no action needed
      console.log(`[rlm-events] Memory persisted: ${event.payload.agentId}`);
      break;
    case 'error':
      await handleError(event);
      break;
    default:
      console.log(`[rlm-events] Unknown event type: ${event.type}`);
  }
}

// ─── SSE Listener ─────────────────────────────────────────────────────────

let eventSourceController: AbortController | null = null;

async function startListener(): Promise<unknown> {
  if (listenerState.active) {
    return { success: false, error: 'Listener already active' };
  }

  listenerState = {
    active: true,
    startedAt: new Date().toISOString(),
    eventsReceived: 0,
    lastEventAt: null,
    errors: 0,
  };

  eventSourceController = new AbortController();

  // Start polling for events (SSE fallback via polling)
  pollForEvents();

  return {
    success: true,
    message: 'Event listener started',
    state: listenerState,
  };
}

async function pollForEvents(): Promise<void> {
  while (listenerState.active) {
    try {
      const response = await fetch(`${RLM_URL}/events/poll`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });

      if (response.ok) {
        const events = await response.json() as IntelligenceEvent[];
        for (const event of events) {
          await dispatchEvent(event);
        }
      }
    } catch (e) {
      if (listenerState.active) {
        console.warn(`[rlm-events] Poll error: ${e}`);
        listenerState.errors++;
      }
    }

    // Wait 5 seconds between polls
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

function stopListener(): unknown {
  if (!listenerState.active) {
    return { success: false, error: 'Listener not active' };
  }

  listenerState.active = false;
  eventSourceController?.abort();
  eventSourceController = null;

  return {
    success: true,
    message: 'Event listener stopped',
    finalState: { ...listenerState },
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
        historyCount: eventHistory.length,
        rlmUrl: RLM_URL,
      };

    case 'history':
      const limit = parseInt(args[0]) || 20;
      return {
        events: eventHistory.slice(0, limit),
        total: eventHistory.length,
      };

    case 'test':
      // Test event dispatch
      await dispatchEvent({
        type: 'learning_update',
        payload: { agentId: 'test', insight: 'Test learning event' },
        timestamp: new Date().toISOString(),
      });
      return { success: true, message: 'Test event dispatched' };

    default:
      return {
        help: 'RLM Events — Intelligence Event Listener 📡',
        commands: {
          '/rlm-events start': 'Start event listener',
          '/rlm-events stop': 'Stop event listener',
          '/rlm-events status': 'Vis listener status',
          '/rlm-events history [limit]': 'Vis seneste events',
          '/rlm-events test': 'Send test event',
        },
        eventTypes: [
          'learning_update', 'q_learning_updated', 'health_change',
          'circuit_breaker_triggered', 'quality_scored', 'context_folded',
          'agent_memory_persisted', 'error',
        ],
      };
  }
}

export default rlm_events;
