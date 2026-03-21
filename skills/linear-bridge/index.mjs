/**
 * Linear Bridge Skill — OpenClaw ↔ Linear operational coordination
 *
 * Governance: Linear is operational truth. OpenClaw is execution surface.
 */

const LINEAR_API = 'https://api.linear.app/graphql';
const API_KEY = process.env.LINEAR_API_KEY || '';
const DEFAULT_TEAM_ID = process.env.LINEAR_TEAM_ID || 'e7e882f6-d598-4dc4-8766-eaa76dcf140f';

// ── GraphQL helper ──────────────────────────────────────────────

async function gql(query, variables = {}) {
  if (!API_KEY) {
    throw new Error('LINEAR_API_KEY not set. Cannot connect to Linear.');
  }

  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': API_KEY,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Linear API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Linear GraphQL: ${json.errors.map(e => e.message).join('; ')}`);
  }
  return json.data;
}

// ── Issue operations ────────────────────────────────────────────

export async function getIssue(identifier) {
  const data = await gql(`
    query($id: String!) {
      issue(id: $id) {
        id identifier title description priority priorityLabel
        state { name type }
        assignee { name }
        labels { nodes { name } }
        createdAt updatedAt
        url
      }
    }
  `, { id: identifier });
  return data.issue;
}

export async function listIssues(filter = {}) {
  const { state, limit = 25 } = filter;

  let filterClause = `teamId: "${DEFAULT_TEAM_ID}"`;
  if (state) {
    const stateMap = {
      'todo': 'unstarted',
      'in_progress': 'started',
      'done': 'completed',
      'blocked': 'started',
    };
    const stateType = stateMap[state] || state;
    filterClause += `, state: { type: { eq: "${stateType}" } }`;
  }

  const data = await gql(`
    query {
      issues(
        filter: { ${filterClause} }
        first: ${limit}
        orderBy: updatedAt
      ) {
        nodes {
          identifier title priorityLabel
          state { name type }
          assignee { name }
          labels { nodes { name } }
          updatedAt
        }
      }
    }
  `);
  return data.issues.nodes;
}

export async function createIssue({ title, description = '', priority = 3, labels = [] }) {
  const input = {
    teamId: DEFAULT_TEAM_ID,
    title,
    description,
    priority,
  };

  const data = await gql(`
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id identifier title url
          state { name }
        }
      }
    }
  `, { input });

  if (!data.issueCreate.success) {
    throw new Error('Failed to create Linear issue');
  }
  return data.issueCreate.issue;
}

export async function updateIssueState(identifier, stateName) {
  // First get state ID
  const statesData = await gql(`
    query {
      workflowStates(filter: { team: { id: { eq: "${DEFAULT_TEAM_ID}" } } }) {
        nodes { id name type }
      }
    }
  `);

  const targetState = statesData.workflowStates.nodes.find(
    s => s.name.toLowerCase() === stateName.toLowerCase() || s.type === stateName
  );

  if (!targetState) {
    const available = statesData.workflowStates.nodes.map(s => s.name).join(', ');
    throw new Error(`State "${stateName}" not found. Available: ${available}`);
  }

  // Get issue ID from identifier
  const issueData = await gql(`
    query($id: String!) {
      issue(id: $id) { id }
    }
  `, { id: identifier });

  const data = await gql(`
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { identifier title state { name } url }
      }
    }
  `, { id: issueData.issue.id, input: { stateId: targetState.id } });

  return data.issueUpdate.issue;
}

export async function activeBacklogSummary() {
  const [todo, inProgress] = await Promise.all([
    listIssues({ state: 'todo', limit: 50 }),
    listIssues({ state: 'in_progress', limit: 50 }),
  ]);

  return {
    timestamp: new Date().toISOString(),
    teamId: DEFAULT_TEAM_ID,
    counts: {
      todo: todo.length,
      in_progress: inProgress.length,
      total: todo.length + inProgress.length,
    },
    in_progress: inProgress.map(i => ({
      id: i.identifier,
      title: i.title,
      priority: i.priorityLabel,
      assignee: i.assignee?.name ?? 'unassigned',
      labels: i.labels.nodes.map(l => l.name),
    })),
    todo: todo.map(i => ({
      id: i.identifier,
      title: i.title,
      priority: i.priorityLabel,
      labels: i.labels.nodes.map(l => l.name),
    })),
  };
}

// ── Default handler (OpenClaw invocation) ───────────────────────

export default async function run(args) {
  const input = (args || '').trim();

  if (!API_KEY) {
    return '❌ LINEAR_API_KEY not set. Add it to OpenClaw environment variables.';
  }

  // Parse command
  const parts = input.split(/\s+/);
  const cmd = parts[0]?.toLowerCase() || 'status';

  try {
    switch (cmd) {
      case 'status':
      case 'sync': {
        const summary = await activeBacklogSummary();
        const lines = [
          `📋 Linear Backlog — ${summary.timestamp}`,
          `   In Progress: ${summary.counts.in_progress} | Todo: ${summary.counts.todo}`,
          '',
        ];
        if (summary.in_progress.length) {
          lines.push('**In Progress:**');
          for (const i of summary.in_progress) {
            lines.push(`  • ${i.id}: ${i.title} [${i.priority}] → ${i.assignee}`);
          }
        }
        if (summary.todo.length) {
          lines.push('', '**Todo (top 10):**');
          for (const i of summary.todo.slice(0, 10)) {
            lines.push(`  • ${i.id}: ${i.title} [${i.priority}]`);
          }
        }
        return lines.join('\n');
      }

      case 'issue': {
        const id = parts[1];
        if (!id) return 'Usage: /linear issue LIN-123';
        const issue = await getIssue(id);
        if (!issue) return `Issue ${id} not found.`;
        return [
          `**${issue.identifier}: ${issue.title}**`,
          `State: ${issue.state.name} | Priority: ${issue.priorityLabel}`,
          `Assignee: ${issue.assignee?.name ?? 'unassigned'}`,
          `Labels: ${issue.labels.nodes.map(l => l.name).join(', ') || 'none'}`,
          `URL: ${issue.url}`,
          '',
          issue.description || '(no description)',
        ].join('\n');
      }

      case 'list': {
        const filter = parts[1] || undefined;
        const issues = await listIssues({ state: filter });
        if (!issues.length) return `No issues found${filter ? ` with state "${filter}"` : ''}.`;
        const lines = issues.map(i =>
          `${i.identifier}: ${i.title} [${i.state.name}] ${i.priorityLabel}`
        );
        return lines.join('\n');
      }

      case 'create': {
        const title = parts.slice(1).join(' ');
        if (!title) return 'Usage: /linear create "Issue title"';
        const issue = await createIssue({ title });
        return `✅ Created ${issue.identifier}: ${issue.title}\n   ${issue.url}`;
      }

      case 'update': {
        const id = parts[1];
        const state = parts[2];
        if (!id || !state) return 'Usage: /linear update LIN-123 "In Progress"';
        const issue = await updateIssueState(id, state);
        return `✅ ${issue.identifier} → ${issue.state.name}\n   ${issue.url}`;
      }

      default:
        return [
          'Linear Bridge — Commands:',
          '  /linear status              — Active backlog summary',
          '  /linear issue LIN-123       — Issue details',
          '  /linear list [state]        — List issues (todo|in_progress)',
          '  /linear create "title"      — Create issue',
          '  /linear update LIN-123 state — Update issue state',
          '  /linear sync                — Sync backlog snapshot',
        ].join('\n');
    }
  } catch (err) {
    return `❌ Linear error: ${err.message}`;
  }
}
