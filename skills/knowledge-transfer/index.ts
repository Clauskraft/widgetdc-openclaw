/**
 * Knowledge Transfer Protocol — Structured Agent-to-Agent Knowledge Exchange
 *
 * Enables:
 * - Explicit knowledge sharing between agents
 * - Learning propagation across the agent network
 * - Knowledge versioning and provenance tracking
 * - Automatic relevance filtering
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

// ─── Types ────────────────────────────────────────────────────────────────

export interface KnowledgePacket {
  id: string;
  type: 'insight' | 'lesson' | 'fact' | 'procedure' | 'warning';
  title: string;
  content: string;
  domain: string;
  confidence: number;
  source: {
    agentId: string;
    timestamp: string;
    context?: string;
  };
  metadata: {
    version: number;
    supersedes?: string;
    expiresAt?: string;
    tags: string[];
  };
}

export interface TransferResult {
  packetId: string;
  fromAgent: string;
  toAgents: string[];
  accepted: string[];
  rejected: string[];
  timestamp: string;
}

interface TransferOptions {
  priority?: 'low' | 'normal' | 'high' | 'critical';
  requireAck?: boolean;
  expiresIn?: number;
  tags?: string[];
}

// ─── Agent Registry ───────────────────────────────────────────────────────

const AGENT_DOMAINS: Record<string, string[]> = {
  main: ['general', 'all'],
  orchestrator: ['workflow', 'coordination', 'planning'],
  developer: ['code', 'git', 'typescript', 'python', 'architecture'],
  writer: ['documentation', 'content', 'reports', 'scr'],
  analyst: ['financial', 'data', 'metrics', 'analysis'],
  researcher: ['osint', 'research', 'investigation'],
  security: ['cybersecurity', 'cve', 'vulnerabilities', 'threats'],
  data: ['graph', 'rag', 'knowledge', 'neo4j'],
  pm: ['project', 'planning', 'kanban', 'tasks'],
  devops: ['cicd', 'deployment', 'infrastructure'],
  qa: ['testing', 'quality', 'validation'],
  ux: ['design', 'ui', 'user-experience'],
};

// ─── Core Functions ───────────────────────────────────────────────────────

/**
 * Create a knowledge packet for transfer
 */
