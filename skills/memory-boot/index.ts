/**
 * Memory Boot Skill — Hierarchical Agent Memory System
 *
 * 3-Tier Memory Architecture:
 * 1. CORE — Altid i context (persona, kritiske facts, identity)
 * 2. WORKING — Aktuel session (recent learnings, < 7 dage)
 * 3. ARCHIVAL — Long-term (compressed, searchable, > 7 dage)
 *
 * Features:
 * - Auto-load ved session start
 * - Memory consolidation (working → archival)
 * - Cross-agent lesson distribution
 * - TTL-based garbage collection
 * - Self-editing memory (edit/delete/forget)
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

// ─── Types ────────────────────────────────────────────────────────────────

type MemoryTier = 'core' | 'working' | 'archival';

interface Memory {
  id?: string;
  content: string;
  type: string;
  tier: MemoryTier;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  deleted?: boolean;
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

interface HierarchicalMemory {
  core: Memory[];
  working: Memory[];
  archival: Memory[];
}

interface BootResult {
  agentId: string;
  bootedAt: string;
  hierarchy: HierarchicalMemory;
  lessons: Lesson[];
  contextFolds: ContextFold[];
  profile: AgentProfile | null;
  rehydrated: boolean;
  stats: {
    coreLoaded: number;
    workingLoaded: number;
    archivalLoaded: number;
    lessonsLoaded: number;
    foldsLoaded: number;
    totalTokensEstimate: number;
  };
}

// ─── Hierarchical Memory Functions ────────────────────────────────────────

/**
 * Load CORE memories — always in context (persona, critical facts)
 */
async function loadCoreMemories(agentId: string): Promise<Memory[]> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $agentId})
        WHERE (m.tier = 'core' OR m.type IN ['persona', 'identity', 'critical', 'fact'])
        AND (m.deleted IS NULL OR m.deleted = false)
        RETURN m.id AS id, m.value AS content, m.type AS type, 
               'core' AS tier, m.createdAt AS createdAt
        ORDER BY m.createdAt DESC
      `,
      params: { agentId },
    }) as { results?: Memory[] };

    return (result?.results ?? []).map(m => ({ ...m, tier: 'core' as MemoryTier }));
  } catch (e) {
    console.warn(`[memory-boot] core load failed: ${e}`);
    return [];
  }
}

/**
 * Load WORKING memories — recent session (< 7 days)
 */
async function loadWorkingMemories(agentId: string, limit = 20): Promise<Memory[]> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $agentId})
        WHERE (m.tier = 'working' OR m.tier IS NULL)
        AND m.type NOT IN ['persona', 'identity', 'critical', 'fact']
        AND m.updatedAt > datetime() - duration('P7D')
        AND (m.deleted IS NULL OR m.deleted = false)
        RETURN m.id AS id, m.value AS content, m.type AS type,
               'working' AS tier, m.createdAt AS createdAt, m.updatedAt AS updatedAt
        ORDER BY m.updatedAt DESC
        LIMIT $limit
      `,
      params: { agentId, limit },
    }) as { results?: Memory[] };

    return (result?.results ?? []).map(m => ({ ...m, tier: 'working' as MemoryTier }));
  } catch (e) {
    console.warn(`[memory-boot] working load failed: ${e}`);
    return [];
  }
}

/**
 * Load ARCHIVAL memories — long-term compressed (searchable)
 */
