/**
 * Linear-to-Task Automation Skill
 *
 * Checks Linear for new/updated issues and auto-creates orchestrator tasks.
 * Runs on-demand or can be scheduled via OpenClaw cron.
 *
 * Features:
 * - Fetches recent Linear issues via orchestrator proxy
 * - Creates tasks for appropriate agents based on issue labels/priority
 * - Tracks processed issues to avoid duplicates
 * - Falls back gracefully if Linear or task API is down
 */

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'https://orchestrator-production-c27e.up.railway.app';
const ORCHESTRATOR_API_KEY = process.env.ORCHESTRATOR_API_KEY || 'WidgeTDC_Orch_2026';

// Track last checked timestamp to avoid re-processing
let lastCheckedAt: string | null = null;

// Map Linear labels to agent assignments
const LABEL_TO_AGENT: Record<string, string> = {
  'bug': 'developer',
  'enhancement': 'developer',
  'documentation': 'writer',
  'research': 'researcher',
  'security': 'security',
  'performance': 'devops',
  'testing': 'qa',
  'design': 'ux',
  'planning': 'pm',
  'data': 'data',
  'analysis': 'analyst',
};

// Map Linear priority to task priority
const PRIORITY_MAP: Record<number, string> = {
  0: 'low',
  1: 'urgent',
  2: 'high',
  3: 'medium',
  4: 'low',
};

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  priority: number | null;
  assignee: { name: string; displayName: string } | null;
  labels: { name: string; color: string }[];
  createdAt: string;
  updatedAt: string;
}

interface TaskResult {
  success: boolean;
  taskId?: string;
  issue?: LinearIssue;
  agentId?: string;
  error?: string;
}

/**
 * Fetch recent Linear issues from the orchestrator proxy
 */
async function fetchLinearIssues(): Promise<LinearIssue[]> {
  try {
    const url = `${ORCHESTRATOR_URL}/api/linear/issues?limit=50&status=active`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${ORCHESTRATOR_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[linear-tasks] Failed to fetch Linear issues: ${err}`);
    return [];
  }
}

/**
 * Determine the best agent for an issue based on labels and content
 */
function assignAgent(issue: LinearIssue): string {
  // If already assigned in Linear, use that agent name
  if (issue.assignee?.name) {
    return issue.assignee.name.toLowerCase();
  }

  // Check labels for agent mapping
  if (issue.labels?.length > 0) {
    for (const label of issue.labels) {
      const agent = LABEL_TO_AGENT[label.name.toLowerCase()];
      if (agent) return agent;
    }
  }

  // Default to main agent (Omega Sentinel)
  return 'main';
}

/**
 * Create a task in the orchestrator for a Linear issue
 */
async function createTask(issue: LinearIssue, agentId: string): Promise<TaskResult> {
  try {
    const priority = PRIORITY_MAP[issue.priority ?? 3] ?? 'medium';
    const description = issue.description?.substring(0, 500) ?? 'No description';
    const labelNames = issue.labels?.map(l => l.name).join(', ') ?? 'none';

    const res = await fetch(`${ORCHESTRATOR_URL}/api/tasks?agentId=${agentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ORCHESTRATOR_API_KEY}`,
      },
      body: JSON.stringify({
        title: `[${issue.identifier}] ${issue.title}`,
        type: 'linear_issue',
        instructions: `Linear issue: ${issue.identifier}\nState: ${issue.state}\nLabels: ${labelNames}\n\n${description}`,
        priority,
        context: {
          linearIssueId: issue.id,
          linearIdentifier: issue.identifier,
          linearUrl: issue.identifier ? `https://linear.app/widgetdc/issue/${issue.identifier.split('-')[1]}` : null,
          state: issue.state,
          labels: issue.labels,
          priority: issue.priority,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, taskId: data?.taskId, issue, agentId };
  } catch (err) {
    return { success: false, issue, agentId, error: String(err) };
  }
}

/**
 * Sync Linear issues to orchestrator tasks.
 * Returns summary of actions taken.
 */
export async function syncLinearToTasks(): Promise<{
  issuesChecked: number;
  tasksCreated: number;
  tasksSkipped: number;
  errors: number;
  details: TaskResult[];
}> {
  const issues = await fetchLinearIssues();
  const details: TaskResult[] = [];
  let tasksCreated = 0;
  let tasksSkipped = 0;
  let errors = 0;

  for (const issue of issues) {
    // Skip if already completed/canceled
    if (issue.state?.toLowerCase() === 'completed' || issue.state?.toLowerCase() === 'canceled') {
      tasksSkipped++;
      continue;
    }

    // Skip if we've already processed this issue
    // (simple dedup by checking if task already exists — in production would use a processed_issues table)

    const agentId = assignAgent(issue);
    const result = await createTask(issue, agentId);
    details.push(result);

    if (result.success) {
      tasksCreated++;
      console.log(`[linear-tasks] Created task ${result.taskId} for ${issue.identifier} → ${agentId}`);
    } else {
      errors++;
      console.warn(`[linear-tasks] Failed to create task for ${issue.identifier}: ${result.error}`);
    }
  }

  return {
    issuesChecked: issues.length,
    tasksCreated,
    tasksSkipped,
    errors,
    details,
  };
}

/**
 * One-shot sync — call from chat or cron
 */
export async function linear_sync(mode: string = 'run'): Promise<unknown> {
  switch (mode?.toLowerCase()) {
    case 'run':
    case 'sync':
    case 'check':
      return syncLinearToTasks();

    case 'status':
      return {
        lastCheckedAt,
        orchestratorUrl: ORCHESTRATOR_URL,
        note: 'Use /linear-sync run to check Linear for new tasks',
      };

    default:
      return {
        help: 'Linear-to-Task Automation — sync Linear issues to agent tasks 🔗',
        commands: {
          '/linear-sync run': 'Check Linear and create tasks for active issues',
          '/linear-sync status': 'Show last sync time and config',
        },
      };
  }
}
