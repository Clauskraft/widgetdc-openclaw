# OpenClaw Agent Persona → Governance Mapping

Created: 2026-03-21
Source: Gap analysis widgetdc-openclaw vs WidgeTDC governance model

## Canonical Governance Agents (8)

The WidgeTDC governance model defines 8 consolidated agents. OpenClaw personas must map to these.

## Mapping Table

| Governance Agent | OpenClaw Persona | OpenClaw ID | Status |
|---|---|---|---|
| omega-sentinel | Omega Sentinel (🛡️) | main | MAPPED |
| consulting-partner | Stor-Bjørn (🐻) | strategist | MAPPED |
| regulatory-navigator | Cyber-Vipera (🐍) | security | MAPPED |
| graph-steward | Graf-Oktopus (🐙) | data | MAPPED |
| loop-orchestrator | Dirigenten (🎼) | orchestrator | MAPPED |
| dream-weaver | Stovsugeren (🌀) | harvester | MAPPED |
| frontend-sentinel | — | — | NEW (use E2E runner) |
| compliance-officer | — | — | NEW (add persona) |

## Consolidated/Removed Personas

| Old Persona | Disposition | Absorbed By |
|---|---|---|
| analyst (Tal-Trold 📊) | MERGED | consulting-partner (strategist) |
| coder (Kodehaj 🦈) | MERGED | loop-orchestrator (orchestrator) |
| documentalist (Arkivar-Rex 📚) | MERGED | consulting-partner (strategist) |
| infra (Jernfod 🦾) | RETAINED | Supporting role (not a governance agent) |
| github (Repo Sherif 🤠) | RETAINED | Supporting role (CI/CD operations) |

## Notes

- `infra` and `github` are operational support personas, not governance agents. They are retained as utility roles.
- `analyst` financial capabilities are absorbed into `consulting-partner` (strategist persona).
- `coder` code analysis capabilities are absorbed into `loop-orchestrator` (orchestrator persona).
- `documentalist` document generation capabilities are absorbed into `consulting-partner` (strategist persona).
- `frontend-sentinel` needs a new OpenClaw persona added for browser E2E execution.
- `compliance-officer` needs a new OpenClaw persona added for SRAG/GDPR/NIS2 execution.

## Governance Rule

OpenClaw is an execution surface, not a truth source. Persona definitions here must align with the canonical governance model defined in WidgeTDC's `config/agent_capability_matrix.json`.
