#!/bin/bash
set -e

# Ensure /data is owned by openclaw user and has restricted permissions
chown openclaw:openclaw /data 2>/dev/null || true
chmod 700 /data 2>/dev/null || true

# Persist Homebrew to Railway volume so it survives container rebuilds
BREW_VOLUME="/data/.linuxbrew"
BREW_SYSTEM="/home/openclaw/.linuxbrew"

if [ -d "$BREW_VOLUME" ]; then
  # Volume already has Homebrew — symlink back to expected location
  if [ ! -L "$BREW_SYSTEM" ]; then
    rm -rf "$BREW_SYSTEM"
    ln -sf "$BREW_VOLUME" "$BREW_SYSTEM"
    echo "[entrypoint] Restored Homebrew from volume symlink"
  fi
else
  # First boot — move Homebrew install to volume for persistence
  if [ -d "$BREW_SYSTEM" ] && [ ! -L "$BREW_SYSTEM" ]; then
    mv "$BREW_SYSTEM" "$BREW_VOLUME"
    ln -sf "$BREW_VOLUME" "$BREW_SYSTEM"
    echo "[entrypoint] Persisted Homebrew to volume on first boot"
  fi
fi

# Pre-seed openclaw config with allowInsecureAuth so Control UI is reachable
# before onboarding completes. Only writes if config does not already exist.
STATE_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
CONFIG_FILE="${OPENCLAW_CONFIG_PATH:-${STATE_DIR}/openclaw.json}"
# Force re-seed if OPENCLAW_RESET_CONFIG=1
if [ "${OPENCLAW_RESET_CONFIG:-0}" = "1" ]; then
  rm -f "${CONFIG_FILE}" 2>/dev/null || true
  echo "[entrypoint] Reset config — will re-seed"
fi

