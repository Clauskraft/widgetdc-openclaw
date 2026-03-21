#!/usr/bin/env node
/**
 * sync-governance-bundle.mjs
 *
 * Syncs governance files from the WidgeTDC monorepo into
 * .governance-sync/ in this repository.
 *
 * Usage:
 *   node scripts/sync-governance-bundle.mjs [source-path]
 *
 * If source-path is omitted the script defaults to ../WidgeTDC relative
 * to the repo root, which matches the standard Clauskraft project layout.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, '..');

// ── configuration ───────────────────────────────────────────────────
const DEFAULT_SOURCE = resolve(REPO_ROOT, '..', 'WidgeTDC');
const TARGET_DIR     = resolve(REPO_ROOT, '.governance-sync');

const FILES = [
  { src: 'MASTER_POLICY.md',                        dst: 'MASTER_POLICY.md' },
  { src: 'config/runtime_compliance_policy.json',    dst: 'runtime_compliance_policy.json' },
  { src: 'config/agent_capability_matrix.json',      dst: 'agent_capability_matrix.json' },
  { src: 'config/agent_bootstrap_manifest.json',     dst: 'agent_bootstrap_manifest.json' },
  { src: 'docs/OPENCLAW_USAGE_POLICY.md',            dst: 'OPENCLAW_USAGE_POLICY.md' },
  { src: 'docs/AGENT_COMPLIANCE.md',                 dst: 'AGENT_COMPLIANCE.md' },
];

const MD_HEADER   = '<!-- SYNCED FROM WidgeTDC — DO NOT EDIT LOCALLY —>\n\n';
const SYNC_FIELD  = '_synced_from';
const SYNC_VALUE  = 'WidgeTDC — DO NOT EDIT LOCALLY';

// ── helpers ─────────────────────────────────────────────────────────
function isJson(name) {
  return name.endsWith('.json');
}

function stamp(content, filename) {
  if (isJson(filename)) {
    try {
      const obj = JSON.parse(content);
      obj[SYNC_FIELD] = SYNC_VALUE;
      return JSON.stringify(obj, null, 2) + '\n';
    } catch {
      // If parsing fails, return content as-is with a comment note
      console.warn(`  ⚠  Could not parse ${filename} as JSON — copying raw`);
      return content;
    }
  }
  // Markdown / other text files
  return MD_HEADER + content;
}

// ── main ────────────────────────────────────────────────────────────
async function main() {
  const sourcePath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : DEFAULT_SOURCE;

  console.log(`Governance bundle sync`);
  console.log(`  Source : ${sourcePath}`);
  console.log(`  Target : ${TARGET_DIR}`);
  console.log('');

  await mkdir(TARGET_DIR, { recursive: true });

  let synced  = 0;
  let skipped = 0;

  for (const { src, dst } of FILES) {
    const srcPath = resolve(sourcePath, src);
    const dstPath = resolve(TARGET_DIR, dst);

    try {
      const raw = await readFile(srcPath, 'utf-8');
      const out = stamp(raw, dst);
      await writeFile(dstPath, out, 'utf-8');
      console.log(`  ✓  ${src} → .governance-sync/${dst}`);
      synced++;
    } catch (err) {
      console.warn(`  ✗  ${src} — ${err.code === 'ENOENT' ? 'file not found, skipping' : err.message}`);
      skipped++;
    }
  }

  console.log('');
  console.log(`Done. Synced: ${synced}, Skipped: ${skipped}`);

  if (skipped > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exitCode = 2;
});
