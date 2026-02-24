# Slack-integration til WidgeTDC + OpenClaw

## Flow

```
OpenClaw agent (slack-bridge skill)
    → POST https://backend-production-d3da.up.railway.app/api/notifications/send
        → Backend SlackWebhookService
            → SLACK_WEBHOOK_URL (Incoming Webhook)
                → Slack kanal
```

**Vigtigt:** OpenClaw har IKKE direkte adgang til Slack. Alt går via Backend. Du skal kun konfigurere **Backend** (Railway).

---

## Trin 1: Opret Slack Incoming Webhook

1. Gå til [Slack API: Incoming Webhooks](https://api.slack.com/messaging/webhooks)
2. Klik **"Create your Slack app"** (eller brug eksisterende app)
3. Vælg **"From scratch"** → navngiv (fx "WidgeTDC Notifications")
4. Vælg dit Slack workspace
5. Under **Features** → **Incoming Webhooks** → slå **Activate Incoming Webhooks** til
6. Klik **Add New Webhook to Workspace**
7. Vælg den kanal, hvor notifikationer skal lande (fx `#widgetdc-alerts`)
8. Kopiér webhook-URL'en (ser ud som `https://hooks.slack.com/services/T.../B.../...`)

---

## Trin 2: Sæt env var på Railway (Backend)

1. Gå til [Railway Dashboard](https://railway.app) → WidgeTDC project
2. Vælg **backend** service
3. **Variables** → **Add Variable**
4. Navn: `SLACK_WEBHOOK_URL`
5. Værdi: den URL du kopierede fra Slack
6. Gem — Backend redeployer automatisk

---

## Trin 3: Test

```bash
curl -X POST https://backend-production-d3da.up.railway.app/api/notifications/test \
  -H "Content-Type: application/json"
```

Du bør se en test-besked i din Slack-kanal.

---

## Brug fra OpenClaw

Når Backend har `SLACK_WEBHOOK_URL`, kan OpenClaw-agenter bruge **slack-bridge** skill:

- `notify({ title: "Task done", message: "..." })`
- `alertCritical("Health", "RLM nede")`
- `shareRagSummary(query, summary, domains)`

Agenter med slack-bridge: **Kaptajn Klo**, **Dirigenten**.
