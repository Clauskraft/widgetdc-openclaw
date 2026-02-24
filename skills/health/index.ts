/**
 * Health Skill for OpenClaw — Fuld WidgeTDC Platform Status
 *
 * Checker alle services parallelt:
 * - Backend API (neo4j, redis, postgres, LLMs)
 * - RLM Engine (repl_manager, 335 tools, components)
 * - RLM Context Folding health
 * - Consulting Frontend
 * - Neo4j Graph (connectivity + node count)
 *
 * Memory Integration:
 * - Gemmer health issues til AgentMemory for trending
 * - Logger degraded status for later analysis
 *
 * Agent Status Reporting:
 * - Hourly agent status updates
 * - Slack channel integration
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const BACKEND  = process.env.WIDGETDC_BACKEND_URL  || 'https://backend-production-d3da.up.railway.app';
const RLM      = process.env.RLM_ENGINE_URL         || 'https://rlm-engine-production.up.railway.app';
const FRONTEND = process.env.CONSULTING_FRONTEND_URL || 'https://consulting-production-b5d8.up.railway.app';

// Agent liste for status rapportering
const AGENTS = [
  { id: 'main', name: 'Kaptajn Klo', emoji: '🦞' },
  { id: 'github', name: 'Repo Sherif', emoji: '🤠' },
  { id: 'data', name: 'Graf-Oktopus', emoji: '🐙' },
  { id: 'infra', name: 'Jernfod', emoji: '🦾' },
  { id: 'strategist', name: 'Stor-Bjørn', emoji: '🐻' },
  { id: 'security', name: 'Cyber-Vipera', emoji: '🐍' },
  { id: 'analyst', name: 'Tal-Trold', emoji: '📊' },
  { id: 'coder', name: 'Kodehaj', emoji: '🦈' },
  { id: 'orchestrator', name: 'Dirigenten', emoji: '🎼' },
  { id: 'documentalist', name: 'Arkivar-Rex', emoji: '📚' },
  { id: 'harvester', name: 'Støvsugeren', emoji: '🌀' },
  { id: 'contracts', name: 'Kontrakt-Karen', emoji: '📋' },
];

/**
 * Gem health issue til memory for trending/analysis
 */
async function logHealthIssue(issues: string[], overall: string): Promise<void> {
  if (issues.length === 0) return;

  try {
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'health',
      content: `Health check: ${overall}. Issues: ${issues.join('; ')}`,
      type: 'health_issue',
    });

    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (h:HealthEvent {
          timestamp: datetime(),
          overall: $overall,
          issues: $issues,
          issueCount: $issueCount
        })
      `,
      params: {
        overall,
        issues,
        issueCount: issues.length,
      },
    });
  } catch {
    // Non-critical, ignore
  }
}

async function ping(url: string, path = '/health'): Promise<{ ok: boolean; latencyMs: number; status?: number; data?: unknown }> {
  const t = Date.now();
  try {
    const r = await fetch(`${url}${path}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { 'Connection': 'keep-alive' },
    });
    let data: unknown;
    try { data = await r.clone().json(); } catch { data = null; }
    return { ok: r.ok, latencyMs: Date.now() - t, status: r.status, data };
  } catch {
    return { ok: false, latencyMs: Date.now() - t };
  }
}

