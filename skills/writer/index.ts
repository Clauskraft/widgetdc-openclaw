/**
 * Writer Skill for OpenClaw — Skribleren ✍️
 *
 * Langt-format skriveagent med Neo4j Context Folding + RLM Engine reasoning.
 *
 * Arkitektur:
 *   - Gemini 2.5 Flash (1M context) er primær skrivemodel
 *   - RLM Engine (/reason) bruges til langt-format kapitelskrivning:
 *     * Dyb reasoning om struktur, argumentation og konsistens
 *     * Retrieval af graph-evidens via RLM's MCP-bridge
 *     * Kædet reasoning: outline → kapitel → revision
 *   - Neo4j Context Folding: persistent state på tværs af sessioner
 *
 * Book Architecture Protocol (4 faser):
 *   Fase 0: Opret Book-node i grafen som ankerpunkt
 *   Fase 1: Outline — hvert kapitel som Chapter-node
 *   Fase 2: Skriv via RLM Engine (Context Folding + deep reasoning)
 *   Fase 3: Konsistens-check hvert 5. kapitel
 *
 * Context Folding:
 *   - Hvert kapitel gemmes som Chapter.text + Chapter.summary + Chapter.lastLine
 *   - lastLine sikrer seamless continuation på tværs af sessions
 *   - Graf er eneste sandhed — aldrig antag hvad der er skrevet
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

// ─── RLM Engine integration ───────────────────────────────────────────────

const RLM_URL = process.env.RLM_ENGINE_URL || 'https://rlm-engine-production.up.railway.app';

/**
 * Kald RLM Engine /reason for dyb skrive-reasoning.
 * Bruges til kapitelskrivning, outline-generering og konsistens-check.
 */
async function rlmReason(prompt: string, context: Record<string, unknown> = {}, mode = 'deep'): Promise<string> {
  try {
    const res = await fetch(`${RLM_URL}/reason`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
      body: JSON.stringify({
        task: 'writer_task',
        context: { prompt, ...context },
        reasoning_mode: mode,
      }),
      signal: AbortSignal.timeout(120_000), // 2 min timeout for lange tekster
    });
    if (!res.ok) throw new Error(`RLM ${res.status}`);
    const data = await res.json() as { recommendation?: string; reasoning?: string };
    return data.recommendation ?? data.reasoning ?? '(ingen tekst returneret)';
  } catch (e) {
    console.warn(`[writer] RLM Engine unavailable: ${e}. Falling back to prompt-only.`);
    return `[RLM unavailable — skriv tekst baseret på: ${prompt.substring(0, 200)}]`;
  }
}

/**
 * Kald RLM /operations/dreamscape for autonom bog-skrivning.
 * Bruges til at lade RLM Engine selv koordinere kapitel-for-kapitel skrivning.
 */
