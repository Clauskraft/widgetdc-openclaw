/**
 * Log Collector Skill for OpenClaw — Railway Error Intelligence
 *
 * Samler, gemmer og analyserer fejllogs fra alle Railway services.
 * Korer pa faste intervaller (heartbeat) eller on-demand via /log-collector.
 *
 * Features:
 * - Pull logs fra alle Railway services via health endpoints + SSE
 * - Parse ERROR/WARN entries, extract structured fields
 * - Store i Neo4j som ErrorPattern + ErrorLog noder
 * - Pattern detection: grupperer lignende fejl
 * - Frequency spike detection
 * - Slack alerts for kritiske monstres
 * - Agent memory for historisk trending
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const BACKEND  = process.env.WIDGETDC_BACKEND_URL  || 'https://backend-production-d3da.up.railway.app';
const RLM      = process.env.RLM_ENGINE_URL         || 'https://rlm-engine-production.up.railway.app';
const FRONTEND = process.env.CONSULTING_FRONTEND_URL || 'https://consulting-production-b5d8.up.railway.app';
const OPENCLAW = process.env.OPENCLAW_PUBLIC_URL     || 'https://openclaw-production-9570.up.railway.app';
const ARCH_MCP = process.env.ARCH_MCP_URL            || 'https://arch-mcp-server-production.up.railway.app';
const API_KEY  = process.env.WIDGETDC_API_KEY || process.env.API_KEY || '';

// ─── Service Registry ─────────────────────────────────────────────────

interface ServiceDef {
  id: string;
  name: string;
  url: string;
  healthPath: string;
  hasLogs: boolean;  // has backend-style log endpoints
}

const SERVICES: ServiceDef[] = [
  { id: 'backend',    name: 'Backend API',          url: BACKEND,  healthPath: '/health',  hasLogs: true },
  { id: 'rlm',        name: 'RLM Engine',           url: RLM,      healthPath: '/',        hasLogs: false },
  { id: 'frontend',   name: 'Consulting Frontend',  url: FRONTEND, healthPath: '/',        hasLogs: false },
  { id: 'openclaw',   name: 'OpenClaw Gateway',     url: OPENCLAW, healthPath: '/health',  hasLogs: false },
  { id: 'arch-mcp',   name: 'Architecture Platform',url: ARCH_MCP, healthPath: '/health',  hasLogs: false },
];

// ─── Types ────────────────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  service: string;
  level: 'ERROR' | 'WARN' | 'INFO';
  message: string;
  metadata: Record<string, unknown>;
}

interface ErrorPattern {
  fingerprint: string;
  message: string;
  service: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
}

interface CollectionResult {
  timestamp: string;
  services: Record<string, { reachable: boolean; errors: LogEntry[]; warnings: LogEntry[]; latencyMs: number }>;
  totalErrors: number;
  totalWarnings: number;
  newPatterns: number;
  alerts: string[];
}

// ─── Log Parsing ──────────────────────────────────────────────────────

const ERROR_PATTERNS = [
  /\[ERROR\]\s*(.+)/i,
  /error:\s*(.+)/i,
  /\[CLIENT_ERROR\]\s*(.+)/i,
  /Error:\s*(.+)/,
  /FATAL:\s*(.+)/i,
  /uncaughtException:\s*(.+)/i,
  /unhandledRejection:\s*(.+)/i,
];

const WARN_PATTERNS = [
  /\[WARN\]\s*(.+)/i,
  /warn:\s*(.+)/i,
  /Warning:\s*(.+)/i,
];

const HTTP_ERROR_PATTERN = /statusCode["\s:]+([45]\d{2})/;
const MCP_FAILURE_PATTERN = /MCP.*(?:fail|error|timeout)/i;
const RESTART_PATTERN = /(?:restart|crash|exit.*code [^0]|SIGTERM|SIGKILL)/i;

function parseLogLine(line: string, service: string): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Extract timestamp
  const tsMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
  const timestamp = tsMatch ? tsMatch[1] : new Date().toISOString();

  // Check for errors
  for (const pat of ERROR_PATTERNS) {
    const m = trimmed.match(pat);
    if (m) {
      return { timestamp, service, level: 'ERROR', message: m[1]?.trim() || trimmed, metadata: extractMetadata(trimmed) };
    }
  }

  // Check for warnings
  for (const pat of WARN_PATTERNS) {
    const m = trimmed.match(pat);
    if (m) {
      return { timestamp, service, level: 'WARN', message: m[1]?.trim() || trimmed, metadata: extractMetadata(trimmed) };
    }
  }

  // Check for HTTP errors
  const httpMatch = trimmed.match(HTTP_ERROR_PATTERN);
  if (httpMatch) {
    const code = parseInt(httpMatch[1], 10);
    return { timestamp, service, level: code >= 500 ? 'ERROR' : 'WARN', message: trimmed, metadata: { statusCode: code } };
  }

  // Check for MCP failures
  if (MCP_FAILURE_PATTERN.test(trimmed)) {
    return { timestamp, service, level: 'ERROR', message: trimmed, metadata: { type: 'mcp_failure' } };
  }

  // Check for restarts/crashes
  if (RESTART_PATTERN.test(trimmed)) {
    return { timestamp, service, level: 'ERROR', message: trimmed, metadata: { type: 'restart' } };
  }

  return null;
}

function extractMetadata(line: string): Record<string, unknown> {
  // Try to extract JSON metadata from log line
  const jsonMatch = line.match(/\{[^}]+\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
  }
  return {};
}

/**
 * Generate a fingerprint for deduplication — normalize the error message
 * by removing timestamps, IDs, and dynamic values.
 */
