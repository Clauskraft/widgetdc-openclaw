/**
 * Memory Boot Skill — Auto-load agent hukommelse ved session start
 *
 * Loader:
 * 1. Agent memories via consulting.agent.memory.recall
 * 2. Lessons fra Neo4j (teacher/student kobling)
 * 3. Sidste context folds (komprimeret session-state)
 * 4. Agent profile fra Neo4j
 *
 * Kan bruges:
 * - Manuelt: /memory-boot [agentId]
 * - Auto: via onSessionStart hook i openclaw.json
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

// ─── Types ────────────────────────────────────────────────────────────────

interface Memory {
  id?: string;
  content: string;
  type: string;
  createdAt?: string;
}

interface Lesson {
  title: string;
  content: string;
  domain?: string;
  createdAt?: string;
}

interface ContextFold {
  summary: string;
  sessionId?: string;
  bookId?: string;
  foldedAt?: string;
}

interface AgentProfile {
  id: string;
  name: string;
  tier?: string;
  persona?: string;
  capabilities?: string[];
}

interface BootResult {
  agentId: string;
  bootedAt: string;
  memories: Memory[];
  lessons: Lesson[];
  contextFolds: ContextFold[];
  profile: AgentProfile | null;
  rehydrated: boolean;
  stats: {
    memoriesLoaded: number;
    lessonsLoaded: number;
    foldsLoaded: number;
    totalTokensEstimate: number;
  };
}

// ─── Core Functions ───────────────────────────────────────────────────────

/**
 * Hent agent memories via MCP
 */
async function recallMemories(agentId: string, limit = 20): Promise<Memory[]> {
  try {
    const result = await widgetdc_mcp('consulting.agent.memory.recall', {
      agentId,
      limit,
    }) as { memories?: Memory[]; data?: Memory[] };

    return result?.memories ?? result?.data ?? [];
  } catch (e) {
    console.warn(`[memory-boot] recall failed: ${e}`);
    return [];
  }
}

/**
 * Hent lessons fra Neo4j (teacher/student kobling)
 */
async function loadLessons(agentId: string, limit = 10): Promise<Lesson[]> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (l:Lesson)
        WHERE l.agentId = $agentId OR l.agentId IS NULL OR l.domain = 'general'
        RETURN l.title AS title, l.content AS content, 
               l.domain AS domain, l.createdAt AS createdAt
        ORDER BY l.createdAt DESC LIMIT $limit
      `,
      params: { agentId, limit },
    }) as { results?: Lesson[]; result?: { results?: Lesson[] } };

    return result?.results ?? result?.result?.results ?? [];
  } catch (e) {
    console.warn(`[memory-boot] lessons failed: ${e}`);
    return [];
  }
}

/**
 * Hent sidste context folds fra Neo4j
 */
async function loadContextFolds(agentId: string, limit = 5): Promise<ContextFold[]> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (f:ContextFold)
        WHERE f.agentId = $agentId
        RETURN f.summary AS summary, f.sessionId AS sessionId, 
               f.bookId AS bookId, f.createdAt AS foldedAt
        ORDER BY f.createdAt DESC LIMIT $limit
      `,
      params: { agentId, limit },
    }) as { results?: ContextFold[]; result?: { results?: ContextFold[] } };

    return result?.results ?? result?.result?.results ?? [];
  } catch (e) {
    console.warn(`[memory-boot] context folds failed: ${e}`);
    return [];
  }
}

/**
 * Hent agent profile fra Neo4j
 */
