/**
 * QMD (Grounded Model Distillation) — Token-optimeret RAG
 *
 * Udvinder top-K insights fra knowledge graph med struktureret output.
 * Prioriterer høj-confidence resultater og komprimerer til token-budget.
 *
 * Optimeret vs. naiv truncation:
 * - Udtræk struktur (titel, confidence, domæne) i stedet for rå tekst-truncation
 * - Separat numerisk metadata (confidence scores, domain tags)
 * - Konsistent 3K token-budget uanset input-størrelse
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const TOKEN_BUDGET = 3_000; // Tegn i output (≈750 tokens @ 4 chars/token)

interface QmdResult {
  query: string;
  totalFound: number;
  topInsights: Array<{
    title: string;
    domain?: string;
    confidence?: number;
    snippet: string;
    source?: string;
  }>;
  distilled: string;
  tokenEstimate: number;
  truncated: boolean;
}

/**
 * Kør grounded distillation mod WidgeTDC knowledge graph.
 *
 * @param query - Naturlig sproglig forespørgsel
 * @param topK  - Antal top-resultater (default: 5)
 * @returns Struktureret QMD output med token-estimat
 *
 * @example
 * const result = await qmd("cloud security best practices", 5);
 * console.log(result.distilled);
 * console.log(`Tokens: ~${result.tokenEstimate}`);
 */
export async function qmd(query: string, topK = 5): Promise<QmdResult> {
  if (!query?.trim()) {
    return emptyResult(query ?? '');
  }

  // Forsøg struktureret Cypher-query (mere præcis end rå RAG)
  const [structuredResult, ragResult] = await Promise.allSettled([
    widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (i:Insight)
        WHERE i.title CONTAINS $kw OR i.content CONTAINS $kw
        RETURN i.title AS title, i.content AS content,
               i.confidence AS confidence, i.domain AS domain,
               i.source AS source
        ORDER BY coalesce(i.confidence, 0) DESC
        LIMIT $topK
      `,
      params: { kw: query.split(' ').slice(0, 3).join(' '), topK },
    }),
    widgetdc_mcp('kg_rag.query', { query }),
  ]);

  const graphRows = structuredResult.status === 'fulfilled'
    ? ((structuredResult.value as any)?.results ?? (structuredResult.value as any)?.result?.results ?? [])
    : [];

  // Byg struktureret top-insights liste
  const topInsights: QmdResult['topInsights'] = graphRows.slice(0, topK).map((r: any) => ({
    title:      r.title ?? 'Indsigt',
    domain:     r.domain,
    confidence: r.confidence,
    snippet:    String(r.content ?? '').substring(0, 300),
    source:     r.source,
  }));

  // Fallback: uddriv fra RAG-svar hvis graph er tom
  if (topInsights.length === 0 && ragResult.status === 'fulfilled') {
    const raw = typeof ragResult.value === 'string'
      ? ragResult.value
      : JSON.stringify(ragResult.value);

    const lines = raw.split('\n').filter(l => l.trim().length > 30).slice(0, topK);
    lines.forEach((l, i) => topInsights.push({
      title:   `RAG Result ${i + 1}`,
      snippet: l.trim().substring(0, 300),
    }));
  }

  // Destillér til token-budget
  const distilledLines = topInsights.map((ins, i) => {
    const conf = ins.confidence ? ` [${Math.round(ins.confidence * 100)}%]` : '';
    const dom  = ins.domain ? ` (${ins.domain})` : '';
    return `${i + 1}. ${ins.title}${dom}${conf}\n   ${ins.snippet}`;
  });

  let distilled = distilledLines.join('\n\n');
  const truncated = distilled.length > TOKEN_BUDGET;
  if (truncated) distilled = distilled.substring(0, TOKEN_BUDGET) + '\n... [QMD Destilleret]';

  return {
    query,
    totalFound:    graphRows.length,
    topInsights,
    distilled,
    tokenEstimate: Math.ceil(distilled.length / 4),
    truncated,
  };
}

function emptyResult(query: string): QmdResult {
  return {
    query,
    totalFound:    0,
    topInsights:   [],
    distilled:     'Angiv en forespørgsel: /qmd <din forespørgsel>',
    tokenEstimate: 0,
    truncated:     false,
  };
}
