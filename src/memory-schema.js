/**
 * Memory Schema Versioning — Agent state snapshot schema version + migration.
 *
 * Resolves compliance warning: memory-agent-state-schema (severity 3)
 * Source: configs/openclaw (agent-souls/config-template.json)
 *
 * Adds a schema_version field to all agent memory snapshots and provides
 * forward-compatible migration when the schema evolves.
 *
 * Schema changelog:
 *   v1 (initial)  — Memory nodes with: id, agentId, value, type, tier, timestamps
 *   v2 (current)  — Adds: schema_version, snapshot_format, migration_applied_at
 */

// ─── Current Schema ──────────────────────────────────────────────────────

export const CURRENT_SCHEMA_VERSION = 2;

export const SCHEMA_CHANGELOG = {
  1: {
    description: "Initial memory schema: id, agentId, value, type, tier, timestamps",
    introduced: "2026-01-01",
    fields: ["id", "agentId", "value", "type", "tier", "createdAt", "updatedAt"],
  },
  2: {
    description: "Add schema_version, snapshot_format, migration tracking",
    introduced: "2026-03-24",
    fields: [
      "id",
      "agentId",
      "value",
      "type",
      "tier",
      "createdAt",
      "updatedAt",
      "schema_version",
      "snapshot_format",
    ],
  },
};

// ─── Migration Functions ─────────────────────────────────────────────────

/**
 * @typedef {object} MemorySnapshot
 * @property {string} id
 * @property {string} agentId
 * @property {string} value
 * @property {string} type
 * @property {string} tier
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 * @property {number} [schema_version]
 * @property {string} [snapshot_format]
 * @property {string} [migration_applied_at]
 */

/**
 * Migrations are keyed by target version. Each receives a snapshot and returns
 * the migrated snapshot. Migrations are applied sequentially.
 * @type {Record<number, (snap: MemorySnapshot) => MemorySnapshot>}
 */
const migrations = {
  2: (snapshot) => ({
    ...snapshot,
    schema_version: 2,
    snapshot_format: "agent-memory-v2",
    migration_applied_at: new Date().toISOString(),
    // Ensure tier has a default
    tier: snapshot.tier || "working",
  }),
};

/**
 * Detect the schema version of a memory snapshot.
 * Returns the version number or 1 if no version is found.
 * @param {MemorySnapshot} snapshot
 * @returns {number}
 */
export function detectSchemaVersion(snapshot) {
  if (typeof snapshot?.schema_version === "number") {
    return snapshot.schema_version;
  }
  // v1 snapshots have no schema_version field
  return 1;
}

/**
 * Migrate a memory snapshot to the current schema version.
 * Applies all intermediate migrations sequentially.
 *
 * @param {MemorySnapshot} snapshot
 * @returns {{ snapshot: MemorySnapshot, migrated: boolean, fromVersion: number, toVersion: number }}
 */
export function migrateSnapshot(snapshot) {
  const fromVersion = detectSchemaVersion(snapshot);

  if (fromVersion >= CURRENT_SCHEMA_VERSION) {
    return { snapshot, migrated: false, fromVersion, toVersion: fromVersion };
  }

  let current = { ...snapshot };
  for (let v = fromVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    const migrateFn = migrations[v];
    if (migrateFn) {
      current = migrateFn(current);
    }
  }

  return {
    snapshot: current,
    migrated: true,
    fromVersion,
    toVersion: CURRENT_SCHEMA_VERSION,
  };
}

/**
 * Stamp a new memory snapshot with the current schema version.
 * Call this when creating new snapshots (memoryStore).
 *
 * @param {object} snapshot — Partial snapshot being created
 * @returns {object} — Snapshot with schema_version and snapshot_format added
 */
export function stampSchemaVersion(snapshot) {
  return {
    ...snapshot,
    schema_version: CURRENT_SCHEMA_VERSION,
    snapshot_format: `agent-memory-v${CURRENT_SCHEMA_VERSION}`,
  };
}

/**
 * Validate that a snapshot conforms to the current schema.
 * Returns a list of issues (empty = valid).
 *
 * @param {MemorySnapshot} snapshot
 * @returns {{ valid: boolean, issues: string[], schema_version: number }}
 */
export function validateSnapshot(snapshot) {
  const issues = [];
  const version = detectSchemaVersion(snapshot);

  const requiredV1 = ["id", "agentId", "value", "type"];
  for (const field of requiredV1) {
    if (!snapshot[field]) {
      issues.push(`Missing required field: ${field}`);
    }
  }

  if (version < CURRENT_SCHEMA_VERSION) {
    issues.push(
      `Schema version ${version} is outdated (current: ${CURRENT_SCHEMA_VERSION}). Migration recommended.`
    );
  }

  if (version >= 2 && !snapshot.snapshot_format) {
    issues.push("Missing snapshot_format field (required in v2+)");
  }

  return {
    valid: issues.length === 0,
    issues,
    schema_version: version,
  };
}

/**
 * Build the Cypher SET clause additions for schema version fields.
 * Use this when constructing MERGE/SET queries in memory-boot skill.
 *
 * @returns {string} — Cypher SET fragment (without leading comma)
 */
export function cypherSchemaFields() {
  return `m.schema_version = ${CURRENT_SCHEMA_VERSION}, m.snapshot_format = 'agent-memory-v${CURRENT_SCHEMA_VERSION}'`;
}
