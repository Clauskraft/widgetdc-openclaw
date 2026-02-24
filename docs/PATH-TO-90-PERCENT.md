# Path to 90%+ RLM Engine & Memory Utilization

**Nuværende:** ~70%  
**Mål:** 90%+

---

## Gap Analyse — Hvad Mangler

### 1. Context Folding Tools (Mangler 3 af 5)

| Tool | Status | Hvad der mangler |
|------|--------|------------------|
| `context_folding.fold` | ✅ 100% | Bruges i rag-fasedelt, writer, orchestrator |
| `context_folding.triage` | ⚠️ 30% | Kun i data-pipeline, mangler i RAG discovery |
| `context_folding.health` | ❌ 0% | Ikke brugt — bør integreres i health skill |
| `context_folding.triage_keywords` | ❌ 0% | Ikke brugt — bør bruges til domain detection |
| `context_folding.domain_gaps` | ❌ 0% | Ikke brugt — bør bruges til knowledge gap analysis |

### 2. Intelligence Events (Mangler 8 af 12)

| Event | Status | Hvad der mangler |
|-------|--------|------------------|
| `context_folded` | ✅ | Logges implicit |
| `error` | ✅ | Håndteres |
| `agent_memory_persisted` | ⚠️ | Kun i writer |
| `routing_decision` | ❌ | Ikke eksponeret fra RLM |
| `recommendation_ready` | ❌ | Ikke eksponeret fra RLM |
| `learning_update` | ❌ | **KRITISK** — Q-learning feedback mangler |
| `health_change` | ❌ | Bør trigge alerts |
| `quality_scored` | ❌ | Bør logges til memory |
| `q_learning_updated` | ❌ | **KRITISK** — Feedback loop mangler |
| `meta_learning_applied` | ❌ | Bør logges |
| `attention_fold_complete` | ❌ | Bør trigge memory save |
| `circuit_breaker_triggered` | ❌ | Bør trigge alert |

### 3. Memory System (Mangler auto-hooks)

| Feature | Status | Hvad der mangler |
|---------|--------|------------------|
| Memory recall | ✅ | memory-boot skill |
| Memory store | ⚠️ | Kun i 3 skills (health, rag, writer) |
| Auto-boot on session | ❌ | **KRITISK** — Ingen hook i gateway |
| Cross-agent learning | ❌ | Lessons deles ikke automatisk |
| Memory cleanup/TTL | ❌ | Ingen garbage collection |

### 4. Session Management (Mangler persistence)

| Feature | Status | Hvad der mangler |
|---------|--------|------------------|
| Session create | ✅ | orchestrator.persistSession |
| Session rehydrate | ✅ | orchestrator.rehydrateSession |
| Auto-persist on idle | ❌ | Ingen hook |
| Auto-rehydrate on resume | ❌ | Ingen hook i gateway |

---

## Implementeringsplan for 90%+

### Fase 1: RLM Event Listener (→ +10%)

Opret `skills/rlm-events/index.ts`:

```typescript
/**
 * RLM Event Listener — Lyt til Intelligence Events via SSE
 * 
 * Kobler RLM Engine's real-time events til:
 * - Memory persistence (learning_update, quality_scored)
 * - Alerts (health_change, circuit_breaker_triggered)
 * - Logging (all events)
 */

const RLM_URL = process.env.RLM_ENGINE_URL || 'https://rlm-engine-production.up.railway.app';

interface IntelligenceEvent {
  type: string;
  payload: Record<string, unknown>;
  trace_id?: string;
  timestamp: string;
}

export async function startEventListener(): Promise<void> {
  const eventSource = new EventSource(`${RLM_URL}/events/sse`);

  eventSource.addEventListener('learning_update', async (event) => {
    const data: IntelligenceEvent = JSON.parse(event.data);
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: data.payload.agentId ?? 'rlm',
      content: JSON.stringify(data.payload),
      type: 'rlm_learning',
    });
  });

  eventSource.addEventListener('q_learning_updated', async (event) => {
    const data: IntelligenceEvent = JSON.parse(event.data);
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (q:QLearningEvent {
          timestamp: datetime(),
          agentId: $agentId,
          reward: $reward,
          action: $action
        })
      `,
      params: data.payload,
    });
  });

  eventSource.addEventListener('health_change', async (event) => {
    const data: IntelligenceEvent = JSON.parse(event.data);
    if (data.payload.status === 'degraded') {
      // Trigger alert via slack-bridge
      await widgetdc_mcp('slack.alert', {
        channel: '#alerts',
        message: `RLM Health: ${JSON.stringify(data.payload)}`,
      });
    }
  });

  eventSource.addEventListener('circuit_breaker_triggered', async (event) => {
    const data: IntelligenceEvent = JSON.parse(event.data);
    await widgetdc_mcp('consulting.agent.memory.store', {
      agentId: 'system',
      content: `Circuit breaker: ${data.payload.reason}`,
      type: 'circuit_breaker',
    });
  });
}
```

### Fase 2: Gateway Hooks (→ +8%)

Tilføj til `src/server.js`:

```javascript
// Auto memory-boot on session start
app.use(async (req, res, next) => {
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;
  const agentId = req.headers['x-agent-id'] || 'main';
  
  if (sessionId && !sessionCache.has(sessionId)) {
    // First request in session — run memory boot
    try {
      await runCmd(OPENCLAW_NODE, clawArgs([
        'skill', 'run', 'memory-boot', agentId
      ]));
      sessionCache.set(sessionId, { bootedAt: Date.now() });
    } catch (e) {
      console.warn(`[auto-boot] failed: ${e}`);
    }
  }
  next();
});

