# RLM Engine & Memory System — Utilization Analysis

**Dato:** 2026-02-24 (aften)  
**Fokus:** Udnytter vi RLM Engine kapabiliteter og memory setup tilstrækkeligt?

---

## 1. RLM Engine Kapabiliteter — Hvad Vi Har

### Context Folding Tools (via MCP)

| Tool | Implementeret | Bruges Aktivt |
|------|---------------|---------------|
| `context_folding.fold` | ✅ | ✅ rag-fasedelt, writer |
| `context_folding.triage` | ✅ | ⚠️ Kun i data-pipeline |
| `context_folding.health` | ✅ | ❌ Ikke brugt |
| `context_folding.triage_keywords` | ✅ | ❌ Ikke brugt |
| `context_folding.domain_gaps` | ✅ | ❌ Ikke brugt |
| `supervisor.fold_context` | ✅ | ⚠️ Dokumenteret, ikke implementeret |
| `supervisor.rehydrate` | ✅ | ❌ Ikke brugt |

### RLM Engine Endpoints

| Endpoint | Bruges | Hvor |
|----------|--------|------|
| `/reason` | ✅ | writer/index.ts (kapitelskrivning) |
| `/operations/dreamscape` | ✅ | writer/index.ts (autonom bog) |
| `/cognitive/fold` | ✅ | rag-fasedelt/index.ts |
| `/health` | ✅ | health/index.ts, widgetdc-setup/index.ts |

### Intelligence Events (fra contracts)

```typescript
IntelligenceEventType = 
  'context_folded' |           // ✅ Bruges
  'routing_decision' |         // ⚠️ Ikke eksponeret
  'recommendation_ready' |     // ⚠️ Ikke eksponeret
  'learning_update' |          // ❌ Ikke brugt
  'health_change' |            // ❌ Ikke brugt
  'quality_scored' |           // ❌ Ikke brugt
  'q_learning_updated' |       // ❌ Ikke brugt
  'meta_learning_applied' |    // ❌ Ikke brugt
  'agent_memory_persisted' |   // ⚠️ Delvist (writer)
  'attention_fold_complete' |  // ❌ Ikke brugt
  'circuit_breaker_triggered' | // ❌ Ikke brugt
  'sse_bridge_connected' |     // ❌ Ikke brugt
  'error'                      // ✅ Bruges
```

---

## 2. Memory System — Hvad Vi Har Implementeret

### Memory Tools (fra entrypoint.sh kl. ~23)

```javascript
// Recall (hent hukommelse)
widgetdc_mcp("consulting.agent.memory.recall", { agentId: "main", limit: 20 })

// Store (gem lærdom)
widgetdc_mcp("consulting.agent.memory.store", { 
  agentId: "main", 
  content: "indsigt...", 
  type: "learning" 
})

// CMA interface
widgetdc_mcp("cma.memory.store", { agentId: "...", ... })
widgetdc_mcp("cma.memory.retrieve", { agentId: "...", ... })

// Notes (persistent)
widgetdc_mcp("notes.create", { ... })
widgetdc_mcp("notes.list", { ... })
widgetdc_mcp("notes.get", { ... })
```

### Neo4j Memory Nodes

```cypher
-- AgentMemory (fra main.md)
MATCH (m:AgentMemory) 
WHERE m.agentId = 'main' OR m.type = 'fact' 
RETURN m.key, m.value, m.updatedAt

-- Lessons (teacher/student)
MATCH (l:Lesson) 
RETURN l.title, l.content 
ORDER BY l.createdAt DESC LIMIT 10

-- ContextFold (fra writer)
MERGE (f:ContextFold {bookId: $bookId, createdAt: datetime()})
SET f.summary = $summary, f.agentId = 'skribleren'
```

### Agent Workspace Files (genereret)

| Fil | Formål | Status |
|-----|--------|--------|
| `MEMORY.md` | Memory boot instruktioner | ✅ Alle 12 agenter |
| `BOOTSTRAP.md` | Opstartsrutine | ✅ Alle 12 agenter |
| `HEARTBEAT.md` | Agent checklist | ✅ Alle 12 agenter |
| `SOUL.md` | Agent identitet | ✅ Alle 12 agenter |
| `VISION.md` | Fælles mål | ✅ Alle 12 agenter |

---

## 3. GAP Analyse — Hvad Vi IKKE Udnytter

### 🔴 Kritiske Mangler

1. **Memory Boot køres IKKE automatisk**
   - `MEMORY.md` dokumenterer hvordan, men ingen skill kalder det ved session-start
   - Agenter starter "blank" hver gang

2. **Context Folding bruges kun reaktivt**
   - `rag-fasedelt` folder kun ved >4K tegn
   - Ingen proaktiv folding af lange samtaler
   - `supervisor.fold_context` er dokumenteret men ikke implementeret

3. **Learning Events ignoreres**
   - `learning_update`, `meta_learning_applied` events fra RLM bruges ikke
   - Q-learning feedback loop er ikke koblet

