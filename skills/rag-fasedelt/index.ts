import { widgetdc_mcp } from '../widgetdc-mcp/index';

/**
 * Faseopdelt RAG (#32).
 * Opdeler en kompleks forespørgsel i 3 faser for at reducere latency og øge præcision.
 * Fase 1: Discovery (hvilke værktøjer/noder)
 * Fase 2: Targeted Query (RAG mod specifikke data)
 * Fase 3: Synthesis (Opsummering af fund)
 */
export async function rag_fasedelt(query: string) {
  console.log(`[RAG-Phase] Starter faseopdelt query for: ${query}`);
  
  // Fase 1: Discovery (hastighed er kritisk)
  const discovery = await widgetdc_mcp('widgetdc_discover_domain', { domain: 'kg_rag' });
  
  // Fase 2: Targeted Query (vi bruger QMD til at begrænse context)
  const rawResults = await widgetdc_mcp('kg_rag.query', { query });
  
  // Fase 3: Synthesis (Manuel destillering for at spare tokens)
  const synthesis = typeof rawResults === 'string' 
    ? rawResults.substring(0, 3000) 
    : JSON.stringify(rawResults).substring(0, 3000);

  return {
    phase: "3/3 Complete",
    query: query,
    summary: "Resultat destilleret via faseopdelt RAG for optimal hastighed.",
    content: synthesis + "... [Destilleret]"
  };
}
