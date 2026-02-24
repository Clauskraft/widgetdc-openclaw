# WidgeTDC Platform — Komplet Arkitektur

**Dato:** 2026-02-24  
**Version:** Platform v2.0  
**Status:** Produktionsaktiv

---

## Executive Summary

WidgeTDC er en **enterprise AI consulting platform** der kombinerer:
- 336 MCP tools på tværs af 64 namespaces
- 12 specialiserede AI agenter
- 165K+ node Knowledge Graph
- Real-time Intelligence Events
- Multi-provider LLM orchestration

Platformen understøtter autonome consulting workflows, threat intelligence, code analysis, financial modeling, og document generation — alt koordineret gennem en delt knowledge graph og MCP tool ecosystem.

---

## Platform Services

### 1. Backend API (FastAPI)
**URL:** `https://backend-production-d3da.up.railway.app`

Central hub der eksponerer alle platform capabilities:

| Endpoint | Funktion |
|----------|----------|
| `/api/mcp/route` | MCP tool execution (336 tools) |
| `/api/mcp/tools` | Tool discovery |
| `/api/mcp/status` | MCP bridge status |
| `/api/notifications/send` | Slack notifications |
| `/health` | Platform health |

**Koblede Services:**
- Neo4j AuraDB (165K nodes, 883K relations)
- Redis (caching)
- PostgreSQL (metadata)
- LLM Providers (Claude, Gemini, DeepSeek)

**Data Sources:**
- Outlook (connected)
- Gmail (connected)
- SharePoint (connected)
- Notion (connected)
- Scribd (connected)

**Active Agents (Backend):**
- PROMETHEUS (System coherence)
- roma (active)
- dot (idle)
- Ensemble: data, security, memory, pal, orchestrator

---

### 2. RLM Engine (v7.0.0)
**URL:** `https://rlm-engine-production.up.railway.app`

Reasoning Language Model Engine med:

| Endpoint | Funktion |
|----------|----------|
| `/reason` | Deep reasoning |
| `/cognitive/fold` | Context compression |
| `/operations/dreamscape` | Autonomous operations |
| `/api/rlm/events/stream` | SSE event stream |
| `/api/rlm/events/recent` | Recent events |
| `/api/self-healing/*` | Auto-recovery |

**Components:**
- `repl_manager` ✅
- `autonomous_agent` ✅
- `mcp_bridge` ✅
- `boot_manifest` ✅ (335 tools)
- `capability_verifier` ✅

---

### 3. OpenClaw Gateway
**URL:** `https://openclaw-production-9570.up.railway.app`

Multi-agent gateway med:
- 12 specialiserede agenter
- 18 skills
- Auto memory boot
- Session persistence
- Hourly status reports

---

### 4. Consulting Frontend
**URL:** `https://consulting-production-b5d8.up.railway.app`

Web UI for consulting workflows.

---

## MCP Tool Ecosystem (336 tools, 64 namespaces)

### Tier 1: Core Platform (100+ tools)

| Namespace | Tools | Beskrivelse |
|-----------|-------|-------------|
| `consulting.*` | 28 | Consulting frameworks, patterns, decisions, insights |
| `prometheus.*` | 28 | Code analysis, governance, RL feedback, dreaming |
| `agent.*` | 18 | Task lifecycle, hierarchy, chat sessions |
| `git.*` | 18 | Git operations, PR management |
| `tdc.*` | 14 | TDC-specific document operations |
| `trident.*` | 14 | Cybersecurity, threat hunting, CVR lookup |
| `ingestion.*` | 13 | Data ingestion pipelines |
| `osint.*` | 11 | Open source intelligence, database scanning |
| `knowledge.*` | 11 | Knowledge retrieval, claims, entities |
| `docgen.*` | 9 | Document generation (PPT, Word, Excel, diagrams) |

### Tier 2: Specialized (50+ tools)

| Namespace | Tools | Beskrivelse |
|-----------|-------|-------------|
| `integration.*` | 8 | System monitoring, source ingest |
| `financial.*` | 8 | Financial modeling, trinity, forecasting |
| `community.*` | 7 | Community management |
| `supervisor.*` | 7 | Multi-agent orchestration, HITL |
| `engagement.*` | 7 | Client engagement tracking |
| `compute.*` | 6 | Compute operations |
| `vidensarkiv.*` | 6 | Knowledge archive |
| `rlm.*` | 6 | RLM mission control |
| `master.*` | 6 | Master data management |
| `context_folding.*` | 5 | Context compression |

### Tier 3: Utilities (80+ tools)

