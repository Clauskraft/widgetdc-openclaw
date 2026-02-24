# Recurring Tasks — Automatisering

Disse opgaver kan køres periodisk. OpenClaw-agenter kan **udløse** dem via webhooks eller manuelt.

## 1. Persona-export (graph → OpenClaw)

**Hvad:** Henter 75 personas fra Neo4j og skriver til `skills/widgetdc-personas/`.

**Manuelt:**
```bash
cd openclaw-railway-template
node scripts/export-graph-personas.mjs
git add skills/widgetdc-personas/
git commit -m "chore: refresh graph personas"
git push
```

**Automatisk (GitHub Actions):** Se `.github/workflows/refresh-personas.yml` — kører dagligt.

---

## 2. Cursor rules sync

**Hvad:** Genererer Cursor rules fra agent-identiteter.

**Manuelt:** I OpenClaw chat, skriv `/cursor-sync rules` — kopier output til `.cursor/rules/` i WidgeTDC-projektet.

**Automatisk:** Kan tilføjes til samme workflow som persona-export (output til fil, commit).

---

## 3. Slack-notifikationer

**Hvad:** OpenClaw sender alerts til Slack via Backend.

**Krav:** `SLACK_WEBHOOK_URL` på Backend (Railway). Se `docs/SLACK_SETUP.md`.

**Udløsning:** Agenter med slack-bridge skill kalder `notify()` / `alertCritical()` når de færdiggør kritiske opgaver.

---

## 4. Hvad OpenClaw kan gøre selv

| Opgave | OpenClaw rolle |
|--------|----------------|
| Persona-export | Kan **ikke** køre script lokalt — kræver GitHub Actions eller cron |
| Cursor sync | **Ja** — agent kan køre `/cursor-sync rules` og returnere output |
| Slack-alerts | **Ja** — agent kalder `notify()` når opgave er færdig |
| Health check | **Ja** — `/health` skill, kan `alertCritical()` ved nedetid |

**Anbefaling:** Brug GitHub Actions til persona-export (daglig). Brug OpenClaw-agenter til Slack + Cursor sync on-demand.
