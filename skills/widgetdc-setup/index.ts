import { widgetdc_mcp } from '../widgetdc-mcp/index';

const BACKEND = process.env.WIDGETDC_BACKEND_URL || 'https://backend-production-d3da.up.railway.app';
const RLM     = process.env.RLM_ENGINE_URL       || 'https://rlm-engine-production.up.railway.app';

async function ping(url: string): Promise<{ ok: boolean; latencyMs: number; status?: number }> {
  const t = Date.now();
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
    return { ok: r.ok, latencyMs: Date.now() - t, status: r.status };
  } catch {
    return { ok: false, latencyMs: Date.now() - t };
  }
}

export async function widgetdc_setup(mode?: string): Promise<unknown> {
  switch ((mode || '').toLowerCase().trim()) {
    case 'quick':   return quickCheck();
    case 'graph':   return graphCheck();
    case 'skills':  return consultingSkills();
    default:
      if (mode?.startsWith('rlm')) return rlmCapabilities(mode.replace(/^rlm\s*/i, ''));
      return setup();
  }
}

/** Fuld verifikation: Backend + RLM + Frontend + Neo4j parallelt */
async function setup(): Promise<unknown> {
  const [backend, rlm, graph, stats] = await Promise.all([
    ping(BACKEND),
    ping(RLM),
    widgetdc_mcp('graph.health'),
    widgetdc_mcp('graph.stats'),
  ]);

  const graphResult = graph as any;
  const statsResult = stats as any;

  return {
    platform: 'WidgeTDC',
    timestamp: new Date().toISOString(),
    services: {
      backend:    { ...backend, url: BACKEND },
      rlm_engine: { ...rlm,     url: RLM },
      neo4j:      { ok: graphResult?.status === 'online' || graphResult?.success, ...graphResult },
    },
    graph: {
      nodes:         statsResult?.total_nodes     ?? statsResult?.result?.total_nodes,
      relationships: statsResult?.total_relationships ?? statsResult?.result?.total_relationships,
      topLabels:     Object.entries(statsResult?.labels ?? statsResult?.result?.labels ?? {})
                      .sort((a: any, b: any) => b[1] - a[1])
                      .slice(0, 10),
    },
    overall: backend.ok && rlm.ok ? 'healthy' : 'degraded',
  };
}

/** Kun Backend + RLM */
async function quickCheck(): Promise<unknown> {
  const [backend, rlm] = await Promise.all([ping(BACKEND), ping(RLM)]);
  return {
    backend:    { ...backend, url: BACKEND },
    rlm_engine: { ...rlm, url: RLM },
    overall:    backend.ok && rlm.ok ? 'healthy' : 'degraded',
  };
}

/** Neo4j connectivity + top labels */
async function graphCheck(): Promise<unknown> {
  const [health, stats] = await Promise.all([
    widgetdc_mcp('graph.health'),
    widgetdc_mcp('graph.stats'),
  ]);
  const s = stats as any;
  const labels = s?.labels ?? s?.result?.labels ?? {};
  return {
    health,
    topLabels: Object.entries(labels).sort((a: any, b: any) => b[1] - a[1]).slice(0, 15),
    totalNodes: s?.total_nodes ?? s?.result?.total_nodes,
    totalRelationships: s?.total_relationships ?? s?.result?.total_relationships,
  };
}

/** ConsultingSkill noder fra grafen */
export async function consultingSkills(): Promise<unknown> {
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (s)
      WHERE any(lbl IN labels(s) WHERE lbl CONTAINS 'Skill' OR lbl CONTAINS 'Capability')
      RETURN labels(s)[0] AS type, s.name AS name, s.description AS description
      ORDER BY type, name LIMIT 50
    `,
  }) as any;
  const rows = result?.results ?? result?.result?.results ?? [];
  return { count: rows.length, skills: rows };
}

/** HAS_CAPABILITY tools for en agent-rolle */
export async function rlmCapabilities(role?: string): Promise<unknown> {
  const roleFilter = role ? `WHERE a.role = '${role.toUpperCase()}' OR a.tier = '${role.toUpperCase()}'` : '';
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (a)-[:HAS_CAPABILITY]->(t:MCPTool)
      ${roleFilter}
      RETURN a.role AS role, a.tier AS tier, collect(t.name)[..20] AS tools, count(t) AS toolCount
      ORDER BY toolCount DESC LIMIT 20
    `,
  }) as any;
  const rows = result?.results ?? result?.result?.results ?? [];
  return { role: role || 'all', capabilities: rows };
}
