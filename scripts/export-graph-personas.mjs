/**
 * Export top 50 personas, skills, prompts from WidgeTDC Neo4j graph
 * Run: node scripts/export-graph-personas.mjs
 * Output: skills/widgetdc-personas/personas.json + SKILL.md
 */
const BACKEND = 'https://backend-production-d3da.up.railway.app';

async function mcp(tool, payload) {
  const res = await fetch(`${BACKEND}/api/mcp/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, payload }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`MCP ${tool}: ${res.status}`);
  return res.json();
}

function extractRows(data) {
  const r = data?.results ?? data?.result?.results ?? data;
  return Array.isArray(r) ? r : [];
}

async function main() {
  console.log('Querying WidgeTDC graph for personas, skills, prompts...\n');

  const queries = [
    {
      name: 'ConsultingSkill',
      q: `MATCH (sk:ConsultingSkill) WHERE sk.name IS NOT NULL
           RETURN sk.name AS act, sk.category AS category, sk.level AS level,
                  coalesce(sk.domains, []) AS domains
           ORDER BY sk.name LIMIT 20`,
      toPrompt: (r) =>
        `Du er en ${r.level || 'ekspert'}-niveau konsulent inden for ${r.category || 'consulting'}. ` +
        (r.domains?.length ? `Domæner: ${r.domains.join(', ')}. ` : '') +
        `Brug McKinsey/BCG-metoder. Evidensbaseret, præcis, struktureret.`,
    },
    {
      name: 'StrategicInsight',
      q: `MATCH (si:StrategicInsight)
           WHERE (si.title IS NOT NULL OR si.content IS NOT NULL OR si.question IS NOT NULL OR si.insight IS NOT NULL)
           WITH si,
                coalesce(si.title, si.question, si.insight, substring(toString(coalesce(si.content, '')), 0, 60)) AS act,
                coalesce(si.content, si.insight, si.description, si.title, si.question) AS insight
           RETURN act, insight, si.domain AS domain
           ORDER BY act LIMIT 15`,
      toPrompt: (r) =>
        `Strategisk indsigt: ${(r.insight || r.act)?.slice(0, 400)}. ` +
        (r.domain ? `Domæne: ${r.domain}. ` : '') +
        `Anvend denne ramme i dine analyser.`,
    },
    {
      name: 'Lesson',
      q: `MATCH (l:Lesson) WHERE l.content IS NOT NULL AND size(l.content) > 20
           RETURN l.title AS act, l.content AS content
           ORDER BY l.createdAt DESC LIMIT 10`,
      toPrompt: (r) =>
        `Lærdom fra tidligere projekter: ${(r.content || r.act)?.slice(0, 350)}. ` +
        `Undgå tidligere fejl. Brug denne viden i dine svar.`,
    },
    {
      name: 'Directive',
      q: `MATCH (d:Directive) WHERE d.content IS NOT NULL AND size(d.content) > 30
           RETURN d.type AS type, d.content AS content
           ORDER BY d.priority DESC LIMIT 10`,
      toPrompt: (r) =>
        `Direktiv (${r.type || 'standard'}): ${(r.content || '')?.slice(0, 350)}. ` +
        `Følg denne retningslinje i dine analyser.`,
      toAct: (r, i) => `directive-${r.type || 'gen'}-${i}`,
    },
    {
      name: 'Insight',
      q: `MATCH (i:Insight) WHERE i.content IS NOT NULL AND size(i.content) > 40
           RETURN i.type AS type, i.content AS content
           ORDER BY i.importance DESC LIMIT 10`,
      toPrompt: (r) =>
        `Indsigt (${r.type || 'general'}): ${(r.content || '')?.slice(0, 350)}. ` +
        `Brug denne viden i konsulentarbejdet.`,
      toAct: (r, i) => `insight-${r.type || 'gen'}-${i}`,
    },
    {
      name: 'L1ProcessFlow',
      q: `MATCH (l1:L1ProcessFlow) WHERE l1.name IS NOT NULL
           RETURN l1.name AS act, l1.domain AS domain, l1.description AS desc
           ORDER BY l1.name LIMIT 12`,
      toPrompt: (r) =>
        `Du arbejder med L1-proces: ${r.act}. ` +
        (r.domain ? `Domæne: ${r.domain}. ` : '') +
        (r.desc ? `${String(r.desc).slice(0, 250)}. ` : '') +
        `Brug McKinsey-procesrammer. Evidensbaseret, struktureret.`,
    },
    {
      name: 'ConsultingDomain',
      q: `MATCH (d:ConsultingDomain) WHERE d.name IS NOT NULL OR d.id IS NOT NULL
           RETURN coalesce(d.name, d.id) AS act, d.description AS desc
           ORDER BY act LIMIT 10`,
      toPrompt: (r) =>
        `Du er konsulent inden for domænet: ${r.act}. ` +
        (r.desc ? `${String(r.desc).slice(0, 300)}. ` : '') +
        `Brug domænespecifikke rammer. McKinsey/BCG-metoder.`,
    },
  ];

  const all = [];
  for (const { name, q, toPrompt, toAct } of queries) {
    try {
      const data = await mcp('graph.read_cypher', { query: q });
      const rows = extractRows(data);
      console.log(`${name}: ${rows.length} rows`);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const act = toAct ? toAct(r, i) : (r.act || r.name || `${name}-${i}`).toString().slice(0, 64);
        const prompt = toPrompt(r);
        all.push({ act, prompt, source: name });
      }
    } catch (e) {
      console.warn(`${name}: ${e.message}`);
    }
  }

  // Dedupe by act, take top 75 (expanded for richer personas)
  const seen = new Set();
  const top50 = all.filter((p) => {
    const k = p.act.toLowerCase().replace(/\s+/g, '-');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 75);

  console.log(`\nTotal: ${top50.length} personas for OpenClaw\n`);

  // Write personas.json (act skill format)
  const fs = await import('fs/promises');
  const path = await import('path');
  const outDir = path.join(process.cwd(), 'skills', 'widgetdc-personas');
  await fs.mkdir(outDir, { recursive: true });

  const personasJson = top50.map(({ act, prompt }) => ({ act, prompt }));
  await fs.writeFile(
    path.join(outDir, 'personas.json'),
    JSON.stringify(personasJson, null, 2),
    'utf8'
  );

  // Write SKILL.md
  const skillMd = `---
name: widgetdc-personas
description: "WidgeTDC Knowledge Graph personas — ${top50.length} consulting skills, insights, lessons og directives fra Neo4j. Brug /act <navn> for at aktivere."
user-invocable: true
metadata: {"openclaw": {"emoji": "📊", "primaryEnv": "WIDGETDC_BACKEND_URL"}}
---

# WidgeTDC Graph Personas

${top50.length} personas eksporteret fra Neo4j Knowledge Graph.

## Kommandoer

- \`/act <persona>\` — Aktivér persona (fx /act strategy, /act directive-gen-0)
- \`/widgetdc-personas list\` — Vis alle tilgængelige personas

## Kilder

| Kilde | Antal |
|-------|-------|
${[...new Set(top50.map((p) => p.source))].map((s) => `| ${s} | ${top50.filter((p) => p.source === s).length} |`).join('\n')}

## Eksempler

${top50.slice(0, 10).map((p) => `- **${p.act}** — ${p.prompt.slice(0, 80)}...`).join('\n')}
`;

  await fs.writeFile(path.join(outDir, 'SKILL.md'), skillMd, 'utf8');

  // Write index.ts
  const indexTs = `/**
 * WidgeTDC Graph Personas — Loaded from personas.json (exported from Neo4j)
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const personas = JSON.parse(readFileSync(join(__dirname, 'personas.json'), 'utf8'));

export function list() {
  return personas.map((p) => p.act);
}

export async function act(persona: string) {
  const found = personas.find(
    (p) => p.act.toLowerCase().includes(persona.toLowerCase())
  );
  if (!found) {
    const suggestions = personas
      .filter((p) => p.act.toLowerCase().includes(persona.slice(0, 3).toLowerCase()))
      .slice(0, 5)
      .map((p) => p.act)
      .join(', ');
    return \`Persona "\${persona}" ikke fundet. Prøv: \${suggestions}\`;
  }
  return {
    status: \`Aktiverer: \${found.act}\`,
    instruction: 'Du skal nu handle efter denne prompt indtil sessionen afsluttes:',
    persona_prompt: found.prompt,
  };
}
`;

  await fs.writeFile(path.join(outDir, 'index.ts'), indexTs, 'utf8');

  console.log(`Written to skills/widgetdc-personas/`);
  console.log('  - personas.json');
  console.log('  - SKILL.md');
  console.log('  - index.ts');
}

main().catch(console.error);
