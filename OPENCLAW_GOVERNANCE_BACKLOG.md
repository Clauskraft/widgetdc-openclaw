# OpenClaw Governance Alignment Backlog

Created: 2026-03-21
Source: Gap analysis — widgetdc-openclaw vs WidgeTDC governance

## P0 — Urgent

### OC-001: Sync agent roster to governance 8-model
- **Owner:** Claude
- **Status:** COMPLETED (2026-03-21)
- **Scope:** Map 11 OpenClaw personas → 8 governance agents. Remove/remap analyst, coder, documentalist.
- **Files:** agent-souls/config-template.json, docs/AGENT_PERSONA_GOVERNANCE_MAP.md
- **Deliverables:** Mapping doc + config-template updated with all 8 governance agents

### OC-002: Add missing .claude/commands for 6 agents
- **Owner:** Claude
- **Status:** COMPLETED (2026-03-21)
- **Scope:** Add dream-weaver, frontend-sentinel, compliance-officer, consulting-partner, regulatory-navigator, graph-steward, loop-orchestrator to .claude/commands/
- **Files:** .claude/commands/*.md (7 new files, 9 total)

### OC-003: Governance bundle sync workflow
- **Owner:** Claude
- **Status:** COMPLETED (2026-03-21)
- **Scope:** GitHub Actions workflow + sync script + .governance-sync/ directory with 6 synced files
- **Files:** .github/workflows/sync-governance-bundle.yml, scripts/sync-governance-bundle.mjs, .governance-sync/

## P1 — High

### OC-004: Add Linear bridge skill
- **Owner:** Claude
- **Status:** COMPLETED (2026-03-21)
- **Scope:** Created skills/linear-bridge/ — GraphQL-based Linear API integration
- **Deliverables:** SKILL.md, index.mjs. Commands: status, issue, list, create, update, sync
- **Dependencies:** LINEAR_API_KEY env var (already deployed on Railway)

### OC-005: Implement Dream Scheduler cron jobs
- **Owner:** Claude
- **Status:** COMPLETED (2026-03-21)
- **Scope:** 6 cron jobs added to config-template.json (15 total, 9 existing + 6 new)
- **Deliverables:** compliance-scan/1h, news-harvest/4h, graph-gardener/6h, nightshift/02:00, dreamscape/03:00, memory-consolidation/04:00

## P2 — Normal

### OC-006: Governance bootstrap verification skill
- **Owner:** Claude
- **Status:** COMPLETED (2026-03-21)
- **Scope:** skills/governance-bootstrap/ — verifies agent roster against bootstrap manifest + capability matrix
- **Deliverables:** package.json, index.mjs, README.md. Tested and functional.

### OC-007: Restore execution-overlay soul files and verification model
- **Owner:** Codex
- **Status:** COMPLETED (2026-03-21)
- **Scope:** Restore missing `agent-souls/*.md` files referenced by config-template and fix governance-bootstrap so it validates OpenClaw as an execution overlay rather than requiring full parity with the machine-policy matrix.
- **Files:** agent-souls/*.md, docs/AGENT_PERSONA_GOVERNANCE_MAP.md, skills/governance-bootstrap/*
- **Deliverables:** All referenced prompt files exist, verification passes, local docs no longer claim parallel machine truth.
