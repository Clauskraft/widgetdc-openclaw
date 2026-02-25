/**
 * Evidence-Based Insights Skill — Link Insights to Supporting Evidence
 *
 * Creates verifiable, traceable insights with:
 * - Source citations (Neo4j nodes)
 * - Confidence scoring
 * - Evidence chain visualization
 * - Automatic evidence gathering from Knowledge Graph
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

// ─── Types ────────────────────────────────────────────────────────────────

export interface Evidence {
  id: string;
  type: 'document' | 'insight' | 'data' | 'external' | 'agent_memory';
  source: string;
  quote: string;
  confidence: number;
  url?: string;
  nodeId?: string;
}

export interface EvidenceBasedInsight {
  id: string;
  title: string;
  content: string;
  domain?: string;
  confidence: number;
  evidence: Evidence[];
  evidenceCount: number;
  createdAt: string;
  createdBy: string;
  verified: boolean;
}

interface InsightOptions {
  domain?: string;
  minConfidence?: number;
  maxEvidence?: number;
  autoGather?: boolean;
  agentId?: string;
}

// ─── Core Functions ───────────────────────────────────────────────────────

/**
 * Create an evidence-based insight with automatic evidence gathering
 */
export async function createInsight(
  title: string,
  content: string,
  options: InsightOptions = {}
): Promise<EvidenceBasedInsight> {
  const {
    domain,
    minConfidence = 0.5,
    maxEvidence = 5,
    autoGather = true,
    agentId = 'analyst',
  } = options;

  const insightId = `insight_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();

  // 1. Auto-gather evidence if enabled
  let evidence: Evidence[] = [];
  if (autoGather) {
    evidence = await gatherEvidence(content, domain, maxEvidence);
  }

  // 2. Calculate confidence based on evidence
  const avgEvidenceConfidence = evidence.length > 0
    ? evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length
    : 0.5;
  const confidence = Math.min(0.95, avgEvidenceConfidence * (1 + evidence.length * 0.1));

  // 3. Store insight to Neo4j with evidence links
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (i:EvidenceBasedInsight {
          id: $id,
          title: $title,
          content: $content,
          domain: $domain,
          confidence: $confidence,
          evidenceCount: $evidenceCount,
          createdAt: datetime(),
          createdBy: $agentId,
          verified: false
        })
      `,
      params: {
        id: insightId,
        title,
        content,
        domain: domain ?? 'general',
        confidence,
        evidenceCount: evidence.length,
        agentId,
      },
    });

    // 4. Create evidence relationships
    for (const ev of evidence) {
      await widgetdc_mcp('graph.write_cypher', {
        query: `
          MATCH (i:EvidenceBasedInsight {id: $insightId})
          MERGE (e:Evidence {id: $evidenceId})
          SET e.type = $type, e.source = $source, e.quote = $quote,
              e.confidence = $confidence, e.url = $url
          MERGE (i)-[:SUPPORTED_BY {confidence: $confidence}]->(e)
        `,
        params: {
          insightId,
          evidenceId: ev.id,
          type: ev.type,
          source: ev.source,
          quote: ev.quote,
          confidence: ev.confidence,
          url: ev.url ?? '',
        },
      });
    }
  } catch (e) {
    console.warn(`[evidence-insights] Failed to store insight: ${e}`);
  }

  return {
    id: insightId,
    title,
    content,
    domain,
    confidence,
    evidence,
    evidenceCount: evidence.length,
    createdAt,
    createdBy: agentId,
    verified: false,
  };
}

/**
 * Gather evidence from Knowledge Graph
 */