export async function health(mode = 'full'): Promise<unknown> {
  if (mode === 'quick') {
    const [backend, rlm] = await Promise.all([ping(BACKEND), ping(RLM)]);
    return {
      backend:    { ok: backend.ok, latencyMs: backend.latencyMs },
      rlm_engine: { ok: rlm.ok,     latencyMs: rlm.latencyMs },
      overall:    backend.ok && rlm.ok ? 'healthy' : 'degraded',
    };
  }

  // Full mode: alle 5 services parallelt (inkl. context_folding.health)
  const [backend, rlm, frontend, graph, contextFolding] = await Promise.all([
    ping(BACKEND),
    ping(RLM),
    ping(FRONTEND, '/').catch(() => ({ ok: false, latencyMs: 0, status: 0 })),
    widgetdc_mcp('graph.health').catch(() => null),
    widgetdc_mcp('context_folding.health').catch(() => null),
  ]);

  // Udtræk RLM komponent-status
  const rlmData = rlm.data as any;
  const components: Record<string, boolean> = rlmData?.components ?? {};
  const failedComponents = Object.entries(components)
    .filter(([, v]) => !v).map(([k]) => k);

  // Udtræk backend services
  const backendData = backend.data as any;
  const services: Record<string, string> = backendData?.services ?? {};

  // Graph node count
  const graphOk = (graph as any)?.success === true || (graph as any)?.status === 'online';

  const allOk = backend.ok && rlm.ok && components['repl_manager'] !== false;
  const overall = allOk ? '✅ healthy' : '⚠️ degraded';

  const issues = [
    !backend.ok  && `❌ Backend nede (${backend.status})`,
    !rlm.ok      && `❌ RLM Engine nede (${rlm.status})`,
    failedComponents.length && `⚠️ RLM komponenter: ${failedComponents.join(', ')}`,
    !frontend.ok && `⚠️ Frontend nede (${(frontend as any).status})`,
    !graphOk     && '⚠️ Neo4j graph utilgængelig',
  ].filter(Boolean) as string[];

  // Log issues til memory for trending (async, don't wait)
  if (issues.length > 0) {
    logHealthIssue(issues, overall).catch(() => {});
  }

  return {
    timestamp: new Date().toISOString(),
    overall,
    services: {
      backend: {
        ok:           backend.ok,
        latencyMs:    backend.latencyMs,
        neo4j:        services.neo4j   ?? 'unknown',
        redis:        services.redis   ?? 'unknown',
        postgres:     services.postgres ?? 'unknown',
        llms:         backendData?.metrics?.llm ?? null,
      },
      rlm_engine: {
        ok:               rlm.ok,
        latencyMs:        rlm.latencyMs,
        repl_manager:     components.repl_manager     ?? null,
        autonomous_agent: components.autonomous_agent ?? null,
        mcp_bridge:       components.mcp_bridge       ?? null,
        tools_count:      rlmData?.boot_manifest?.tools_count ?? null,
        errors:           rlmData?.errors?.length ?? 0,
        failedComponents: failedComponents.length > 0 ? failedComponents : null,
      },
      frontend: {
        ok:        frontend.ok,
        latencyMs: frontend.latencyMs,
        status:    (frontend as any).status,
      },
      neo4j_graph: {
        ok:       graphOk,
        response: graph,
      },
      context_folding: contextFolding,
    },
    issues,
  };
}

/**
 * Hent status for alle agenter
 */
export async function agentStatus(): Promise<unknown> {
  const statuses = await Promise.all(
    AGENTS.map(async (agent) => {
      try {
        // Hent sidste aktivitet fra Neo4j
        const result = await widgetdc_mcp('graph.read_cypher', {
          query: `
            MATCH (b:BootEvent {agentId: $agentId})
            OPTIONAL MATCH (m:AgentMemory {agentId: $agentId})
            RETURN b.lastBootAt AS lastBoot, b.bootCount AS bootCount,
                   count(m) AS memoryCount
            ORDER BY b.lastBootAt DESC LIMIT 1
          `,
          params: { agentId: agent.id },
        }) as { results?: unknown[] };

        const data = (result?.results ?? [])[0] as any ?? {};
        
        return {
          ...agent,
          status: data.lastBoot ? 'active' : 'idle',
          lastBoot: data.lastBoot ?? null,
          bootCount: data.bootCount ?? 0,
          memoryCount: data.memoryCount ?? 0,
        };
      } catch {
        return { ...agent, status: 'unknown', error: true };
      }
    })
  );

  return {
    timestamp: new Date().toISOString(),
    agentCount: AGENTS.length,
    agents: statuses,
    summary: {
      active: statuses.filter(a => a.status === 'active').length,
      idle: statuses.filter(a => a.status === 'idle').length,
      unknown: statuses.filter(a => a.status === 'unknown').length,
    },
  };
}

/**
 * Generer hourly status rapport for Slack
 */
export async function hourlyReport(): Promise<unknown> {
  const [healthResult, agentResult] = await Promise.all([
    health('full'),
    agentStatus(),
  ]);

  const h = healthResult as any;
  const a = agentResult as any;

  // Format for Slack
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🕐 Hourly Status Report', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Platform:* ${h.overall}\n*Agents:* ${a.summary.active}/${a.agentCount} active`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Services:*\n' +
          `• Backend: ${h.services.backend.ok ? '✅' : '❌'} (${h.services.backend.latencyMs}ms)\n` +
          `• RLM Engine: ${h.services.rlm_engine.ok ? '✅' : '❌'} (${h.services.rlm_engine.latencyMs}ms)\n` +
          `• Neo4j: ${h.services.neo4j_graph.ok ? '✅' : '❌'}\n` +
          `• Context Folding: ${h.services.context_folding ? '✅' : '⚠️'}`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Agent Status:*\n' +
          a.agents.map((ag: any) => 
            `${ag.emoji} ${ag.name}: ${ag.status === 'active' ? '🟢' : ag.status === 'idle' ? '🟡' : '🔴'}`
          ).join('\n'),
      },
    },
  ];

  // Send til Slack hvis konfigureret
  try {
    await widgetdc_mcp('slack.post', {
      channel: '#agent-status',
      blocks,
    });
  } catch {
    // Slack ikke konfigureret, ignorer
  }

  return {
    timestamp: new Date().toISOString(),
    health: healthResult,
    agents: agentResult,
    slackBlocks: blocks,
  };
}
