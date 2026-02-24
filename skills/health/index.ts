/**
 * Health Skill for OpenClaw — Fuld WidgeTDC Platform Status
 *
 * Checker alle services parallelt:
 * - Backend API (neo4j, redis, postgres, LLMs)
 * - RLM Engine (repl_manager, 335 tools, components)
 * - Consulting Frontend
 * - Neo4j Graph (connectivity + node count)
 *
 * Memory Integration:
 * - Gemmer health issues til AgentMemory for trending
 * - Logger degraded status for later analysis
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const BACKEND  = process.env.WIDGETDC_BACKEND_URL  || 'https://backend-production-d3da.up.railway.app';
const RLM      = process.env.RLM_ENGINE_URL         || 'https://rlm-engine-production.up.railway.app';
const FRONTEND = process.env.CONSULTING_FRONTEND_URL || 'https://consulting-production-b5d8.up.railway.app';

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

  // Full mode: alle 4 services parallelt
  const [backend, rlm, frontend, graph] = await Promise.all([
    ping(BACKEND),
    ping(RLM),
    ping(FRONTEND, '/').catch(() => ({ ok: false, latencyMs: 0, status: 0 })),
    widgetdc_mcp('graph.health').catch(() => null),
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
    },
    issues,
  };
}
