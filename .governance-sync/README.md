# Governance Bundle Sync

This directory contains **READ-ONLY** copies of governance files from the
[WidgeTDC](https://github.com/Clauskraft/WidgeTDC) monorepo, which is the
canonical owner of the governance bundle.

## Do not edit locally

Any local changes will be **overwritten** on the next sync run.
If a policy needs updating, make the change in `WidgeTDC` and let
the sync propagate it here.

## Sync schedule

| Trigger | Frequency |
|---------|-----------|
| Scheduled | Every Sunday at 04:00 UTC |
| Manual | `workflow_dispatch` via GitHub Actions |
| Local | `node scripts/sync-governance-bundle.mjs` |

## Synced files

| Source (WidgeTDC) | Local copy |
|---|---|
| `MASTER_POLICY.md` | `.governance-sync/MASTER_POLICY.md` |
| `config/runtime_compliance_policy.json` | `.governance-sync/runtime_compliance_policy.json` |
| `config/agent_capability_matrix.json` | `.governance-sync/agent_capability_matrix.json` |
| `config/agent_bootstrap_manifest.json` | `.governance-sync/agent_bootstrap_manifest.json` |
| `docs/OPENCLAW_USAGE_POLICY.md` | `.governance-sync/OPENCLAW_USAGE_POLICY.md` |
| `docs/AGENT_COMPLIANCE.md` | `.governance-sync/AGENT_COMPLIANCE.md` |

## Source

**WidgeTDC** monorepo (`Clauskraft/WidgeTDC`) is the single source of truth
for all governance, compliance, and agent policy artefacts.
