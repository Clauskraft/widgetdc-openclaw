/**
 * Cursor Sync Skill — Generate Cursor rules and skills for WidgeTDC projects
 *
 * Produces .cursor/rules and RULE.md content from:
 * - Agent identities (Kaptajn Klo, Graf-Oktopus, etc.)
 * - Graph personas
 * - Consulting domains
 * - MCP tool namespaces
 *
 * Use with: /cursor-sync rules | /cursor-sync skill <name>
 */

const BACKEND = process.env.WIDGETDC_BACKEND_URL || 'https://backend-production-d3da.up.railway.app';

const AGENT_IDENTITIES = [
  { id: 'main', name: 'Kaptajn Klo', emoji: '🦞', role: 'Primær AI-konsulent og orkestrator' },
  { id: 'github', name: 'Repo Sherif', emoji: '🤠', role: 'GitHub & CI/CD vagt' },
  { id: 'data', name: 'Graf-Oktopus', emoji: '🐙', role: 'Knowledge graph vogter' },
  { id: 'infra', name: 'Jernfod', emoji: '🦾', role: 'Infrastruktur monitor' },
  { id: 'strategist', name: 'Stor-Bjoern', emoji: '🐻', role: 'Strategisk synthesizer' },
  { id: 'security', name: 'Cyber-Vipera', emoji: '🐍', role: 'CVE & Threat Intelligence' },
  { id: 'analyst', name: 'Tal-Trold', emoji: '📊', role: 'Financial analyst' },
  { id: 'coder', name: 'Kodehaj', emoji: '🦈', role: 'Code analysis' },
  { id: 'orchestrator', name: 'Dirigenten', emoji: '🎼', role: 'Multi-agent orchestrator' },
  { id: 'documentalist', name: 'Arkivar-Rex', emoji: '📚', role: 'Document generation' },
  { id: 'harvester', name: 'Stovsugeren', emoji: '🌀', role: 'Data ingestion' },
  { id: 'contracts', name: 'Kontrakt-Karen', emoji: '📋', role: 'Contracts ekspert' },
];

const MCP_NAMESPACES = [
  'graph', 'consulting', 'knowledge', 'kg_rag', 'context_folding',
  'agent.task', 'supervisor', 'git', 'docgen', 'trident', 'osint',
  'cve', 'prometheus', 'financial', 'integration',
];

export async function generateRules(): Promise<string> {
  const lines: string[] = [
    '# WidgeTDC Cursor Rules — Auto-generated from OpenClaw',
    '',
    '## Agent Team Context',
    '',
    ...AGENT_IDENTITIES.map(
      (a) => `- **${a.emoji} ${a.name}** (${a.id}): ${a.role}`
    ),
    '',
    '## MCP Tool Namespaces',
    '',
    MCP_NAMESPACES.map((n) => `- \`${n}.*\``).join('\n'),
    '',
    '## Conventions',
    '- Backend: https://backend-production-d3da.up.railway.app',
    '- RLM Engine: https://rlm-engine-production.up.railway.app',
    '- Neo4j: 165K+ nodes, 883K+ relationships',
    '- Use graph.read_cypher for Neo4j queries',
    '- Use kg_rag.query for semantic RAG',
    '- Use context_folding.fold for large context compression',
    '',
  ];
  return lines.join('\n');
}

export async function generateSkillPrompt(skillName: string): Promise<string> {
  const agent = AGENT_IDENTITIES.find((a) => a.id === skillName);
  if (agent) {
    return `# ${agent.emoji} ${agent.name} — Cursor Skill

Når du arbejder som ${agent.name} i WidgeTDC-miljøet:

## Rolle
${agent.role}

## Adfærd
- Evidensbaseret: altid citer kilde fra graph eller skill output
- Præcis: aldrig estimer uden datagrundlag
- Proaktiv: monitorér og alert ved afvigelser

## Relevante tools
- widgetdc_mcp("graph.read_cypher", ...)
- widgetdc_mcp("kg_rag.query", ...)
- widgetdc_mcp("context_folding.fold", ...)
`;
  }
  return `# ${skillName} — Cursor Skill\n\nIngen specifik agent matchet. Brug generelle WidgeTDC-regler.`;
}

export async function cursorSync(mode: 'rules' | 'skill', skillName?: string): Promise<string> {
  if (mode === 'rules') return generateRules();
  return generateSkillPrompt(skillName || 'main');
}
