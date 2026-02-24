/**
 * Data Pipeline Skill — Graf-Oktopus patterns for knowledge ingestion
 *
 * Guides: Harvesting → Extraction → Graph → RAG
 * For data agent (Graf-Oktopus), harvester (Stovsugeren), analyst (Tal-Trold)
 */

export interface PipelineStage {
  id: string;
  name: string;
  description: string;
  tools: string[];
  cypherHints: string[];
}

export const DATA_PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 'harvest',
    name: 'Harvesting',
    description: 'Ingest from sources: OSINT, documents, APIs',
    tools: ['integration.source_ingest', 'graph.read_cypher'],
    cypherHints: [
      'MATCH (h:HarvestedKnowledge) RETURN h.source, h.ingestedAt ORDER BY h.ingestedAt DESC LIMIT 10',
      'MATCH (d:TDCDocument) RETURN count(d) AS docs',
    ],
  },
  {
    id: 'extract',
    name: 'Extraction & Chunking',
    description: 'Content extraction, vector embedding, semantic classification',
    tools: ['context_folding.triage', 'context_folding.fold', 'graph.read_cypher'],
    cypherHints: [
      'MATCH (kc:KnowledgeChunk) RETURN count(kc) AS chunks',
      'MATCH (e:Evidence) RETURN count(e) AS evidence_nodes',
    ],
  },
  {
    id: 'graph',
    name: 'Graph Storage',
    description: 'Neo4j nodes: Insight, StrategicInsight, Directive, Evidence',
    tools: ['graph.read_cypher', 'graph.write_cypher', 'graph.stats', 'graph.health'],
    cypherHints: [
      'CALL db.labels() YIELD label RETURN label, count(*) AS cnt ORDER BY cnt DESC LIMIT 15',
      'MATCH (i:Insight) RETURN i.domain, count(*) AS cnt ORDER BY cnt DESC LIMIT 10',
    ],
  },
  {
    id: 'rag',
    name: 'RAG Query',
    description: 'Semantic search, evidence retrieval, synthesis',
    tools: ['kg_rag.query', 'knowledge.search_claims', 'rag_fasedelt'],
    cypherHints: [
      'MATCH (fc:FoldedContext) RETURN count(fc) AS folded_contexts',
    ],
  },
];

export function getStage(stageId: string): PipelineStage | undefined {
  return DATA_PIPELINE_STAGES.find((s) => s.id === stageId);
}

/**
 * Return pipeline guidance for a data task.
 */
export async function dataPipeline(
  task: string,
  stageHint?: string
): Promise<{ stage: PipelineStage; suggestedCypher?: string }> {
  const stage = stageHint ? getStage(stageHint) : DATA_PIPELINE_STAGES[0];
  const s = stage || DATA_PIPELINE_STAGES[0];
  const suggestedCypher = s.cypherHints[0];
  return { stage: s, suggestedCypher };
}
