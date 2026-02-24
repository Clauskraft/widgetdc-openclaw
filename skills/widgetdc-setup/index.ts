/**
 * @module widgetdc-setup
 *
 * WidgeTDC Setup & Verification Skill for OpenClaw.
 *
 * Verificerer hele WidgeTDC AI-workspace parallelt:
 * Backend API, RLM Engine, Neo4j graph og consulting capabilities.
 *
 * Generet 2026-02-24 baseret på live Neo4j-graph + system-arkitektur.
 * Bygger på {@link ../widgetdc-mcp/index.widgetdc_mcp}.
 *
 * @example
 * // Fuld verifikation
 * const status = await widgetdc_setup();
 *
 * @example
 * // Hurtig check (kun Backend + RLM)
 * const status = await widgetdc_setup('quick');
 *
 * @example
 * // Kun Neo4j
 * const graph = await widgetdc_setup('graph');
 *
 * @example
 * // Consulting skills fra grafen
 * const skills = await widgetdc_setup('skills');
 *
 * @example
 * // RLM capabilities for CORE-rollen
 * const caps = await widgetdc_setup('rlm CORE');
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const BACKEND = process.env.WIDGETDC_BACKEND_URL || 'https://backend-production-d3da.up.railway.app';
const RLM     = process.env.RLM_ENGINE_URL       || 'https://rlm-engine-production.up.railway.app';

// ─── Internal Types ────────────────────────────────────────────────────────

interface PingResult {
  ok: boolean;
  latencyMs: number;
  status?: number;
}

// ─── Internal Helpers ──────────────────────────────────────────────────────

/**
 * Pinger et services `/health`-endpoint og måler svartid.
 *
 * @param url - Base-URL til servicen (uden `/health`)
 * @returns Objekt med `ok`, `latencyMs` og `status`
 */
async function ping(url: string): Promise<PingResult> {
  const t = Date.now();
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8_000) });
    return { ok: r.ok, latencyMs: Date.now() - t, status: r.status };
  } catch {
    return { ok: false, latencyMs: Date.now() - t };
  }
}

/**
 * Fuld verifikation: Backend + RLM + Neo4j health + graph stats parallelt.
 *
 * @returns Platform-status med services, graph-oversigt og `overall` flag
 */
async function setup(): Promise<unknown> {
  const [backend, rlm, graph, stats] = await Promise.all([
    ping(BACKEND),
    ping(RLM),
    widgetdc_mcp('graph.health'),
    widgetdc_mcp('graph.stats'),
  ]);

  const g = graph as any;
  const s = stats  as any;

  return {
    platform:  'WidgeTDC',
    timestamp: new Date().toISOString(),
    services: {
      backend:    { ...backend, url: BACKEND },
      rlm_engine: { ...rlm,     url: RLM },
      neo4j:      { ok: g?.status === 'online' || g?.success, ...g },
    },
    graph: {
      nodes:         s?.total_nodes         ?? s?.result?.total_nodes,
      relationships: s?.total_relationships ?? s?.result?.total_relationships,
      topLabels:     Object.entries(s?.labels ?? s?.result?.labels ?? {})
                       .sort((a: any, b: any) => b[1] - a[1])
                       .slice(0, 10),
    },
    overall: backend.ok && rlm.ok ? 'healthy' : 'degraded',
  };
}

/**
 * Hurtig check — kun Backend API og RLM Engine.
 *
 * @returns `{ backend, rlm_engine, overall }` med ping-resultater
 */
async function quickCheck(): Promise<unknown> {
  const [backend, rlm] = await Promise.all([ping(BACKEND), ping(RLM)]);
  return {
    backend:    { ...backend, url: BACKEND },
    rlm_engine: { ...rlm,     url: RLM },
    overall:    backend.ok && rlm.ok ? 'healthy' : 'degraded',
  };
}

/**
 * Neo4j graph-check — connectivity + top-15 labels med node-count.
 *
 * @returns `{ health, topLabels, totalNodes, totalRelationships }`
 */