export function createPacket(
  fromAgent: string,
  type: KnowledgePacket['type'],
  title: string,
  content: string,
  domain: string,
  options: { confidence?: number; tags?: string[]; supersedes?: string } = {}
): KnowledgePacket {
  return {
    id: `kp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    title,
    content,
    domain,
    confidence: options.confidence ?? 0.7,
    source: {
      agentId: fromAgent,
      timestamp: new Date().toISOString(),
    },
    metadata: {
      version: 1,
      supersedes: options.supersedes,
      tags: options.tags ?? [],
    },
  };
}

/**
 * Transfer knowledge to specific agents
 */
export async function transferTo(
  packet: KnowledgePacket,
  toAgents: string[],
  options: TransferOptions = {}
): Promise<TransferResult> {
  const accepted: string[] = [];
  const rejected: string[] = [];

  // Store packet to Neo4j
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      CREATE (k:KnowledgePacket {
        id: $id,
        type: $type,
        title: $title,
        content: $content,
        domain: $domain,
        confidence: $confidence,
        sourceAgent: $sourceAgent,
        sourceTimestamp: datetime(),
        version: $version,
        tags: $tags,
        priority: $priority
      })
    `,
    params: {
      id: packet.id,
      type: packet.type,
      title: packet.title,
      content: packet.content,
      domain: packet.domain,
      confidence: packet.confidence,
      sourceAgent: packet.source.agentId,
      version: packet.metadata.version,
      tags: packet.metadata.tags,
      priority: options.priority ?? 'normal',
    },
  }).catch(() => {});

  // Transfer to each agent
  for (const agentId of toAgents) {
    const relevance = calculateRelevance(packet.domain, agentId);

    if (relevance < 0.3) {
      rejected.push(agentId);
      continue;
    }

    try {
      // Store to agent's memory
      await widgetdc_mcp('consulting.agent.memory.store', {
        agentId,
        content: `[Knowledge Transfer: ${packet.type}] ${packet.title}\n\n${packet.content}\n\n(From: ${packet.source.agentId}, Confidence: ${(packet.confidence * 100).toFixed(0)}%)`,
        type: `transferred_${packet.type}`,
      });

      // Create transfer relationship
      await widgetdc_mcp('graph.write_cypher', {
        query: `
          MATCH (k:KnowledgePacket {id: $packetId})
          MERGE (a:Agent {id: $agentId})
          CREATE (k)-[:TRANSFERRED_TO {
            timestamp: datetime(),
            relevance: $relevance,
            priority: $priority,
            acknowledged: false
          }]->(a)
        `,
        params: {
          packetId: packet.id,
          agentId,
          relevance,
          priority: options.priority ?? 'normal',
        },
      });

      accepted.push(agentId);
    } catch {
      rejected.push(agentId);
    }
  }

  // Log transfer event
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      CREATE (t:KnowledgeTransfer {
        packetId: $packetId,
        fromAgent: $fromAgent,
        toAgents: $toAgents,
        accepted: $accepted,
        rejected: $rejected,
        timestamp: datetime()
      })
    `,
    params: {
      packetId: packet.id,
      fromAgent: packet.source.agentId,
      toAgents,
      accepted,
      rejected,
    },
  }).catch(() => {});

  return {
    packetId: packet.id,
    fromAgent: packet.source.agentId,
    toAgents,
    accepted,
    rejected,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Broadcast knowledge to all relevant agents
 */
export async function broadcast(
  packet: KnowledgePacket,
  options: TransferOptions = {}
): Promise<TransferResult> {
  // Find relevant agents based on domain
  const relevantAgents = Object.entries(AGENT_DOMAINS)
    .filter(([agentId, domains]) => {
      if (agentId === packet.source.agentId) return false;
      return domains.includes(packet.domain) || domains.includes('all');
    })
    .map(([agentId]) => agentId);

  return transferTo(packet, relevantAgents, options);
}

/**
 * Calculate relevance score for agent
 */
function calculateRelevance(domain: string, agentId: string): number {
  const agentDomains = AGENT_DOMAINS[agentId] ?? [];
  
  if (agentDomains.includes('all')) return 0.8;
  if (agentDomains.includes(domain)) return 1.0;
  
  // Partial match
  for (const d of agentDomains) {
    if (domain.includes(d) || d.includes(domain)) return 0.6;
  }
  
  return 0.2;
}

/**
 * Request knowledge from another agent
 */
export async function requestKnowledge(
  fromAgent: string,
  toAgent: string,
  query: string,
  domain?: string
): Promise<{ request: string; response?: KnowledgePacket }> {
  const requestId = `kr_${Date.now()}`;

  // Log request
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      CREATE (r:KnowledgeRequest {
        id: $requestId,
        fromAgent: $fromAgent,
        toAgent: $toAgent,
        query: $query,
        domain: $domain,
        timestamp: datetime(),
        status: 'pending'
      })
    `,
    params: { requestId, fromAgent, toAgent, query, domain: domain ?? 'general' },
  }).catch(() => {});

  // Try to find relevant knowledge in target agent's memory
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (m:AgentMemory {agentId: $toAgent})
        WHERE m.value CONTAINS $keyword
        ${domain ? 'AND (m.domain = $domain OR m.domain IS NULL)' : ''}
        RETURN m.value AS content, m.type AS type
        ORDER BY m.updatedAt DESC
        LIMIT 1
      `,
      params: { toAgent, keyword: query.split(' ')[0], domain },
    }) as { results?: { content: string; type: string }[] };

    const memory = result?.results?.[0];
    if (memory) {
      const packet = createPacket(
        toAgent,
        'insight',
        `Response to: ${query}`,
        memory.content,
        domain ?? 'general'
      );

      // Update request status
      await widgetdc_mcp('graph.write_cypher', {
        query: `
          MATCH (r:KnowledgeRequest {id: $requestId})
          SET r.status = 'fulfilled', r.responsePacketId = $packetId
        `,
        params: { requestId, packetId: packet.id },
      });

      return { request: requestId, response: packet };
    }
  } catch {
    // No knowledge found
  }

  return { request: requestId };
}

/**
 * Acknowledge receipt of knowledge
 */
export async function acknowledgeKnowledge(
  agentId: string,
  packetId: string,
  feedback?: { useful: boolean; notes?: string }
): Promise<{ success: boolean }> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (k:KnowledgePacket {id: $packetId})-[r:TRANSFERRED_TO]->(a:Agent {id: $agentId})
        SET r.acknowledged = true,
            r.acknowledgedAt = datetime(),
            r.useful = $useful,
            r.notes = $notes
      `,
      params: {
        packetId,
        agentId,
        useful: feedback?.useful ?? true,
        notes: feedback?.notes ?? '',
      },
    });

    // If useful, increase confidence of original packet
    if (feedback?.useful) {
      await widgetdc_mcp('graph.write_cypher', {
        query: `
          MATCH (k:KnowledgePacket {id: $packetId})
          SET k.confidence = CASE 
            WHEN k.confidence < 0.95 THEN k.confidence + 0.05 
            ELSE k.confidence 
          END
        `,
        params: { packetId },
      });
    }

    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Get pending knowledge transfers for an agent
 */
