/**
 * CI/CD Monitor Skill for OpenClaw
 *
 * Monitors GitHub Actions across all widgetdc-* repos.
 * Reports failures, extracts error logs, suggests fixes.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Clauskraft';
const GH_API = 'https://api.github.com';

const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours — ignore runs older than this

const REPOS = [
  'WidgeTDC',
  'widgetdc-openclaw',
  'widgetdc-rlm-engine',
  'widgetdc-consulting-frontend',
  'widgetdc-contracts',
  'widgetdc-n8n',
];

interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
  head_branch: string;
}

interface RunsResponse {
  workflow_runs: WorkflowRun[];
}

function isRecent(run: WorkflowRun): boolean {
  return Date.now() - new Date(run.created_at).getTime() < MAX_AGE_MS;
}

const headers: Record<string, string> = {
  'Authorization': `token ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'OpenClaw-CICD-Monitor',
};

async function ghFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${GH_API}${path}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  return res.json() as Promise<T>;
}

async function getRepoRuns(repo: string, limit = 5): Promise<WorkflowRun[]> {
  const data = await ghFetch<RunsResponse>(
    `/repos/${GITHUB_OWNER}/${repo}/actions/runs?per_page=${limit}`
  );
  return (data.workflow_runs || []).filter(isRecent);
}

async function getFailedLogs(repo: string, runId: number): Promise<string> {
  try {
    const jobs = await ghFetch<{ jobs: Array<{ id: number; name: string; conclusion: string; steps: Array<{ name: string; conclusion: string }> }> }>(
      `/repos/${GITHUB_OWNER}/${repo}/actions/runs/${runId}/jobs`
    );

    const failedJob = jobs.jobs.find(j => j.conclusion === 'failure');
    if (!failedJob) return 'No failed job found';

    const logRes = await fetch(
      `${GH_API}/repos/${GITHUB_OWNER}/${repo}/actions/jobs/${failedJob.id}/logs`,
      { headers, signal: AbortSignal.timeout(15_000) }
    );

    if (!logRes.ok) return `Could not fetch logs: ${logRes.status}`;

    const fullLog = await logRes.text();
    // Extract last 60 lines (usually contains the error)
    const lines = fullLog.split('\n');
    const tail = lines.slice(-60).join('\n');
    return tail.length > 3000 ? tail.substring(tail.length - 3000) : tail;
  } catch (e) {
    return `Log fetch error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ═══ Public Skill Functions ═══

export async function cicd(action: string = 'status', repoFilter?: string) {
  if (!GITHUB_TOKEN) {
    return { error: 'GITHUB_TOKEN not set. Add it to .env and restart gateway.' };
  }

  switch (action.toLowerCase()) {
    case 'status':
      return cicdStatus();
    case 'failures':
      return cicdFailures();
    case 'logs':
      return cicdLogs(repoFilter);
    case 'watch':
      return cicdWatch();
    default:
      return {
        help: 'Tilgængelige kommandoer: status, failures, logs <repo>, watch',
        examples: ['/cicd status', '/cicd failures', '/cicd logs widgetdc-rlm-engine'],
      };
  }
}

async function cicdStatus() {
  const results = await Promise.allSettled(
    REPOS.map(async (repo) => {
      const runs = await getRepoRuns(repo, 3);
      const latest = runs[0];
      return {
        repo,
        hasCI: runs.length > 0,
        latest: latest
          ? {
              workflow: latest.name,
              status: latest.conclusion || latest.status,
              branch: latest.head_branch,
              when: latest.created_at,
              url: latest.html_url,
            }
          : null,
        recentFailures: runs.filter(r => r.conclusion === 'failure').length,
      };
    })
  );

  const summary = results.map((r, i) => {
    if (r.status === 'rejected') {
      return { repo: REPOS[i], error: String(r.reason) };
    }
    return r.value;
  });

  const failing = summary.filter(
    (s) => 'latest' in s && s.latest && s.latest.status === 'failure'
  );

  return {
    timestamp: new Date().toISOString(),
    totalRepos: REPOS.length,
    reposWithCI: summary.filter((s) => 'hasCI' in s && s.hasCI).length,
    currentlyFailing: failing.length,
    repos: summary,
  };
}

async function cicdFailures() {
  const allRuns = await Promise.allSettled(
    REPOS.map(async (repo) => {
      const runs = await getRepoRuns(repo, 5);
      const failures = runs.filter((r) => r.conclusion === 'failure');
      if (failures.length === 0) return null;

      // Get logs for the most recent failure
      const latestFail = failures[0];
      const logs = await getFailedLogs(repo, latestFail.id);

      return {
        repo,
        failureCount: failures.length,
        latestFailure: {
          workflow: latestFail.name,
          branch: latestFail.head_branch,
          when: latestFail.created_at,
          url: latestFail.html_url,
        },
        errorLog: logs,
      };
    })
  );

  const failures = allRuns
    .filter((r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof getRepoRuns>>>> =>
      r.status === 'fulfilled' && r.value !== null
    )
    .map((r) => r.value);

  return {
    timestamp: new Date().toISOString(),
    totalFailingRepos: failures.length,
    failures,
    recommendation: failures.length === 0
      ? 'Alle repos er grønne!'
      : `${failures.length} repo(s) har fejl. Brug /cicd logs <repo> for detaljer.`,
  };
}

async function cicdLogs(repo?: string) {
  if (!repo) {
    return { error: 'Angiv repo-navn: /cicd logs widgetdc-rlm-engine' };
  }

  const targetRepo = REPOS.find(
    (r) => r.toLowerCase() === repo.toLowerCase() || r.toLowerCase().includes(repo.toLowerCase())
  );
  if (!targetRepo) {
    return { error: `Repo "${repo}" ikke fundet. Tilgængelige: ${REPOS.join(', ')}` };
  }

  const runs = await getRepoRuns(targetRepo, 1);
  if (runs.length === 0) {
    return { repo: targetRepo, message: 'Ingen CI runs fundet.' };
  }

  const latest = runs[0];
  const logs = latest.conclusion === 'failure'
    ? await getFailedLogs(targetRepo, latest.id)
    : 'Seneste run er OK — ingen fejllog.';

  return {
    repo: targetRepo,
    run: {
      workflow: latest.name,
      status: latest.conclusion || latest.status,
      branch: latest.head_branch,
      when: latest.created_at,
      url: latest.html_url,
    },
    logs,
  };
}

async function cicdWatch() {
  const [status, failures] = await Promise.all([cicdStatus(), cicdFailures()]);

  const lines: string[] = [
    `🔧 CI/CD MONITOR — ${new Date().toISOString()}`,
    `═══════════════════════════════════════`,
    `Repos: ${status.totalRepos} total, ${status.reposWithCI} med CI`,
    `Status: ${status.currentlyFailing === 0 ? '✅ Alt grønt' : `🔴 ${status.currentlyFailing} fejlende`}`,
    '',
  ];

  for (const repo of status.repos) {
    if ('error' in repo) {
      lines.push(`❓ ${repo.repo} — API fejl`);
    } else if (!repo.hasCI) {
      lines.push(`⚪ ${repo.repo} — Ingen CI`);
    } else if (repo.latest?.status === 'failure') {
      lines.push(`🔴 ${repo.repo} — FEJL (${repo.latest.workflow}) [${repo.recentFailures}/3 fejl]`);
    } else {
      lines.push(`✅ ${repo.repo} — OK (${repo.latest?.workflow})`);
    }
  }

  if (failures.totalFailingRepos > 0) {
    lines.push('', '── FEJLDETALJER ──');
    for (const f of failures.failures as Array<{ repo: string; latestFailure: { workflow: string; when: string }; errorLog: string }>) {
      lines.push(``, `🔴 ${f.repo} (${f.latestFailure.workflow}):`);
      // Last 5 meaningful lines from error log
      const errorLines = f.errorLog
        .split('\n')
        .filter((l: string) => l.includes('ERROR') || l.includes('error') || l.includes('failed') || l.includes('FAIL'))
        .slice(-5);
      for (const el of errorLines) {
        lines.push(`   ${el.trim().substring(0, 120)}`);
      }
    }
  }

  return lines.join('\n');
}