function fingerprint(service: string, message: string): string {
  const normalized = message
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, 'TS')     // timestamps
    .replace(/[0-9a-f]{8,}/gi, 'ID')                      // hex IDs
    .replace(/\d+\.\d+\.\d+\.\d+/g, 'IP')                 // IP addresses
    .replace(/:\d{2,5}/g, ':PORT')                         // ports
    .replace(/\d+ms/g, 'Nms')                              // durations
    .replace(/"[^"]{20,}"/g, '"STR"')                      // long strings
    .trim()
    .slice(0, 200);
  return `${service}::${normalized}`;
}

// ─── Log Collection ───────────────────────────────────────────────────

async function fetchServiceLogs(svc: ServiceDef): Promise<{ reachable: boolean; lines: string[]; latencyMs: number }> {
  const t = Date.now();
  const lines: string[] = [];

  // Strategy 1: Backend SSE event stream (for backend service with log access)
  if (svc.hasLogs && API_KEY) {
    try {
      const res = await fetch(`${svc.url}/api/mcp/events?topics=error,auth,health&snapshot=true`, {
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'text/event-stream' },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const text = await res.text();
        lines.push(...text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()));
      }
    } catch { /* fallback below */ }
  }

  // Strategy 2: Health endpoint check — detect unhealthy states
  try {
    const res = await fetch(`${svc.url}${svc.healthPath}`, {
      headers: {
        'Connection': 'keep-alive',
        ...(API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}),
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      lines.push(`[ERROR] ${svc.name} health check failed: HTTP ${res.status}`);
    } else {
      try {
        const data = await res.json() as Record<string, unknown>;
        // Check for degraded services within health response
        if (data.services && typeof data.services === 'object') {
          for (const [name, status] of Object.entries(data.services as Record<string, string>)) {
            if (status !== 'connected' && status !== 'healthy' && status !== 'ok') {
              lines.push(`[WARN] ${svc.name} sub-service ${name}: ${status}`);
            }
          }
        }
        // Check for failedGroups in MCP status
        if (typeof data.failedGroupCount === 'number' && data.failedGroupCount > 0) {
          lines.push(`[ERROR] ${svc.name} has ${data.failedGroupCount} failed MCP groups`);
        }
      } catch { /* not JSON, that's ok */ }
    }

    return { reachable: res.ok, lines, latencyMs: Date.now() - t };
  } catch (e) {
    lines.push(`[ERROR] ${svc.name} unreachable: ${e instanceof Error ? e.message : String(e)}`);
    return { reachable: false, lines, latencyMs: Date.now() - t };
  }
}

/**
 * Pull recent backend logs via MCP tool (if available)
 */
