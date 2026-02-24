/**
 * Orchestrator Skill for OpenClaw — Dirigenten 🎼
 *
 * Multi-agent task orchestration: supervisor HITL, agent.task lifecycle,
 * proactive context folding, and session management.
 *
 * Features:
 * - Supervisor control (pause/resume/status)
 * - Agent task lifecycle (create/claim/complete/fail)
 * - Proactive context folding for long conversations
 * - Session rehydration on resume
 * - Memory persistence across sessions
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

// ─── Constants ────────────────────────────────────────────────────────────

const FOLD_THRESHOLD_CHARS = 8000;
const FOLD_TARGET_TOKENS = 2048;

// ─── Context Folding ──────────────────────────────────────────────────────

interface FoldResult {
  folded: boolean;
  originalChars: number;
  foldedChars: number;
  compressionRatio: number;
  summary?: string;
  savedToGraph: boolean;
}

/**
 * Proaktiv context folding — komprimerer lange samtaler via RLM Engine.
 * Gemmer foldet kontekst til Neo4j for persistence.
 */
export async function foldContext(
  sessionId: string,
  content: string,
  options: { agentId?: string; force?: boolean } = {}
): Promise<FoldResult> {
  const originalChars = content.length;

  // Skip hvis under threshold (medmindre force)
  if (!options.force && originalChars < FOLD_THRESHOLD_CHARS) {
    return {
      folded: false,
      originalChars,
      foldedChars: originalChars,
      compressionRatio: 1,
      savedToGraph: false,
    };
  }

  try {
    // Kald RLM Engine context_folding.fold
    const foldResult = await widgetdc_mcp('context_folding.fold', {
      task: `Compress conversation context for session ${sessionId}`,
      context: { content, sessionId },
      max_tokens: FOLD_TARGET_TOKENS,
    }) as {
      data?: {
        folded_context?: { summary?: string; content?: string };
        compression?: { folded_tokens?: number };
      };
    };

    const foldedContent = foldResult?.data?.folded_context;
    const summary = typeof foldedContent === 'string'
      ? foldedContent
      : (foldedContent?.summary ?? foldedContent?.content ?? '');

    const foldedChars = summary.length;

    // Gem til Neo4j for persistence
    let savedToGraph = false;
    if (summary) {
      try {
        await widgetdc_mcp('graph.write_cypher', {
          query: `
            MERGE (f:ContextFold {sessionId: $sessionId})
            SET f.summary = $summary,
                f.agentId = $agentId,
                f.originalChars = $originalChars,
                f.foldedChars = $foldedChars,
                f.createdAt = datetime(),
                f.updatedAt = datetime()
          `,
          params: {
            sessionId,
            summary,
            agentId: options.agentId ?? 'orchestrator',
            originalChars,
            foldedChars,
          },
        });
        savedToGraph = true;
      } catch (e) {
        console.warn(`[orchestrator] Failed to save fold to graph: ${e}`);
      }
    }

    return {
      folded: true,
      originalChars,
      foldedChars,
      compressionRatio: originalChars > 0 ? foldedChars / originalChars : 1,
      summary: summary.substring(0, 500),
      savedToGraph,
    };
  } catch (e) {
    console.warn(`[orchestrator] Context folding failed: ${e}`);
    return {
      folded: false,
      originalChars,
      foldedChars: originalChars,
      compressionRatio: 1,
      savedToGraph: false,
    };
  }
}

/**
 * Rehydrate session — gendan state fra Neo4j og supervisor
 */
export async function rehydrateSession(
  sessionId: string,
  agentId = 'main'
): Promise<unknown> {
  const results: Record<string, unknown> = {
    sessionId,
    agentId,
    rehydratedAt: new Date().toISOString(),
  };

  // 1. Hent sidste context fold fra Neo4j
  try {
    const foldResult = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (f:ContextFold)
        WHERE f.sessionId = $sessionId OR f.agentId = $agentId
        RETURN f.summary AS summary, f.sessionId AS foldSessionId,
               f.createdAt AS foldedAt
        ORDER BY f.updatedAt DESC LIMIT 1
      `,
      params: { sessionId, agentId },
    }) as { results?: { summary: string }[] };

    const fold = results?.results?.[0];
    if (fold) {
      results.lastFold = fold;
    }
  } catch {
    results.lastFold = null;
  }

  // 2. Forsøg supervisor.rehydrate
  try {
    const supervisorState = await widgetdc_mcp('supervisor.rehydrate', {
      agentId,
      sessionId,
      includeMemory: true,
      includeContextFolds: true,
    });
    results.supervisorState = supervisorState;
  } catch {
    results.supervisorState = null;
  }

  // 3. Hent pending tasks for agenten
  try {
    const tasks = await widgetdc_mcp('agent.task.fetch', { agentId });
    results.pendingTasks = tasks;
  } catch {
    results.pendingTasks = [];
  }

  return results;
}

/**
 * Gem session state til Neo4j (for later rehydration)
 */
export async function persistSession(
  sessionId: string,
  state: Record<string, unknown>,
  agentId = 'main'
): Promise<unknown> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MERGE (s:Session {id: $sessionId})
        SET s.agentId = $agentId,
            s.state = $state,
            s.updatedAt = datetime()
      `,
      params: {
        sessionId,
        agentId,
        state: JSON.stringify(state),
      },
    });

    return { success: true, sessionId, agentId };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Supervisor Commands ──────────────────────────────────────────────────