if [ ! -f "${CONFIG_FILE}" ]; then
  mkdir -p "$(dirname "${CONFIG_FILE}")"
  PUBLIC_ORIGIN="https://${RAILWAY_PUBLIC_DOMAIN:-openclaw-production-9570.up.railway.app}"
  cat > "${CONFIG_FILE}" <<SEEDEOF
{
  "gateway": {
    "mode": "local",
    "trustedProxies": ["0.0.0.0/0"],
    "controlUi": {
      "allowInsecureAuth": true,
      "dangerouslyDisableDeviceAuth": true,
      "allowedOrigins": ["${PUBLIC_ORIGIN}", "http://localhost", "http://localhost:18789", "http://127.0.0.1", "http://127.0.0.1:18789"]
    },
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true },
        "responses": { "enabled": true }
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "google": {
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
        "apiKey": "${GOOGLE_API_KEY}",
        "api": "google-generative-ai",
        "models": [
          {
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 1048576,
            "maxTokens": 65536
          }
        ]
      },
      "deepseek": {
        "baseUrl": "https://api.deepseek.com/v1",
        "apiKey": "${DEEPSEEK_API_KEY}",
        "api": "openai-completions",
        "models": [
          { "id": "deepseek-chat", "name": "DeepSeek Chat", "contextWindow": 65536 },
          { "id": "deepseek-reasoner", "name": "DeepSeek Reasoner", "contextWindow": 65536 }
        ]
      }
    }
  },
  "skills": {
    "entries": {
      "widgetdc-mcp": {
        "enabled": true,
        "env": { "WIDGETDC_MCP_ENDPOINT": "https://backend-production-d3da.up.railway.app/api/mcp/route" }
      },
      "graph": { "enabled": true, "env": { "WIDGETDC_BACKEND_URL": "https://backend-production-d3da.up.railway.app" } },
      "health": { "enabled": true, "env": { "WIDGETDC_BACKEND_URL": "https://backend-production-d3da.up.railway.app", "RLM_ENGINE_URL": "https://rlm-engine-production.up.railway.app" } },
      "rag": { "enabled": true, "env": { "WIDGETDC_BACKEND_URL": "https://backend-production-d3da.up.railway.app" } },
      "rag-fasedelt": { "enabled": true, "env": { "WIDGETDC_BACKEND_URL": "https://backend-production-d3da.up.railway.app" } },
      "qmd": { "enabled": true, "env": { "WIDGETDC_BACKEND_URL": "https://backend-production-d3da.up.railway.app" } },
      "cicd": { "enabled": true, "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}", "GITHUB_OWNER": "Clauskraft" } },
      "act": { "enabled": true },
      "widgetdc-setup": { "enabled": true, "env": { "WIDGETDC_BACKEND_URL": "https://backend-production-d3da.up.railway.app", "RLM_ENGINE_URL": "https://rlm-engine-production.up.railway.app" } },
      "writer": { "enabled": true, "env": { "WIDGETDC_BACKEND_URL": "https://backend-production-d3da.up.railway.app", "RLM_ENGINE_URL": "https://rlm-engine-production.up.railway.app" } }
    }
  },
  "agents": {
    "defaults": {
      "models": {
        "google/gemini-2.5-flash": { "alias": "gemini" },
        "deepseek/deepseek-chat": { "alias": "deepseek" },
        "deepseek/deepseek-reasoner": { "alias": "reasoner" }
      },
      "model": {
        "primary": "google/gemini-2.5-flash",
        "fallbacks": ["deepseek/deepseek-chat"]
      },
      "maxConcurrent": 5,
      "contextTokens": 800000,
      "heartbeat": { "every": "0m", "target": "none" },
      "timeoutSeconds": 180,
      "contextPruning": {
        "mode": "cache-ttl",
        "ttl": "20m",
        "keepLastAssistants": 5,
        "hardClear": { "enabled": true, "placeholder": "[Optimized context]" }
      }
    },
    "list": [
      { "id": "main",         "default": true, "workspace": "${STATE_DIR}/workspace-main",         "name": "Kaptajn Klo",    "skills": ["widgetdc-mcp","graph","health","rag","rag-fasedelt","qmd","cicd","act","widgetdc-setup","writer"],  "identity": { "name": "Kaptajn Klo",    "emoji": "🦞" } },
      { "id": "github",       "workspace": "${STATE_DIR}/workspace-github",       "name": "Repo Sherif",    "skills": ["widgetdc-mcp","cicd","graph"],                                            "identity": { "name": "Repo Sherif",    "emoji": "🤠" } },
      { "id": "data",         "workspace": "${STATE_DIR}/workspace-data",         "name": "Graf-Oktopus",   "skills": ["widgetdc-mcp","graph","rag","qmd","rag-fasedelt"],                        "identity": { "name": "Graf-Oktopus",   "emoji": "🐙" } },
      { "id": "infra",        "workspace": "${STATE_DIR}/workspace-infra",        "name": "Jernfod",        "skills": ["widgetdc-mcp","health","graph","cicd"],                                   "identity": { "name": "Jernfod",        "emoji": "🦾" } },
      { "id": "strategist",   "workspace": "${STATE_DIR}/workspace-strategist",   "name": "Stor-Bjoern",   "skills": ["widgetdc-mcp","rag","rag-fasedelt","graph","qmd"],                        "identity": { "name": "Stor-Bjoern",   "emoji": "🐻" } },
      { "id": "security",     "workspace": "${STATE_DIR}/workspace-security",     "name": "Cyber-Vipera",  "skills": ["widgetdc-mcp","graph","rag"],                                             "identity": { "name": "Cyber-Vipera",  "emoji": "🐍" } },
      { "id": "analyst",      "workspace": "${STATE_DIR}/workspace-analyst",      "name": "Tal-Trold",     "skills": ["widgetdc-mcp","rag","graph","qmd"],                                       "identity": { "name": "Tal-Trold",     "emoji": "📊" } },
      { "id": "coder",        "workspace": "${STATE_DIR}/workspace-coder",        "name": "Kodehaj",       "skills": ["widgetdc-mcp","graph","cicd"],                                            "identity": { "name": "Kodehaj",       "emoji": "🦈" } },
      { "id": "orchestrator", "workspace": "${STATE_DIR}/workspace-orchestrator", "name": "Dirigenten",    "skills": ["widgetdc-mcp","graph","health"],                                          "identity": { "name": "Dirigenten",    "emoji": "🎼" } },
      { "id": "documentalist","workspace": "${STATE_DIR}/workspace-documentalist","name": "Arkivar-Rex",   "skills": ["widgetdc-mcp","rag","qmd","graph","writer"],                              "identity": { "name": "Arkivar-Rex",   "emoji": "📚" } },
      { "id": "harvester",    "workspace": "${STATE_DIR}/workspace-harvester",    "name": "Stovsugeren",   "skills": ["widgetdc-mcp","rag","graph"],                                             "identity": { "name": "Stovsugeren",   "emoji": "🌀" } },
      { "id": "contracts",    "workspace": "${STATE_DIR}/workspace-contracts",    "name": "Kontrakt-Karen","skills": ["widgetdc-mcp","graph","rag"],                                             "identity": { "name": "Kontrakt-Karen","emoji": "📋" } }
    ]
  },
  "channels": {
    "defaults": {
      "heartbeat": { "showOk": false, "showAlerts": false, "useIndicator": false }
    }
  },
  "commands": { "native": "auto", "text": true, "bash": true, "config": true, "restart": true }
}
SEEDEOF
  chown -R openclaw:openclaw "${STATE_DIR}" 2>/dev/null || true
  echo "[entrypoint] Full WidgeTDC config seeded"
