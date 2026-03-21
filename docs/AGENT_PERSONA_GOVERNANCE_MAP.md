# OpenClaw Execution Persona Alignment

Created: 2026-03-21
Source: Gap analysis widgetdc-openclaw vs WidgeTDC governance model

## Scope

OpenClaw is an execution surface. It hosts a local execution roster that is
aligned to WidgeTDC operating docs, while machine-policy truth remains in the
synced governance bundle under `.governance-sync/`.

This file documents that local alignment layer. It is not a replacement for
`config/*.json` truth in WidgeTDC.

## Mapping Table

| Local Execution Agent | Prompt File | Machine-Policy Anchor | Status |
|---|---|---|---|
| omega-sentinel | `agent-souls/main.md` | `omega_sentinel` | MACHINE_POLICY_ANCHOR |
| consulting-partner | `agent-souls/strategist.md` | none | LOCAL_EXECUTION_OVERLAY |
| regulatory-navigator | `agent-souls/security.md` | none | LOCAL_EXECUTION_OVERLAY |
| graph-steward | `agent-souls/data.md` | none | LOCAL_EXECUTION_OVERLAY |
| loop-orchestrator | `agent-souls/orchestrator.md` | `loop_orchestrator` | MACHINE_POLICY_ANCHOR |
| dream-weaver | `agent-souls/harvester.md` | none | LOCAL_EXECUTION_OVERLAY |
| frontend-sentinel | `agent-souls/frontend-sentinel.md` | none | LOCAL_EXECUTION_OVERLAY |
| compliance-officer | `agent-souls/compliance.md` | none | LOCAL_EXECUTION_OVERLAY |
| skribleren | `agent-souls/writer.md` | none | SUPPORT_PERSONA |

## Consolidated/Removed Personas

| Old Persona | Disposition | Absorbed By |
|---|---|---|
| analyst (Tal-Trold 📊) | MERGED | consulting-partner (strategist) |
| coder (Kodehaj 🦈) | MERGED | loop-orchestrator (orchestrator) |
| documentalist (Arkivar-Rex 📚) | MERGED | consulting-partner (strategist) |
| infra (Jernfod 🦾) | RETAINED | Supporting role (not in current config-template) |
| github (Repo Sherif 🤠) | RETAINED | Supporting role (not in current config-template) |

## Notes

- `infra` and `github` remain support personas outside the current execution roster.
- `analyst` capabilities are absorbed into `consulting-partner`.
- `coder` capabilities are absorbed into `loop-orchestrator`.
- `documentalist` capabilities are absorbed into `consulting-partner`.
- `frontend-sentinel` and `compliance-officer` now have local soul files and are part of the execution overlay.
- Only `omega-sentinel` and `loop-orchestrator` are currently anchored directly in the synced machine-policy capability matrix.
- The remaining execution agents are local OpenClaw overlays and must never be described as machine-policy truth.

## Governance Rule

OpenClaw is an execution surface, not a truth source. Local persona definitions
must stay subordinate to the synced governance bundle and must not claim to be
canonical machine policy on their own.