export async function supervisor(action: string, ...args: string[]) {
  switch (action?.toLowerCase()) {
    case 'status':
      return widgetdc_mcp('supervisor.status', {});

    case 'pause':
      return widgetdc_mcp('supervisor.pause', {});

    case 'resume':
      return widgetdc_mcp('supervisor.resume', {});

    case 'diagnostics':
      return widgetdc_mcp('supervisor.diagnostics', {});

    case 'boot':
      return widgetdc_mcp('supervisor.boot_manifest', {});

    case 'fold': {
      const [sessionId, ...contentParts] = args;
      if (!sessionId) {
        return { error: 'Brug: /supervisor fold <sessionId> [content]' };
      }
      const content = contentParts.join(' ') || '';
      return foldContext(sessionId, content, { force: true });
    }

    case 'rehydrate': {
      const [sessionId, agentId] = args;
      if (!sessionId) {
        return { error: 'Brug: /supervisor rehydrate <sessionId> [agentId]' };
      }
      return rehydrateSession(sessionId, agentId || 'main');
    }

    case 'persist': {
      const [sessionId, stateJson] = args;
      if (!sessionId) {
        return { error: 'Brug: /supervisor persist <sessionId> <stateJson>' };
      }
      try {
        const state = stateJson ? JSON.parse(stateJson) : {};
        return persistSession(sessionId, state);
      } catch {
        return { error: 'Invalid JSON state' };
      }
    }

    default:
      return {
        help: 'Dirigenten — Multi-agent orchestration 🎼',
        commands: {
          '/supervisor status': 'Supervisor status og aktive sessions',
          '/supervisor pause': 'Pause supervisor',
          '/supervisor resume': 'Genoptag supervisor',
          '/supervisor diagnostics': 'Fuld diagnostik',
          '/supervisor boot': 'Boot manifest',
          '/supervisor fold <sessionId> [content]': 'Proaktiv context folding',
          '/supervisor rehydrate <sessionId> [agentId]': 'Gendan session state',
          '/supervisor persist <sessionId> <stateJson>': 'Gem session state',
        },
        tools: [
          'supervisor.status', 'supervisor.pause', 'supervisor.resume',
          'supervisor.hitl_request', 'supervisor.hitl_response', 'supervisor.hitl_pending',
          'supervisor.fold_context', 'supervisor.rehydrate',
          'context_folding.fold', 'context_folding.triage',
        ],
      };
  }
}

export async function task(action: string, taskId?: string, payload?: string) {
  switch (action?.toLowerCase()) {
    case 'create':
      try {
        return widgetdc_mcp('agent.task.create', typeof payload === 'string' ? JSON.parse(payload || '{}') : (payload || {}));
      } catch {
        return { error: 'Invalid JSON payload. Use: task("create", undefined, \'{"title":"...","type":"..."}\')' };
      }
    case 'fetch':
      return widgetdc_mcp('agent.task.fetch', { agentId: taskId });
    case 'claim':
      return widgetdc_mcp('agent.task.claim', { taskId: taskId! });
    case 'complete':
      try {
        const result = payload ? (typeof payload === 'string' ? JSON.parse(payload) : payload) : {};
        return widgetdc_mcp('agent.task.complete', { taskId: taskId!, result });
      } catch {
        return { error: 'Invalid JSON result. Use: task("complete", "<taskId>", \'{"summary":"..."}\')' };
      }
    case 'fail':
      return widgetdc_mcp('agent.task.fail', { taskId: taskId!, reason: payload || 'Unknown' });
    case 'status':
      return widgetdc_mcp('agent.task.status', { taskId: taskId! });
    default:
      return {
        help: 'Kommandoer: create <type> <payload>, fetch [agentId], claim <taskId>, complete <taskId> <result>, fail <taskId> <reason>, status <taskId>',
        tools: ['agent.task.create', 'agent.task.fetch', 'agent.task.claim', 'agent.task.start', 'agent.task.complete', 'agent.task.fail', 'agent.task.log', 'agent.task.status'],
      };
  }
}
