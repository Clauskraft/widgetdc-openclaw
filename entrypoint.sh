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
      "act": { "enabled": true }
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
      {
        "id": "main",
        "default": true,
        "name": "WidgeTDC Consulting AI",
        "skills": ["widgetdc-mcp", "graph", "health", "rag", "rag-fasedelt", "qmd", "cicd", "act"],
        "identity": { "name": "WidgeTDC Consulting AI", "emoji": "🦞" }
      }
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

# Sync WidgeTDC skills — copy to ALL locations OpenClaw may scan
if [ -d "/app/skills" ]; then
  WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-/data/workspace}"
  STATE_WORKSPACE="${STATE_DIR}/workspace"
  USER_HOME_WORKSPACE="/home/openclaw/.openclaw/workspace"

  for SKILL_TARGET in \
    "${WORKSPACE_DIR}/skills" \
    "${STATE_WORKSPACE}/skills" \
    "${USER_HOME_WORKSPACE}/skills"; do
    mkdir -p "${SKILL_TARGET}"
    cp -r /app/skills/. "${SKILL_TARGET}/"
    echo "[entrypoint] skills → ${SKILL_TARGET}"
  done

  chown -R openclaw:openclaw "${WORKSPACE_DIR}" 2>/dev/null || true
  chown -R openclaw:openclaw "${STATE_WORKSPACE}" 2>/dev/null || true
  chown -R openclaw:openclaw "/home/openclaw/.openclaw" 2>/dev/null || true

  # Debug: show what was synced
  echo "[entrypoint] Skills in workspace:"
  ls "${WORKSPACE_DIR}/skills/" 2>/dev/null | tr '\n' ' '
  echo ""
  echo "[entrypoint] Skills in home:"
  ls "/home/openclaw/.openclaw/workspace/skills/" 2>/dev/null | tr '\n' ' '
  echo ""
fi

exec gosu openclaw node src/server.js
