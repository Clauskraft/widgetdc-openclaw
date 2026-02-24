/**
 * Persona Memory Skill — Dynamic Agent Identity Evolution
 *
 * Manages agent personas with:
 * - Core identity traits (immutable)
 * - Evolving personality (learned from interactions)
 * - Communication style preferences
 * - Domain expertise tracking
 * - Interaction history influence
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PersonaTrait {
  name: string;
  value: string;
  category: 'core' | 'learned' | 'style' | 'expertise';
  confidence: number;
  learnedFrom?: string;
  updatedAt: string;
}

export interface AgentPersona {
  agentId: string;
  name: string;
  emoji: string;
  description: string;
  traits: PersonaTrait[];
  communicationStyle: {
    formality: 'casual' | 'professional' | 'academic';
    verbosity: 'concise' | 'balanced' | 'detailed';
    tone: 'friendly' | 'neutral' | 'authoritative';
  };
  expertise: {
    domain: string;
    level: 'novice' | 'intermediate' | 'expert' | 'master';
    confidence: number;
  }[];
  interactionCount: number;
  lastEvolution: string;
  version: number;
}

// ─── Default Personas ─────────────────────────────────────────────────────

const DEFAULT_PERSONAS: Record<string, Partial<AgentPersona>> = {
  main: {
    name: 'Kaptajn Klo',
    emoji: '🦀',
    description: 'Den primære AI-assistent — alsidig og hjælpsom',
    communicationStyle: { formality: 'professional', verbosity: 'balanced', tone: 'friendly' },
  },
  orchestrator: {
    name: 'Dirigenten',
    emoji: '🎭',
    description: 'Multi-agent koordinator og workflow manager',
    communicationStyle: { formality: 'professional', verbosity: 'concise', tone: 'authoritative' },
  },
  developer: {
    name: 'Udvikleren',
    emoji: '💻',
    description: 'Kode-ekspert og teknisk problemløser',
    communicationStyle: { formality: 'casual', verbosity: 'detailed', tone: 'neutral' },
  },
  writer: {
    name: 'Skribleren',
    emoji: '✍️',
    description: 'Indholdsproducent og dokumentationsspecialist',
    communicationStyle: { formality: 'professional', verbosity: 'detailed', tone: 'friendly' },
  },
  analyst: {
    name: 'Analytikeren',
    emoji: '📊',
    description: 'Data-analytiker og finansiel ekspert',
    communicationStyle: { formality: 'academic', verbosity: 'balanced', tone: 'neutral' },
  },
  researcher: {
    name: 'Forskeren',
    emoji: '🔬',
    description: 'OSINT-specialist og research-ekspert',
    communicationStyle: { formality: 'academic', verbosity: 'detailed', tone: 'neutral' },
  },
  security: {
    name: 'Sikkerhedsvagten',
    emoji: '🛡️',
    description: 'Cybersikkerhed og CVE-analyse',
    communicationStyle: { formality: 'professional', verbosity: 'concise', tone: 'authoritative' },
  },
  data: {
    name: 'Data Scientist',
    emoji: '📈',
    description: 'Knowledge Graph og RAG-specialist',
    communicationStyle: { formality: 'academic', verbosity: 'balanced', tone: 'neutral' },
  },
  pm: {
    name: 'Projekt Manager',
    emoji: '📋',
    description: 'Projektledelse og planlægning',
    communicationStyle: { formality: 'professional', verbosity: 'concise', tone: 'friendly' },
  },
};

// ─── Core Functions ───────────────────────────────────────────────────────

/**
 * Initialize or load agent persona
 */