async function loadArchivalMemories(agentId: string, limit = 50): Promise<Memory[]> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $agentId})
        WHERE m.tier = 'archival'
        AND (m.deleted IS NULL OR m.deleted = false)
        RETURN m.id AS id, m.value AS content, m.type AS type,
               'archival' AS tier, m.createdAt AS createdAt,
               m.consolidatedFrom AS consolidatedFrom
        ORDER BY m.createdAt DESC
        LIMIT $limit
      `,
      params: { agentId, limit },
    }) as { results?: Memory[] };

    return (result?.results ?? []).map(m => ({ ...m, tier: 'archival' as MemoryTier }));
  } catch (e) {
    console.warn(`[memory-boot] archival load failed: ${e}`);
    return [];
  }
}

/**
 * Load full hierarchical memory
 */
async function loadHierarchicalMemory(agentId: string): Promise<HierarchicalMemory> {
  const [core, working, archival] = await Promise.all([
    loadCoreMemories(agentId),
    loadWorkingMemories(agentId),
    loadArchivalMemories(agentId),
  ]);

  return { core, working, archival };
}

// ─── Memory Consolidation ─────────────────────────────────────────────────

/**
 * Consolidate working memories to archival (> 24 hours old)
 * Uses context folding for compression
 */
async function consolidateMemories(agentId: string): Promise<{
  consolidated: number;
  archivalCreated: boolean;
  summary?: string;
}> {
  try {
    // 1. Find working memories older than 24 hours
    const oldWorking = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $agentId})
        WHERE (m.tier = 'working' OR m.tier IS NULL)
        AND m.type NOT IN ['persona', 'identity', 'critical', 'fact']
        AND m.updatedAt < datetime() - duration('P1D')
        AND (m.deleted IS NULL OR m.deleted = false)
        RETURN m.id AS id, m.value AS content, m.type AS type
        ORDER BY m.createdAt
      `,
      params: { agentId },
    }) as { results?: { id: string; content: string; type: string }[] };

    const memories = oldWorking?.results ?? [];
    if (memories.length === 0) {
      return { consolidated: 0, archivalCreated: false };
    }

    // 2. Combine content for folding
    const combinedContent = memories
      .map(m => `[${m.type}] ${m.content}`)
      .join('\n\n');

    // 3. Fold via RLM context folding
    let summary: string;
    try {
      const foldResult = await widgetdc_mcp('context_folding.fold', {
        content: combinedContent,
        target_tokens: 500,
        preserve_key_facts: true,
      }) as { folded?: string; summary?: string };
      summary = foldResult?.folded ?? foldResult?.summary ?? combinedContent.substring(0, 1000);
    } catch {
      // Fallback: simple truncation
      summary = combinedContent.substring(0, 1000) + (combinedContent.length > 1000 ? '...' : '');
    }

    // 4. Create archival memory
    const archivalId = `archival_${agentId}_${Date.now()}`;
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (m:AgentMemory {
          id: $id,
          agentId: $agentId,
          value: $summary,
          type: 'consolidated',
          tier: 'archival',
          consolidatedFrom: $count,
          consolidatedIds: $ids,
          createdAt: datetime(),
          updatedAt: datetime()
        })
      `,
      params: {
        id: archivalId,
        agentId,
        summary,
        count: memories.length,
        ids: memories.map(m => m.id),
      },
    });

    // 5. Mark old working memories as consolidated (soft delete)
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $agentId})
        WHERE m.id IN $ids
        SET m.deleted = true, m.consolidatedTo = $archivalId, m.deletedAt = datetime()
      `,
      params: {
        agentId,
        ids: memories.map(m => m.id),
        archivalId,
      },
    });

    return {
      consolidated: memories.length,
      archivalCreated: true,
      summary,
    };
  } catch (e) {
    console.warn(`[memory-boot] consolidation failed: ${e}`);
    return { consolidated: 0, archivalCreated: false };
  }
}

// ─── Self-Editing Memory ──────────────────────────────────────────────────

/**
 * Edit an existing memory
 */