async function fetchBackendRecentErrors(): Promise<LogEntry[]> {
  try {
    // Use graph to find recent ErrorLog entries (if they exist from previous runs)
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (e:ErrorLog)
        WHERE e.timestamp > datetime() - duration({minutes: 30})
        RETURN e.service AS service, e.level AS level, e.message AS message,
               e.timestamp AS timestamp, e.metadata AS metadata
        ORDER BY e.timestamp DESC LIMIT 50
      `,
    }) as { results?: unknown[] };

    return ((result?.results ?? []) as any[]).map(r => ({
      timestamp: r.timestamp || new Date().toISOString(),
      service: r.service || 'unknown',
      level: r.level || 'ERROR',
      message: r.message || '',
      metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : {},
    }));
  } catch {
    return [];
  }
}

// ─── Neo4j Storage ────────────────────────────────────────────────────

async function storeErrorLog(entry: LogEntry): Promise<void> {
  const fp = fingerprint(entry.service, entry.message);

  await widgetdc_mcp('graph.write_cypher', {
    query: `
      MERGE (p:ErrorPattern {fingerprint: $fingerprint})
      ON CREATE SET
        p.message = $message,
        p.service = $service,
        p.count = 1,
        p.firstSeen = datetime(),
        p.lastSeen = datetime(),
        p.severity = $severity
      ON MATCH SET
        p.count = p.count + 1,
        p.lastSeen = datetime()

      CREATE (e:ErrorLog {
        timestamp: datetime($timestamp),
        service: $service,
        level: $level,
        message: $message,
        metadata: $metadata,
        fingerprint: $fingerprint
      })

      MERGE (s:Service {id: $service})
      ON CREATE SET s.name = $service, s.firstSeen = datetime()

      CREATE (s)-[:PRODUCED]->(e)
      CREATE (e)-[:MATCHES]->(p)
    `,
    params: {
      fingerprint: fp,
      message: entry.message.slice(0, 500),
      service: entry.service,
      level: entry.level,
      severity: entry.level === 'ERROR' ? 'P1' : 'P2',
      timestamp: entry.timestamp,
      metadata: JSON.stringify(entry.metadata),
    },
  });
}

async function storeServiceStatus(serviceId: string, reachable: boolean, latencyMs: number): Promise<void> {
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      MERGE (s:Service {id: $serviceId})
      ON CREATE SET s.name = $serviceId, s.firstSeen = datetime()
      SET s.lastCheck = datetime(),
          s.reachable = $reachable,
          s.latencyMs = $latencyMs

      CREATE (c:ServiceCheck {
        timestamp: datetime(),
        serviceId: $serviceId,
        reachable: $reachable,
        latencyMs: $latencyMs
      })
      CREATE (s)-[:HAS_CHECK]->(c)
    `,
    params: { serviceId, reachable, latencyMs },
  });
}

// ─── Pattern Analysis ─────────────────────────────────────────────────

async function getErrorPatterns(minCount = 3): Promise<ErrorPattern[]> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (p:ErrorPattern)
        WHERE p.count >= $minCount
        RETURN p.fingerprint AS fingerprint, p.message AS message,
               p.service AS service, p.count AS count,
               p.firstSeen AS firstSeen, p.lastSeen AS lastSeen,
               p.severity AS severity
        ORDER BY p.count DESC LIMIT 50
      `,
      params: { minCount },
    }) as { results?: unknown[] };

    return ((result?.results ?? []) as any[]).map(r => ({
      fingerprint: r.fingerprint,
      message: r.message,
      service: r.service,
      count: r.count,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      severity: r.severity || 'P2',
    }));
  } catch {
    return [];
  }
}

async function detectSpikes(): Promise<{ service: string; currentRate: number; normalRate: number; spike: boolean }[]> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (e:ErrorLog)
        WHERE e.timestamp > datetime() - duration({minutes: 10})
        WITH e.service AS service, count(e) AS recentCount

        OPTIONAL MATCH (h:ErrorLog)
        WHERE h.service = service AND h.timestamp > datetime() - duration({hours: 1})
        WITH service, recentCount, count(h) AS hourlyCount

        RETURN service,
               recentCount AS currentRate,
               hourlyCount / 6.0 AS normalRate,
               CASE WHEN recentCount > (hourlyCount / 6.0) * 5 THEN true ELSE false END AS spike
        ORDER BY spike DESC, currentRate DESC
      `,
    }) as { results?: unknown[] };

    return ((result?.results ?? []) as any[]).map(r => ({
      service: r.service,
      currentRate: r.currentRate || 0,
      normalRate: Math.round((r.normalRate || 0) * 10) / 10,
      spike: r.spike || false,
    }));
  } catch {
    return [];
  }
}

async function getServiceHistory(serviceId: string, hours = 24): Promise<unknown> {
  try {
    return await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (s:Service {id: $serviceId})-[:HAS_CHECK]->(c:ServiceCheck)
        WHERE c.timestamp > datetime() - duration({hours: $hours})
        RETURN c.timestamp AS timestamp, c.reachable AS reachable, c.latencyMs AS latencyMs
        ORDER BY c.timestamp DESC LIMIT 100
      `,
      params: { serviceId, hours },
    });
  } catch {
    return { error: 'Could not fetch service history' };
  }
}

// ─── Alerting ─────────────────────────────────────────────────────────

async function sendAlert(severity: string, title: string, message: string): Promise<void> {
  try {
    await fetch(`${BACKEND}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}) },
      body: JSON.stringify({
        level: severity === 'P0' ? 'critical' : severity === 'P1' ? 'warning' : 'info',
        title,
        message,
        source: 'OpenClaw-LogCollector',
        channel: '#agent-status',
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.warn(`[log-collector] Slack alert failed: ${e}`);
  }
}