async function rlmDreamscape(task: string): Promise<unknown> {
  try {
    const res = await fetch(`${RLM_URL}/operations/dreamscape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, reasoning_mode: 'deep' }),
      signal: AbortSignal.timeout(300_000), // 5 min for hel bog-session
    });
    if (!res.ok) throw new Error(`Dreamscape ${res.status}`);
    return res.json();
  } catch (e) {
    return { error: String(e), message: 'RLM Dreamscape ikke tilgængelig' };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────

interface BookNode {
  id: string;
  title: string;
  genre: string;
  totalWords: number;
  targetWords: number;
  status: string;
  updatedAt: string;
}

interface ChapterNode {
  id: string;
  index: number;
  title: string;
  status: string;
  wordCount: number;
  summary?: string;
  lastLine?: string;
}

// ─── Router ───────────────────────────────────────────────────────────────

/**
 * Primær entry point — router baseret på action.
 *
 * @param action - 'new' | 'outline' | 'chapter' | 'status' | 'list' | 'memo' | 'brief'
 * @param args   - Action-specifikke argumenter
 */
export async function writer(action = 'list', ...args: string[]): Promise<unknown> {
  switch (action.toLowerCase().trim()) {
    case 'new':     return writerNew(args[0], args[1]);
    case 'outline': return writerOutline(args[0]);
    case 'chapter': return writerChapterRlm(args[0], parseInt(args[1] ?? '1'));
    case 'write':   return writerChapterRlm(args[0], parseInt(args[1] ?? '1'));
    case 'auto':    return writerAuto(args[0]);
    case 'fold':    return writerFold(args[0], args.slice(1).join(' '));
    case 'status':  return writerStatus(args[0]);
    case 'list':    return writerList();
    case 'memo':    return writerMemo(args.join(' '));
    case 'brief':   return writerBrief(args.join(' '));
    default:
      return {
        help: 'Skribleren — Langt-format skriveagent med RLM + Context Folding',
        commands: {
          '/writer new <titel> [genre]':       'Opret nyt bog-projekt i grafen (Fase 0)',
          '/writer chapter <bookId> <idx>':    'Skriv kapitel via RLM Engine + Context Folding',
          '/writer write <bookId> <idx>':      'Alias for chapter',
          '/writer auto <bookId>':             'Autonom bog-skrivning via RLM Dreamscape',
          '/writer fold <bookId> <summary>':   'Gem context fold til grafen',
          '/writer outline <bookId>':           'Vis eller generer outline',
          '/writer chapter <bookId> <idx>':     'Skriv kapitel N',
          '/writer status <bookId>':            'Fremskridt og ordantal',
          '/writer list':                       'Alle aktive bøger',
          '/writer memo <emne>':                'Kort 1-pager (SCR)',
          '/writer brief <emne>':               'Strategibrief med graph-evidens',
        },
        soul: 'agent-souls/writer.md',
      };
  }
}

// ─── Opret bog ────────────────────────────────────────────────────────────

async function writerNew(title?: string, genre = 'non-fiction'): Promise<unknown> {
  if (!title) {
    return { error: 'Angiv bogens titel: /writer new "Min Bog" [genre]' };
  }

  const bookId = `book_${Date.now()}_${title.toLowerCase().replace(/\s+/g, '_').substring(0, 20)}`;
  const targetWords = {
    'fiction':    80000,
    'non-fiction': 60000,
    'business':   55000,
    'technical':  40000,
    'handbook':   35000,
  }[genre] ?? 60000;

  await widgetdc_mcp('graph.write_cypher', {
    query: `
      MERGE (b:Book {id: $bookId})
      SET b.title        = $title,
          b.genre        = $genre,
          b.targetWords  = $targetWords,
          b.totalWords   = 0,
          b.status       = 'active',
          b.createdAt    = datetime(),
          b.updatedAt    = datetime()
      RETURN b.id AS id
    `,
    params: { bookId, title, genre, targetWords },
  });

  return {
    bookId,
    title,
    genre,
    targetWords,
    message: `📖 Bog oprettet: "${title}" (${genre}, mål: ${targetWords.toLocaleString()} ord). Brug /writer outline ${bookId} for at generere kapitelstruktur.`,
  };
}

// ─── Outline ─────────────────────────────────────────────────────────────

async function writerOutline(bookId?: string): Promise<unknown> {
  if (!bookId) return { error: 'Angiv bookId: /writer outline <bookId>' };

  // Hent eksisterende chapters
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (b:Book {id: $bookId})
      OPTIONAL MATCH (b)-[:HAS_CHAPTER]->(c:Chapter)
      RETURN b.title AS title, b.genre AS genre, b.targetWords AS targetWords,
             collect({
               idx: c.index, title: c.title, status: c.status,
               words: c.wordCount, premise: c.premise
             }) AS chapters
    `,
    params: { bookId },
  });

  const rows = (result as any)?.results ?? (result as any)?.result?.results ?? [];
  if (!rows.length) return { error: `Bog "${bookId}" ikke fundet.` };

  const book = rows[0];
  const chapters = (book.chapters as ChapterNode[])
    .filter(c => c.idx != null)
    .sort((a, b) => a.index - b.index);

  return {
    bookId,
    title:        book.title,
    genre:        book.genre,
    targetWords:  book.targetWords,
    chapterCount: chapters.length,
    chapters,
    tip:          chapters.length === 0
      ? `Ingen kapitler endnu. Brug graph.write_cypher til at tilføje Chapter-noder, eller konfigurer outline via soul: agent-souls/writer.md`
      : `Brug /writer chapter ${bookId} <idx> for at skrive et kapitel.`,
  };
}