| Namespace | Tools | Beskrivelse |
|-----------|-------|-------------|
| `notes.*` | 5 | Note management |
| `widgets.*` | 5 | Widget operations |
| `autonomous.*` | 5 | Autonomous operations |
| `project.*` | 5 | Project management |
| `taskrecorder.*` | 5 | Task recording |
| `specialist.*` | 5 | Specialist routing |
| `cma.*` | 4 | CMA memory interface |
| `graph.*` | 4 | Neo4j operations |
| `pal.*` | 4 | PAL operations |
| `railway.*` | 4 | Railway deployment |
| `repomix.*` | 4 | Repository mixing |
| `gdrive.*` | 4 | Google Drive |
| `llm.*` | 3 | LLM operations |
| `darkweb.*` | 3 | Dark web monitoring |
| `kg_rag.*` | 2 | Knowledge Graph RAG |

---

## Key Tool Details

### Consulting Namespace (28 tools)

```
consulting.agent.chain          — Agent chain execution
consulting.agent.memory.recall  — Recall agent memory
consulting.agent.memory.store   — Store agent memory
consulting.analytics            — Analytics dashboard
consulting.client.assess        — Client assessment
consulting.commander.activate   — Activate commander
consulting.commander.missions   — List missions
consulting.dashboard.create     — Create dashboard
consulting.dashboard.share      — Share dashboard
consulting.data.cvr             — CVR data lookup
consulting.decision.list        — List decisions
consulting.decision.log         — Log decision
consulting.execute_flow         — Execute consulting flow
consulting.execute_step         — Execute flow step
consulting.export.pdf           — Export to PDF
consulting.failure.record       — Record failure
consulting.failure.search       — Search failures
consulting.flow_status          — Flow status
consulting.insight.capture      — Capture insight
consulting.insight.search       — Search insights
consulting.list_flows           — List flows
consulting.pattern.create       — Create pattern
consulting.pattern.get          — Get pattern
consulting.pattern.search       — Search patterns
consulting.pattern.vectorSearch — Vector search patterns
consulting.redflag.checklist    — Red flag checklist
consulting.review.submit        — Submit review
consulting.teacher.validate     — Validate via teacher
```

### Prometheus Namespace (28 tools)

```
prometheus.code_attention.focus     — Focus code attention
prometheus.code_immune.vaccinate    — Vaccinate code
prometheus.dream.history            — Dream history
prometheus.dream.insights           — Dream insights
prometheus.dream.start              — Start dreaming
prometheus.dream.status             — Dream status
prometheus.embed_code               — Embed code
prometheus.embedding_stats          — Embedding statistics
prometheus.find_similar_code        — Find similar code
prometheus.governance.benefit_get   — Get governance benefit
prometheus.governance.benefit_list  — List benefits
prometheus.governance.track_benefit — Track benefit
prometheus.invention_health         — Invention health
prometheus.lsp.get_symbols          — Get LSP symbols
prometheus.lsp.initialize           — Initialize LSP
prometheus.rl.analyze               — RL analyze
prometheus.rl.feedback              — RL feedback
prometheus.rl.history               — RL history
prometheus.rl.propose               — RL propose
prometheus.rl.status                — RL status
prometheus.run_scan                 — Run scan
prometheus.solve_analogy            — Solve analogy
prometheus.status                   — Status
prometheus.teacher.disable_realtime — Disable realtime
prometheus.teacher.enable_realtime  — Enable realtime
prometheus.teacher.generate_report  — Generate report
prometheus.teacher.predict_failure  — Predict failure
prometheus.teacher.recommend_recovery — Recommend recovery
```

### Trident Namespace (14 tools) — Cybersecurity

```
trident.cvr.lookup        — CVR lookup
trident.cvr.scan          — CVR scan
trident.disengage         — Disengage target
trident.engage            — Engage target
trident.harvest           — Harvest intelligence
trident.hunt              — Threat hunting
trident.scan.documents    — Scan documents
trident.scan.domain       — Scan domain
trident.status            — Trident status
trident.target            — Set target
trident.threat.level      — Threat level assessment
trident.toolbox           — Toolbox
trident.toolbox.leaks     — Check for leaks
trident.toolbox.takeover  — Takeover detection
```

### OSINT Namespace (11 tools)

```
osint.add-entity           — Add entity to graph
osint.graph                — OSINT graph
osint.investigate          — Investigate target
osint.progress             — Investigation progress
osint.scan.databases       — Scan databases
osint.scan.elasticsearch   — Scan Elasticsearch
osint.scan.list            — List scans
osint.scan.mongodb         — Scan MongoDB
osint.scan.s3              — Scan S3 buckets
osint.scan.status          — Scan status
osint_investigate_instagram — Instagram investigation
```

---

## Knowledge Graph Schema

### Node Statistics (165K+ nodes)

