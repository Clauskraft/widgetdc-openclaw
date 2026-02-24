/**
 * SCR Framework Skill — McKinsey Situation-Complication-Resolution
 *
 * Struktureret output format for consulting-grade deliverables:
 * - Situation: Current state, context
 * - Complication: Why change is needed
 * - Resolution: Recommended action
 * - Evidence: Supporting data (optional)
 *
 * Based on McKinsey Pyramid Principle and validated Lessons from Neo4j.
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const RLM_URL = process.env.RLM_ENGINE_URL || 'https://rlm-engine-production.up.railway.app';

// ─── Types ────────────────────────────────────────────────────────────────

export interface SCROutput {
  situation: string;
  complication: string;
  resolution: string;
  evidence: Evidence[];
  confidence: number;
  domain?: string;
  generatedAt: string;
}

interface Evidence {
  source: string;
  quote: string;
  confidence: number;
  url?: string;
}

interface SCROptions {
  domain?: string;
  includeEvidence?: boolean;
  maxEvidenceItems?: number;
  reasoningMode?: 'quick' | 'deep' | 'strategic';
}

// ─── Core SCR Generation ──────────────────────────────────────────────────

/**
 * Generate SCR-structured output from a query/topic
 */
export async function generateSCR(
  query: string,
  options: SCROptions = {}
): Promise<SCROutput> {
  const {
    domain,
    includeEvidence = true,
    maxEvidenceItems = 3,
    reasoningMode = 'strategic',
  } = options;

  const generatedAt = new Date().toISOString();

  try {
    // 1. Use RLM Engine for structured reasoning
    const reasoningResult = await fetch(`${RLM_URL}/reason`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: `Analyze the following topic using the McKinsey SCR (Situation-Complication-Resolution) framework. 
               Provide a clear, structured analysis.
               
               Topic: ${query}
               ${domain ? `Domain: ${domain}` : ''}
               
               Format your response as:
               SITUATION: [Current state and context]
               COMPLICATION: [Why change is needed, the problem or challenge]
               RESOLUTION: [Recommended action or solution]`,
        reasoning_mode: reasoningMode,
        output_format: 'structured',
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!reasoningResult.ok) {
      throw new Error(`RLM reasoning failed: ${reasoningResult.status}`);
    }

    const reasoning = await reasoningResult.json() as {
      recommendation?: string;
      reasoning?: string;
      confidence?: number;
    };

    // 2. Parse SCR from reasoning output
    const scr = parseSCRFromText(reasoning.recommendation ?? reasoning.reasoning ?? '');

    // 3. Gather evidence if requested
    let evidence: Evidence[] = [];
    if (includeEvidence) {
      evidence = await gatherEvidence(query, domain, maxEvidenceItems);
    }

    // 4. Store SCR to memory for learning
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'writer',
      content: `[SCR Generated] ${query}: S=${scr.situation.substring(0, 100)}... C=${scr.complication.substring(0, 100)}... R=${scr.resolution.substring(0, 100)}...`,
      type: 'scr_output',
    }).catch(() => {});

    return {
      situation: scr.situation,
      complication: scr.complication,
      resolution: scr.resolution,
      evidence,
      confidence: reasoning.confidence ?? 0.7,
      domain,
      generatedAt,
    };
  } catch (e) {
    // Fallback: Generate basic SCR without RLM
    console.warn(`[scr-framework] RLM failed, using fallback: ${e}`);
    return generateFallbackSCR(query, domain, generatedAt);
  }
}

/**
 * Parse SCR sections from text
 */
function parseSCRFromText(text: string): { situation: string; complication: string; resolution: string } {
  const situationMatch = text.match(/SITUATION:?\s*([\s\S]*?)(?=COMPLICATION:|$)/i);
  const complicationMatch = text.match(/COMPLICATION:?\s*([\s\S]*?)(?=RESOLUTION:|$)/i);
  const resolutionMatch = text.match(/RESOLUTION:?\s*([\s\S]*?)$/i);

  return {
    situation: situationMatch?.[1]?.trim() || 'Current state requires analysis.',
    complication: complicationMatch?.[1]?.trim() || 'Challenges exist that need to be addressed.',
    resolution: resolutionMatch?.[1]?.trim() || 'Recommended actions to be determined.',
  };
}

/**
 * Fallback SCR generation without RLM
 */
async function generateFallbackSCR(
  query: string,
  domain?: string,
  generatedAt?: string
): Promise<SCROutput> {
  // Try to get insights from knowledge graph
  let situation = 'The current state requires detailed analysis.';
  let complication = 'Several challenges and opportunities exist.';
  let resolution = 'A structured approach is recommended.';

  try {
    const insights = await widgetdc_mcp('kg_rag.query', { query }) as {
      answer?: string;
      citations?: { quote: string }[];
    };

    if (insights?.answer && insights.answer !== 'INSUFFICIENT_EVIDENCE') {
      const parts = insights.answer.split('\n\n');
      if (parts.length >= 3) {
        situation = parts[0];
        complication = parts[1];
        resolution = parts[2];
      } else if (parts.length > 0) {
        resolution = insights.answer;
      }
    }
  } catch {
    // Use defaults
  }

  return {
    situation,
    complication,
    resolution,
    evidence: [],
    confidence: 0.5,
    domain,
    generatedAt: generatedAt ?? new Date().toISOString(),
  };
}

/**
 * Gather evidence from knowledge graph
 */