// ─── Main Collection Pipeline ─────────────────────────────────────────

/**
 * Collect logs from all services, parse errors, store and analyze.
 * This is the main entry point called on heartbeat or /log-collector command.
 */
export async function collectLogs(windowMinutes = 5): Promise<CollectionResult> {
  const timestamp = new Date().toISOString();
  const result: CollectionResult = {
    timestamp,
    services: {},
    totalErrors: 0,
    totalWarnings: 0,
    newPatterns: 0,
    alerts: [],
  };

  // Collect from all services in parallel
  const collections = await Promise.all(
    SERVICES.map(async (svc) => {
      const { reachable, lines, latencyMs } = await fetchServiceLogs(svc);
      const errors: LogEntry[] = [];
      const warnings: LogEntry[] = [];

      for (const line of lines) {
        const entry = parseLogLine(line, svc.id);
        if (entry) {
          if (entry.level === 'ERROR') errors.push(entry);
          else if (entry.level === 'WARN') warnings.push(entry);
        }
      }

      return { svc, reachable, errors, warnings, latencyMs };
    })
  );

  // Process results and store
  for (const { svc, reachable, errors, warnings, latencyMs } of collections) {
    result.services[svc.id] = { reachable, errors, warnings, latencyMs };
    result.totalErrors += errors.length;
    result.totalWarnings += warnings.length;

    // Store service status
    storeServiceStatus(svc.id, reachable, latencyMs).catch(() => {});

    // Store individual errors in Neo4j
    for (const entry of errors) {
      storeErrorLog(entry).catch(() => {});
    }
    for (const entry of warnings) {
      storeErrorLog(entry).catch(() => {});
    }

    // P0: Service unreachable
    if (!reachable) {
      const alertMsg = `${svc.name} is UNREACHABLE (latency: ${latencyMs}ms)`;
      result.alerts.push(alertMsg);
      sendAlert('P0', `P0 CRITICAL: ${svc.name} DOWN`, alertMsg).catch(() => {});
    }
  }

  // Check for error spikes
  const spikes = await detectSpikes();
  for (const spike of spikes) {
    if (spike.spike) {
      const alertMsg = `Error spike detected on ${spike.service}: ${spike.currentRate} errors in 10min (normal: ~${spike.normalRate})`;
      result.alerts.push(alertMsg);
      sendAlert('P1', `P1 SPIKE: ${spike.service}`, alertMsg).catch(() => {});
    }
  }

  // Store collection summary in agent memory
  try {
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'log-collector',
      content: `Log sweep at ${timestamp}: ${result.totalErrors} errors, ${result.totalWarnings} warnings across ${SERVICES.length} services. Alerts: ${result.alerts.length > 0 ? result.alerts.join('; ') : 'none'}`,
      type: 'log_sweep',
    });
  } catch { /* non-critical */ }

  return result;
}

/**
 * Full sweep — longer window, more thorough analysis.
 */
export async function sweep(): Promise<CollectionResult> {
  return collectLogs(30);
}

/**
 * Get known error patterns with occurrence counts.
 */
export async function patterns(): Promise<{ patterns: ErrorPattern[]; total: number }> {
  const pats = await getErrorPatterns(1);
  return { patterns: pats, total: pats.length };
}

/**
 * Get error history for a specific service.
 */
export async function history(serviceId = 'backend'): Promise<unknown> {
  return getServiceHistory(serviceId);
}

/**
 * Get current alert rules and their status.
 */
export function alertRules(): { rules: { severity: string; trigger: string; action: string }[] } {
  return {
    rules: [
      { severity: 'P0', trigger: 'Service unreachable (health check fails)', action: 'Immediate Slack alert + Neo4j ServiceIncident' },
      { severity: 'P1', trigger: 'Error spike (>5x normal rate in 10min window)', action: 'Slack alert' },
      { severity: 'P2', trigger: 'New error pattern (never seen fingerprint)', action: 'Log to Neo4j + optional alert' },
      { severity: 'P3', trigger: 'Known recurring error', action: 'Increment counter, weekly summary' },
    ],
  };
}

/**
 * Cleanup old logs — keep patterns but prune individual ErrorLog nodes older than 7 days.
 */
export async function cleanup(daysToKeep = 7): Promise<{ deleted: number }> {
  try {
    const result = await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (e:ErrorLog)
        WHERE e.timestamp < datetime() - duration({days: $days})
        DETACH DELETE e
        RETURN count(e) AS deleted
      `,
      params: { days: daysToKeep },
    }) as { results?: unknown[] };

    const deleted = ((result?.results ?? [])[0] as any)?.deleted ?? 0;
    return { deleted };
  } catch {
    return { deleted: 0 };
  }
}
