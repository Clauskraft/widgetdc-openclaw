<!-- SYNCED FROM WidgeTDC — DO NOT EDIT LOCALLY —>

# Agent Compliance Rules

All agents across the WidgeTDC ecosystem MUST follow these rules.

**Master data owner**: Neo4j AuraDB (graph) + arch-mcp-server (dashboards/API).

## Lesson Check (MANDATORY at boot)

Before starting any mission, run `audit.lessons` with your agentId. Integrate all pending lessons. Acknowledge with `audit.acknowledge`. Lessons contain corrections from other agents' failures.

## Integrity Audit

All agent output is audited by `InsightIntegrityGuard` (`apps/backend/src/services/audit/`). Ensure:
- **Citations**: Use `[Source: CODE-ID]` for StrategicInsight references
- **Contract Law**: JSON payloads must include `$id` and use `snake_case` keys (widgetdc-contracts)
- **Graph Consistency**: No contradictions with FailureMemory nodes in Neo4j

## Audit MCP Tools (audit.* namespace)

| Tool | Purpose |
|------|---------|
| `audit.lessons` | Get pending lessons for agent (Lesson Check) |
| `audit.acknowledge` | Mark lessons as read |
| `audit.status` | Get latest integrity score for agent |
| `audit.run` | Manually audit output text |
| `audit.dashboard` | Full integrity matrix across all agents |

## Cross-Agent Learning (Teacher/Student)

- Failures → `AgentLearningLoop` creates `Lesson` nodes in Neo4j
- Lessons propagated to all agents via `SHOULD_AWARE_OF` relationships
- Agents fetch via `audit.lessons`, acknowledge via `audit.acknowledge`

## External Discovery (S1-4 Research-First Mandate)

When Neo4j has no match: **S1** Extract (max 50 lines) → **S2** Map to widgetdc-contracts → **S3** Inject as `:ExternalKnowledge` node → **S4** Verify with `audit.run`.

## Frontend Verification (ZERO TOLERANCE)

No frontend code pushed to main without browser-verifying it renders correctly. TypeScript/ESLint/Vite build are NOT sufficient — they do not catch runtime null access or API shape mismatches.

Steps: Start dev server → Open affected pages → Verify zero JS errors → Verify complete render → Verify graceful handling of missing API data → Then commit.

## Hook Enforcement Gates

| ID | Rule | Gate | Severity |
|----|------|------|----------|
| R1 | Search existing assets before creating new files | BLOCK | P0 |
| R2 | No direct pptxgenjs/pdfkit/docx imports | BLOCK | P0 |
| R3 | No new *Generator.ts/*Service.ts in protected dirs | BLOCK | P0 |
| R4 | ESM only — require() blocked | BLOCK | P0 |
| R5 | Asset inventory injected at session start | INJECT | P0 |
| R6 | Post-write audit (>50 lines, null guards, URLs, auth) | WARN | P1 |

**Asset Manifest**: `.claude/hooks/asset-manifest.json` — 28+ registered services.

## Agent Registries (6 independent systems)

The platform has 6 separate agent registries. Each is authoritative for its own domain.

| # | Registry | Query | Count | Authoritative For |
|---|----------|-------|-------|-------------------|
| 1 | `agents.get_state` (MCP) | `{"tool":"agents.get_state","input":{}}` | 5 | LLM provider routing (DeepSeek, Gemini, Claude, Grok, RLM-Engine) |
| 2 | `master.get_agents` (MCP) | `{"tool":"master.get_agents","input":{}}` | 10+ | Consulting personas (christensen, porter, taleb, etc.) |
| 3 | `omega.sub_agents` (MCP) | `{"tool":"omega.sub_agents","input":{}}` | 10 | Platform monitoring (CLAUSE, SIGNAL, ARGUS, NEXUS, FISCAL, PIPELINE, SYNAPSE, ENGRAM, AEGIS, CLAW) |
| 4 | RLM `/api/capabilities` | `GET /api/capabilities` | 11 | RLM reasoning personas (RESEARCHER, ARCHITECT, ENGINEER, etc.) — hardcoded in Python |
| 5 | RLM `/memory/cortex/agents` | `GET /memory/cortex/dashboard` | 27 | Legacy cortex agents (pre-consolidation, deprecated) |
| 6 | `.claude/agents/*.md` | File system | 8 | Claude Code session agents (the Consolidated Eight) |

**Important**: The 3-layer agent model (Commands → Agents → RLM Personas) covers registries 4, 5, and 6. Registries 1-3 are backend runtime systems with separate lifecycles.

**RLM Agent Registry** (`/api/rlm/registry/agents`): Read-only HTTP. Agents register programmatically via `AgentRegistry.register_agent()` during task execution. No explicit boot-time seeding — registration is implicit and reactive.

## DO's

- Verify frontend changes render in browser before pushing
- Check asset-manifest.json before creating any new service file
- Include `Authorization: Bearer ${API_KEY}` on all backend calls
- Use params in Cypher (never string interpolation)
- Use production URLs (backend-production-d3da, rlm-engine-production, AuraDB)
- Cite sources with `[Source: CODE-ID]` format
- Run `audit.lessons` before starting a mission
- Search existing: Graph → Repos → Local → External BEFORE writing code
- Use `?? fallback` or optional chaining for ALL API response property access

## DON'Ts

- Never create new generator files — extend existing
- Never import pptxgenjs/pdfkit/docx directly — use orchestrators
- Never push frontend code without browser-verifying it renders
- Never call backend without auth header
- Never use `require()` — only ESM imports
- Never write to local Neo4j — only AuraDB
- Never trust TypeScript interfaces for API data — always add runtime null guards
- Never change architecture without consensus
