/**
 * Orchestrator Skill for OpenClaw — Dirigenten 🎼
 *
 * Multi-agent task orchestration: supervisor HITL, agent.task lifecycle,
 * proactive context folding, session management, and multi-agent chaining.
 *
 * Features:
 * - Supervisor control (pause/resume/status)
 * - Agent task lifecycle (create/claim/complete/fail)
 * - Proactive context folding for long conversations
 * - Session rehydration on resume
 * - Memory persistence across sessions
 * - Multi-Agent Chain execution (sequential agent delegation)
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

// ─── Agent Registry ───────────────────────────────────────────────────────

const AGENTS = {
  main: { name: 'Kaptajn Klo', emoji: '🦀', skills: ['all'] },
  orchestrator: { name: 'Dirigenten', emoji: '🎭', skills: ['orchestrator', 'supervisor'] },
  developer: { name: 'Udvikleren', emoji: '💻', skills: ['code', 'git'] },
  writer: { name: 'Skribleren', emoji: '✍️', skills: ['writer', 'docgen'] },
  analyst: { name: 'Analytikeren', emoji: '📊', skills: ['financial', 'rag'] },
  researcher: { name: 'Forskeren', emoji: '🔬', skills: ['osint', 'rag'] },
  security: { name: 'Sikkerhedsvagten', emoji: '🛡️', skills: ['trident', 'cve'] },
  data: { name: 'Data Scientist', emoji: '📈', skills: ['graph', 'rag'] },
  devops: { name: 'DevOps Ninja', emoji: '🚀', skills: ['cicd', 'railway'] },
  qa: { name: 'QA Mesteren', emoji: '🧪', skills: ['testing'] },
  ux: { name: 'UX Designeren', emoji: '🎨', skills: ['design'] },
  pm: { name: 'Projekt Manager', emoji: '📋', skills: ['planning'] },
} as const;

type AgentId = keyof typeof AGENTS;

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

// ─── Multi-Agent Chain ────────────────────────────────────────────────────

interface ChainStep {
  agentId: AgentId | string;
  task: string;
  dependsOn?: string;
  timeout?: number;
}

interface ChainConfig {
  id: string;
  name: string;
  steps: ChainStep[];
  onError?: 'stop' | 'continue' | 'retry';
  maxRetries?: number;
}

interface ChainResult {
  chainId: string;
  status: 'completed' | 'failed' | 'partial';
  startedAt: string;
  completedAt: string;
  steps: {
    agentId: string;
    task: string;
    status: 'completed' | 'failed' | 'skipped';
    result?: unknown;
    error?: string;
    durationMs: number;
  }[];
  finalResult?: unknown;
}

/**
 * Execute a multi-agent chain — sequential agent delegation with dependencies
 */
