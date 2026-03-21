# Governance Bootstrap Verification (OC-006)

Validates alignment between the synced governance bundle and the local
OpenClaw execution overlay:

1. **agent_bootstrap_manifest.json** — canonical bootstrap and closure rules
2. **agent_capability_matrix.json** — machine-policy anchors that OpenClaw must not contradict
3. **config-template.json** — local OpenClaw execution roster
4. **agent-souls/*.md** — prompt files referenced by the execution roster

## Checks performed

- Required OpenClaw execution agents are present in config-template
- Prompt files referenced by config-template exist locally
- Machine-policy anchors that matter to OpenClaw still exist in the synced bundle
- Unknown local personas and local overlay drift are reported with actionable detail

## Usage

```js
import { verifyGovernanceBootstrap } from './index.mjs';
const report = await verifyGovernanceBootstrap();
// report.status === 'PASS' | 'FAIL'
```

## Invocation

- `/governance-bootstrap` — run full verification
- `/governance-bootstrap --json` — output raw JSON report

## Important

This verifier does not require OpenClaw to mirror every system agent from the
machine-policy capability matrix. OpenClaw is an execution surface with a
local roster. The verifier checks that the local roster stays aligned with the
synced governance bundle and does not pretend to become a parallel source of
truth.
