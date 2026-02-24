---
name: widgetdc-setup
description: "WidgeTDC AI workspace setup — verificer Backend, RLM Engine, Neo4j, hent ConsultingSkills og agent capabilities fra graph"
user-invocable: true
metadata: {"openclaw": {"primaryEnv": "WIDGETDC_BACKEND_URL", "emoji": "⚙️"}}
---

# WidgeTDC Setup & Verification Skill

Verifikation og discovery af hele WidgeTDC platformen.

## Kommandoer

- `/widgetdc-setup` — fuld verifikation (Backend + RLM + Frontend + Neo4j parallelt)
- `/widgetdc-setup quick` — kun Backend + RLM (hurtig)
- `/widgetdc-setup graph` — kun Neo4j connectivity + top labels
- `/widgetdc-setup skills` — ConsultingSkill-nodes fra grafen
- `/widgetdc-setup rlm [role]` — aktive HAS_CAPABILITY tools for en agent-rolle
