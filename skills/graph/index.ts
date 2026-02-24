import { widgetdc_mcp } from '../widgetdc-mcp/index';

export async function graph(action: string = 'stats') {
  if (action === 'stats') {
    return await widgetdc_mcp('graph.stats');
  }
  return `Ukjent handling: ${action}. Bruk 'stats'.`;
}
