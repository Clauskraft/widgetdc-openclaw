import { widgetdc_mcp } from '../widgetdc-mcp/index';

/**
 * QMD (Grounded Model Distillation) logic.
 * Optimizes token usage by performing a RAG query and taking only the top-k results
 * with a strict character limit.
 */
export async function qmd(query: string) {
  const result = await widgetdc_mcp('kg_rag.query', { query });
  
  if (typeof result === 'string') {
    return result.substring(0, 5000) + '... [QMD Truncated for token optimization]';
  }
  
  // If result is an object/array, we try to stringify and truncate
  const str = JSON.stringify(result);
  return str.substring(0, 4000) + '... [QMD Truncated]';
}