| Label | Count | Beskrivelse |
|-------|-------|-------------|
| `Insight` | 17,985 | Business insights |
| `LLMDecision` | 16,520 | LLM routing decisions |
| `Directive` | 12,895 | Strategic directives |
| `StrategicInsight` | 10,545 | Strategic analysis |
| `MCPTool` | 7,302 | MCP tool definitions |
| `ChatMessage` | 6,852 | Chat history |
| `CVE` | 6,644 | Security vulnerabilities |
| `CodeSymbol` | 6,181 | Code symbols |
| `L3Task` | 5,874 | Level 3 tasks |
| `TDCDocument` | 5,589 | TDC documents |
| `CodeFile` | 5,121 | Code files |
| `LocalFile` | 4,488 | Local files |
| `Memory` | 3,687 | Agent memories |
| `Entity` | 3,117 | Named entities |
| `Conversation` | 2,947 | Conversations |
| `Evidence` | 2,704 | Evidence nodes |
| `ActivePiece` | 2,500 | Active workflow pieces |
| `UIComponent` | 2,344 | UI components |
| `CyberIntelligence` | 2,183 | Cyber intel |
| `KnowledgeChunk` | 2,168 | Knowledge chunks |
| `Task` | 1,973 | Tasks |
| `AI_Constraint` | 1,909 | AI constraints |
| `Tag` | 1,818 | Tags |
| `Document` | 1,808 | Documents |
| `Knowledge` | 1,493 | Knowledge nodes |
| `AI_Directive` | 1,293 | AI directives |
| `SourceFile` | 1,204 | Source files |
| `HarvestedKnowledge` | 1,173 | Harvested knowledge |
| `Pattern` | 1,154 | Patterns |
| `L2SubProcess` | 996 | Level 2 subprocesses |
| `ConsultingFlow` | 825 | Consulting flows |
| `KPI` | 825 | KPIs |
| `AuditLog` | 806 | Audit logs |
| `Methodology` | 768 | Methodologies |
| `Skill` | 710 | Skills |
| `Persona` | 492 | Personas |

### Relationship Statistics (883K+ relations)

Key relationship types:
- `BELONGS_TO_DOMAIN`
- `HAS_SUBPROCESS`
- `HAS_TASK`
- `USES_TOOL`
- `CONTAINS_PATTERN`
- `SUPPORTED_BY`
- `RELATES_TO`
- `MADE_DECISION`

---

## Agent Architecture

### 12 Specialiserede Agenter

| Agent | Emoji | Rolle | Nøgle-Skills |
|-------|-------|-------|--------------|
| Kaptajn Klo | 🦞 | Hoved-orkestrator | Alle 18 skills |
| Dirigenten | 🎼 | Multi-agent koordinator | orchestrator, supervisor |
| Jernfod | 🦾 | Infrastruktur | health, cicd |
| Repo Sherif | 🤠 | CI/CD guardian | git, cicd |
| Graf-Oktopus | 🐙 | Knowledge graph | graph, rag, data-pipeline |
| Stor-Bjørn | 🐻 | Strategi | rag, consulting-workflow |
| Cyber-Vipera | 🐍 | Sikkerhed | trident, osint, cve |
| Tal-Trold | 📊 | Analyse | financial, rag |
| Kodehaj | 🦈 | Kode | prometheus, git |
| Arkivar-Rex | 📚 | Dokumentation | writer, docgen |
| Støvsugeren | 🌀 | Data ingestion | ingestion, data-pipeline |
| Kontrakt-Karen | 📋 | Contracts | widgetdc-contracts |

---

## Intelligence Events (13 types)

| Event | Handler | Persistence |
|-------|---------|-------------|
| `context_folded` | ✅ | ContextFoldEvent |
| `routing_decision` | ✅ | RoutingDecisionEvent |
| `recommendation_ready` | ✅ | RecommendationEvent |
| `learning_update` | ✅ | LearningEvent + AgentMemory |
| `health_change` | ✅ | HealthChangeEvent + Slack |
| `quality_scored` | ✅ | QualityScoreEvent |
| `q_learning_updated` | ✅ | QLearningEvent |
| `meta_learning_applied` | ✅ | MetaLearningEvent |
| `agent_memory_persisted` | ✅ | MemoryPersistEvent |
| `attention_fold_complete` | ✅ | AttentionFoldEvent |
| `circuit_breaker_triggered` | ✅ | CircuitBreakerEvent + Slack |
| `sse_bridge_connected` | ✅ | SSEConnectionEvent |
| `error` | ✅ | ErrorEvent + Slack |

---

## Contracts System (@widgetdc/contracts v0.2.0)

### Core Types

