/**
 * WidgeTDC MCP Skill for OpenClaw (Optimized v2)
 *
 * Universal proxy to all 335 WidgeTDC MCP tools.
 * Includes: TTL cache, connection pooling, gzip, RAG query cache.
 *
 * Call any tool by name: widgetdc_mcp("graph.stats")
 * Switch models in chat: /model deepseek | /model gemini | /model local
 */

const MCP_ENDPOINT = process.env.WIDGETDC_MCP_ENDPOINT || 'https://backend-production-d3da.up.railway.app/api/mcp/route';
const BACKEND_URL = process.env.WIDGETDC_BACKEND_URL || 'https://backend-production-d3da.up.railway.app';

// ═══ Opt 4: TTL Cache for frequently called tools ═══

interface CacheEntry {
  data: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS: Record<string, number> = {
  'graph.stats':           60_000,   // 60s — node counts rarely change
  'system_health':         30_000,   // 30s — health check
  'core.ping':             15_000,   // 15s — ping
  'integration.system_health': 30_000,
};

function getCacheKey(tool: string, payload: Record<string, unknown>): string {
  return `${tool}:${JSON.stringify(payload)}`;
}

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) return entry.data;
  if (entry) cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, expires: Date.now() + ttlMs });
  // Evict stale entries periodically (keep cache lean)
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now >= v.expires) cache.delete(k);
    }
  }
}

// ═══ Opt 3: RAG query cache (kg_rag.query is slow — 7.6s → cached) ═══
const RAG_CACHE_TTL = 5 * 60_000; // 5 min for RAG queries
const RAG_CACHEABLE_TOOLS = new Set(['kg_rag.query', 'knowledge.search_claims']);

// ═══ Opt 5: Connection pooling via keep-alive headers ═══

const POOLED_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Connection': 'keep-alive',
  'Accept-Encoding': 'gzip, deflate, br',  // Opt 9: gzip
};

// ═══ Universal Tool Proxy (with caching + pooling + gzip) ═══

/**
 * Call any WidgeTDC MCP tool by name.
 * @param tool - Full tool name, e.g. "graph.read_cypher", "consulting.pattern.search"
 * @param payload - Tool parameters as key-value object
 * @returns Tool result
 *
 * @example widgetdc_mcp("graph.stats")
 * @example widgetdc_mcp("graph.read_cypher", { query: "MATCH (n) RETURN count(n)" })
 * @example widgetdc_mcp("consulting.pattern.search", { query: "digital transformation" })
 */
export async function widgetdc_mcp(tool: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const cacheKey = getCacheKey(tool, payload);

  // Check TTL cache (Opt 4)
  const ttl = CACHE_TTL_MS[tool];
  if (ttl) {
    const cached = getFromCache(cacheKey);
    if (cached !== null) return cached;
  }

  // Check RAG cache (Opt 3)
  if (RAG_CACHEABLE_TOOLS.has(tool)) {
    const cached = getFromCache(cacheKey);
    if (cached !== null) return cached;
  }

  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: POOLED_HEADERS,       // Opt 5 + 9: keep-alive + gzip
    body: JSON.stringify({ tool, payload }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MCP tool "${tool}" failed: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
  }

  const data = await res.json();

  // Store in cache if applicable
  if (ttl) setCache(cacheKey, data, ttl);
  if (RAG_CACHEABLE_TOOLS.has(tool)) setCache(cacheKey, data, RAG_CACHE_TTL);

  return data;
}

// ═══ Discovery ═══

/** List all available MCP tools with their schemas (cached 5 min) */
export async function widgetdc_discover(): Promise<unknown> {
  const cacheKey = 'discover:all';
  const cached = getFromCache(cacheKey);
  if (cached !== null) return cached;

  const res = await fetch(`${BACKEND_URL}/api/mcp/tools`, {
    headers: { 'Connection': 'keep-alive', 'Accept-Encoding': 'gzip, deflate, br' },
  });
  if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
  const data = await res.json();
  setCache(cacheKey, data, 5 * 60_000);
  return data;
}

// ═══ Opt 8: Domain-scoped tool discovery ═══

/** List tools filtered by namespace/domain for reduced context */
export async function widgetdc_discover_domain(domain: string): Promise<unknown> {
  const all = (await widgetdc_discover()) as Array<{ name: string; [k: string]: unknown }>;
  if (!Array.isArray(all)) return all;
  return all.filter(t => t.name?.startsWith(domain + '.') || t.name?.startsWith(domain + '_'));
}

// ═══ Convenience Aliases (most-used tools) ═══

export async function graph_query(query: string, params?: Record<string, unknown>) {
  return widgetdc_mcp('graph.read_cypher', { query, params });
}

export async function graph_stats() {
  return widgetdc_mcp('graph.stats');
}

export async function rag_query(query: string) {
  return widgetdc_mcp('kg_rag.query', { query });
}

export async function system_health() {
  const [backend, mcp] = await Promise.all([
    fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Connection': 'keep-alive' },
    })
      .then(r => ({ ok: r.ok, status: r.status }))
      .catch(() => ({ ok: false, status: 0 })),
    fetch(`${BACKEND_URL}/api/mcp/status`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Connection': 'keep-alive' },
    })
      .then(r => r.json())
      .catch(() => ({ status: 'unreachable' })),
  ]);
  return { backend, mcp, endpoint: BACKEND_URL };
}

/** Invalidate all cached results (useful after writes) */
export function cache_clear(): { cleared: number } {
  const n = cache.size;
  cache.clear();
  return { cleared: n };
}
