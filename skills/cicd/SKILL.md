---
name: cicd
description: Monitor og fix GitHub Actions CI/CD for alle widgetdc-* repos
user-invocable: true
metadata: {"openclaw": {"primaryEnv": "GITHUB_TOKEN", "emoji": "🔧"}}
---

# CI/CD Monitor

Overvåger GitHub Actions workflows på tværs af alle WidgeTDC repos.

## Kommandoer

- `/cicd status` — Samlet CI/CD status for alle repos
- `/cicd failures` — Fejlede runs med fejllog-uddrag
- `/cicd logs <repo>` — Seneste fejllog for et specifikt repo
- `/cicd watch` — Fuld rapport formateret til chat

## Repos der overvåges

- WidgeTDC (main backend)
- openclaw-railway-template (OpenClaw gateway)
- widgetdc-rlm-engine (RAG/LLM engine)
- widgetdc-consulting-frontend (frontend)
- widgetdc-contracts (TypeBox contracts)

## Krav

- `GITHUB_TOKEN` env var med repo + actions scope