export async function loadPersona(agentId: string): Promise<AgentPersona> {
  // Try to load from Neo4j
  try {
    const result = await widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (p:AgentPersona {agentId: $agentId})
        OPTIONAL MATCH (p)-[:HAS_TRAIT]->(t:PersonaTrait)
        OPTIONAL MATCH (p)-[:HAS_EXPERTISE]->(e:Expertise)
        RETURN p, collect(DISTINCT t) AS traits, collect(DISTINCT e) AS expertise
      `,
      params: { agentId },
    }) as { results?: { p: any; traits: any[]; expertise: any[] }[] };

    const row = result?.results?.[0];
    if (row?.p) {
      return {
        agentId,
        name: row.p.name,
        emoji: row.p.emoji,
        description: row.p.description,
        traits: row.traits.map(t => ({
          name: t.name,
          value: t.value,
          category: t.category,
          confidence: t.confidence,
          updatedAt: t.updatedAt,
        })),
        communicationStyle: JSON.parse(row.p.communicationStyle || '{}'),
        expertise: row.expertise.map(e => ({
          domain: e.domain,
          level: e.level,
          confidence: e.confidence,
        })),
        interactionCount: row.p.interactionCount || 0,
        lastEvolution: row.p.lastEvolution,
        version: row.p.version || 1,
      };
    }
  } catch {
    // Continue to create default
  }

  // Create default persona
  const defaults = DEFAULT_PERSONAS[agentId] || DEFAULT_PERSONAS.main;
  const persona: AgentPersona = {
    agentId,
    name: defaults.name ?? agentId,
    emoji: defaults.emoji ?? '🤖',
    description: defaults.description ?? `Agent ${agentId}`,
    traits: [
      { name: 'role', value: agentId, category: 'core', confidence: 1.0, updatedAt: new Date().toISOString() },
    ],
    communicationStyle: defaults.communicationStyle ?? { formality: 'professional', verbosity: 'balanced', tone: 'neutral' },
    expertise: [],
    interactionCount: 0,
    lastEvolution: new Date().toISOString(),
    version: 1,
  };

  // Persist to Neo4j
  await savePersona(persona);

  return persona;
}

/**
 * Save persona to Neo4j
 */
async function savePersona(persona: AgentPersona): Promise<void> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MERGE (p:AgentPersona {agentId: $agentId})
        SET p.name = $name,
            p.emoji = $emoji,
            p.description = $description,
            p.communicationStyle = $communicationStyle,
            p.interactionCount = $interactionCount,
            p.lastEvolution = datetime(),
            p.version = $version
      `,
      params: {
        agentId: persona.agentId,
        name: persona.name,
        emoji: persona.emoji,
        description: persona.description,
        communicationStyle: JSON.stringify(persona.communicationStyle),
        interactionCount: persona.interactionCount,
        version: persona.version,
      },
    });

    // Save traits
    for (const trait of persona.traits) {
      await widgetdc_mcp('graph.write_cypher', {
        query: `
          MATCH (p:AgentPersona {agentId: $agentId})
          MERGE (t:PersonaTrait {agentId: $agentId, name: $name})
          SET t.value = $value, t.category = $category, 
              t.confidence = $confidence, t.updatedAt = datetime()
          MERGE (p)-[:HAS_TRAIT]->(t)
        `,
        params: {
          agentId: persona.agentId,
          name: trait.name,
          value: trait.value,
          category: trait.category,
          confidence: trait.confidence,
        },
      });
    }

    // Save expertise
    for (const exp of persona.expertise) {
      await widgetdc_mcp('graph.write_cypher', {
        query: `
          MATCH (p:AgentPersona {agentId: $agentId})
          MERGE (e:Expertise {agentId: $agentId, domain: $domain})
          SET e.level = $level, e.confidence = $confidence, e.updatedAt = datetime()
          MERGE (p)-[:HAS_EXPERTISE]->(e)
        `,
        params: {
          agentId: persona.agentId,
          domain: exp.domain,
          level: exp.level,
          confidence: exp.confidence,
        },
      });
    }
  } catch (e) {
    console.warn(`[persona-memory] Failed to save persona: ${e}`);
  }
}

/**
 * Evolve persona based on interaction
 */
export async function evolvePersona(
  agentId: string,
  interaction: {
    type: 'success' | 'failure' | 'feedback';
    domain?: string;
    trait?: string;
    value?: string;
    context?: string;
  }
): Promise<{ evolved: boolean; changes: string[] }> {
  const persona = await loadPersona(agentId);
  const changes: string[] = [];

  // Increment interaction count
  persona.interactionCount += 1;

  // Evolve based on interaction type
  if (interaction.type === 'success' && interaction.domain) {
    // Increase expertise confidence in domain
    const existing = persona.expertise.find(e => e.domain === interaction.domain);
    if (existing) {
      existing.confidence = Math.min(1.0, existing.confidence + 0.05);
      if (existing.confidence > 0.8 && existing.level !== 'master') {
        existing.level = 'expert';
        changes.push(`Expertise in ${interaction.domain} upgraded to expert`);
      }
    } else {
      persona.expertise.push({
        domain: interaction.domain,
        level: 'intermediate',
        confidence: 0.6,
      });
      changes.push(`New expertise added: ${interaction.domain}`);
    }
  }

  if (interaction.type === 'feedback' && interaction.trait && interaction.value) {
    // Learn new trait from feedback
    const existingTrait = persona.traits.find(t => t.name === interaction.trait);
    if (existingTrait) {
      existingTrait.value = interaction.value;
      existingTrait.confidence = Math.min(1.0, existingTrait.confidence + 0.1);
      changes.push(`Trait ${interaction.trait} updated to ${interaction.value}`);
    } else {
      persona.traits.push({
        name: interaction.trait,
        value: interaction.value,
        category: 'learned',
        confidence: 0.6,
        learnedFrom: interaction.context,
        updatedAt: new Date().toISOString(),
      });
      changes.push(`New trait learned: ${interaction.trait}`);
    }
  }

  // Update version and save
  if (changes.length > 0) {
    persona.version += 1;
    persona.lastEvolution = new Date().toISOString();
    await savePersona(persona);
  }

  return { evolved: changes.length > 0, changes };
}