// ─── Skriv kapitel ────────────────────────────────────────────────────────

async function writerChapter(bookId?: string, idx = 1): Promise<unknown> {
  if (!bookId) return { error: 'Angiv bookId: /writer chapter <bookId> <idx>' };

  // Load kapitel-brief + forrige kapitels slutning fra grafen
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (b:Book {id: $bookId})-[:HAS_CHAPTER]->(c:Chapter {index: $idx})
      OPTIONAL MATCH (b)-[:HAS_CHAPTER]->(prev:Chapter {index: $prevIdx})
      RETURN b.title AS bookTitle, b.genre AS genre,
             c.id AS chapterId, c.title AS title, c.premise AS premise,
             c.keyPoints AS keyPoints, c.targetWords AS targetWords,
             c.status AS status, c.wordCount AS wordCount,
             prev.summary AS previousSummary, prev.lastLine AS previousLastLine
    `,
    params: { bookId, idx, prevIdx: idx - 1 },
  });

  const rows = (result as any)?.results ?? (result as any)?.result?.results ?? [];
  if (!rows.length) {
    return {
      error: `Kapitel ${idx} ikke fundet i bog "${bookId}".`,
      tip:   'Opret kapitlet som Chapter-node via /graph query eller book outline.',
    };
  }

  const ch = rows[0];

  return {
    action:    'write_chapter',
    bookId,
    chapterId: ch.chapterId,
    index:     idx,
    title:     ch.title,
    premise:   ch.premise,
    keyPoints: ch.keyPoints,
    target:    ch.targetWords ?? 3000,
    context: {
      bookTitle:       ch.bookTitle,
      genre:           ch.genre,
      previousSummary: ch.previousSummary,
      previousLastLine: ch.previousLastLine,
    },
    instructions: [
      `Skriv kapitel ${idx}: "${ch.title}"`,
      `Formål: ${ch.premise ?? 'ikke specificeret'}`,
      `Mål: ~${ch.targetWords ?? 3000} ord`,
      `Genre: ${ch.genre}`,
      ch.previousLastLine ? `Fortsæt fra: "${ch.previousLastLine}"` : 'Første kapitel — start frisk',
      '',
      'Gem kapitlet med /graph query:',
      `MATCH (c:Chapter {id: "${ch.chapterId}"}) SET c.text = "<tekst>", c.wordCount = <n>, c.summary = "<2-3 sætninger>", c.lastLine = "<bogens sidste sætning>", c.status = "done"`,
    ],
  };
}

// ─── Kapitel via RLM + Context Folding ───────────────────────────────────

/**
 * Skriv kapitel via RLM Engine /reason med fuld Context Folding.
 *
 * Flow:
 *   1. Hent kapitel-brief + forrige lastLine fra Neo4j (Context Fold load)
 *   2. Kald RLM Engine /reason med kapitel-kontekst (deep reasoning mode)
 *   3. Gem resultatet til Neo4j (Chapter.text + summary + lastLine)
 *   4. Opdater Book.totalWords
 */
async function writerChapterRlm(bookId?: string, idx = 1): Promise<unknown> {
  if (!bookId) return { error: 'Angiv bookId: /writer chapter <bookId> <idx>' };

  // Step 1: Load kontekst fra graf (Context Fold)
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (b:Book {id: $bookId})-[:HAS_CHAPTER]->(c:Chapter {index: $idx})
      OPTIONAL MATCH (b)-[:HAS_CHAPTER]->(prev:Chapter {index: $prevIdx})
      RETURN b.title AS bookTitle, b.genre AS genre, b.targetWords AS bookTarget,
             c.id AS chapterId, c.title AS title, c.premise AS premise,
             c.keyPoints AS keyPoints, c.targetWords AS targetWords,
             c.status AS status,
             prev.summary AS previousSummary, prev.lastLine AS previousLastLine,
             prev.title AS previousTitle
    `,
    params: { bookId, idx, prevIdx: idx - 1 },
  });

  const rows = (result as any)?.results ?? (result as any)?.result?.results ?? [];
  if (!rows.length) {
    return { error: `Kapitel ${idx} ikke fundet i bog "${bookId}".` };
  }
  const ch = rows[0];

  if (ch.status === 'done') {
    return {
      warning: `Kapitel ${idx} er allerede skrevet (status: done).`,
      chapterId: ch.chapterId,
      tip: `Brug /graph query for at overskrive: MATCH (c:Chapter {id: "${ch.chapterId}"}) SET c.status = 'pending'`,
    };
  }

  // Step 2: Byg RLM-prompt med fuld kontekst
  const continuationLine = ch.previousLastLine
    ? `\nFortsæt direkte fra denne sætning: "${ch.previousLastLine}"`
    : '\nDette er det første kapitel — start bogens åbning.';

  const rlmPrompt = `
Skriv kapitel ${idx} af bogen "${ch.bookTitle}" (genre: ${ch.genre}).

KAPITEL-TITEL: ${ch.title}
FORMÅL: ${ch.premise ?? 'ikke specificeret'}
MÅL: ~${ch.targetWords ?? 3000} ord
NØGLEPUNKTER: ${JSON.stringify(ch.keyPoints ?? [])}

FORRIGE KAPITEL (${ch.previousTitle ?? 'ingen'}):
Slutningen: "${ch.previousSummary ?? 'ingen opsummering'}"
${continuationLine}

INSTRUKTIONER:
- Skriv det fulde kapitel nu (~${ch.targetWords ?? 3000} ord)
- Afslut med en sætning der giver naturlig fortsættelse til næste kapitel
- Output KUN selve kapitel-teksten (ingen meta-kommentarer)
- Brug Situation → Complication → Resolution struktur for non-fiction
- For fiction: følg bogens genre og tone
  `.trim();

  // Step 3: Kald RLM Engine (deep reasoning for langt-format)
  const writtenText = await rlmReason(rlmPrompt, {
    bookId, chapterId: ch.chapterId, chapterIndex: idx,
    genre: ch.genre, targetWords: ch.targetWords ?? 3000,
  }, 'deep');

  // Beregn ordantal og udtræk lastLine
  const wordCount = writtenText.split(/\s+/).filter(w => w.length > 0).length;
  const sentences = writtenText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const lastLine = sentences[sentences.length - 1]?.trim().substring(0, 300) ?? '';
  const summary = writtenText.substring(0, 500).replace(/\n/g, ' ');

  // Step 4: Gem til Neo4j (Context Fold save)
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      MATCH (c:Chapter {id: $chapterId})
      SET c.text      = $text,
          c.wordCount = $wordCount,
          c.summary   = $summary,
          c.lastLine  = $lastLine,
          c.status    = 'done',
          c.updatedAt = datetime()
      WITH c
      MATCH (b:Book)-[:HAS_CHAPTER]->(c)
      SET b.totalWords = b.totalWords + $wordCount,
          b.updatedAt  = datetime()
    `,
    params: { chapterId: ch.chapterId, text: writtenText, wordCount, summary, lastLine },
  });

  return {
    success:    true,
    bookId,
    chapterId:  ch.chapterId,
    chapterIdx: idx,
    title:      ch.title,
    wordCount,
    lastLine,
    preview:    writtenText.substring(0, 500) + '...',
    nextStep:   `Skriv næste kapitel: /writer chapter ${bookId} ${idx + 1}`,
    foldSaved:  true,
  };
}

// ─── Autonom bog-skrivning via RLM Dreamscape ────────────────────────────

/**
 * Kør autonom kapitel-for-kapitel skrivning via RLM Engine Dreamscape.
 * RLM orchestrerer selv hele skriveprocessen via Context Folding.
 */
async function writerAuto(bookId?: string): Promise<unknown> {
  if (!bookId) return { error: 'Angiv bookId: /writer auto <bookId>' };

  // Hent bog-status for at bygge kontekst til RLM
  const status = await writerStatus(bookId) as any;
  if (status.error) return status;

  const task = `