async function gatherEvidence(
  query: string,
  domain?: string,
  limit = 3
): Promise<Evidence[]> {
  try {
    const result = await widgetdc_mcp('kg_rag.query', {
      query,
      domain,
    }) as {
      citations?: { quote: string; sourceUrl?: string; confidence?: number }[];
    };

    return (result?.citations ?? []).slice(0, limit).map(c => ({
      source: c.sourceUrl ?? 'Knowledge Graph',
      quote: c.quote,
      confidence: c.confidence ?? 0.6,
      url: c.sourceUrl,
    }));
  } catch {
    return [];
  }
}

// ─── Formatting Functions ─────────────────────────────────────────────────

/**
 * Format SCR as Markdown
 */
export function formatSCRMarkdown(scr: SCROutput): string {
  let md = `## Situation\n\n${scr.situation}\n\n`;
  md += `## Complication\n\n${scr.complication}\n\n`;
  md += `## Resolution\n\n${scr.resolution}\n\n`;

  if (scr.evidence.length > 0) {
    md += `### Evidence\n\n`;
    for (const ev of scr.evidence) {
      md += `- "${ev.quote}" _(${ev.source}, confidence: ${(ev.confidence * 100).toFixed(0)}%)_\n`;
    }
    md += '\n';
  }

  md += `---\n_Generated: ${scr.generatedAt} | Confidence: ${(scr.confidence * 100).toFixed(0)}%_`;

  return md;
}

/**
 * Format SCR as Slack blocks
 */
export function formatSCRSlack(scr: SCROutput): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 SCR Analysis', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Situation:*\n${scr.situation}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Complication:*\n${scr.complication}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Resolution:*\n${scr.resolution}` },
    },
  ];

  if (scr.evidence.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Evidence:*\n${scr.evidence.map(e => `• "${e.quote.substring(0, 100)}..."`).join('\n')}`,
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `_Confidence: ${(scr.confidence * 100).toFixed(0)}% | ${scr.generatedAt}_` },
    ],
  });

  return blocks;
}

/**
 * Format SCR as executive summary (one paragraph)
 */
export function formatSCRExecutive(scr: SCROutput): string {
  return `${scr.situation} However, ${scr.complication.toLowerCase()} Therefore, ${scr.resolution.toLowerCase()}`;
}

// ─── Batch Processing ─────────────────────────────────────────────────────

/**
 * Generate SCR for multiple topics
 */
export async function batchSCR(
  topics: string[],
  options: SCROptions = {}
): Promise<{ topic: string; scr: SCROutput }[]> {
  const results = await Promise.all(
    topics.map(async topic => ({
      topic,
      scr: await generateSCR(topic, options),
    }))
  );

  return results;
}

// ─── Agent Response Wrapper ───────────────────────────────────────────────

/**
 * Wrap any agent response in SCR format
 */
export async function wrapResponseInSCR(
  agentId: string,
  originalResponse: string,
  context?: string
): Promise<SCROutput> {
  const query = context
    ? `Based on: ${context}\n\nResponse: ${originalResponse}`
    : originalResponse;

  return generateSCR(query, {
    reasoningMode: 'quick',
    includeEvidence: false,
  });
}

// ─── Router ───────────────────────────────────────────────────────────────

export async function scr_framework(action = 'help', ...args: string[]): Promise<unknown> {
  switch (action.toLowerCase().trim()) {
    case 'generate':
    case 'analyze': {
      const query = args.join(' ');
      if (!query) {
        return { error: 'Usage: /scr generate <topic or question>' };
      }
      return generateSCR(query);
    }

    case 'format': {
      const [format, ...queryParts] = args;
      const query = queryParts.join(' ');
      if (!query) {
        return { error: 'Usage: /scr format <markdown|slack|executive> <topic>' };
      }
      const scr = await generateSCR(query);
      switch (format) {
        case 'markdown':
        case 'md':
          return { formatted: formatSCRMarkdown(scr), scr };
        case 'slack':
          return { blocks: formatSCRSlack(scr), scr };
        case 'executive':
        case 'exec':
          return { summary: formatSCRExecutive(scr), scr };
        default:
          return { error: 'Unknown format. Use: markdown, slack, or executive' };
      }
    }

    case 'batch': {
      const topics = args;
      if (topics.length === 0) {
        return { error: 'Usage: /scr batch <topic1> <topic2> ...' };
      }
      return batchSCR(topics);
    }

    case 'wrap': {
      const [agentId, ...responseParts] = args;
      const response = responseParts.join(' ');
      if (!agentId || !response) {
        return { error: 'Usage: /scr wrap <agentId> <response>' };
      }
      return wrapResponseInSCR(agentId, response);
    }

    default:
      return {
        help: 'SCR Framework — McKinsey Pyramid Principle 📊',
        description: 'Situation-Complication-Resolution structured output',
        commands: {
          '/scr generate <topic>': 'Generate SCR analysis',
          '/scr format <type> <topic>': 'Generate and format (markdown/slack/executive)',
          '/scr batch <topics...>': 'Batch generate multiple SCRs',
          '/scr wrap <agentId> <response>': 'Wrap response in SCR format',
        },
        example: {
          input: '/scr generate How to reduce customer churn by 20%',
          output: {
            situation: 'Current churn rate is X%, impacting revenue...',
            complication: 'Competitors offer better retention programs...',
            resolution: 'Implement loyalty program with 3 key initiatives...',
          },
        },
      };
  }
}

export default scr_framework;