4. **Rehydrate mangler**
   - `supervisor.rehydrate` kan genindlæse agent-state
   - Ikke brugt nogen steder

### 🟡 Delvist Implementeret

1. **Writer bruger Context Folding korrekt**
   - Gemmer `Chapter.summary` + `lastLine` til Neo4j
   - Kan genoptage på tværs af sessioner
   - MEN: Ingen andre skills gør dette

2. **Memory Store bruges i writer**
   - `writerFold()` gemmer til både `ContextFold` og `AgentMemory`
   - MEN: Ingen andre skills gemmer lærdom

3. **Orchestrator har tools men bruger dem ikke**
   - `supervisor.fold_context` er i SKILL.md
   - Ingen implementation i `orchestrator/index.ts`

---

## 4. Anbefalinger — Fuld Udnyttelse

### Implementer Memory Boot Skill

```typescript
// skills/memory-boot/index.ts
export async function memoryBoot(agentId: string) {
  // 1. Hent agent memory
  const memories = await widgetdc_mcp("consulting.agent.memory.recall", {
    agentId, limit: 20
  });
  
  // 2. Hent lessons
  const lessons = await widgetdc_mcp("graph.read_cypher", {
    query: `MATCH (l:Lesson) WHERE l.agentId = $agentId OR l.agentId IS NULL 
            RETURN l.title, l.content ORDER BY l.createdAt DESC LIMIT 10`,
    params: { agentId }
  });
  
  // 3. Hent sidste context fold
  const lastFold = await widgetdc_mcp("graph.read_cypher", {
    query: `MATCH (f:ContextFold {agentId: $agentId}) 
            RETURN f.summary ORDER BY f.createdAt DESC LIMIT 1`,
    params: { agentId }
  });
  
  return { memories, lessons, lastFold, bootedAt: new Date().toISOString() };
}
```

### Implementer Proaktiv Context Folding

```typescript
// I orchestrator/index.ts
async function foldConversation(sessionId: string, messages: string[]) {
  const totalChars = messages.join('').length;
  
  if (totalChars > 8000) {
    const folded = await widgetdc_mcp("supervisor.fold_context", {
      sessionId,
      messages,
      max_tokens: 2048
    });
    
    // Gem til Neo4j for persistence
    await widgetdc_mcp("graph.write_cypher", {
      query: `MERGE (f:ContextFold {sessionId: $sessionId})
              SET f.summary = $summary, f.foldedAt = datetime()`,
      params: { sessionId, summary: folded.summary }
    });
    
    return folded;
  }
  return null;
}
```

### Kobl Learning Events

```typescript
// Lyt til RLM events via SSE
const eventSource = new EventSource(`${RLM_URL}/events/sse`);

eventSource.addEventListener('learning_update', (event) => {
  const data = JSON.parse(event.data);
  // Gem til AgentMemory
  widgetdc_mcp("consulting.agent.memory.store", {
    agentId: data.agentId,
    content: data.insight,
    type: "rlm_learning"
  });
});

eventSource.addEventListener('agent_memory_persisted', (event) => {
  console.log('[memory] Persisted:', event.data);
});
```

### Implementer Rehydrate ved Session Start

```typescript
// I server.js eller gateway hook
async function onSessionStart(agentId: string) {
  // Rehydrate fra sidste session
  const state = await widgetdc_mcp("supervisor.rehydrate", {
    agentId,
    includeMemory: true,
    includeContextFolds: true
  });
  
  return state;
}
```

---

## 5. Prioriteret Handlingsplan

| # | Opgave | Indsats | Impact |
|---|--------|---------|--------|
| 1 | Implementer `memory-boot` skill | 2h | 🔴 Høj |
| 2 | Tilføj auto-fold i orchestrator | 3h | 🔴 Høj |
| 3 | Kobl `supervisor.rehydrate` | 2h | 🟡 Medium |
| 4 | Lyt til RLM learning events | 4h | 🟡 Medium |
| 5 | Tilføj memory store til alle skills | 4h | 🟢 Lav |
| 6 | Implementer `context_folding.domain_gaps` | 2h | 🟢 Lav |

---

## 6. Konklusion

**Udnyttelsesgrad: ~35%**

Vi har infrastrukturen på plads:
- ✅ RLM Engine kører og er tilgængelig
- ✅ Memory tools er eksponeret via MCP
- ✅ Neo4j har de rigtige node labels
- ✅ Writer skill viser korrekt pattern

Men vi mangler:
- ❌ Automatisk memory boot ved session start
- ❌ Proaktiv context folding i lange samtaler
- ❌ Learning event feedback loop
- ❌ Rehydrate ved session genoptagelse
- ❌ Memory store i andre skills end writer

**Næste skridt:** Implementer `memory-boot` skill og kobl det til gateway hooks.

---

*Genereret af OpenClaw Cloud Agent — 2026-02-24*