fi

# ── Skill migration — tilføj nye skills til eksisterende config ──────
# Kører altid (ikke kun første boot) for at sikre nye skills er aktiveret.
MIGRATE_SKILLS=("widgetdc-setup" "writer")
for SKILL in "${MIGRATE_SKILLS[@]}"; do
  # Tjek om skill allerede er i config via grep
  if [ -f "${CONFIG_FILE}" ] && ! grep -q "\"${SKILL}\"" "${CONFIG_FILE}" 2>/dev/null; then
    # Brug openclaw config set til at tilføje skill (kun hvis openclaw er tilgængeligt)
    if command -v node >/dev/null 2>&1 && [ -f "${OPENCLAW_ENTRY:-/openclaw/dist/entry.js}" ]; then
      BACKEND_URL="https://backend-production-d3da.up.railway.app"
      RLM_URL="https://rlm-engine-production.up.railway.app"
      SKILL_JSON="{\"enabled\":true,\"env\":{\"WIDGETDC_BACKEND_URL\":\"${BACKEND_URL}\",\"RLM_ENGINE_URL\":\"${RLM_URL}\"}}"
      node "${OPENCLAW_ENTRY:-/openclaw/dist/entry.js}" config set "skills.entries.${SKILL}" "${SKILL_JSON}" 2>/dev/null \
        && echo "[entrypoint] Added skill to config: ${SKILL}" \
        || echo "[entrypoint] Could not add skill (will appear in workspace but needs manual enable): ${SKILL}"
    fi
  fi
done

# ── Per-agent workspaces med skills og SOUL.md ───────────────────────
# Pattern: /data/.openclaw/workspace-{agentId}
# Alle agenter: skills + SOUL.md i eget workspace

