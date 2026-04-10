/**
 * Agent Registry Sync Skill
 *
 * Syncs OpenClaw agent definitions with orchestrator's registered agents.
 * Ensures agents defined in OpenClaw match actual orchestrator capabilities.
 *
 * Features:
 * - Fetches registered agents from orchestrator
 * - Compares with local agent registry
 * - Reports discrepancies
 * - Can auto-update agent capabilities
 */

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'https://orchestrator-production-c27e.up.railway.app';
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY || 'WidgeTDC_Orch_2026';

// Local agent definitions (should match orchestrator)
const LOCAL_AGENTS = {
  main: { name: 'Kaptajn Klo', emoji: '🦀', skills: ['all'] },
  orchestrator: { name: 'Dirigenten', emoji: '🎭', skills: ['orchestrator', 'supervisor'] },
  developer: { name: 'Udvikleren', emoji: '💻', skills: ['code', 'git'] },
  writer: { name: 'Skribleren', emoji: '✍️', skills: ['writer', 'docgen'] },
  analyst: { name: 'Analytikeren', emoji: '📊', skills: ['financial', 'rag'] },
  researcher: { name: 'Forskeren', emoji: '🔬', skills: ['osint', 'rag'] },
  security: { name: 'Sikkerhedsvagten', emoji: '🛡️', skills: ['trident', 'cve'] },
  data: { name: 'Data Scientist', emoji: '📈', skills: ['graph', 'rag'] },
  devops: { name: 'DevOps Ninja', emoji: '🚀', skills: ['cicd', 'railway'] },
  qa: { name: 'QA Mesteren', emoji: '🧪', skills: ['testing'] },
  ux: { name: 'UX Designeren', emoji: '🎨', skills: ['design'] },
  pm: { name: 'Projekt Manager', emoji: '📋', skills: ['planning'] },
};

/**
 * Fetch registered agents from orchestrator
 */
async function fetchOrchestratorAgents(): Promise<any[]> {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/agents`, {
      headers: { 'Authorization': `Bearer ${ORCHESTRATOR_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.agents ?? data?.data?.agents ?? data ?? [];
  } catch {
    return [];
  }
}

/**
 * Sync local agents with orchestrator
 */
export async function syncAgentRegistry(): Promise<{
  localAgents: number;
  orchestratorAgents: number;
  missing: string[];
  extra: string[];
  match: boolean;
}> {
  const orchestratorAgents = await fetchOrchestratorAgents();
  const orchestratorIds = new Set(
    orchestratorAgents.map((a: any) => (a.id ?? a.agentId ?? a.name ?? '').toLowerCase())
  );

  const localIds = new Set(Object.keys(LOCAL_AGENTS).map(k => k.toLowerCase()));

  const missing = [...localIds].filter(id => !orchestratorIds.has(id));
  const extra = [...orchestratorIds].filter(id => !localIds.has(id) && id !== '');

  return {
    localAgents: Object.keys(LOCAL_AGENTS).length,
    orchestratorAgents: orchestratorAgents.length,
    missing,
    extra,
    match: missing.length === 0 && extra.length === 0,
  };
}

/**
 * Command handler
 */
export async function agent_sync(action: string = 'status'): Promise<unknown> {
  switch (action?.toLowerCase()) {
    case 'sync':
    case 'run':
    case 'check':
      return syncAgentRegistry();

    case 'list':
      return {
        localAgents: Object.entries(LOCAL_AGENTS).map(([id, info]) => ({
          id,
          name: info.name,
          emoji: info.emoji,
          skills: info.skills,
        })),
        total: Object.keys(LOCAL_AGENTS).length,
      };

    default:
      return {
        help: 'Agent Registry Sync — keep OpenClaw agents in sync with orchestrator 🔄',
        commands: {
          '/agent-sync sync': 'Compare local vs orchestrator agents',
          '/agent-sync list': 'List all defined local agents',
          '/agent-sync status': 'Show sync status',
        },
        localAgents: Object.keys(LOCAL_AGENTS).length,
      };
  }
}