async function gatherEvidence(
  query: string,
  domain?: string,
  limit = 5
): Promise<Evidence[]> {
  const evidence: Evidence[] = [];

  // 1. Search existing Insights
  try {
    const insightResult = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (i:Insight)
        WHERE i.content CONTAINS $keyword OR i.title CONTAINS $keyword
        RETURN i.id AS id, i.title AS source, i.content AS quote,
               coalesce(i.confidence, 0.6) AS confidence
        LIMIT $limit
      `,
      params: { keyword: query.split(' ')[0], limit: Math.ceil(limit / 2) },
    }) as { results?: { id: string; source: string; quote: string; confidence: number }[] };

    for (const r of insightResult?.results ?? []) {
      evidence.push({
        id: r.id ?? `ev_${Date.now()}`,
        type: 'insight',
        source: r.source ?? 'Knowledge Graph',
        quote: r.quote?.substring(0, 300) ?? '',
        confidence: r.confidence ?? 0.6,
      });
    }
  } catch {
    // Continue without insight evidence
  }

  // 2. Search Lessons
  try {
    const lessonResult = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (l:Lesson)
        WHERE (l.content CONTAINS $keyword OR l.title CONTAINS $keyword)
        ${domain ? 'AND (l.domain = $domain OR l.domain = "general")' : ''}
        RETURN l.id AS id, l.title AS source, l.content AS quote
        LIMIT $limit
      `,
      params: { keyword: query.split(' ')[0], domain, limit: Math.ceil(limit / 2) },
    }) as { results?: { id: string; source: string; quote: string }[] };

    for (const r of lessonResult?.results ?? []) {
      evidence.push({
        id: r.id ?? `ev_${Date.now()}`,
        type: 'document',
        source: r.source ?? 'Lesson',
        quote: r.quote?.substring(0, 300) ?? '',
        confidence: 0.7,
      });
    }
  } catch {
    // Continue without lesson evidence
  }

  // 3. Try KG RAG for additional context
  try {
    const ragResult = await widgetdc_mcp('kg_rag.query', {
      query,
      domain,
    }) as { citations?: { quote: string; sourceUrl?: string; confidence?: number }[] };

    for (const c of (ragResult?.citations ?? []).slice(0, limit - evidence.length)) {
      evidence.push({
        id: `ev_rag_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
        type: 'data',
        source: c.sourceUrl ?? 'RAG',
        quote: c.quote?.substring(0, 300) ?? '',
        confidence: c.confidence ?? 0.6,
        url: c.sourceUrl,
      });
    }
  } catch {
    // Continue without RAG evidence
  }

  return evidence.slice(0, limit);
}

/**
 * Add evidence to an existing insight
 */
export async function addEvidence(
  insightId: string,
  evidence: Omit<Evidence, 'id'>
): Promise<{ success: boolean; evidenceId?: string }> {
  const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (i:EvidenceBasedInsight {id: $insightId})
        MERGE (e:Evidence {id: $evidenceId})
        SET e.type = $type, e.source = $source, e.quote = $quote,
            e.confidence = $confidence, e.url = $url
        MERGE (i)-[:SUPPORTED_BY {confidence: $confidence}]->(e)
        SET i.evidenceCount = i.evidenceCount + 1,
            i.confidence = (i.confidence * i.evidenceCount + $confidence) / (i.evidenceCount + 1)
      `,
      params: {
        insightId,
        evidenceId,
        type: evidence.type,
        source: evidence.source,
        quote: evidence.quote,
        confidence: evidence.confidence,
        url: evidence.url ?? '',
      },
    });

    return { success: true, evidenceId };
  } catch (e) {
    return { success: false };
  }
}

/**
 * Verify an insight (mark as human-verified)
 */
export async function verifyInsight(
  insightId: string,
  verifiedBy: string
): Promise<{ success: boolean }> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (i:EvidenceBasedInsight {id: $insightId})
        SET i.verified = true, i.verifiedBy = $verifiedBy, i.verifiedAt = datetime()
      `,
      params: { insightId, verifiedBy },
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Get insight with full evidence chain
 */
export async function getInsightWithEvidence(
  insightId: string
): Promise<EvidenceBasedInsight | null> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (i:EvidenceBasedInsight {id: $insightId})
        OPTIONAL MATCH (i)-[r:SUPPORTED_BY]->(e:Evidence)
        RETURN i.id AS id, i.title AS title, i.content AS content,
               i.domain AS domain, i.confidence AS confidence,
               i.evidenceCount AS evidenceCount, i.createdAt AS createdAt,
               i.createdBy AS createdBy, i.verified AS verified,
               collect({
                 id: e.id, type: e.type, source: e.source,
                 quote: e.quote, confidence: e.confidence, url: e.url
               }) AS evidence
      `,
      params: { insightId },
    }) as { results?: EvidenceBasedInsight[] };

    return result?.results?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Search insights by domain or keyword
 */
