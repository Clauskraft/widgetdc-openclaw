<!-- SYNCED FROM WidgeTDC — DO NOT EDIT LOCALLY —>

# OPENCLAW USAGE POLICY

Version: 2026-03-14
Status: Canonical OpenClaw usage policy

## Purpose

Define how OpenClaw should be used inside the WidgeTDC operating model.

## Canonical Rule

- OpenClaw is an execution and control surface.
- OpenClaw is not a source of truth.
- OpenClaw must not replace Linear, repo artifacts, or governance bundle files.

## Allowed Uses

- controlled execution surface for agents
- gateway for Slack, cron, webhook, and operational flows
- runtime bridge for agent actions
- controlled place for tool use, routing, and operational automation
- hosted execution surface for a frontend tester agent

## Disallowed Uses

- storing canonical policy only in OpenClaw prompts
- treating OpenClaw chat as artifact storage
- replacing Linear with OpenClaw thread state
- replacing repo docs or config with OpenClaw-only instructions
- letting OpenClaw become an unsynced parallel governance system

## Integration Rule

OpenClaw must be tied to:

- Linear for operational coordination
- repo-local artifacts for code and contracts
- governance bundle for canonical policy
- runtime enforcement for tool scope and delivery discipline

## Ownership

- `Claude` owns OpenClaw operational alignment with the wider infrastructure model.
- `Qwen` challenges OpenClaw drift if it starts behaving like a separate truth system.
- `Codex` and `DeepSeek` may use OpenClaw as an execution surface, but not as a policy source.

## Frontend Tester Clarification

- OpenClaw is not itself the frontend tester.
- OpenClaw should host and execute the frontend tester agent.
- The tester agent should run real browser E2E against Railway-hosted user surfaces and return governed defect packets.
- OpenClaw should be treated as the execution host for `Frontend E2E Sentinel`, not as a replacement for Playwright, defects, backlog, or repo-local fixes.

## Final Rule

Use OpenClaw to execute and control work. Do not use OpenClaw to redefine truth.
