/**
 * OC-006 — Governance Bootstrap Verification Skill
 *
 * OpenClaw is an execution surface, not a policy source. This verifier checks
 * that the local execution overlay stays aligned with the synced governance
 * bundle while allowing repo-local personas that are intentionally not part of
 * the machine-policy capability matrix.
 */

import { access, readFile } from 'fs/promises';
import { basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const REQUIRED_EXECUTION_AGENTS = [
  {
    configId: 'omega-sentinel',
    promptFile: 'agent-souls/main.md',
    matrixId: 'omega_sentinel',
    source: 'machine_policy',
  },
  {
    configId: 'consulting-partner',
    promptFile: 'agent-souls/strategist.md',
    source: 'execution_overlay',
  },
  {
    configId: 'regulatory-navigator',
    promptFile: 'agent-souls/security.md',
    source: 'execution_overlay',
  },
  {
    configId: 'graph-steward',
    promptFile: 'agent-souls/data.md',
    source: 'execution_overlay',
  },
  {
    configId: 'loop-orchestrator',
    promptFile: 'agent-souls/orchestrator.md',
    matrixId: 'loop_orchestrator',
    source: 'machine_policy',
  },
  {
    configId: 'dream-weaver',
    promptFile: 'agent-souls/harvester.md',
    source: 'execution_overlay',
  },
  {
    configId: 'frontend-sentinel',
    promptFile: 'agent-souls/frontend-sentinel.md',
    source: 'execution_overlay',
  },
  {
    configId: 'compliance-officer',
    promptFile: 'agent-souls/compliance.md',
    source: 'execution_overlay',
  },
];

const OPTIONAL_SUPPORT_AGENTS = [
  {
    configId: 'skribleren',
    promptFile: 'agent-souls/writer.md',
    source: 'support_persona',
  },
];

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

function normaliseId(id) {
  return id.replace(/[-_]/g, '').toLowerCase();
}

function buildMatrixLookup(obj) {
  const map = new Map();
  for (const key of Object.keys(obj)) {
    map.set(normaliseId(key), { originalKey: key, value: obj[key] });
  }
  return map;
}

function buildConfigLookup(list) {
  const map = new Map();
  for (const agent of list) {
    map.set(normaliseId(agent.id), agent);
  }
  return map;
}

async function fileExists(relPath) {
  try {
    await access(resolve(REPO_ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}

function expectedPromptPath(relPath) {
  return `/data/workspace/${relPath.replace(/\\/g, '/')}`;
}

function pushPromptMismatch(report, agentId, actual, expected, detail) {
  report.capabilityMismatches.push({
    agentId,
    configId: agentId,
    field: 'systemPromptFile',
    expected,
    actual,
    detail,
  });
}

export async function verifyGovernanceBootstrap() {
  const report = {
    status: 'PASS',
    timestamp: new Date().toISOString(),
    sources: {},
    missingAgents: [],
    missingPromptFiles: [],
    capabilityMismatches: [],
    driftWarnings: [],
    summary: '',
  };

  const manifest = await loadJson('.governance-sync/agent_bootstrap_manifest.json');
  const matrix = await loadJson('.governance-sync/agent_capability_matrix.json');
  const config = await loadJson('agent-souls/config-template.json');

  report.sources = {
    bootstrap_manifest: manifest.error ? `MISSING (${manifest.error})` : 'OK',
    capability_matrix: matrix.error ? `MISSING (${matrix.error})` : 'OK',
    config_template: config.error ? `MISSING (${config.error})` : 'OK',
  };

  if (matrix.error) {
    report.status = 'FAIL';
    report.driftWarnings.push({
      type: 'source_missing',
      source: 'agent_capability_matrix.json',
      detail: matrix.error,
    });
    report.summary = 'Cannot verify - capability matrix missing.';
    return report;
  }

  if (config.error) {
    report.status = 'FAIL';
    report.driftWarnings.push({
      type: 'source_missing',
      source: 'config-template.json',
      detail: config.error,
    });
    report.summary = 'Cannot verify - config-template.json missing.';
    return report;
  }

  const matrixAgents = matrix.data.agents || {};
  const configAgentList = config.data?.agents?.list || [];
  const matrixLookup = buildMatrixLookup(matrixAgents);
  const configLookup = buildConfigLookup(configAgentList);
  const requiredIds = new Set(REQUIRED_EXECUTION_AGENTS.map((agent) => normaliseId(agent.configId)));
  const optionalIds = new Set(OPTIONAL_SUPPORT_AGENTS.map((agent) => normaliseId(agent.configId)));

  for (const expectedAgent of REQUIRED_EXECUTION_AGENTS) {
    const normId = normaliseId(expectedAgent.configId);
    const configAgent = configLookup.get(normId);

    if (!configAgent) {
      report.missingAgents.push({
        agentId: expectedAgent.configId,
        category: expectedAgent.source,
        primaryRole: expectedAgent.source === 'machine_policy' ? 'machine_policy_anchor' : 'execution_overlay',
        expectedIn: 'config-template.json agents.list',
      });
      continue;
    }

    const expectedPrompt = expectedPromptPath(expectedAgent.promptFile);
    if (configAgent.systemPromptFile !== expectedPrompt) {
      pushPromptMismatch(
        report,
        expectedAgent.configId,
        configAgent.systemPromptFile,
        expectedPrompt,
        `Agent "${configAgent.id}" must point at ${basename(expectedAgent.promptFile)} to keep the OpenClaw execution overlay deterministic.`,
      );
    }

    if (!(await fileExists(expectedAgent.promptFile))) {
      report.missingPromptFiles.push({
        agentId: expectedAgent.configId,
        promptFile: expectedAgent.promptFile,
      });
    }

    if (expectedAgent.matrixId && !matrixLookup.has(normaliseId(expectedAgent.matrixId))) {
      report.driftWarnings.push({
        type: 'machine_policy_anchor_missing',
        agentId: expectedAgent.configId,
        detail: `Expected machine-policy anchor "${expectedAgent.matrixId}" is missing from .governance-sync/agent_capability_matrix.json.`,
      });
    }
  }

  for (const supportAgent of OPTIONAL_SUPPORT_AGENTS) {
    const configAgent = configLookup.get(normaliseId(supportAgent.configId));
    if (!configAgent) {
      continue;
    }

    const expectedPrompt = expectedPromptPath(supportAgent.promptFile);
    if (configAgent.systemPromptFile !== expectedPrompt) {
      pushPromptMismatch(
        report,
        supportAgent.configId,
        configAgent.systemPromptFile,
        expectedPrompt,
        `Support agent "${configAgent.id}" must point at ${basename(supportAgent.promptFile)}.`,
      );
    }

    if (!(await fileExists(supportAgent.promptFile))) {
      report.missingPromptFiles.push({
        agentId: supportAgent.configId,
        promptFile: supportAgent.promptFile,
      });
    }
  }

  for (const [normId, agent] of configLookup) {
    if (!requiredIds.has(normId) && !optionalIds.has(normId)) {
      report.driftWarnings.push({
        type: 'unknown_local_persona',
        agentId: agent.id,
        agentName: agent.name,
        detail: `Agent "${agent.id}" is present in config-template but is not declared in the local OpenClaw execution overlay registry.`,
      });
    }
  }

  for (const expectedAgent of REQUIRED_EXECUTION_AGENTS.filter((agent) => agent.matrixId)) {
    const configAgent = configLookup.get(normaliseId(expectedAgent.configId));
    const matrixEntry = matrixLookup.get(normaliseId(expectedAgent.matrixId));

    if (!configAgent || !matrixEntry) {
      continue;
    }

    if (
      (matrixEntry.value.category === 'governance_agent' || matrixEntry.value.category === 'execution_engine') &&
      !configAgent.elevated &&
      !configAgent.heartbeat?.enabled
    ) {
      report.driftWarnings.push({
        type: 'governance_agent_not_elevated',
        agentId: matrixEntry.originalKey,
        configId: configAgent.id,
        detail: `Governance/execution agent "${matrixEntry.originalKey}" has neither elevated:true nor heartbeat in config-template. Consider enabling one of them for monitoring.`,
      });
    }

    if (matrixEntry.value.owns_delivery_for_own_changes === true && (configAgent.timeoutSeconds || 180) < 120) {
      report.capabilityMismatches.push({
        agentId: matrixEntry.originalKey,
        configId: configAgent.id,
        field: 'timeoutSeconds',
        expected: '>= 120 (delivery-owning agent)',
        actual: configAgent.timeoutSeconds,
        detail: 'Agent owns delivery but has a very short timeout, which may cause incomplete task execution.',
      });
    }
  }

  if (manifest.data) {
    const allowedRepos = manifest.data.allowed_owner_repos || [];
    if (allowedRepos.length > 0 && !allowedRepos.includes('widgetdc-openclaw')) {
      report.driftWarnings.push({
        type: 'openclaw_not_in_allowed_repos',
        detail: `widgetdc-openclaw is not listed in bootstrap manifest allowed_owner_repos: [${allowedRepos.join(', ')}]`,
      });
    }

    const requiredReads = manifest.data.required_reads || [];
    if (requiredReads.length === 0) {
      report.driftWarnings.push({
        type: 'empty_required_reads',
        detail: 'Bootstrap manifest has no required_reads defined.',
      });
    }

    const closureRules = manifest.data.closure_rules || [];
    if (!closureRules.includes('OpenClaw is execution-only and never policy truth.')) {
      report.driftWarnings.push({
        type: 'closure_rule_missing',
        detail: 'Bootstrap manifest is missing the OpenClaw execution-only closure rule.',
      });
    }
  } else {
    report.driftWarnings.push({
      type: 'source_missing',
      source: 'agent_bootstrap_manifest.json',
      detail: manifest.error || 'File could not be loaded (non-fatal).',
    });
  }

  if (
    report.missingAgents.length > 0 ||
    report.missingPromptFiles.length > 0 ||
    report.capabilityMismatches.length > 0
  ) {
    report.status = 'FAIL';
  }

  const parts = [];
  parts.push(`Sources: ${Object.values(report.sources).filter((value) => value === 'OK').length}/3 OK`);
  parts.push(`Machine-policy anchors: ${REQUIRED_EXECUTION_AGENTS.filter((agent) => agent.source === 'machine_policy').length}`);
  parts.push(`Execution overlay agents: ${REQUIRED_EXECUTION_AGENTS.filter((agent) => agent.source === 'execution_overlay').length}`);
  parts.push(`Config agents: ${configAgentList.length}`);
  if (report.missingAgents.length > 0) {
    parts.push(`Missing from config: ${report.missingAgents.map((agent) => agent.agentId).join(', ')}`);
  }
  if (report.missingPromptFiles.length > 0) {
    parts.push(`Missing prompt files: ${report.missingPromptFiles.map((prompt) => prompt.promptFile).join(', ')}`);
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

export default async function run() {
  const report = await verifyGovernanceBootstrap();

  const statusIcon = report.status === 'PASS' ? '[PASS]' : '[FAIL]';
  const lines = [];
  lines.push(`${statusIcon} Governance Bootstrap Verification`);
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push('');

  lines.push('Sources:');
  for (const [name, status] of Object.entries(report.sources)) {
    lines.push(`  ${status === 'OK' ? '[OK]' : '[!!]'} ${name}: ${status}`);
  }
  lines.push('');

  if (report.missingAgents.length > 0) {
    lines.push(`Missing Agents (${report.missingAgents.length}):`);
    for (const missingAgent of report.missingAgents) {
      lines.push(`  - ${missingAgent.agentId} (${missingAgent.category} / ${missingAgent.primaryRole}) - not in ${missingAgent.expectedIn}`);
    }
    lines.push('');
  }

  if (report.missingPromptFiles.length > 0) {
    lines.push(`Missing Prompt Files (${report.missingPromptFiles.length}):`);
    for (const prompt of report.missingPromptFiles) {
      lines.push(`  - ${prompt.agentId}: ${prompt.promptFile}`);
    }
    lines.push('');
  }

  if (report.capabilityMismatches.length > 0) {
    lines.push(`Capability Mismatches (${report.capabilityMismatches.length}):`);
    for (const mismatch of report.capabilityMismatches) {
      lines.push(`  - ${mismatch.agentId}: ${mismatch.field} expected ${mismatch.expected}, got ${mismatch.actual}`);
      lines.push(`    ${mismatch.detail}`);
    }
    lines.push('');
  }

  if (report.driftWarnings.length > 0) {
    lines.push(`Drift Warnings (${report.driftWarnings.length}):`);
    for (const warning of report.driftWarnings) {
      lines.push(`  - [${warning.type}] ${warning.detail}`);
    }
    lines.push('');
  }

  lines.push(`Summary: ${report.summary}`);

  return lines.join('\n');
}
