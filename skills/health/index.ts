import { widgetdc_mcp } from '../widgetdc-mcp/index';

export async function health() {
  const [mcp, rlm] = await Promise.all([
    widgetdc_mcp('system_health'),
    fetch('https://rlm-engine-production.up.railway.app/health')
      .then(r => r.json())
      .catch(() => ({ status: 'unreachable' }))
  ]);
  
  return {
    mcp_backend: mcp,
    rlm_engine: rlm,
    gateway: 'OK'
  };
}