AUTONOMT BOG-SKRIVEPROGRAM — Context Folding Protocol

Bog: "${status.title}" (${status.genre})
Mål: ${status.targetWords} ord total
Status: ${status.doneChapters}/${status.totalChapters} kapitler skrevet (${status.progress})

MISSION:
1. Query Neo4j for alle PLANNED Chapter-noder i bog ${bookId}
2. For hvert uafsluttet kapitel (status != 'done'):
   a. Load forrige kapitel's lastLine fra Neo4j
   b. Skriv kapitlet (~3000 ord)
   c. Gem Chapter.text + summary + lastLine til Neo4j
   d. Opdater Book.totalWords
3. Kør konsistens-check efter hvert 5. kapitel
4. Rapport: ordantal, % completion, eventuelle problemer

Brug graph.read_cypher og graph.write_cypher via MCP.
Gem progress løbende — Context Folding er kritisk for store projekter.
  `.trim();

  const dreamscapeResult = await rlmDreamscape(task);

  return {
    bookId,
    title:            status.title,
    action:           'autonomous_writing',
    rlm_dreamscape:   dreamscapeResult,
    statusBefore:     status,
    tip:              'Tjek fremskridt med: /writer status ' + bookId,
  };
}

// ─── Context Fold manuelt ─────────────────────────────────────────────────

/**
 * Gem en manuel context fold til Neo4j — bruges ved sessionsskift.
 */
async function writerFold(bookId?: string, summary?: string): Promise<unknown> {
  if (!bookId || !summary) {
    return { error: 'Brug: /writer fold <bookId> <hvad du har lært/skrevet>' };
  }

  await widgetdc_mcp('graph.write_cypher', {
    query: `
      MERGE (f:ContextFold {bookId: $bookId, createdAt: datetime()})
      SET f.summary   = $summary,
          f.agentId   = 'skribleren',
          f.updatedAt = datetime()
    `,
    params: { bookId, summary },
  });

  // Gem også som AgentMemory for global tilgængelighed
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      MERGE (m:AgentMemory {agentId: 'skribleren', key: $key})
      SET m.value = $summary, m.type = 'context_fold', m.updatedAt = datetime()
    `,
    params: { key: `fold_${bookId}_${Date.now()}`, summary },
  });

  return {
    success: true,
    bookId,
    summary,
    message: `Context fold gemt til Neo4j. Næste session: /writer status ${bookId} for at se progress.`,
  };
}