/**
 * Get persona summary for context injection
 */
export async function getPersonaSummary(agentId: string): Promise<string> {
  const persona = await loadPersona(agentId);

  const expertiseStr = persona.expertise
    .filter(e => e.confidence > 0.5)
    .map(e => `${e.domain} (${e.level})`)
    .join(', ');

  const traitsStr = persona.traits
    .filter(t => t.category === 'learned' && t.confidence > 0.5)
    .map(t => `${t.name}: ${t.value}`)
    .join(', ');

  return `${persona.emoji} ${persona.name}: ${persona.description}
Style: ${persona.communicationStyle.formality}, ${persona.communicationStyle.verbosity}, ${persona.communicationStyle.tone}
${expertiseStr ? `Expertise: ${expertiseStr}` : ''}
${traitsStr ? `Learned traits: ${traitsStr}` : ''}
Interactions: ${persona.interactionCount} | Version: ${persona.version}`;
}

/**
 * Update communication style
 */
export async function updateStyle(
  agentId: string,
  style: Partial<AgentPersona['communicationStyle']>
): Promise<{ success: boolean }> {
  const persona = await loadPersona(agentId);
  persona.communicationStyle = { ...persona.communicationStyle, ...style };
  persona.version += 1;
  await savePersona(persona);
  return { success: true };
}

/**
 * Add expertise to agent
 */
export async function addExpertise(
  agentId: string,
  domain: string,
  level: AgentPersona['expertise'][0]['level'] = 'intermediate'
): Promise<{ success: boolean }> {
  const persona = await loadPersona(agentId);
  const existing = persona.expertise.find(e => e.domain === domain);
  
  if (existing) {
    existing.level = level;
    existing.confidence = Math.min(1.0, existing.confidence + 0.1);
  } else {
    persona.expertise.push({ domain, level, confidence: 0.7 });
  }
  
  persona.version += 1;
  await savePersona(persona);
  return { success: true };
}

// ─── Router ───────────────────────────────────────────────────────────────

export async function persona_memory(action = 'help', ...args: string[]): Promise<unknown> {
  switch (action.toLowerCase().trim()) {
    case 'load':
    case 'get': {
      const agentId = args[0] || 'main';
      return loadPersona(agentId);
    }

    case 'summary': {
      const agentId = args[0] || 'main';
      return { summary: await getPersonaSummary(agentId) };
    }

    case 'evolve': {
      const [agentId, type, domain] = args;
      if (!agentId || !type) {
        return { error: 'Usage: /persona evolve <agentId> <success|failure|feedback> [domain]' };
      }
      return evolvePersona(agentId, {
        type: type as 'success' | 'failure' | 'feedback',
        domain,
      });
    }

    case 'style': {
      const [agentId, formality, verbosity, tone] = args;
      if (!agentId) {
        return { error: 'Usage: /persona style <agentId> [formality] [verbosity] [tone]' };
      }
      const style: Partial<AgentPersona['communicationStyle']> = {};
      if (formality) style.formality = formality as any;
      if (verbosity) style.verbosity = verbosity as any;
      if (tone) style.tone = tone as any;
      return updateStyle(agentId, style);
    }

    case 'expertise': {
      const [agentId, domain, level] = args;
      if (!agentId || !domain) {
        return { error: 'Usage: /persona expertise <agentId> <domain> [level]' };
      }
      return addExpertise(agentId, domain, level as any);
    }

    case 'list': {
      const result = await widgetdc_mcp('graph.read_cypher', {
        query: `
          MATCH (p:AgentPersona)
          RETURN p.agentId AS id, p.name AS name, p.emoji AS emoji,
                 p.interactionCount AS interactions, p.version AS version
          ORDER BY p.interactionCount DESC
        `,
      });
      return result;
    }

    default:
      return {
        help: 'Persona Memory — Dynamic Agent Identity 🎭',
        description: 'Manage evolving agent personas',
        commands: {
          '/persona load [agentId]': 'Load agent persona',
          '/persona summary [agentId]': 'Get persona summary for context',
          '/persona evolve <agentId> <type> [domain]': 'Evolve from interaction',
          '/persona style <agentId> [formality] [verbosity] [tone]': 'Update communication style',
          '/persona expertise <agentId> <domain> [level]': 'Add expertise',
          '/persona list': 'List all personas',
        },
        agents: Object.keys(DEFAULT_PERSONAS),
        styleOptions: {
          formality: ['casual', 'professional', 'academic'],
          verbosity: ['concise', 'balanced', 'detailed'],
          tone: ['friendly', 'neutral', 'authoritative'],
        },
      };
  }
}

export default persona_memory;