export async function getPendingTransfers(agentId: string): Promise<KnowledgePacket[]> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (k:KnowledgePacket)-[r:TRANSFERRED_TO]->(a:Agent {id: $agentId})
        WHERE r.acknowledged = false
        RETURN k.id AS id, k.type AS type, k.title AS title, 
               k.content AS content, k.domain AS domain,
               k.confidence AS confidence, k.sourceAgent AS sourceAgent,
               r.priority AS priority
        ORDER BY 
          CASE r.priority 
            WHEN 'critical' THEN 0 
            WHEN 'high' THEN 1 
            WHEN 'normal' THEN 2 
            ELSE 3 
          END,
          k.sourceTimestamp DESC
      `,
      params: { agentId },
    }) as { results?: any[] };

    return (result?.results ?? []).map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content: r.content,
      domain: r.domain,
      confidence: r.confidence,
      source: { agentId: r.sourceAgent, timestamp: '' },
      metadata: { version: 1, tags: [] },
    }));
  } catch {
    return [];
  }
}

/**
 * Get knowledge transfer statistics
 */
export async function getTransferStats(): Promise<{
  totalPackets: number;
  totalTransfers: number;
  byAgent: { agentId: string; sent: number; received: number }[];
  byDomain: { domain: string; count: number }[];
}> {
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (k:KnowledgePacket)
        WITH count(k) AS totalPackets
        MATCH (t:KnowledgeTransfer)
        WITH totalPackets, count(t) AS totalTransfers
        MATCH (k2:KnowledgePacket)
        WITH totalPackets, totalTransfers, k2.sourceAgent AS agent, k2.domain AS domain
        RETURN totalPackets, totalTransfers,
               collect(DISTINCT {agent: agent}) AS agents,
               collect(DISTINCT {domain: domain}) AS domains
      `,
    }) as { results?: any[] };

    const row = result?.results?.[0] ?? {};
    return {
      totalPackets: row.totalPackets ?? 0,
      totalTransfers: row.totalTransfers ?? 0,
      byAgent: [],
      byDomain: [],
    };
  } catch {
    return { totalPackets: 0, totalTransfers: 0, byAgent: [], byDomain: [] };
  }
}

// ─── Router ───────────────────────────────────────────────────────────────

export async function knowledge_transfer(action = 'help', ...args: string[]): Promise<unknown> {
  switch (action.toLowerCase().trim()) {
    case 'send': {
      const [fromAgent, toAgent, type, title, ...contentParts] = args;
      const content = contentParts.join(' ');
      if (!fromAgent || !toAgent || !type || !title || !content) {
        return { error: 'Usage: /knowledge send <from> <to> <type> <title> <content>' };
      }
      const packet = createPacket(fromAgent, type as KnowledgePacket['type'], title, content, 'general');
      return transferTo(packet, [toAgent]);
    }

    case 'broadcast': {
      const [fromAgent, type, domain, title, ...contentParts] = args;
      const content = contentParts.join(' ');
      if (!fromAgent || !type || !domain || !title || !content) {
        return { error: 'Usage: /knowledge broadcast <from> <type> <domain> <title> <content>' };
      }
      const packet = createPacket(fromAgent, type as KnowledgePacket['type'], title, content, domain);
      return broadcast(packet);
    }

    case 'request': {
      const [fromAgent, toAgent, ...queryParts] = args;
      const query = queryParts.join(' ');
      if (!fromAgent || !toAgent || !query) {
        return { error: 'Usage: /knowledge request <from> <to> <query>' };
      }
      return requestKnowledge(fromAgent, toAgent, query);
    }

    case 'pending': {
      const agentId = args[0] || 'main';
      return getPendingTransfers(agentId);
    }

    case 'ack': {
      const [agentId, packetId, useful] = args;
      if (!agentId || !packetId) {
        return { error: 'Usage: /knowledge ack <agentId> <packetId> [useful]' };
      }
      return acknowledgeKnowledge(agentId, packetId, { useful: useful !== 'false' });
    }

    case 'stats':
      return getTransferStats();

    default:
      return {
        help: 'Knowledge Transfer Protocol — Agent-to-Agent Learning 📚',
        description: 'Structured knowledge exchange between agents',
        commands: {
          '/knowledge send <from> <to> <type> <title> <content>': 'Send to specific agent',
          '/knowledge broadcast <from> <type> <domain> <title> <content>': 'Broadcast to relevant agents',
          '/knowledge request <from> <to> <query>': 'Request knowledge from agent',
          '/knowledge pending [agentId]': 'Get pending transfers',
          '/knowledge ack <agentId> <packetId> [useful]': 'Acknowledge receipt',
          '/knowledge stats': 'Transfer statistics',
        },
        packetTypes: ['insight', 'lesson', 'fact', 'procedure', 'warning'],
        domains: Object.keys(AGENT_DOMAINS).flatMap(a => AGENT_DOMAINS[a]),
      };
  }
}

export default knowledge_transfer;
