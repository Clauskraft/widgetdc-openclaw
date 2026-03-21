<!-- SYNCED FROM WidgeTDC — DO NOT EDIT LOCALLY —>

# MASTER POLICY

Version: 2026-03-14
Status: Canonical governance policy for WidgeTDC

## Purpose

This document defines the source hierarchy and operating model for agent governance in WidgeTDC.

## Canonical Source Hierarchy

1. `Linear` is the operational coordination truth.
2. `config/*.json` are the machine policy truth.
3. `docs/*.md` are human-readable explanations, rationale, and rollout guidance.
4. `docs/HANDOVER_LOG.md` is archive/index only.
5. The WidgeTDC governance bundle is the cross-repo distribution source.

## Agent Operating Model

- `Codex` is the default implementation owner.
- `Gemini` is the architecture reviewer.
- `Qwen3.5` is the default QA reviewer.
- `Qwen Code Smith` is used only when QA requires MCP, repo reads, or runtime facts.
- `Claude` is the deploy/test gate and operational rollout owner.
- Qwen is an active participant in the collaboration loop, not a passive afterthought.
- `Gemini` may review architecture, but may not certify runtime correctness, browser correctness, or closure without independent evidence.

## Qwen Policy

- Qwen is the default QA reviewer.
- Qwen is not a global blocking gate.
- Claude or Codex may proceed with a triaged waiver.
- A waiver must be explicit, documented, and risk-tagged.
- Qwen is centralized in policy but distributed in execution across active repos.

## Approval Model

- Approval of a backlog item is sufficient authority to execute that item.
- Ongoing step-by-step approvals are not required.
- Re-approval is needed only if scope changes materially, risk profile changes, or the work crosses an ownership boundary not already covered by the backlog item.

## Direct Communication

- Direct agent-to-agent communication is the default collaboration mode.
- Agents should coordinate through canonical backlog items and direct communication, not through ad hoc user approval loops.
- Linear is the active backlog and coordination layer for this model.

## Linear API Integration

- `LINEAR_API_KEY` is deployed to backend production (Railway) and local `.env`.
- Backend MCP tools in the `linear.*` namespace have programmatic read/write access to Linear.
- Agents SHOULD use `linear.*` MCP tools for status updates, issue creation, and coordination.
- Manual Linear updates are acceptable but programmatic updates are preferred for traceability.
- Agent status updates via API must follow the same operating discipline as manual updates (see `docs/LINEAR_OPERATING_PROCESS.md`).

## Delivery Accountability

- The agent that finishes a code batch owns the delivery of that batch.
- Delivery ownership includes commit, push to `main`, and Railway follow-up for the affected runtime surface.
- Finished code must not remain only in a local workspace when the approved backlog item scope is complete.
- `Claude` remains the deploy/test gate for deploy-sensitive work, but does not inherit the executing agent's delivery accountability.
- A code batch is not done until repository state and runtime state have both been checked where relevant.
- A `main` or delivery worktree is not allowed to borrow verification credibility from another worktree's `node_modules`.
- Local verification claims for a delivery worktree require deterministic bootstrap from that worktree's own lockfile, or they must be explicitly described as replay-only delivery proof.
- Canonical local path for backend-only delivery verification is `npm run verify:delivery:backend`.

## Runtime Truth

- `main` is the only integration branch.
- Railway and Aura are the runtime truth for deploy-sensitive verification.
- Parameterized Cypher is mandatory for graph writes and task coordination.
- MCP calls use `payload`, never `args`, in canonical policy and examples.

## Infrastructure Ownership

- `Claude` is the cross-repo infrastructure owner.
- Specialist agents own fixes in their own domains, but `Claude` owns overall platform health and cross-repo follow-up.

## OpenClaw Policy

- OpenClaw is an execution and control surface.
- OpenClaw is not a source of truth.
- OpenClaw must not replace Linear, repo artifacts, or governance bundle files.
- OpenClaw may host execution agents, including a frontend browser tester, but is not itself that agent role.

## Frontend E2E Factory

- Frontend browser testing for Railway-hosted user surfaces must run as a governed agent flow.
- `Frontend E2E Sentinel` is the canonical browser-testing role.
- OpenClaw is the preferred execution host for that role, not the role itself.
- `Claude` owns orchestration and bug intake.
- `Lego Factory` owns approved fix execution.
- Frontend fixes are not done until the browser tester reruns the affected production flow.

## Workflow Policy

- Workflow topology must have exactly one canonical source.
- Tool scoping is runtime-first: config and backend enforcement precede UI filtering.
- All non-canonical topology views are derived.

## Governance Bundle

The canonical bundle consists of:

- `config/agent_autoflow_policy.json`
- `config/agent_capability_matrix.json`
- `config/runtime_compliance_policy.json`
- `config/targets.json`
- `MASTER_POLICY.md`
- `scripts/sync_agent_governance.py`

## Multi-Repo Execution

- Development may happen in multiple repos at the same time.
- Agent governance is centralized in `WidgeTDC`, but execution is repo-local.
- Qwen must therefore run as a federated role with one active repo-local context per active repo or worktree.
- No single repo should become a forced bottleneck for Qwen execution.
- Claude, Codex, Gemini, Qwen, and Qwen Code Smith all follow this federated multi-repo execution model.

## Change Control

Any change to agent roles, source hierarchy, QA semantics, workflow topology, or runtime compliance must:

1. be tracked in Linear
2. update machine policy first
3. update docs second
4. pass bundle validation

## Enforcement Intent

The governance bundle exists to eliminate semantic drift between coordination, policy, runtime, and docs.
