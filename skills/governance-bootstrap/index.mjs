/**
 * OC-006 — Governance Bootstrap Verification Skill
 *
 * Validates alignment between:
 *   .governance-sync/agent_bootstrap_manifest.json
 *   .governance-sync/agent_capability_matrix.json
 *   agent-souls/config-template.json
 *
 * Returns a structured report with PASS/FAIL, missing agents,
 * capability mismatches, and drift warnings.
 */

import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

/**
 * Safely read and parse a JSON file. Returns { data, error }.
 */
async function loadJson(relPath) {
  const fullPath = resolve(REPO_ROOT, relPath);
  try {
    const raw = await readFile(fullPath, 'utf-8');
    return { data: JSON.parse(raw), error: null, path: fullPath };
  } catch (err) {
    return { data: null, error: err.message, path: fullPath };
  }
}

/**
 * Normalise an agent id to a comparable key.
 * Strips hyphens/underscores and lowercases.
 */
function normaliseId(id) {
  return id.replace(/[-_]/g, '').toLowerCase();
}

/**
 * Build a lookup map keyed by normalised id, preserving original keys.
 */
function buildLookup(obj) {
  const map = new Map();
  for (const key of Object.keys(obj)) {
    map.set(normaliseId(key), { originalKey: key, value: obj[key] });
  }
  return map;
}

/**
 * Main verification function. Can be called programmatically by OpenClaw.
 *
 * @returns {Promise<GovernanceReport>}
 */
export async function verifyGovernanceBootstrap() {
  const report = {
    status: 'PASS',
    timestamp: new Date().toISOString(),
    sources: {},
    missingAgents: [],
    capabilityMismatches: [],
    driftWarnings: [],
    summary: '',
  };

  // ── Load sources ──────────────────────────────────────────────
  const manifest = await loadJson('.governance-sync/agent_bootstrap_manifest.json');
  const matrix   = await loadJson('.governance-sync/agent_capability_matrix.json');
  const config   = await loadJson('agent-souls/config-template.json');

  report.sources = {
    bootstrap_manifest: manifest.error ? `MISSING (${manifest.error})` : 'OK',
    capability_matrix:  matrix.error   ? `MISSING (${matrix.error})`   : 'OK',
    config_template:    config.error   ? `MISSING (${config.error})`   : 'OK',
  };

  // If capability matrix is missing we cannot run the core checks
  if (matrix.error) {
    report.status = 'FAIL';
    report.driftWarnings.push({
      type: 'source_missing',
      source: 'agent_capability_matrix.json',
      detail: matrix.error,
    });
    report.summary = 'Cannot verify — capability matrix missing.';
    return report;
  }

  // If config-template is missing we cannot cross-check agents
  if (config.error) {
    report.status = 'FAIL';
    report.driftWarnings.push({
      type: 'source_missing',
      source: 'config-template.json',
      detail: config.error,
    });
    report.summary = 'Cannot verify — config-template.json missing.';
    return report;
  }

  // ── Extract agent sets ────────────────────────────────────────
  const matrixAgents = matrix.data.agents || {};
  const configAgentList = config.data?.agents?.list || [];

  // Build lookup from config-template agent list (by normalised id)
  const configLookup = new Map();
  for (const agent of configAgentList) {
    configLookup.set(normaliseId(agent.id), agent);
  }

  const matrixLookup = buildLookup(matrixAgents);

  // ── Check 1: All matrix agents present in config-template ────
  for (const [normId, { originalKey, value }] of matrixLookup) {
    const configAgent = configLookup.get(normId);

    if (!configAgent) {
      report.missingAgents.push({
        agentId: originalKey,
        category: value.category || 'unknown',
        primaryRole: value.primary_role || 'unknown',
        expectedIn: 'config-template.json agents.list',
      });
    }
  }

  // ── Check 2: Config agents not in capability matrix (drift) ──
  for (const [normId, agent] of configLookup) {
    if (!matrixLookup.has(normId)) {
      report.driftWarnings.push({
        type: 'config_agent_not_in_matrix',
        agentId: agent.id,
        agentName: agent.name,
        detail: `Agent "${agent.id}" is defined in config-template but has no entry in capability_matrix. This may indicate governance drift.`,
      });
    }
  }

  // ── Check 3: Capability alignment for matched agents ─────────
  for (const [normId, { originalKey, value: matrixEntry }] of matrixLookup) {
    const configAgent = configLookup.get(normId);
    if (!configAgent) continue; // already captured as missing

    // Check elevated flag vs governance role expectations
    if (matrixEntry.category === 'governance_agent' || matrixEntry.category === 'execution_engine') {
      // Governance/execution agents should ideally have elevated or heartbeat
      if (!configAgent.elevated && !configAgent.heartbeat?.enabled) {
        report.driftWarnings.push({
          type: 'governance_agent_not_elevated',
          agentId: originalKey,
          configId: configAgent.id,
          detail: `Governance/execution agent "${originalKey}" has neither elevated:true nor heartbeat in config-template. Consider enabling for monitoring.`,
        });
      }
    }

    // Check QA agents have delivery ownership matching
    if (matrixEntry.owns_delivery_for_own_changes === true) {
      // This is an informational check — no config-template field maps directly
      // but we flag if timeout is suspiciously low for delivery-owning agents
      if ((configAgent.timeoutSeconds || 180) < 120) {
        report.capabilityMismatches.push({
          agentId: originalKey,
          configId: configAgent.id,
          field: 'timeoutSeconds',
          expected: '>= 120 (delivery-owning agent)',
          actual: configAgent.timeoutSeconds,
          detail: 'Agent owns delivery but has a very short timeout, which may cause incomplete task execution.',
        });
      }
    }

    // Cross-check: system_agent category agents should have sufficient context
    if (matrixEntry.category === 'system_agent') {
      if ((configAgent.contextTokens || 0) < 500000) {
        report.driftWarnings.push({
          type: 'low_context_for_system_agent',
          agentId: originalKey,
          configId: configAgent.id,
          contextTokens: configAgent.contextTokens,
          detail: `System agent "${originalKey}" has contextTokens=${configAgent.contextTokens}, which is below 500K recommended for system agents.`,
        });
      }
    }
  }

  // ── Check 4: Bootstrap manifest closure rules ─────────────────
  if (manifest.data) {
    const allowedRepos = manifest.data.allowed_owner_repos || [];
    if (allowedRepos.length > 0 && !allowedRepos.includes('widgetdc-openclaw')) {
      report.driftWarnings.push({
        type: 'openclaw_not_in_allowed_repos',
        detail: `widgetdc-openclaw is not listed in bootstrap manifest allowed_owner_repos: [${allowedRepos.join(', ')}]`,
      });
    }

    // Verify required_reads are documented
    const requiredReads = manifest.data.required_reads || [];
    if (requiredReads.length === 0) {
      report.driftWarnings.push({
        type: 'empty_required_reads',
        detail: 'Bootstrap manifest has no required_reads defined.',
      });
    }
  } else {
    report.driftWarnings.push({
      type: 'source_missing',
      source: 'agent_bootstrap_manifest.json',
      detail: manifest.error || 'File could not be loaded (non-fatal).',
    });
  }

  // ── Determine overall status ──────────────────────────────────
  if (report.missingAgents.length > 0 || report.capabilityMismatches.length > 0) {
    report.status = 'FAIL';
  }

  // ── Summary ───────────────────────────────────────────────────
  const parts = [];
  parts.push(`Sources: ${Object.values(report.sources).filter(v => v === 'OK').length}/3 OK`);
  parts.push(`Matrix agents: ${Object.keys(matrixAgents).length}`);
  parts.push(`Config agents: ${configAgentList.length}`);
  if (report.missingAgents.length > 0) {
    parts.push(`Missing from config: ${report.missingAgents.map(a => a.agentId).join(', ')}`);
  }
  if (report.capabilityMismatches.length > 0) {
    parts.push(`Capability mismatches: ${report.capabilityMismatches.length}`);
  }
  if (report.driftWarnings.length > 0) {
    parts.push(`Drift warnings: ${report.driftWarnings.length}`);
  }
  report.summary = parts.join(' | ');

  return report;
}

