import { widgetdc_mcp } from '../widgetdc-mcp/index';

const PROMPTS_URL = 'https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv';

interface PromptEntry {
  act: string;
  prompt: string;
}

let cachedPrompts: PromptEntry[] | null = null;

async function fetchPrompts(): Promise<PromptEntry[]> {
  if (cachedPrompts) return cachedPrompts;
  
  const res = await fetch(PROMPTS_URL);
  const text = await res.text();
  
  // Enkel CSV parser (håndterer ikke alle edge cases, men virker for de fleste awesome-prompts)
  const lines = text.split('\n').slice(1); // Skip header
  cachedPrompts = lines.map(line => {
    // CSV'en bruger " for at indkapsle felter med kommaer
    const match = line.match(/^"([^"]+)"\s*,\s*"([^"]+)"/);
    if (match) {
      return { act: match[1], prompt: match[2].replace(/""/g, '"') };
    }
    // Fallback til simpelt split hvis ingen quotes
    const [act, ...rest] = line.split(',');
    return { act: act?.trim(), prompt: rest.join(',').trim() };
  }).filter(p => p.act && p.prompt);
  
  return cachedPrompts;
}

/**
 * Ændrer agentens adfærd til en specifik persona fra awesome-prompts biblioteket.
 * Brug: /act account
 */
export async function act(persona: string) {
  const prompts = await fetchPrompts();
  const found = prompts.find(p => p.act.toLowerCase().includes(persona.toLowerCase()));
  
  if (!found) {
    const suggestions = prompts
      .filter(p => p.act.toLowerCase().includes(persona.substring(0, 3).toLowerCase()))
      .slice(0, 5)
      .map(p => p.act)
      .join(', ');
      
    return `Kunne ikke finde persona: "${persona}". Prøv f.eks.: ${suggestions}`;
  }
  
  return {
    status: `Aktiverer persona: ${found.act}`,
    instruction: "Du skal nu handle efter denne prompt indtil sessionen afsluttes eller en ny persona vælges:",
    persona_prompt: found.prompt
  };
}