export async function executeChain(config: ChainConfig): Promise<ChainResult> {
  const chainId = config.id || `chain_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const results: Record<string, unknown> = {};
  const stepResults: ChainResult['steps'] = [];

  // Log chain start to Neo4j
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      CREATE (c:AgentChain {
        id: $chainId,
        name: $name,
        status: 'running',
        stepCount: $stepCount,
        startedAt: datetime()
      })
    `,
    params: { chainId, name: config.name, stepCount: config.steps.length },
  }).catch(() => {});

  let chainStatus: ChainResult['status'] = 'completed';

  for (const step of config.steps) {
    const stepStart = Date.now();
    const agent = AGENTS[step.agentId as AgentId];
    const agentName = agent?.name ?? step.agentId;

    // Check dependencies
    if (step.dependsOn && !results[step.dependsOn]) {
      stepResults.push({
        agentId: step.agentId,
        task: step.task,
        status: 'skipped',
        error: `Dependency ${step.dependsOn} not completed`,
        durationMs: 0,
      });
      
      if (config.onError === 'stop') {
        chainStatus = 'failed';
        break;
      }
      continue;
    }

    // Build context from dependencies
    const context = step.dependsOn ? results[step.dependsOn] : undefined;

    try {
      // Create task for agent
      const taskResult = await widgetdc_mcp('agent.task.create', {
        agentId: step.agentId,
        title: step.task,
        type: 'chain_step',
        context: {
          chainId,
          chainName: config.name,
          previousResult: context,
        },
      }) as { taskId?: string };

      // Execute via agent (simplified — in production would wait for completion)
      const result = await executeAgentTask(step.agentId, step.task, context, step.timeout);

      results[step.agentId] = result;
      stepResults.push({
        agentId: step.agentId,
        task: step.task,
        status: 'completed',
        result,
        durationMs: Date.now() - stepStart,
      });

      // Log step completion
      await widgetdc_mcp('consulting.agent.memory.store', {
        agentId: step.agentId,
        content: `[Chain: ${config.name}] Completed step: ${step.task}`,
        type: 'chain_step',
      }).catch(() => {});

    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      
      stepResults.push({
        agentId: step.agentId,
        task: step.task,
        status: 'failed',
        error,
        durationMs: Date.now() - stepStart,
      });

      if (config.onError === 'stop') {
        chainStatus = 'failed';
        break;
      } else if (config.onError === 'retry' && config.maxRetries) {
        // Retry logic (simplified)
        chainStatus = 'partial';
      } else {
        chainStatus = 'partial';
      }
    }
  }

  const completedAt = new Date().toISOString();

  // Update chain status in Neo4j
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      MATCH (c:AgentChain {id: $chainId})
      SET c.status = $status,
          c.completedAt = datetime(),
          c.stepsCompleted = $completed,
          c.stepsFailed = $failed
    `,
    params: {
      chainId,
      status: chainStatus,
      completed: stepResults.filter(s => s.status === 'completed').length,
      failed: stepResults.filter(s => s.status === 'failed').length,
    },
  }).catch(() => {});

  // Get final result from last successful step
  const lastSuccess = stepResults.filter(s => s.status === 'completed').pop();

  return {
    chainId,
    status: chainStatus,
    startedAt,
    completedAt,
    steps: stepResults,
    finalResult: lastSuccess?.result,
  };
}

/**
 * Execute a single agent task (simplified execution)
 */
async function executeAgentTask(
  agentId: string,
  task: string,
  context?: unknown,
  timeout = 60000
): Promise<unknown> {
  // In a full implementation, this would:
  // 1. Create a task via agent.task.create
  // 2. Wait for the agent to claim and complete it
  // 3. Return the result
  
  // For now, we simulate by calling relevant MCP tools based on agent type
  const agent = AGENTS[agentId as AgentId];
  
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // Route to appropriate tool based on agent skills
  if (agent.skills.includes('rag') || agent.skills.includes('all')) {
    const result = await widgetdc_mcp('kg_rag.query', {
      query: task,
      context: context ? JSON.stringify(context) : undefined,
    });
    return result;
  }

  if (agent.skills.includes('graph')) {
    // Data agent — query graph
    return { agentId, task, status: 'executed', context };
  }

  // Default: return task acknowledgment
  return {
    agentId,
    task,
    status: 'acknowledged',
    context,
    note: 'Task queued for agent execution',
  };
}

/**
 * Create a predefined chain for common workflows
 */
export function createChain(
  type: 'due_diligence' | 'research' | 'code_review' | 'report',
  params: { target?: string; query?: string }
): ChainConfig {
  switch (type) {
    case 'due_diligence':
      return {
        id: `dd_${Date.now()}`,
        name: `Due Diligence: ${params.target ?? 'Unknown'}`,
        steps: [
          { agentId: 'researcher', task: `Research company: ${params.target}` },
          { agentId: 'security', task: 'Analyze security posture and CVE exposure', dependsOn: 'researcher' },
          { agentId: 'analyst', task: 'Financial analysis and peer comparison', dependsOn: 'researcher' },
          { agentId: 'writer', task: 'Compile DD report with findings', dependsOn: 'analyst' },
        ],
        onError: 'continue',
      };

    case 'research':
      return {
        id: `research_${Date.now()}`,
        name: `Research: ${params.query ?? 'Unknown'}`,
        steps: [
          { agentId: 'researcher', task: `Deep research: ${params.query}` },
          { agentId: 'analyst', task: 'Analyze and synthesize findings', dependsOn: 'researcher' },
          { agentId: 'writer', task: 'Write research summary', dependsOn: 'analyst' },
        ],
        onError: 'stop',
      };

    case 'code_review':
      return {
        id: `review_${Date.now()}`,
        name: `Code Review: ${params.target ?? 'PR'}`,
        steps: [
          { agentId: 'developer', task: `Analyze code changes: ${params.target}` },
          { agentId: 'security', task: 'Security review of changes', dependsOn: 'developer' },
          { agentId: 'qa', task: 'Test coverage analysis', dependsOn: 'developer' },
        ],
        onError: 'continue',
      };

    case 'report':
      return {
        id: `report_${Date.now()}`,
        name: `Report: ${params.query ?? 'Unknown'}`,
        steps: [
          { agentId: 'data', task: `Gather data for: ${params.query}` },
          { agentId: 'analyst', task: 'Analyze data and extract insights', dependsOn: 'data' },
          { agentId: 'writer', task: 'Write formatted report', dependsOn: 'analyst' },
        ],
        onError: 'stop',
      };

    default:
      throw new Error(`Unknown chain type: ${type}`);
  }
}

/**
 * Chain command handler
 */
export async function chain(action: string, ...args: string[]): Promise<unknown> {
  switch (action?.toLowerCase()) {
    case 'run': {
      const [type, ...params] = args;
      if (!type) {
        return { error: 'Usage: /chain run <type> [target/query]' };
      }
      const chainConfig = createChain(
        type as 'due_diligence' | 'research' | 'code_review' | 'report',
        { target: params[0], query: params[0] }
      );
      return executeChain(chainConfig);
    }

    case 'dd':
    case 'due_diligence': {
      const target = args[0];
      if (!target) {
        return { error: 'Usage: /chain dd <company_name>' };
      }
      const chainConfig = createChain('due_diligence', { target });
      return executeChain(chainConfig);
    }

    case 'research': {
      const query = args.join(' ');
      if (!query) {
        return { error: 'Usage: /chain research <query>' };
      }
      const chainConfig = createChain('research', { query });
      return executeChain(chainConfig);
    }

    case 'review': {
      const target = args[0];
      if (!target) {
        return { error: 'Usage: /chain review <PR_or_branch>' };
      }
      const chainConfig = createChain('code_review', { target });
      return executeChain(chainConfig);
    }

    case 'status': {
      const chainId = args[0];
      if (!chainId) {
        // List recent chains
        const result = await widgetdc_mcp('graph.read_cypher', {
          query: `
            MATCH (c:AgentChain)
            RETURN c.id AS id, c.name AS name, c.status AS status,
                   c.stepsCompleted AS completed, c.stepCount AS total
            ORDER BY c.startedAt DESC LIMIT 10
          `,
        });
        return result;
      }
      // Get specific chain
      const result = await widgetdc_mcp('graph.read_cypher', {
        query: `
          MATCH (c:AgentChain {id: $chainId})
          RETURN c
        `,
        params: { chainId },
      });
      return result;
    }

    case 'agents':
      return {
        agents: Object.entries(AGENTS).map(([id, info]) => ({
          id,
          name: info.name,
          emoji: info.emoji,
          skills: info.skills,
        })),
      };

    default:
      return {
        help: 'Multi-Agent Chain — Sequential agent delegation 🔗',
        commands: {
          '/chain run <type> [params]': 'Run predefined chain',
          '/chain dd <company>': 'Due Diligence chain',
          '/chain research <query>': 'Research chain',
          '/chain review <PR>': 'Code Review chain',
          '/chain status [chainId]': 'Chain status',
          '/chain agents': 'List available agents',
        },
        chainTypes: ['due_diligence', 'research', 'code_review', 'report'],
        agents: Object.keys(AGENTS),
      };
  }
}
