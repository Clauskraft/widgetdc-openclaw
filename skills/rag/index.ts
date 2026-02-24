import { widgetdc_mcp } from '../widgetdc-mcp/index';

export async function rag(query: string) {
  return await widgetdc_mcp('kg_rag.query', { query });
}