async function editMemory(
  agentId: string,
  memoryId: string,
  newContent: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (m:AgentMemory {id: $memoryId, agentId: $agentId})
        SET m.value = $newContent,
            m.editedAt = datetime(),
            m.updatedAt = datetime(),
            m.version = coalesce(m.version, 0) + 1
      `,
      params: { memoryId, agentId, newContent },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Soft-delete a memory
 */
async function deleteMemory(
  agentId: string,
  memoryId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (m:AgentMemory {id: $memoryId, agentId: $agentId})
        SET m.deleted = true, m.deletedAt = datetime()
      `,
      params: { memoryId, agentId },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Forget old memories (TTL-based cleanup)
 */
async function forgetOldMemories(
  agentId: string,
  olderThanDays: number
): Promise<{ forgotten: number }> {
  try {
    const result = await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $agentId})
        WHERE m.tier = 'working'
        AND m.type NOT IN ['persona', 'identity', 'critical', 'fact']
        AND m.updatedAt < datetime() - duration('P' + toString($days) + 'D')
        AND (m.deleted IS NULL OR m.deleted = false)
        SET m.deleted = true, m.deletedAt = datetime(), m.deleteReason = 'ttl_expired'
        RETURN count(*) AS forgotten
      `,
      params: { agentId, days: olderThanDays },
    }) as { results?: { forgotten: number }[] };

    return { forgotten: result?.results?.[0]?.forgotten ?? 0 };
  } catch {
    return { forgotten: 0 };
  }
}

// ─── Legacy Functions (Backwards Compatible) ──────────────────────────────

async function recallMemories(agentId: string, limit = 20): Promise<Memory[]> {
  try {
    const result = await widgetdc_mcp('consulting.agent.memory.recall', {
      agentId,
      limit,
    }) as { memories?: Memory[]; data?: Memory[] };

    return (result?.memories ?? result?.data ?? []).map(m => ({
      ...m,
      tier: 'working' as MemoryTier,
    }));
  } catch (e) {
    console.warn(`[memory-boot] recall failed: ${e}`);
    return [];
  }
}

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
    }) as { results?: Lesson[] };

    return result?.results ?? [];
  } catch (e) {
    console.warn(`[memory-boot] lessons failed: ${e}`);
    return [];
  }
}

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
    }) as { results?: ContextFold[] };

    return result?.results ?? [];
  } catch (e) {
    console.warn(`[memory-boot] context folds failed: ${e}`);
    return [];
  }
}

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
    }) as { results?: AgentProfile[] };

    return result?.results?.[0] ?? null;
  } catch (e) {
    console.warn(`[memory-boot] profile failed: ${e}`);
    return null;
  }
}

async function tryRehydrate(agentId: string): Promise<boolean> {
  try {
    const result = await widgetdc_mcp('supervisor.rehydrate', {
      agentId,
      includeMemory: true,
      includeContextFolds: true,
    }) as { success?: boolean };

    return result?.success ?? false;
  } catch {
    return false;
  }
}

async function logBootEvent(agentId: string, stats: BootResult['stats']): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MERGE (b:BootEvent {agentId: $agentId, date: date()})
        SET b.lastBootAt = datetime(),
            b.coreLoaded = $coreLoaded,
            b.workingLoaded = $workingLoaded,
            b.archivalLoaded = $archivalLoaded,
            b.lessonsLoaded = $lessonsLoaded,
            b.foldsLoaded = $foldsLoaded,
            b.bootCount = coalesce(b.bootCount, 0) + 1
      `,
      params: {
        agentId,
        coreLoaded: stats.coreLoaded,
        workingLoaded: stats.workingLoaded,
        archivalLoaded: stats.archivalLoaded,
        lessonsLoaded: stats.lessonsLoaded,
        foldsLoaded: stats.foldsLoaded,
      },
    });
  } catch {
    // Non-critical
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Full hierarchical memory boot for an agent
 */
export async function memoryBoot(
  agentId = 'main',
  options: { quick?: boolean } = {}
): Promise<BootResult> {
  // Run consolidation first (async, don't wait)
  consolidateMemories(agentId).catch(() => {});

  // Load hierarchical memory + lessons + folds + profile in parallel
  const [hierarchy, lessons, contextFolds, profile, rehydrated] = await Promise.all([
    loadHierarchicalMemory(agentId),
    loadLessons(agentId, options.quick ? 3 : 10),
    loadContextFolds(agentId, options.quick ? 2 : 5),
    loadAgentProfile(agentId),
    tryRehydrate(agentId),
  ]);

  // Calculate token estimate
  const totalChars =
    hierarchy.core.reduce((sum, m) => sum + (m.content?.length ?? 0), 0) +
    hierarchy.working.reduce((sum, m) => sum + (m.content?.length ?? 0), 0) +
    hierarchy.archival.reduce((sum, m) => sum + (m.content?.length ?? 0), 0) +
    lessons.reduce((sum, l) => sum + (l.content?.length ?? 0), 0) +
    contextFolds.reduce((sum, f) => sum + (f.summary?.length ?? 0), 0);

  const stats = {
    coreLoaded: hierarchy.core.length,
    workingLoaded: hierarchy.working.length,
    archivalLoaded: hierarchy.archival.length,
    lessonsLoaded: lessons.length,
    foldsLoaded: contextFolds.length,
    totalTokensEstimate: Math.ceil(totalChars / 4),
  };

  // Log boot event (async)
  logBootEvent(agentId, stats).catch(() => {});

  return {
    agentId,
    bootedAt: new Date().toISOString(),
    hierarchy,
    lessons,
    contextFolds,
    profile,
    rehydrated,
    stats,
  };
}

/**
 * Get memory stats without loading everything
 */
export async function memoryStatus(agentId = 'main'): Promise<unknown> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $agentId})
        WHERE m.deleted IS NULL OR m.deleted = false
        WITH m.tier AS tier, count(*) AS count
        RETURN collect({tier: tier, count: count}) AS tiers
      `,
      params: { agentId },
    }) as { results?: { tiers: { tier: string; count: number }[] }[] };

    const tiers = result?.results?.[0]?.tiers ?? [];
    const tierCounts: Record<string, number> = {};
    for (const t of tiers) {
      tierCounts[t.tier ?? 'working'] = t.count;
    }

    // Get boot info
    const bootResult = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (b:BootEvent {agentId: $agentId})
        RETURN b.lastBootAt AS lastBoot, b.bootCount AS bootCount
      `,
      params: { agentId },
    }) as { results?: { lastBoot: string; bootCount: number }[] };

    const bootInfo = bootResult?.results?.[0] ?? {};

    return {
      agentId,
      tiers: {
        core: tierCounts['core'] ?? 0,
        working: tierCounts['working'] ?? tierCounts['null'] ?? 0,
        archival: tierCounts['archival'] ?? 0,
      },
      total: Object.values(tierCounts).reduce((a, b) => a + b, 0),
      lastBoot: bootInfo.lastBoot,
      bootCount: bootInfo.bootCount ?? 0,
    };
  } catch (e) {
    return { agentId, error: String(e) };
  }
}