/**
 * OpenClaw skill entry point.
 * Called when the skill is invoked via /governance-bootstrap.
 */
export default async function run(_args) {
  const report = await verifyGovernanceBootstrap();

  const statusIcon = report.status === 'PASS' ? '[PASS]' : '[FAIL]';
  const lines = [];
  lines.push(`${statusIcon} Governance Bootstrap Verification`);
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push('');

  // Sources
  lines.push('Sources:');
  for (const [name, status] of Object.entries(report.sources)) {
    lines.push(`  ${status === 'OK' ? '[OK]' : '[!!]'} ${name}: ${status}`);
  }
  lines.push('');

  // Missing agents
  if (report.missingAgents.length > 0) {
    lines.push(`Missing Agents (${report.missingAgents.length}):`);
    for (const m of report.missingAgents) {
      lines.push(`  - ${m.agentId} (${m.category} / ${m.primaryRole}) — not in ${m.expectedIn}`);
    }
    lines.push('');
  }

  // Capability mismatches
  if (report.capabilityMismatches.length > 0) {
    lines.push(`Capability Mismatches (${report.capabilityMismatches.length}):`);
    for (const c of report.capabilityMismatches) {
      lines.push(`  - ${c.agentId}: ${c.field} expected ${c.expected}, got ${c.actual}`);
      lines.push(`    ${c.detail}`);
    }
    lines.push('');
  }

  // Drift warnings
  if (report.driftWarnings.length > 0) {
    lines.push(`Drift Warnings (${report.driftWarnings.length}):`);
    for (const w of report.driftWarnings) {
      lines.push(`  - [${w.type}] ${w.detail}`);
    }
    lines.push('');
  }

  lines.push(`Summary: ${report.summary}`);

  return lines.join('\n');
}