async function graphCheck(): Promise<unknown> {
  const [health, stats] = await Promise.all([
    widgetdc_mcp('graph.health'),
    widgetdc_mcp('graph.stats'),
  ]);
  const s = stats as any;
  const labels = s?.labels ?? s?.result?.labels ?? {};
  return {
    health,
    topLabels:          Object.entries(labels).sort((a: any, b: any) => b[1] - a[1]).slice(0, 15),
    totalNodes:         s?.total_nodes         ?? s?.result?.total_nodes,
    totalRelationships: s?.total_relationships ?? s?.result?.total_relationships,
  };
}

// ─── Public Exports ────────────────────────────────────────────────────────

/**
 * Primær skill-entry — router baseret på `mode`-argument.
 *
 * | mode | Handling |
 * |------|----------|
 * | *(ingen)* | Fuld verifikation (`setup()`) |
 * | `quick` | Kun Backend + RLM (`quickCheck()`) |
 * | `graph` | Kun Neo4j health + stats (`graphCheck()`) |
 * | `skills` | ConsultingSkill-noder fra grafen |
 * | `rlm [role]` | HAS_CAPABILITY tools for agent-rolle |
 *
 * @param mode - Valgfri tilstand: `'quick'`, `'graph'`, `'skills'`, `'rlm [ROLE]'`
 * @returns Resultat afhængigt af valgt mode
 *
 * @example
 * await widgetdc_setup()          // fuld check
 * await widgetdc_setup('quick')   // hurtig check
 * await widgetdc_setup('graph')   // Neo4j only
 * await widgetdc_setup('skills')  // consulting domains
 * await widgetdc_setup('rlm CORE') // CORE agent capabilities
 */
export async function widgetdc_setup(mode?: string): Promise<unknown> {
  switch ((mode || '').toLowerCase().trim()) {
    case 'quick':  return quickCheck();
    case 'graph':  return graphCheck();
    case 'skills': return consultingSkills();
    default:
      if (mode?.toLowerCase().startsWith('rlm')) {
        return rlmCapabilities(mode.replace(/^rlm\s*/i, ''));
      }
      return setup();
  }
}

/**
 * Henter alle Skill- og Capability-noder fra Neo4j-grafen.
 *
 * Verificeret indhold (feb 2026):
 * - 35 `ConsultingSkill`-noder (strategidomæner)
 * - 710 `Skill`-noder (Anthropic cookbooks, agent patterns)
 *
 * @returns `{ count, skills }` — liste af `{ type, name, description }`
 *
 * @example
 * const { count, skills } = await consultingSkills();
 * console.log(`${count} skills fundet`);
 */
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

/**
 * Henter aktive `[:HAS_CAPABILITY]`-tools for en agent-rolle fra Neo4j.
 *
 * Kræver at self-model sync er kørt:
 * `POST https://rlm-engine-production.up.railway.app/api/rlm/self-model/sync`
 *
 * Relationstype i grafen: `(Agent)-[:HAS_CAPABILITY]->(MCPTool)`
 * (Ikke `[:CONTROLS]` — se CLAUDE.md session 2026-02-24.)
 *
 * @param role - Agent-rolle, f.eks. `'CORE'`, `'ANALYST'`. Udeladt = alle roller.
 * @returns `{ role, capabilities }` — liste af `{ role, tier, tools[], toolCount }`
 *
 * @example
 * // Alle roller
 * const all = await rlmCapabilities();
 *
 * @example
 * // Kun CORE-agenten
 * const core = await rlmCapabilities('CORE');
 * console.log(core.capabilities[0].toolCount); // ~335
 */
export async function rlmCapabilities(role?: string): Promise<unknown> {
  const roleFilter = role
    ? `WHERE a.role = '${role.toUpperCase()}' OR a.tier = '${role.toUpperCase()}'`
    : '';
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