async function loadAgentProfile(agentId: string): Promise<AgentProfile | null> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (a:Agent {id: $agentId})
        OPTIONAL MATCH (a)-[:HAS_CAPABILITY]->(c:MCPTool)
        RETURN a.id AS id, a.name AS name, a.tier AS tier, 
               a.persona AS persona, collect(c.name) AS capabilities
        LIMIT 1
      `,
      params: { agentId },
    }) as { results?: AgentProfile[]; result?: { results?: AgentProfile[] } };

    const rows = result?.results ?? result?.result?.results ?? [];
    return rows[0] ?? null;
  } catch (e) {
    console.warn(`[memory-boot] profile failed: ${e}`);
    return null;
  }
}

/**
 * Forsøg rehydrate via supervisor (hvis tilgængelig)
 */
async function tryRehydrate(agentId: string): Promise<boolean> {
  try {
    const result = await widgetdc_mcp('supervisor.rehydrate', {
      agentId,
      includeMemory: true,
      includeContextFolds: true,
    }) as { success?: boolean; rehydrated?: boolean };

    return result?.success ?? result?.rehydrated ?? false;
  } catch {
    // supervisor.rehydrate may not be available
    return false;
  }
}

/**
 * Gem boot-event til Neo4j for tracking
 */
async function logBootEvent(agentId: string, stats: BootResult['stats']): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MERGE (b:BootEvent {agentId: $agentId, date: date()})
        SET b.lastBootAt = datetime(),
            b.memoriesLoaded = $memoriesLoaded,
            b.lessonsLoaded = $lessonsLoaded,
            b.foldsLoaded = $foldsLoaded,
            b.bootCount = coalesce(b.bootCount, 0) + 1
      `,
      params: {
        agentId,
        memoriesLoaded: stats.memoriesLoaded,
        lessonsLoaded: stats.lessonsLoaded,
        foldsLoaded: stats.foldsLoaded,
      },
    });
  } catch {
    // Non-critical, ignore errors
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Fuld memory boot for en agent
 */
export async function memoryBoot(agentId = 'main', options: { quick?: boolean } = {}): Promise<BootResult> {
  const limits = options.quick
    ? { memories: 5, lessons: 3, folds: 2 }
    : { memories: 20, lessons: 10, folds: 5 };

  // Kør alle loads parallelt for hastighed
  const [memories, lessons, contextFolds, profile, rehydrated] = await Promise.all([
    recallMemories(agentId, limits.memories),
    loadLessons(agentId, limits.lessons),
    loadContextFolds(agentId, limits.folds),
    loadAgentProfile(agentId),
    tryRehydrate(agentId),
  ]);

  // Beregn token-estimat
  const totalChars =
    memories.reduce((sum, m) => sum + (m.content?.length ?? 0), 0) +
    lessons.reduce((sum, l) => sum + (l.content?.length ?? 0), 0) +
    contextFolds.reduce((sum, f) => sum + (f.summary?.length ?? 0), 0);

  const stats = {
    memoriesLoaded: memories.length,
    lessonsLoaded: lessons.length,
    foldsLoaded: contextFolds.length,
    totalTokensEstimate: Math.ceil(totalChars / 4),
  };

  // Log boot event (async, don't wait)
  logBootEvent(agentId, stats).catch(() => {});

  return {
    agentId,
    bootedAt: new Date().toISOString(),
    memories,
    lessons,
    contextFolds,
    profile,
    rehydrated,
    stats,
  };
}

/**
 * Hent memory stats uden at loade alt
 */
export async function memoryStatus(agentId = 'main'): Promise<unknown> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        OPTIONAL MATCH (m:AgentMemory {agentId: $agentId})
        WITH count(m) AS memoryCount
        OPTIONAL MATCH (l:Lesson) WHERE l.agentId = $agentId OR l.agentId IS NULL
        WITH memoryCount, count(l) AS lessonCount
        OPTIONAL MATCH (f:ContextFold {agentId: $agentId})
        WITH memoryCount, lessonCount, count(f) AS foldCount
        OPTIONAL MATCH (b:BootEvent {agentId: $agentId})
        RETURN memoryCount, lessonCount, foldCount, 
               b.lastBootAt AS lastBoot, b.bootCount AS bootCount
      `,
      params: { agentId },
    }) as { results?: unknown[]; result?: { results?: unknown[] } };

    const rows = result?.results ?? result?.result?.results ?? [];
    return {
      agentId,
      ...(rows[0] ?? { memoryCount: 0, lessonCount: 0, foldCount: 0 }),
    };
  } catch (e) {
    return { agentId, error: String(e) };
  }
}

/**
 * Gem en ny lærdom/indsigt
 */
export async function memoryStore(
  agentId: string,
  content: string,
  type: 'learning' | 'insight' | 'fact' | 'context_fold' = 'learning'
): Promise<unknown> {
  try {
    // Gem via MCP
    const result = await widgetdc_mcp('consulting.agent.memory.store', {
      agentId,
      content,
      type,
    });

    // Gem også til Neo4j AgentMemory for redundans
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MERGE (m:AgentMemory {agentId: $agentId, key: $key})
        SET m.value = $content, m.type = $type, m.updatedAt = datetime()
      `,
      params: {
        agentId,
        key: `${type}_${Date.now()}`,
        content,
        type,
      },
    });

    return { success: true, agentId, type, stored: true, result };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Memory Cleanup ───────────────────────────────────────────────────────

/**
 * Cleanup gamle memories (TTL-baseret garbage collection)
 */