```typescript
// Agent tiers
AgentTier = 'ANALYST' | 'ASSOCIATE' | 'MANAGER' | 'PARTNER' | 'ARCHITECT'

// Agent personas
AgentPersona = 'RESEARCHER' | 'ENGINEER' | 'CUSTODIAN' | 'ARCHITECT' | 
               'SENTINEL' | 'ARCHIVIST' | 'HARVESTER' | 'ANALYST' | 
               'INTEGRATOR' | 'TESTER'

// Cognitive request
CognitiveRequest = {
  task: string,
  context: Record<string, unknown>,
  reasoning_mode: 'quick' | 'deep' | 'strategic',
  trace_id: uuid,
  domain_hint?: string,
  constraints?: { max_tokens, timeout_ms, fold_context }
}

// Cognitive response
CognitiveResponse = {
  recommendation: string | null,
  reasoning: string,
  confidence: 0-1,
  reasoning_chain?: string[],
  trace?: TraceInfo,
  quality?: QualityScore,
  routing?: RoutingInfo
}
```

### Node Labels (48 types)

ConsultingDomain, L1ProcessFlow, L2SubProcess, Task, Engagement, Track, Insight, StrategicInsight, Evidence, Claim, KnowledgePack, KnowledgePattern, Knowledge, MCPTool, Tool, CodeImplementation, Agent, AgentProfile, Session, Decision, TDCDocument, SystemSnapshot, LocalFile, Entity, ExpansionSignal, CVE, CyberIntelligence, Directive, Methodology, KPI, AIPattern, Memory, AgentMemory, Lesson, ContextFold, HealthEvent, QLearningEvent, CircuitBreakerEvent, QualityEvent, LearningEvent, MetaLearningEvent, MemoryPersistEvent, AttentionFoldEvent, ErrorEvent, KanbanTask, BootEvent, SSEConnectionEvent, RecommendationEvent

---

## Platform Capabilities Matrix

| Capability | Tools | Status |
|------------|-------|--------|
| Knowledge Graph | graph.*, knowledge.* | ✅ Active |
| RAG Pipeline | kg_rag.*, srag.* | ✅ Active |
| Context Folding | context_folding.* | ✅ Active |
| Consulting Workflows | consulting.* | ✅ Active |
| Code Analysis | prometheus.* | ✅ Active |
| Cybersecurity | trident.*, osint.*, darkweb.* | ✅ Active |
| Financial Modeling | financial.* | ✅ Active |
| Document Generation | docgen.* | ✅ Active |
| Git Operations | git.* | ✅ Active |
| Multi-Agent Orchestration | agent.*, supervisor.* | ✅ Active |
| Data Ingestion | ingestion.* | ✅ Active |
| LLM Orchestration | llm.*, rlm.* | ✅ Active |
| Slack Integration | notifications | ✅ Active |
| Memory Persistence | cma.*, notes.* | ✅ Active |

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RAILWAY PLATFORM                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   Backend    │  │  RLM Engine  │  │   OpenClaw   │              │
│  │   (FastAPI)  │  │   (v7.0.0)   │  │   Gateway    │              │
│  │              │  │              │  │              │              │
│  │ 336 MCP tools│  │ /reason      │  │ 12 agents    │              │
│  │ LLM proxy    │  │ /fold        │  │ 18 skills    │              │
│  │ Slack        │  │ /events      │  │ Memory boot  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
│         └─────────────────┼─────────────────┘                       │
│                           │                                         │
│  ┌────────────────────────┴────────────────────────┐               │
│  │              SHARED INFRASTRUCTURE               │               │
│  │                                                  │               │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │               │
│  │  │  Neo4j   │  │  Redis   │  │ Postgres │      │               │
│  │  │ AuraDB   │  │  Cache   │  │   Meta   │      │               │
│  │  │ 165K+    │  │          │  │          │      │               │
│  │  │ nodes    │  │          │  │          │      │               │
│  │  └──────────┘  └──────────┘  └──────────┘      │               │
│  │                                                  │               │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │               │
│  │  │  Claude  │  │  Gemini  │  │ DeepSeek │      │               │
│  │  │   API    │  │   API    │  │   API    │      │               │
│  │  └──────────┘  └──────────┘  └──────────┘      │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                      │
│  ┌──────────────────────────────────────────────────┐               │
│  │              DATA SOURCES                         │               │
│  │  Outlook │ Gmail │ SharePoint │ Notion │ Scribd  │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Konklusion

WidgeTDC er en **komplet enterprise AI platform** med:

- **336 MCP tools** — Dækker alt fra consulting til cybersecurity
- **165K+ Knowledge Graph nodes** — Akkumuleret viden og patterns
- **12 specialiserede agenter** — Hver med unikke kompetencer
- **Real-time Intelligence Events** — Kontinuerlig læring
- **Multi-provider LLM** — Claude, Gemini, DeepSeek

Platformen er produktionsklar og aktivt i brug, med rum for yderligere optimering af memory boot, context folding, og cross-agent learning.

---

*Genereret af OpenClaw Cloud Agent — 2026-02-24*
