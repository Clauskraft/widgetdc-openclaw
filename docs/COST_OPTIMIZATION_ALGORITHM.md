# Cost Optimization Algorithm — OpenClaw Agent Platform

## Decision Framework

Every agent run, cron job, or heartbeat follows this evaluation before execution.

## 1. Token Budget Model

```
DAILY_BUDGET = 2_000_000 tokens (Gemini Flash ≈ $0.30/day)
RESERVE      = 20% of DAILY_BUDGET  (for on-demand/chat)

AVAILABLE    = DAILY_BUDGET - RESERVE = 1_600_000 tokens/day
```

### Per-job allocation

| Priority | Jobs | Max tokens/run | Runs/day | Daily budget |
|----------|------|---------------|----------|-------------|
| P0 (critical) | infra-health | 8,000 | 96 (15m) | 768,000 |
| P1 (high) | data-graph-health | 12,000 | 1 | 12,000 |
| P1 (high) | github-cicd | 10,000 | 6 (4h) | 60,000 |
| P2 (medium) | orchestrator-sync | 10,000 | 12 (2h) | 120,000 |
| P2 (medium) | security-cve-scan | 15,000 | 4 (6h) | 60,000 |
| P2 (medium) | harvester-freshness | 12,000 | 6 (4h) | 72,000 |
| P3 (low) | strategist-daily | 15,000 | 2 (12h) | 30,000 |
| P3 (low) | data-validation | 10,000 | 1 | 10,000 |
| **Total scheduled** | | | | **1,132,000** |
| **Remaining for chat/on-demand** | | | | **868,000** |

## 2. Model Selection Algorithm

```
function selectModel(job, context):
  if job.requires_reasoning:
    return "deepseek-reasoner"     # $0.55/M in, $2.19/M out (complex analysis)
  if job.type == "code" or job.type == "security":
    return "deepseek-chat"         # $0.27/M in, $1.10/M out (code/logic)
  if context.tokens_needed > 100_000:
    return "gemini-2.5-flash"      # $0.075/M in (1M context, multimodal)
  if job.priority <= P1:
    return "gemini-2.5-flash"      # fast + reliable for critical path
  return "gemini-2.5-flash"        # default (cheapest with largest context)
```

### Model cost table

| Model | Input $/M | Output $/M | Context | Best for |
|-------|----------|-----------|---------|----------|
| Gemini 2.5 Flash | 0.075 | 0.30 | 1M | default, large context, multimodal |
| DeepSeek Chat | 0.27 | 1.10 | 64K | code analysis, structured data |
| DeepSeek Reasoner | 0.55 | 2.19 | 64K | strategic planning, deep analysis |

## 3. Execution Gate (run/skip decision)

```
function shouldRun(job, lastRun):
  # Gate 1: Budget check
  if daily_tokens_used >= AVAILABLE:
    if job.priority > P1: return SKIP("budget exhausted")

  # Gate 2: Consecutive error circuit breaker
  if lastRun.consecutiveErrors >= 5:
    return SKIP("circuit breaker open — fix root cause first")

  # Gate 3: Duplicate suppression
  if lastRun.status == "ok" and lastRun.age < job.minInterval * 0.8:
    return SKIP("too soon after successful run")

  # Gate 4: Value check
  if lastRun.status == "ok" and lastRun.output == lastRun.previousOutput:
    job.nextInterval *= 1.5   # back off if no new information
    return SKIP("no delta — extending interval")

  return RUN
```

## 4. Delivery Cost Optimization

```
function selectDelivery(job, result):
  if result.status == "critical" or result.has_incidents:
    return { mode: "announce", channel: "slack", to: SLACK_CHANNEL }

  if result.status == "healthy" and job.lastDeliveredStatus == "healthy":
    return { mode: "silent" }  # don't spam healthy-healthy

  return { mode: "announce", channel: "slack", to: SLACK_CHANNEL, bestEffort: true }
```

**Rule: only announce when status changes or incidents detected.**

## 5. Agent Activation Tiers

| Tier | Agents | Activation | Cost profile |
|------|--------|-----------|-------------|
| Always-on | main, infra | heartbeat 1h + cron | ~800K tokens/day |
| Scheduled | data, github, orchestrator, security, strategist | heartbeat + cron | ~350K tokens/day |
| On-demand | analyst, coder, contracts, documentalist, harvester | chat/webhook only | ~0 tokens/day (idle) |

## 6. Escalation Chain

```
P0 error → retry 1x immediately → if fail: alert Slack + disable job + notify main agent
P1 error → retry 1x after 60s → if fail: alert Slack
P2 error → retry 1x after 5m → if fail: log only
P3 error → no retry → log only
```

## 7. Weekly Cost Review Trigger

Every Sunday 08:00:
- Strategist agent produces cost/value report
- Metrics: tokens used, cost estimate, delivery success rate, value signals
- Auto-adjust intervals for jobs with consistently empty outputs
- Flag agents with >50% error rate for investigation

## Summary: Expected Daily Cost

| Component | Tokens | Est. cost (Gemini Flash) |
|-----------|--------|------------------------|
| Cron jobs | 1,132,000 | $0.11 |
| Chat/on-demand | 868,000 | $0.08 |
| **Total** | **2,000,000** | **~$0.20/day** |
| Monthly estimate | 60M | **~$6/month** |