/**
 * Store a new memory with tier assignment
 */
export async function memoryStore(
  agentId: string,
  content: string,
  type: string = 'learning',
  tier: MemoryTier = 'working'
): Promise<unknown> {
  // Core types always go to core tier
  if (['persona', 'identity', 'critical', 'fact'].includes(type)) {
    tier = 'core';
  }

  const memoryId = `mem_${agentId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (m:AgentMemory {
          id: $id,
          agentId: $agentId,
          value: $content,
          type: $type,
          tier: $tier,
          createdAt: datetime(),
          updatedAt: datetime(),
          version: 1
        })
      `,
      params: { id: memoryId, agentId, content, type, tier },
    });

    // Also store via MCP for redundancy
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId,
      content,
      type,
    }).catch(() => {});

    return { success: true, memoryId, agentId, type, tier };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Promote a working memory to core (make it permanent)
 */
export async function promoteToCore(
  agentId: string,
  memoryId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (m:AgentMemory {id: $memoryId, agentId: $agentId})
        SET m.tier = 'core', m.promotedAt = datetime()
      `,
      params: { memoryId, agentId },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ─── Memory Cleanup ───────────────────────────────────────────────────────

export async function memoryCleanup(
  agentId: string,
  options: { maxAgeDays?: number; keepTypes?: string[] } = {}
): Promise<unknown> {
  const maxAge = options.maxAgeDays ?? 30;
  const keepTypes = options.keepTypes ?? ['persona', 'identity', 'critical', 'fact'];

  try {
    const result = await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $agentId})
        WHERE m.updatedAt < datetime() - duration({days: $maxAge})
        AND NOT m.type IN $keepTypes
        AND m.tier <> 'core'
        WITH m, m.id AS deletedId
        SET m.deleted = true, m.deletedAt = datetime()
        RETURN count(*) AS deleted
      `,
      params: { agentId, maxAge, keepTypes },
    }) as { results?: { deleted: number }[] };

    return {
      success: true,
      agentId,
      deleted: result?.results?.[0]?.deleted ?? 0,
      maxAgeDays: maxAge,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function cleanupAllAgents(maxAgeDays = 30): Promise<unknown> {
  const agents = [
    'main', 'orchestrator', 'developer', 'writer', 'analyst', 'data',
    'security', 'devops', 'qa', 'ux', 'pm', 'researcher',
  ];

  const results = await Promise.all(
    agents.map(agentId => memoryCleanup(agentId, { maxAgeDays }))
  );

  const totalDeleted = results.reduce((sum, r: any) => sum + (r.deleted ?? 0), 0);

  return {
    success: true,
    agentsProcessed: agents.length,
    totalDeleted,
  };
}

// ─── Lesson Distribution ──────────────────────────────────────────────────

export async function distributeLesson(
  lesson: { title: string; content: string; source?: string; domain?: string }
): Promise<unknown> {
  const agents = [
    'main', 'orchestrator', 'developer', 'writer', 'analyst', 'data',
    'security', 'devops', 'qa', 'ux', 'pm', 'researcher',
  ];

  // Save lesson to Neo4j
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

  // Distribute to all agents
  const results = await Promise.all(
    agents.map(agentId =>
      memoryStore(agentId, `[Lesson: ${lesson.title}] ${lesson.content}`, 'shared_lesson', 'working')
        .catch(() => ({ error: true }))
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
        return { error: 'Usage: /memory-boot store <agentId> <content> [type] [tier]' };
      }
      return memoryStore(
        args[0] || 'main',
        args.slice(1).join(' ')
      );

    case 'consolidate':
      return consolidateMemories(args[0] || 'main');

    case 'edit':
      if (!args[0] || !args[1] || !args[2]) {
        return { error: 'Usage: /memory-boot edit <agentId> <memoryId> <newContent>' };
      }
      return editMemory(args[0], args[1], args.slice(2).join(' '));

    case 'delete':
      if (!args[0] || !args[1]) {
        return { error: 'Usage: /memory-boot delete <agentId> <memoryId>' };
      }
      return deleteMemory(args[0], args[1]);

    case 'forget':
      return forgetOldMemories(args[0] || 'main', parseInt(args[1]) || 30);

    case 'promote':
      if (!args[0] || !args[1]) {
        return { error: 'Usage: /memory-boot promote <agentId> <memoryId>' };
      }
      return promoteToCore(args[0], args[1]);

    case 'cleanup':
      if (args[0] === 'all') {
        return cleanupAllAgents(parseInt(args[1]) || 30);
      }
      return memoryCleanup(args[0] || 'main', { maxAgeDays: parseInt(args[1]) || 30 });

    case 'distribute':
    case 'lesson':
      if (!args[0] || !args[1]) {
        return { error: 'Usage: /memory-boot distribute <title> <content>' };
      }
      return distributeLesson({ title: args[0], content: args.slice(1).join(' ') });

    default:
      if (action && !['help', '?', '--help'].includes(action)) {
        return memoryBoot(action);
      }

      return {
        help: 'Memory Boot — Hierarchical Agent Memory 🧠',
        architecture: {
          core: 'Always in context (persona, critical facts)',
          working: 'Current session (< 7 days)',
          archival: 'Long-term compressed (searchable)',
        },
        commands: {
          '/memory-boot': 'Full hierarchical boot for main agent',
          '/memory-boot <agentId>': 'Boot specific agent',
          '/memory-boot quick [agentId]': 'Quick boot (fewer items)',
          '/memory-boot status [agentId]': 'Show memory stats by tier',
          '/memory-boot store <agentId> <content> [type] [tier]': 'Store new memory',
          '/memory-boot consolidate [agentId]': 'Consolidate working → archival',
          '/memory-boot edit <agentId> <memoryId> <newContent>': 'Edit memory',
          '/memory-boot delete <agentId> <memoryId>': 'Soft-delete memory',
          '/memory-boot forget <agentId> [days]': 'Forget old memories',
          '/memory-boot promote <agentId> <memoryId>': 'Promote to core tier',
          '/memory-boot cleanup [agentId] [days]': 'Cleanup old memories',
          '/memory-boot distribute <title> <content>': 'Distribute lesson to all',
        },
      };
  }
}

export default memory_boot;