// ─── Status ───────────────────────────────────────────────────────────────

async function writerStatus(bookId?: string): Promise<unknown> {
  if (!bookId) return { error: 'Angiv bookId: /writer status <bookId>' };

  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (b:Book {id: $bookId})
      OPTIONAL MATCH (b)-[:HAS_CHAPTER]->(c:Chapter)
      RETURN b.title AS title, b.genre AS genre,
             b.totalWords AS totalWords, b.targetWords AS targetWords,
             b.status AS status,
             count(c) AS totalChapters,
             sum(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END) AS doneChapters,
             sum(c.wordCount) AS countedWords
    `,
    params: { bookId },
  });

  const rows = (result as any)?.results ?? (result as any)?.result?.results ?? [];
  if (!rows.length) return { error: `Bog "${bookId}" ikke fundet.` };

  const b = rows[0];
  const pct = b.targetWords > 0 ? Math.round((b.countedWords / b.targetWords) * 100) : 0;

  return {
    bookId,
    title:          b.title,
    genre:          b.genre,
    status:         b.status,
    totalChapters:  b.totalChapters,
    doneChapters:   b.doneChapters,
    totalWords:     b.countedWords?.toLocaleString() ?? '0',
    targetWords:    b.targetWords?.toLocaleString() ?? '?',
    progress:       `${pct}%`,
    progressBar:    '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10)),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────

async function writerList(): Promise<unknown> {
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (b:Book)
      OPTIONAL MATCH (b)-[:HAS_CHAPTER]->(c:Chapter)
      RETURN b.id AS id, b.title AS title, b.genre AS genre,
             b.status AS status, b.totalWords AS words,
             b.targetWords AS target,
             count(c) AS chapters,
             sum(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END) AS done
      ORDER BY b.updatedAt DESC LIMIT 20
    `,
  });

  const rows = (result as any)?.results ?? (result as any)?.result?.results ?? [];
  return {
    count: rows.length,
    books: rows,
    tip:   rows.length === 0 ? 'Ingen bøger fundet. Start med: /writer new "Bogens Titel" [genre]' : null,
  };
}

