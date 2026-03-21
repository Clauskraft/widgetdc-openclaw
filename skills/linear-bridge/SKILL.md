---
name: linear-bridge
description: "Linear API bridge for operational coordination — read/write issues, sync backlog, update status"
user-invocable: true
metadata: {"openclaw": {"emoji": "📋"}}
---

# Linear Bridge

Operational coordination bridge to Linear. Governance requires OpenClaw to be tied to Linear for backlog management.

## Commands

```
/linear status                    — Show active issues summary
/linear issue LIN-123             — Get issue details
/linear list [filter]             — List issues (todo|in_progress|blocked)
/linear create "title" [priority] — Create new issue
/linear update LIN-123 state      — Update issue status
/linear sync                      — Sync active backlog snapshot
```

## Environment

- `LINEAR_API_KEY` — Required. Linear API key with read/write access.
- `LINEAR_TEAM_ID` — Optional. Defaults to WidgeTDC team `e7e882f6-d598-4dc4-8766-eaa76dcf140f`.

## Governance Rule

Linear is the operational coordination truth source. OpenClaw is execution surface only.
Issues created or updated via this skill are canonical — they are NOT duplicated in OpenClaw chat.
