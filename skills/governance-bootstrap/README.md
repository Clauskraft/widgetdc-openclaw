# Governance Bootstrap Verification (OC-006)

Validates alignment between the three canonical governance sources:

1. **agent_bootstrap_manifest.json** — canonical agent registry and bootstrap rules
2. **agent_capability_matrix.json** — per-agent roles, responsibilities, and permissions
3. **config-template.json** — OpenClaw runtime agent configuration

## Checks performed

- All canonical agents from the capability matrix are present in config-template
- Agent capability mappings are consistent (no drift between sources)
- Missing agents and capability mismatches are reported with actionable detail

## Usage

```js
import { verifyGovernanceBootstrap } from './index.mjs';
const report = await verifyGovernanceBootstrap();
// report.status === 'PASS' | 'FAIL'
```

## Invocation

- `/governance-bootstrap` — run full verification
- `/governance-bootstrap --json` — output raw JSON report