export async function memoryCleanup(
  agentId: string,
  options: { maxAgeDays?: number; keepTypes?: string[] } = {}
): Promise<unknown> {
  const maxAge = options.maxAgeDays ?? 30;
  const keepTypes = options.keepTypes ?? ['fact', 'critical', 'lesson'];

  try {
    const result = await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $agentId})
        WHERE m.updatedAt < datetime() - duration({days: $maxAge})
        AND NOT m.type IN $keepTypes
        WITH m, m.key AS deletedKey
        DELETE m
        RETURN count(*) AS deleted, collect(deletedKey)[0..5] AS sampleKeys
      `,
      params: { agentId, maxAge, keepTypes },
    }) as { results?: { deleted: number; sampleKeys: string[] }[] };

    const data = result?.results?.[0] ?? { deleted: 0, sampleKeys: [] };

    // Log cleanup event
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'system',
      content: `Memory cleanup for ${agentId}: deleted ${data.deleted} old memories (>${maxAge} days)`,
      type: 'maintenance',
    }).catch(() => {});

    return {
      success: true,
      agentId,
      deleted: data.deleted,
      maxAgeDays: maxAge,
      preservedTypes: keepTypes,
      sampleDeletedKeys: data.sampleKeys,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Cleanup alle agenter
 */
export async function cleanupAllAgents(maxAgeDays = 30): Promise<unknown> {
  const agents = [
    'main', 'github', 'data', 'infra', 'strategist', 'security',
    'analyst', 'coder', 'orchestrator', 'documentalist', 'harvester', 'contracts',
    'rag', 'health', 'system',
  ];

  const results = await Promise.all(
    agents.map(agentId => memoryCleanup(agentId, { maxAgeDays }))
  );

  const totalDeleted = results.reduce((sum, r: any) => sum + (r.deleted ?? 0), 0);

  return {
    success: true,
    agentsProcessed: agents.length,
    totalDeleted,
    results,
  };
}

// ─── Lesson Distribution ──────────────────────────────────────────────────

/**
 * Distribuer en lesson til alle agenter (cross-agent learning)
 */
export async function distributeLesson(
  lesson: { title: string; content: string; source?: string; domain?: string }
): Promise<unknown> {
  const agents = [
    'main', 'github', 'data', 'infra', 'strategist', 'security',
    'analyst', 'coder', 'orchestrator', 'documentalist', 'harvester', 'contracts',
  ];

  // Gem lesson til Neo4j
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      CREATE (l:Lesson {
        id: $id,
        title: $title,
        content: $content,
        source: $source,
        domain: $domain,
        createdAt: datetime(),
        distributed: true
      })
    `,
    params: {
      id: `lesson_${Date.now()}`,
      title: lesson.title,
      content: lesson.content,
      source: lesson.source ?? 'system',
      domain: lesson.domain ?? 'general',
    },
  });

  // Distribuer til alle agenter
  const results = await Promise.all(
    agents.map(agentId =>
      widgetdc_mcp('consulting.agent.memory.store', {
        agentId,
        content: `[Lesson: ${lesson.title}] ${lesson.content}`,
        type: 'shared_lesson',
      }).catch(() => ({ error: true, agentId }))
    )
  );

  const successful = results.filter((r: any) => !r.error).length;

  return {
    success: true,
    lesson: lesson.title,
    distributedTo: successful,
    totalAgents: agents.length,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────

/**
 * Skill entry point
 */
export async function memory_boot(action = 'boot', ...args: string[]): Promise<unknown> {
  switch (action.toLowerCase().trim()) {
    case 'boot':
    case 'load':
      return memoryBoot(args[0] || 'main');

    case 'quick':
      return memoryBoot(args[0] || 'main', { quick: true });

    case 'status':
    case 'stats':
      return memoryStatus(args[0] || 'main');

    case 'store':
    case 'save':
      if (!args[1]) {
        return { error: 'Brug: /memory-boot store <agentId> <content>' };
      }
      return memoryStore(args[0] || 'main', args.slice(1).join(' '));

    case 'cleanup':
      if (args[0] === 'all') {
        return cleanupAllAgents(parseInt(args[1]) || 30);
      }
      return memoryCleanup(args[0] || 'main', { maxAgeDays: parseInt(args[1]) || 30 });

    case 'distribute':
    case 'lesson':
      if (!args[0] || !args[1]) {
        return { error: 'Brug: /memory-boot distribute <title> <content>' };
      }
      return distributeLesson({ title: args[0], content: args.slice(1).join(' ') });

    default:
      // Hvis action ligner et agentId, boot den agent
      if (action && !['help', '?', '--help'].includes(action)) {
        return memoryBoot(action);
      }

      return {
        help: 'Memory Boot — Agent hukommelse 🧠',
        commands: {
          '/memory-boot': 'Fuld boot for main agent',
          '/memory-boot <agentId>': 'Boot specifik agent',
          '/memory-boot quick [agentId]': 'Hurtig boot (færre items)',
          '/memory-boot status [agentId]': 'Vis memory stats',
          '/memory-boot store <agentId> <content>': 'Gem ny lærdom',
          '/memory-boot cleanup [agentId] [days]': 'Cleanup gamle memories (default 30 dage)',
          '/memory-boot cleanup all [days]': 'Cleanup alle agenter',
          '/memory-boot distribute <title> <content>': 'Distribuer lesson til alle agenter',
        },
        agents: [
          'main', 'github', 'data', 'infra', 'strategist', 'security',
          'analyst', 'coder', 'orchestrator', 'documentalist', 'harvester', 'contracts',
        ],
      };
  }
}

// Default export for OpenClaw skill loading
export default memory_boot;
