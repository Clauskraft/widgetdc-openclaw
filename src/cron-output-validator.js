/**
 * Cron Output Validator — Runtime JSON schema validation for cron job outputs.
 *
 * Resolves compliance warning: agent-openclaw-output-contract (severity 4)
 * Source: docs/CRON_PROMPTS.md + docs/CRON_ROUTING_PROFILE.json
 *
 * Validates cron output JSON against the output_contract declared in
 * CRON_ROUTING_PROFILE.json before the output is dispatched to notification
 * channels. Outputs that fail validation are still delivered but tagged with
 * a validation warning so downstream consumers can distinguish validated from
 * unvalidated payloads.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ─── Schema Cache ────────────────────────────────────────────────────────

/** @type {Record<string, string[]> | null} */
let contractCache = null;

/**
 * Load output_contract definitions from CRON_ROUTING_PROFILE.json.
 * Falls back to the cron id -> output_contract mapping from config-template cron entries.
 * @returns {Promise<Record<string, string[]>>}
 */
export async function loadOutputContracts() {
  if (contractCache) return contractCache;

  /** @type {Record<string, string[]>} */
  const contracts = {};

  // Primary: CRON_ROUTING_PROFILE.json
  try {
    const profilePath = join(
      process.cwd(),
      "docs",
      "CRON_ROUTING_PROFILE.json"
    );
    const raw = await readFile(profilePath, "utf-8");
    const profile = JSON.parse(raw);
    const routing = profile?.cron_routing ?? {};
    for (const [jobId, config] of Object.entries(routing)) {
      if (Array.isArray(config?.output_contract)) {
        contracts[jobId] = config.output_contract;
      }
    }
  } catch {
    // Profile not found — not fatal, fall through to defaults
  }

  // Fallback: hard-coded contracts for cron jobs defined in config-template
  // These match the "Produce JSON: {...}" instructions in each cron prompt.
  const fallbacks = {
    "omega-desk-check": [
      "desk_status",
      "backend_status",
      "rlm_status",
      "threat_level",
      "actions",
    ],
    "omega-compliance-audit": [
      "compliance_grade",
      "score",
      "total_checks",
      "pass_count",
      "warn_count",
      "fail_count",
      "top_3_violations",
      "remediation_priority",
    ],
    "omega-antipattern-sweep": [
      "antipattern_count",
      "circular_deps",
      "severity",
    ],
    "omega-cicd-guardian": [
      "repo_status",
      "failed_checks",
      "required_actions",
    ],
    "omega-graph-custodian": [
      "node_count",
      "edge_count",
      "health_status",
    ],
    "omega-sentinel-gaps": [
      "open_gaps",
      "critical_gaps",
      "recommended_actions",
    ],
    "omega-security-scan": [
      "critical_cves",
      "affected_components",
      "remediation_plan",
    ],
    "omega-cost-audit": [
      "estimated_daily_cost",
      "quota_usage_pct",
      "optimization_suggestions",
    ],
    "omega-daily-sitrep": [
      "desk_status",
      "compliance_grade",
      "threat_level",
      "actions_taken",
    ],
  };

  for (const [jobId, fields] of Object.entries(fallbacks)) {
    if (!contracts[jobId]) {
      contracts[jobId] = fields;
    }
  }

  contractCache = contracts;
  return contracts;
}

/**
 * Reset the contract cache (useful for tests or hot-reload).
 */
export function resetContractCache() {
  contractCache = null;
}

// ─── JSON Extraction ─────────────────────────────────────────────────────

/**
 * Extract the first valid JSON object from a string by finding balanced braces.
 * Handles cases where prose contains additional curly braces after the JSON.
 *
 * @param {string} text — The text to search for JSON
 * @returns {object|null} — Parsed JSON object or null if none found
 */
function extractFirstValidJson(text) {
  const startIdx = text.indexOf("{");
  if (startIdx === -1) return null;

  // Find balanced braces starting from the first '{'
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        // Found a balanced JSON candidate
        const candidate = text.slice(startIdx, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          // Not valid JSON, try from the next '{'
          const nextStart = text.indexOf("{", startIdx + 1);
          if (nextStart === -1) return null;
          return extractFirstValidJson(text.slice(nextStart));
        }
      }
    }
  }

  return null;
}

// ─── Validation ──────────────────────────────────────────────────────────

/**
 * @typedef {object} ValidationResult
 * @property {boolean} valid      - true if all required fields are present
 * @property {string[]} missing   - list of required fields that are absent
 * @property {string[]} present   - list of required fields that are present
 * @property {string|null} error  - parse error message if output is not valid JSON
 */

/**
 * Validate cron output against the output_contract for the given job.
 *
 * @param {string} cronJobId  — The cron job identifier (e.g. "omega-desk-check")
 * @param {string|object} output — Raw output string (will attempt JSON parse) or parsed object
 * @returns {Promise<ValidationResult>}
 */
export async function validateCronOutput(cronJobId, output) {
  const contracts = await loadOutputContracts();
  const requiredFields = contracts[cronJobId];

  // No contract defined for this job — pass by default
  if (!requiredFields || requiredFields.length === 0) {
    return { valid: true, missing: [], present: [], error: null };
  }

  // Parse output if it's a string
  let parsed;
  if (typeof output === "string") {
    // Try to extract JSON from the output (agents sometimes wrap JSON in prose)
    // Use balanced brace matching to find valid JSON objects
    parsed = extractFirstValidJson(output);
    if (parsed === null) {
      return {
        valid: false,
        missing: requiredFields,
        present: [],
        error: "No valid JSON object found in output",
      };
    }
  } else if (typeof output === "object" && output !== null) {
    parsed = output;
  } else {
    return {
      valid: false,
      missing: requiredFields,
      present: [],
      error: "Output is not a string or object",
    };
  }

  // Check required fields (shallow — keys must exist and not be null/undefined)
  const present = [];
  const missing = [];
  for (const field of requiredFields) {
    if (
      Object.prototype.hasOwnProperty.call(parsed, field) &&
      parsed[field] !== undefined &&
      parsed[field] !== null
    ) {
      present.push(field);
    } else {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    present,
    error: null,
  };
}

/**
 * Wrap a notification payload with validation metadata.
 * This should be called before dispatching cron output to notification channels.
 *
 * @param {string} cronJobId
 * @param {string|object} output
 * @param {object} notificationPayload — The payload that will be sent to the notification channel
 * @returns {Promise<object>} — The enriched notification payload with _validation metadata
 */
export async function validateAndEnrich(cronJobId, output, notificationPayload) {
  const validation = await validateCronOutput(cronJobId, output);

  return {
    ...notificationPayload,
    _validation: {
      cron_job_id: cronJobId,
      validated_at: new Date().toISOString(),
      contract_valid: validation.valid,
      missing_fields: validation.missing,
      present_fields: validation.present,
      parse_error: validation.error,
    },
  };
}