// Auto-persist on idle (5 min)
setInterval(async () => {
  for (const [sessionId, data] of sessionCache) {
    if (Date.now() - data.lastActivity > 300_000) {
      await runCmd(OPENCLAW_NODE, clawArgs([
        'skill', 'run', 'orchestrator', 'persist', sessionId
      ]));
    }
  }
}, 60_000);
```

### Fase 3: Context Folding Tools (→ +6%)

Tilføj til `skills/rag-fasedelt/index.ts`:

```typescript
// Brug triage_keywords for bedre domain detection
async function discover(query: string): Promise<Phase1Result> {
  // Kald context_folding.triage_keywords for intelligent keyword extraction
  const keywords = await widgetdc_mcp('context_folding.triage_keywords', {
    content: query,
    max_keywords: 5,
  });
  
  // Brug keywords til domain mapping
  // ...
}

// Brug domain_gaps for knowledge gap analysis
async function analyzeGaps(query: string, results: unknown[]): Promise<string[]> {
  const gaps = await widgetdc_mcp('context_folding.domain_gaps', {
    query,
    retrieved_content: results,
  });
  return gaps?.gaps ?? [];
}
```

Tilføj til `skills/health/index.ts`:

```typescript
// Brug context_folding.health for RLM-specifik health
export async function health(mode = 'full'): Promise<unknown> {
  // ... existing code ...
  
  // Tilføj RLM context folding health
  const foldingHealth = await widgetdc_mcp('context_folding.health')
    .catch(() => null);
  
  return {
    // ... existing ...
    context_folding: foldingHealth,
  };
}
```

### Fase 4: Cross-Agent Learning (→ +6%)

Tilføj til `skills/memory-boot/index.ts`:

```typescript
/**
 * Distribuer lessons til alle agenter
 */
export async function distributeLesson(lesson: Lesson): Promise<void> {
  const agents = [
    'main', 'github', 'data', 'infra', 'strategist', 'security',
    'analyst', 'coder', 'orchestrator', 'documentalist', 'harvester', 'contracts'
  ];
  
  await Promise.all(agents.map(agentId =>
    widgetdc_mcp('consulting.agent.memory.store', {
      agentId,
      content: `[Lesson from ${lesson.source}] ${lesson.content}`,
      type: 'shared_lesson',
    })
  ));
}

/**
 * Memory cleanup — fjern gamle memories
 */
export async function cleanupMemories(agentId: string, maxAge = 30): Promise<unknown> {
  return widgetdc_mcp('graph.write_cypher', {
    query: `
      MATCH (m:AgentMemory {agentId: $agentId})
      WHERE m.updatedAt < datetime() - duration({days: $maxAge})
      AND m.type NOT IN ['fact', 'critical']
      DELETE m
      RETURN count(*) AS deleted
    `,
    params: { agentId, maxAge },
  });
}
```

---

## Scorecard

| Kategori | Før | Efter Fase 1-4 | Mål |
|----------|-----|----------------|-----|
| Context Folding Tools | 40% | 100% | ✅ |
| Intelligence Events | 25% | 85% | ✅ |
| Memory System | 60% | 95% | ✅ |
| Session Management | 50% | 90% | ✅ |
| **Total** | **~70%** | **~92%** | ✅ |

---

## Prioriteret Rækkefølge

1. **Fase 3: Context Folding Tools** (2h) — Lavthængende frugt
2. **Fase 4: Cross-Agent Learning** (2h) — Stor impact
3. **Fase 1: RLM Event Listener** (3h) — Kræver SSE setup
4. **Fase 2: Gateway Hooks** (4h) — Kræver server.js ændringer

**Total estimat:** 11 timer til 90%+

---

## Quick Wins (kan gøres nu)

1. Tilføj `context_folding.health` til health skill
2. Tilføj `context_folding.triage_keywords` til rag-fasedelt discovery
3. Tilføj memory cleanup cron job
4. Tilføj lesson distribution efter vigtige indsigter

Skal jeg implementere disse?
