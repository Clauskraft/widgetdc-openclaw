/**
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
    return `Persona "${persona}" ikke fundet. Prøv: ${suggestions}`;
  }
  return {
    status: `Aktiverer: ${found.act}`,
    instruction: 'Du skal nu handle efter denne prompt indtil sessionen afsluttes:',
    persona_prompt: found.prompt,
  };
}