export async function searchInsights(
  query: string,
  options: { domain?: string; minConfidence?: number; limit?: number } = {}
): Promise<EvidenceBasedInsight[]> {
  const { domain, minConfidence = 0.5, limit = 10 } = options;

  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (i:EvidenceBasedInsight)
        WHERE (i.title CONTAINS $query OR i.content CONTAINS $query)
        AND i.confidence >= $minConfidence
        ${domain ? 'AND i.domain = $domain' : ''}
        OPTIONAL MATCH (i)-[:SUPPORTED_BY]->(e:Evidence)
        RETURN i.id AS id, i.title AS title, i.content AS content,
               i.domain AS domain, i.confidence AS confidence,
               i.evidenceCount AS evidenceCount, i.createdAt AS createdAt,
               i.createdBy AS createdBy, i.verified AS verified,
               count(e) AS actualEvidenceCount
        ORDER BY i.confidence DESC
        LIMIT $limit
      `,
      params: { query, domain, minConfidence, limit },
    }) as { results?: EvidenceBasedInsight[] };

    return result?.results ?? [];
  } catch {
    return [];
  }
}

/**
 * Get evidence chain visualization (for debugging/display)
 */
export async function getEvidenceChain(insightId: string): Promise<{
  insight: { id: string; title: string; confidence: number };
  evidence: { id: string; source: string; confidence: number }[];
  chain: string;
}> {
  const insight = await getInsightWithEvidence(insightId);
  if (!insight) {
    return { insight: { id: '', title: '', confidence: 0 }, evidence: [], chain: '' };
  }

  const evidenceList = insight.evidence.map(e => ({
    id: e.id,
    source: e.source,
    confidence: e.confidence,
  }));

  const chain = `[${insight.title}] (${(insight.confidence * 100).toFixed(0)}%)\n` +
    evidenceList.map(e => `  └─ ${e.source} (${(e.confidence * 100).toFixed(0)}%)`).join('\n');

  return {
    insight: { id: insight.id, title: insight.title, confidence: insight.confidence },
    evidence: evidenceList,
    chain,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────

export async function evidence_insights(action = 'help', ...args: string[]): Promise<unknown> {
  switch (action.toLowerCase().trim()) {
    case 'create': {
      const [title, ...contentParts] = args;
      const content = contentParts.join(' ');
      if (!title || !content) {
        return { error: 'Usage: /evidence create <title> <content>' };
      }
      return createInsight(title, content);
    }

    case 'add': {
      const [insightId, type, source, ...quoteParts] = args;
      const quote = quoteParts.join(' ');
      if (!insightId || !type || !source || !quote) {
        return { error: 'Usage: /evidence add <insightId> <type> <source> <quote>' };
      }
      return addEvidence(insightId, {
        type: type as Evidence['type'],
        source,
        quote,
        confidence: 0.7,
      });
    }

    case 'verify': {
      const [insightId, verifiedBy] = args;
      if (!insightId) {
        return { error: 'Usage: /evidence verify <insightId> [verifiedBy]' };
      }
      return verifyInsight(insightId, verifiedBy ?? 'human');
    }

    case 'get': {
      const [insightId] = args;
      if (!insightId) {
        return { error: 'Usage: /evidence get <insightId>' };
      }
      return getInsightWithEvidence(insightId);
    }

    case 'search': {
      const query = args.join(' ');
      if (!query) {
        return { error: 'Usage: /evidence search <query>' };
      }
      return searchInsights(query);
    }

    case 'chain': {
      const [insightId] = args;
      if (!insightId) {
        return { error: 'Usage: /evidence chain <insightId>' };
      }
      return getEvidenceChain(insightId);
    }

    default:
      return {
        help: 'Evidence-Based Insights — Verifiable Knowledge 📚',
        description: 'Create insights with traceable evidence chains',
        commands: {
          '/evidence create <title> <content>': 'Create insight with auto-gathered evidence',
          '/evidence add <insightId> <type> <source> <quote>': 'Add evidence to insight',
          '/evidence verify <insightId> [by]': 'Mark insight as verified',
          '/evidence get <insightId>': 'Get insight with evidence',
          '/evidence search <query>': 'Search insights',
          '/evidence chain <insightId>': 'Show evidence chain',
        },
        evidenceTypes: ['document', 'insight', 'data', 'external', 'agent_memory'],
      };
  }
}

export default evidence_insights;