// ─── Kort leverancer ─────────────────────────────────────────────────────

async function writerMemo(topic: string): Promise<unknown> {
  if (!topic) return { error: 'Angiv emne: /writer memo <emne>' };

  // Hent graph-evidens for emnet
  const evidence = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (i:Insight)
      WHERE i.title CONTAINS $kw OR i.content CONTAINS $kw
      RETURN i.title AS title, i.content AS content, i.source AS source
      ORDER BY i.confidence DESC LIMIT 5
    `,
    params: { kw: topic.split(' ')[0] },
  }).catch(() => null);

  const rows = (evidence as any)?.results ?? (evidence as any)?.result?.results ?? [];

  return {
    action:   'write_memo',
    topic,
    format:   'SCR (Situation → Complication → Resolution), max 1 side, 5 bullets exec summary',
    evidence: rows.slice(0, 3),
    template: [
      `# ${topic}`,
      '',
      '## Executive Summary',
      '- [Bullet 1]',
      '- [Bullet 2]',
      '- [Bullet 3]',
      '',
      '## Situation',
      '[Hvad er konteksten?]',
      '',
      '## Complication',
      '[Hvad er problemet/udfordringen?]',
      '',
      '## Resolution',
      '[Hvad anbefales?]',
      '',
      '## Næste skridt',
      '| Handling | Ejer | Dato |',
      '|----------|------|------|',
      `| [Action 1] | [Ejer] | [Dato] |`,
    ].join('\n'),
    graphSources: rows.length > 0 ? `${rows.length} graph-evidens noder fundet` : 'Ingen graph-evidens — skriv fra best practice',
  };
}

async function writerBrief(topic: string): Promise<unknown> {
  if (!topic) return { error: 'Angiv emne: /writer brief <emne>' };

  const [insights, domains] = await Promise.allSettled([
    widgetdc_mcp('graph.read_cypher', {
      query: `
        MATCH (i:StrategicInsight)
        WHERE i.title CONTAINS $kw OR i.domain CONTAINS $kw
        RETURN i.title AS title, i.content AS content, i.framework AS framework
        ORDER BY i.confidence DESC LIMIT 6
      `,
      params: { kw: topic.split(' ')[0] },
    }),
    widgetdc_mcp('graph.read_cypher', {
      query: 'MATCH (d:ConsultingDomain) RETURN d.id AS id, d.name AS name ORDER BY d.id',
    }),
  ]);

  const insightRows = insights.status === 'fulfilled'
    ? ((insights.value as any)?.results ?? (insights.value as any)?.result?.results ?? [])
    : [];

  return {
    action:   'write_brief',
    topic,
    format:   'Strategy Brief: Situation → Analyse (Porter/SWOT) → Anbefalinger → Roadmap',
    insights: insightRows.slice(0, 4),
    domains:  domains.status === 'fulfilled'
      ? ((domains.value as any)?.results ?? [])
      : [],
    template: [
      `# Strategibrief: ${topic}`,
      '',
      '## Executive Summary (3 bullets)',
      '- ',
      '',
      '## Situationsanalyse',
      '[Markedsposition, konkurrenter, trends]',
      '',
      '## Strategiske muligheder',
      '| Mulighed | Potentiale | Indsats | Prioritet |',
      '|----------|-----------|---------|-----------|',
      '',
      '## Anbefalinger',
      '1. [Anbefaling 1 — evidens: Graph]',
      '2. [Anbefaling 2]',
      '3. [Anbefaling 3]',
      '',
      '## Roadmap',
      '| Fase | Aktivitet | Tidslinje |',
      '|------|-----------|-----------|',
    ].join('\n'),
  };
}