setup_agent_workspace() {
  local AGENT_ID="$1"
  local AGENT_NAME="$2"
  local AGENT_EMOJI="$3"
  local AGENT_ROLE="$4"
  local AGENT_TOOLS="$5"
  local AGENT_SKILLS="$6"  # kommasepareret liste

  local WS="${STATE_DIR}/workspace-${AGENT_ID}"
  mkdir -p "${WS}/skills"

  # Kopier agent-specifikke skills
  if [ -d "/app/skills" ] && [ -n "${AGENT_SKILLS}" ]; then
    echo "${AGENT_SKILLS}" | tr ',' '\n' | while read -r skill; do
      skill=$(echo "${skill}" | tr -d ' ')
      [ -d "/app/skills/${skill}" ] && cp -r "/app/skills/${skill}" "${WS}/skills/"
    done
  fi

  # Skriv kun filer der ikke allerede er brugertilpassede
  write_ws_file() {
    local FILE="$1"; local CONTENT="$2"
    if [ ! -f "${WS}/${FILE}" ] || grep -q "AUTO-GENERATED" "${WS}/${FILE}" 2>/dev/null; then
      printf '%s\n' "${CONTENT}" > "${WS}/${FILE}"
    fi
  }

  # IDENTITY.md — hvem er agenten
  write_ws_file "IDENTITY.md" "# ${AGENT_EMOJI} ${AGENT_NAME}
**ID:** ${AGENT_ID} | **Platform:** WidgeTDC OpenClaw Gateway
**Rolle:** ${AGENT_ROLE}
**Model:** google/gemini-2.5-flash (fallback: deepseek/deepseek-chat)
**Gateway:** https://openclaw-production-9570.up.railway.app
<!-- AUTO-GENERATED -->"

  # SOUL.md — adfærd og filosofi
  write_ws_file "SOUL.md" "# ${AGENT_EMOJI} ${AGENT_NAME} — Soul
Du er ${AGENT_NAME} i WidgeTDC AI-platformen.
${AGENT_ROLE}

## Core values
- Evidensbaseret: altid citer kilde fra graph eller skill output
- Præcis: aldrig estimer uden datagrundlag
- Proaktiv: monitorér og alert ved afvigelser
<!-- AUTO-GENERATED -->"

  # TOOLS.md — tilgængelige MCP tools
  write_ws_file "TOOLS.md" "# ${AGENT_EMOJI} ${AGENT_NAME} — Tools
## Primære MCP Tools (via widgetdc_mcp)
${AGENT_TOOLS}

## Memory Tools
- consulting.agent.memory.store — gem lærdom cross-session
- consulting.agent.memory.recall — hent tidligere lærdom
- cma.memory.store / cma.memory.retrieve — CMA memory interface
- notes.create / notes.list / notes.get — persistent noter

## Graph Tools (altid tilgængelige)
- graph.read_cypher — læs Neo4j (165K noder)
- graph.stats — node/rel tælling
- graph.health — Neo4j connection status
<!-- AUTO-GENERATED -->"

  # MEMORY.md — hukommelsesstruktur
  write_ws_file "MEMORY.md" "# ${AGENT_EMOJI} ${AGENT_NAME} — Memory

## Memory Boot (kør ved session-start)
\`\`\`
widgetdc_mcp(\"consulting.agent.memory.recall\", { agentId: \"${AGENT_ID}\", limit: 15 })
\`\`\`

## Teacher/Student kobling
Hent lessons fra Neo4j ved opstart:
\`\`\`
widgetdc_mcp(\"graph.read_cypher\", {
  query: \"MATCH (l:Lesson) RETURN l.title, l.content ORDER BY l.createdAt DESC LIMIT 5\"
})
\`\`\`

## Gem ny lærdom
\`\`\`
widgetdc_mcp(\"consulting.agent.memory.store\", {
  agentId: \"${AGENT_ID}\",
  content: \"hvad du lærte...\",
  type: \"learning\"
})
\`\`\`
<!-- AUTO-GENERATED -->"

  # BOOTSTRAP.md — opstartsrutine
  write_ws_file "BOOTSTRAP.md" "# ${AGENT_EMOJI} ${AGENT_NAME} — Bootstrap
Ved session-start, kør i rækkefølge:
1. Indlæs memory: widgetdc_mcp consulting.agent.memory.recall agentId=${AGENT_ID}
2. Tjek system: widgetdc_mcp integration.system_health
3. Hent lessons: graph.read_cypher MATCH (l:Lesson) RETURN l.title, l.content LIMIT 5
4. Aktivér rolle: ${AGENT_ROLE}
<!-- AUTO-GENERATED -->"

  # HEARTBEAT.md — tom fil = heartbeat deaktiveret (OpenClaw design)
  write_ws_file "HEARTBEAT.md" ""

  # AGENTS.md — oversigt over hele agent-teamet
  write_ws_file "AGENTS.md" "# WidgeTDC Agent Team
🦞 main (Kaptajn Klo) — Hoved-konsulent
🤠 github (Repo Sherif) — CI/CD vagt
🐙 data (Graf-Oktopus) — Graph vogter
🦾 infra (Jernfod) — Infra monitor
🐻 strategist (Stor-Bjoern) — Strategi
🐍 security (Cyber-Vipera) — CVE/threat
📊 analyst (Tal-Trold) — Financial
🦈 coder (Kodehaj) — Code analysis
🎼 orchestrator (Dirigenten) — Orchestration
📚 documentalist (Arkivar-Rex) — Docs
🌀 harvester (Stovsugeren) — Data ingest
📋 contracts (Kontrakt-Karen) — Contracts
<!-- AUTO-GENERATED -->"

  # USER.md — bruger/kontekst info
  write_ws_file "USER.md" "# WidgeTDC Platform Context
**Ejer:** Clauskraft (clauskraft@gmail.com)
**Projekt:** WidgeTDC — AI-drevet management consulting platform
**Backend:** https://backend-production-d3da.up.railway.app (335 MCP tools)
**Neo4j:** AuraDB Enterprise 5.27 (165K noder, 883K relationer)
**RLM Engine:** https://rlm-engine-production.up.railway.app
**GitHub:** https://github.com/Clauskraft
<!-- AUTO-GENERATED -->"

  chown -R openclaw:openclaw "${WS}" 2>/dev/null || true
  echo "[entrypoint] workspace-${AGENT_ID}: $(ls "${WS}/skills/" 2>/dev/null | wc -l) skills, 8 md files"
}

# Fælles memory-instruktion til alle agenter
MEM='Memory: widgetdc_mcp("consulting.agent.memory.recall",{"agentId":"AGID","limit":10}) + widgetdc_mcp("cma.memory.retrieve",{"agentId":"AGID"})
Lær: widgetdc_mcp("consulting.agent.memory.store",{"agentId":"AGID","content":"...","type":"learning"})
<!-- AUTO-GENERATED -->'

setup_agent_workspace "main" "Kaptajn Klo" "🦞" \
  "Primær AI-konsulent og orkestrator. Alle 335 MCP tools og 165K graph-noder." \
  "- kg_rag.query, consulting.pattern.search/insight/decision, knowledge.search_claims
- graph.read_cypher/stats/health, agent.task.*, supervisor.*
- docgen.*, financial.*, osint.*, cve.*, trident.*" \
  "widgetdc-mcp,graph,health,rag,rag-fasedelt,qmd,cicd,act,widgetdc-setup,writer"

setup_agent_workspace "github" "Repo Sherif" "🤠" \
  "GitHub & CI/CD vagt for alle Clauskraft repos." \
  "- git.status, git.log, git.diff, git.pull, git.push, git.commit, git.merge
- agent.task.fetch (hent opgaver fra queue)" \
  "widgetdc-mcp,cicd,graph"

setup_agent_workspace "data" "Graf-Oktopus" "🐙" \
  "Knowledge graph vogter: Neo4j AuraDB 165K noder, PgVector, RLM Engine." \
  "- graph.read_cypher, graph.write_cypher, graph.stats, graph.health, graph.create_node
- knowledge.search_claims, knowledge.entities
- ingestion.*, vidensarkiv.*" \
  "widgetdc-mcp,graph,rag,qmd,rag-fasedelt"

setup_agent_workspace "infra" "Jernfod" "🦾" \
  "Railway infrastruktur monitor for alle 11 services." \
  "- integration.system_health, integration.source_ingest
- supervisor.status, supervisor.pause, supervisor.resume
- agent.task.fetch, agent.task.status" \
  "widgetdc-mcp,health,graph,cicd"

setup_agent_workspace "strategist" "Stor-Bjoern" "🐻" \
  "Strategisk synthesizer: 17K Insights, 10K StrategicInsights, 12K Directives." \
  "- kg_rag.query (cached 5min), consulting.pattern.search, consulting.insight, consulting.decision
- knowledge.search_claims, knowledge.entities
- graph.read_cypher (StrategicInsight, Directive, L3Task)" \
  "widgetdc-mcp,rag,rag-fasedelt,graph,qmd"

setup_agent_workspace "security" "Cyber-Vipera" "🐍" \
  "CVE & Threat Intelligence: 6.561 CVEs, 1.994 CyberIntelligence noder." \
  "- cve.search, cve.analyze
- trident.threat.level, trident.harvest, trident.engage
- osint.investigate, osint.graph, osint.scan" \
  "widgetdc-mcp,graph,rag"

setup_agent_workspace "analyst" "Tal-Trold" "📊" \
  "Financial analysis og forecasting ekspert." \
  "- financial.trinity (3-statement model)
- financial.forecast (DCF/LBO valuations)
- financial.macro_data (market data)
- consulting.pattern.search (financial domain)" \
  "widgetdc-mcp,rag,graph,qmd"

setup_agent_workspace "coder" "Kodehaj" "🦈" \
  "Code analysis, 6K CodeSymbols og 5K CodeFiles i Neo4j." \
  "- prometheus.lsp (language server protocol)
- prometheus.governance (code quality)
- prometheus.code_dreaming (generativ kode)
- git.status, git.diff, git.commit, git.log" \
  "widgetdc-mcp,graph,cicd"

setup_agent_workspace "orchestrator" "Dirigenten" "🎼" \
  "Multi-agent task orchestrator via supervisor og agent.task API." \
  "- supervisor.hitl.request, supervisor.hitl.response, supervisor.hitl.pending
- supervisor.pause, supervisor.resume, supervisor.sendToolResult, supervisor.status
- agent.task.create, agent.task.claim, agent.task.complete, agent.task.fail
- agent.task.fetch, agent.task.enqueue, agent.task.log, agent.task.start, agent.task.status" \
  "widgetdc-mcp,graph,health"

setup_agent_workspace "documentalist" "Arkivar-Rex" "📚" \
  "Document generation og knowledge archiving: 5.589 TDCDocuments i Neo4j." \
  "- docgen.powerpoint, docgen.word, docgen.excel, docgen.diagram
- notes.create, notes.update, notes.delete, notes.get, notes.list
- vidensarkiv.* (knowledge archiving)" \
  "widgetdc-mcp,rag,qmd,graph,writer"

setup_agent_workspace "harvester" "Stovsugeren" "🌀" \
  "Data ingestion specialist og RAG pipeline vedligehold." \
  "- integration.source_ingest, integration.system_health
- notes.create (dokumentér fund)
- graph.read_cypher (tjek data freshness)" \
  "widgetdc-mcp,rag,graph"

setup_agent_workspace "contracts" "Kontrakt-Karen" "📋" \
  "@widgetdc/contracts v0.2.0 ekspert. TypeBox cross-service kontrakter." \
  "- graph.read_cypher (MCPTool, NodeLabel, RelationshipType noder)
- knowledge.search_claims (find kontrakt-relateret viden)
- kg_rag.query (semantisk søgning i kontrakt-dokumentation)" \
  "widgetdc-mcp,graph,rag"

# Sync skills til fælles workspace (alle agenter)
if [ -d "/app/skills" ]; then
  for WS_TARGET in \
    "${STATE_DIR}/workspace/skills" \
    "/home/openclaw/.openclaw/workspace/skills"; do
    mkdir -p "${WS_TARGET}"
    cp -r /app/skills/. "${WS_TARGET}/"
  done
  chown -R openclaw:openclaw "${STATE_DIR}" 2>/dev/null || true
  chown -R openclaw:openclaw "/home/openclaw/.openclaw" 2>/dev/null || true
  echo "[entrypoint] Fælles workspace synced"
fi

# ── SOUL.md filer til alle agenter ───────────────────────────────────
# Placeres i agent workspace så OpenClaw loader dem som identitetsfil
STATE_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
AGENTS_DIR="${STATE_DIR}/agents"

write_soul() {
  local agent_id="$1"
  local soul_content="$2"
  local agent_dir="${AGENTS_DIR}/${agent_id}"
  mkdir -p "${agent_dir}"
  # Skriv kun hvis ikke allerede tilpasset (bevar bruger-edits)
  if [ ! -f "${agent_dir}/SOUL.md" ] || grep -q "AUTO-GENERATED" "${agent_dir}/SOUL.md" 2>/dev/null; then
    printf '%s\n' "${soul_content}" > "${agent_dir}/SOUL.md"
    echo "[entrypoint] SOUL.md → ${agent_id}"
  fi
}

MEMORY_BOOT='## Memory Boot
Ved session-start kald:
widgetdc_mcp("consulting.agent.memory.recall", { agentId: "AGENT_ID", limit: 20 })
widgetdc_mcp("graph.read_cypher", { query: "MATCH (l:Lesson) RETURN l.title, l.content ORDER BY l.createdAt DESC LIMIT 5" })

## Memory Write (efter vigtige indsigter)
widgetdc_mcp("consulting.agent.memory.store", { agentId: "AGENT_ID", content: "indsigt...", type: "learning" })

<!-- AUTO-GENERATED -->'

write_soul "main" "# Kaptajn Klo 🦞 — Hoved-konsulent & orkestrator
Du koordinerer alle 11 specialistagenter og besvarer konsulentspørgsmål med evidens fra Neo4j.
Brug /rag til vidensøgning, /graph til Cypher-queries, /health til systemcheck.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/main/g')"

write_soul "github" "# Repo Sherif 🤠 — GitHub & CI/CD vagt
Du overvåger Clauskraft repos: WidgeTDC, widgetdc-contracts, widgetdc-openclaw.
Brug /cicd status, /cicd failures. Tools: git.status, git.log, git.diff.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/github/g')"

write_soul "data" "# Graf-Oktopus 🐙 — Knowledge graph vogter
Du overvåger Neo4j AuraDB (165K noder: 17K Insights, 7K MCPTools, 6K CVEs).
Brug /graph til Cypher, /rag til semantisk søgning, /qmd til kompakte svar.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/data/g')"

write_soul "infra" "# Jernfod 🦾 — Infrastruktur monitor
Du overvåger alle Railway services: backend, rlm-engine, openclaw, frontend, consulting,
llm-proxy, matrix-frontend, pgvector-db, steel-browser, arch-mcp, activepieces.
Brug /health for systemstatus. Alert ved nedetid >30s eller latency >500ms.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/infra/g')"

write_soul "strategist" "# Stor-Bjoern 🐻 — Strategisk indsigt synthesizer
Du synthesiserer fra 17K Insights, 10K StrategicInsights, 12K Directives i Neo4j.
15 domæner: STR, DEA, FIN, OPS, TEC, AIA, CYB, RCC, TLA, ESG, CMS, POO, PMO, IND, MSO.
McKinsey SRC-model: Situation → Complication → Resolution.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/strategist/g')"

write_soul "security" "# Cyber-Vipera 🐍 — CVE & Threat Intelligence
Du overvåger 6.561 CVEs, 1.994 CyberIntelligence noder i Neo4j.
Tools: cve.search, cve.analyze, trident.threat.level, osint.scan.
Alert ved CVSS 9+ CVEs eller aktive trusler mod WidgeTDC infrastruktur.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/security/g')"

write_soul "analyst" "# Tal-Trold 📊 — Financial analyst
Tools: financial.trinity (3-statement), financial.forecast (DCF/LBO), financial.macro_data.
Trækker evidens fra Neo4j knowledge base. Aldrig estimater uden datagrundlag.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/analyst/g')"

write_soul "coder" "# Kodehaj 🦈 — Code analysis expert
Tools: prometheus.lsp, prometheus.governance, prometheus.code_dreaming.
Analyserer 6K CodeSymbols og 5K CodeFiles i Neo4j. git.status, git.diff, git.commit.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/coder/g')"

write_soul "orchestrator" "# Dirigenten 🎼 — Multi-agent orchestrator
Tools: supervisor.hitl.request/response, agent.task.create/claim/complete/fail/fetch.
Koordinerer workflows på tværs af domæner. Bruger 5.874 L3Tasks som task-templates.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/orchestrator/g')"

write_soul "documentalist" "# Arkivar-Rex 📚 — Document generation
Tools: docgen.powerpoint, docgen.word, docgen.excel, docgen.diagram, notes.create, notes.list.
Henter evidens fra 5.589 TDCDocuments i Neo4j. McKinsey-grade deliverables med citationsporering.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/documentalist/g')"

write_soul "harvester" "# Stovsugeren 🌀 — Data ingestion specialist
Tools: integration.source_ingest, notes.create. Overvåger Activepieces workflows.
Alert når knowledge er >7 dage gammel. Vedligeholder RAG pipeline kvalitet.
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/harvester/g')"

write_soul "contracts" "# Kontrakt-Karen 📋 — @widgetdc/contracts ekspert
TypeBox-baserede cross-service kontrakter (v0.2.0): cognitive, http, health, consulting, agent, graph.
CognitiveRequest: task, context, reasoning_mode (quick|deep|strategic), trace_id, recursion_depth.
CognitiveResponse: recommendation, reasoning, confidence 0-1, routing, quality.
ApiError codes: VALIDATION_ERROR|AUTH_ERROR|NOT_FOUND|RATE_LIMIT|INTERNAL_ERROR|TIMEOUT|SERVICE_UNAVAILABLE.
AgentTier: ANALYST|ASSOCIATE|MANAGER|PARTNER|ARCHITECT.
NodeLabel (48): ConsultingDomain, L1ProcessFlow, L2SubProcess, Insight, MCPTool, CVE...
Wire format: snake_case JSON. Runtime: Value.Check(Schema, payload).
$(echo "$MEMORY_BOOT" | sed 's/AGENT_ID/contracts/g')"

chown -R openclaw:openclaw "${AGENTS_DIR}" 2>/dev/null || true
echo "[entrypoint] SOUL.md filer skrevet for alle 12 agenter"

exec gosu openclaw node src/server.js
