/**
 * Graph Skill for OpenClaw — Neo4j Knowledge Graph Access
 *
 * Giver adgang til WidgeTDC knowledge graph (137K+ noder, 1.1M+ relationer).
 *
 * Kommandoer:
 *   /graph           — stats (default)
 *   /graph stats     — node/relation counts + top labels
 *   /graph query <cypher> — kør en read-only Cypher query
 *   /graph schema    — get graph schema (labels + relationship types)
 *   /graph labels    — alle labels med count
 *   /graph caps [role] — HAS_CAPABILITY tools for agent-rolle (default: CORE)
 *   /graph health    — connectivity check
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

// ─── Public Export ───────────────────────────────────────────────────────

/**
 * @param action - 'stats' | 'query' | 'schema' | 'labels' | 'caps' | 'health' (default: stats)
 * @param arg    - Cypher query (for 'query') or role (for 'caps')
 */
export async function graph(action: string = 'stats', arg?: string): Promise<unknown> {
  switch (action.toLowerCase().trim()) {
    case 'stats':
    case '':
      return graphStats();
    case 'query':
      return graphQuery(arg);
    case 'schema':
      return graphSchema();
    case 'labels':
      return graphLabels();
    case 'caps':
    case 'capabilities':
      return graphCapabilities(arg ?? 'CORE');
    case 'health':
      return widgetdc_mcp('graph.health');
    default:
      // Hvis action ligner Cypher (starter med MATCH/RETURN/WITH)
      if (/^(match|return|with|call|create|merge)\b/i.test(action)) {
        return graphQuery(action + (arg ? ' ' + arg : ''));
      }
      return {
        help: 'Brug: /graph [stats|query <cypher>|schema|labels|caps [role]|health]',
        examples: [
          '/graph stats',
          '/graph query MATCH (n:Insight) RETURN n.title LIMIT 5',
          '/graph schema',
          '/graph labels',
          '/graph caps CORE',
          '/graph health',
        ],
      };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function graphStats(): Promise<unknown> {
  const [stats, health] = await Promise.allSettled([
    widgetdc_mcp('graph.stats'),
    widgetdc_mcp('graph.health'),
  ]);

  const s = stats.status === 'fulfilled' ? (stats.value as any) : null;
  const h = health.status === 'fulfilled' ? health.value : null;

  // Normaliser stats response (backend kan returnere forskellig struktur)
  const labels: Record<string, number> = s?.labels ?? s?.result?.labels ?? {};
  const totalNodes = s?.total_nodes ?? s?.result?.total_nodes ?? Object.values(labels).reduce((a, b) => a + (b as number), 0);
  const totalRels = s?.total_relationships ?? s?.result?.total_relationships ?? null;

  const topLabels = Object.entries(labels)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10)
    .map(([label, count]) => `${label}: ${count.toLocaleString()}`);

  return {
    health:      h,
    totalNodes:  totalNodes?.toLocaleString() ?? 'ukendt',
    totalRels:   totalRels?.toLocaleString() ?? 'ukendt',
    topLabels,
    platform:    'WidgeTDC Neo4j 5.27 AuraDB Enterprise',
  };
}

async function graphQuery(cypher?: string): Promise<unknown> {
  if (!cypher?.trim()) {
    return { error: 'Angiv en Cypher query: /graph query MATCH (n) RETURN count(n)' };
  }

  // Sikkerhedstjek: kun read-only (blokér skrive-operationer)
  const upper = cypher.toUpperCase();
  const blocked = ['CREATE ', 'MERGE ', 'SET ', 'DELETE ', 'DETACH ', 'REMOVE ', 'DROP '];
  if (blocked.some(kw => upper.includes(kw))) {
    return {
      error: 'Kun read-only queries er tilladt via /graph query. Skriv-operationer kræver graph.write_cypher.',
      blocked: true,
    };
  }

  try {
    const result = await widgetdc_mcp('graph.read_cypher', { query: cypher });
    const rows = (result as any)?.results ?? (result as any)?.result?.results ?? result;
    const count = Array.isArray(rows) ? rows.length : null;
    return { query: cypher, count, results: rows };
  } catch (e) {
    return { error: String(e), query: cypher };
  }
}

async function graphSchema(): Promise<unknown> {
  const [labels, rels] = await Promise.allSettled([
    widgetdc_mcp('graph.read_cypher', {
      query: 'CALL db.labels() YIELD label RETURN label ORDER BY label',
    }),
    widgetdc_mcp('graph.read_cypher', {
      query: 'CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType',
    }),
  ]);

  return {
    labels: labels.status === 'fulfilled'
      ? ((labels.value as any)?.results ?? (labels.value as any)?.result?.results ?? labels.value)
      : null,
    relationshipTypes: rels.status === 'fulfilled'
      ? ((rels.value as any)?.results ?? (rels.value as any)?.result?.results ?? rels.value)
      : null,
    note: 'Brug /graph query for at udforske specifikke labels og relationer.',
  };
}

async function graphLabels(): Promise<unknown> {
  const stats = await widgetdc_mcp('graph.stats');
  const s = stats as any;
  const labels: Record<string, number> = s?.labels ?? s?.result?.labels ?? {};

  const sorted = Object.entries(labels)
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  return {
    total: sorted.length,
    labels: sorted.map(([label, count]) => ({ label, count })),
  };
}

async function graphCapabilities(role: string): Promise<unknown> {
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (a:Agent {role: '${role.toUpperCase()}'})-[:HAS_CAPABILITY]->(t:Tool)
      WHERE t.status = 'ACTIVE'
      RETURN t.name AS tool, t.description AS description
      ORDER BY t.name
      LIMIT 50
    `,
  });

  const rows = (result as any)?.results ?? (result as any)?.result?.results ?? [];
  const count = Array.isArray(rows) ? rows.length : 0;

  return {
    role:        role.toUpperCase(),
    toolCount:   count,
    tools:       rows,
    note:        count === 0
      ? `Ingen HAS_CAPABILITY-kanter fundet for rolle '${role.toUpperCase()}'. Kør POST /api/rlm/self-model/sync for at populere grafen.`
      : `${count} aktive tools verificeret i graph for ${role.toUpperCase()}.`,
  };
}
