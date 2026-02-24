/**
 * Slack Bridge Skill — Send notifications via WidgeTDC Backend
 *
 * Uses POST /api/notifications/send on backend.
 * Requires SLACK_WEBHOOK_URL configured on Railway (backend).
 *
 * Use cases:
 * - Alert team when OpenClaw agent completes critical task
 * - Share RAG synthesis summaries to Slack channel
 * - Notify on health degradation
 * - Hourly agent status updates to #agent-status
 * - Kanban board management
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const BACKEND = process.env.WIDGETDC_BACKEND_URL || 'https://backend-production-d3da.up.railway.app';

export type SlackLevel = 'info' | 'warning' | 'critical' | 'success';

export interface SlackPayload {
  level?: SlackLevel;
  title: string;
  message: string;
  source?: string;
  fields?: Record<string, string>;
  channel?: string;
}

// Kanban board state (in-memory, synced to Neo4j)
interface KanbanTask {
  id: string;
  title: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  assignee?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  updatedAt: string;
}

/**
 * Send notification to Slack via WidgeTDC backend.
 */
export async function notify(payload: SlackPayload): Promise<{ sent: boolean; error?: string }> {
  if (!payload.title || !payload.message) {
    return { sent: false, error: 'title and message required' };
  }
  try {
    const res = await fetch(`${BACKEND}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: payload.level || 'info',
        title: payload.title,
        message: payload.message,
        source: payload.source || 'OpenClaw',
        fields: payload.fields,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const err = await res.text();
      return { sent: false, error: `${res.status}: ${err}` };
    }
    const data = (await res.json()) as { success?: boolean; data?: { sent?: boolean } };
    return { sent: data?.data?.sent ?? data?.success ?? true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sent: false, error: msg };
  }
}

/**
 * Quick helpers for common notification types.
 */
export async function alertCritical(title: string, message: string, fields?: Record<string, string>) {
  return notify({ level: 'critical', title, message, source: 'OpenClaw-Alert', fields });
}

export async function alertSuccess(title: string, message: string, fields?: Record<string, string>) {
  return notify({ level: 'success', title, message, source: 'OpenClaw', fields });
}

export async function shareRagSummary(query: string, summary: string, domains: string[]) {
  return notify({
    level: 'info',
    title: `RAG: ${query.slice(0, 60)}${query.length > 60 ? '...' : ''}`,
    message: summary.slice(0, 1500),
    source: 'OpenClaw-RAG',
    fields: { Domains: domains.join(', ') },
  });
}

// ─── Agent Status Channel ─────────────────────────────────────────────────

/**
 * Post hourly agent status to #agent-status channel
 */
export async function postAgentStatus(status: {
  overall: string;
  agents: { id: string; name: string; emoji: string; status: string }[];
  services: Record<string, { ok: boolean; latencyMs?: number }>;
}): Promise<{ sent: boolean; error?: string }> {
  const agentLines = status.agents
    .map(a => `${a.emoji} ${a.name}: ${a.status === 'active' ? '🟢' : a.status === 'idle' ? '🟡' : '🔴'}`)
    .join('\n');

  const serviceLines = Object.entries(status.services)
    .map(([name, s]) => `• ${name}: ${s.ok ? '✅' : '❌'}${s.latencyMs ? ` (${s.latencyMs}ms)` : ''}`)
    .join('\n');

  return notify({
    level: status.overall.includes('healthy') ? 'success' : 'warning',
    title: `🕐 Hourly Status: ${status.overall}`,
    message: `*Services:*\n${serviceLines}\n\n*Agents:*\n${agentLines}`,
    source: 'OpenClaw-Status',
    channel: '#agent-status',
  });
}

// ─── Kanban Board ─────────────────────────────────────────────────────────

/**
 * Create a new Kanban task
 */
export async function kanbanCreate(task: {
  title: string;
  assignee?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}): Promise<KanbanTask> {
  const id = `task_${Date.now()}`;
  const now = new Date().toISOString();

  const newTask: KanbanTask = {
    id,
    title: task.title,
    status: 'backlog',
    assignee: task.assignee,
    priority: task.priority ?? 'medium',
    createdAt: now,
    updatedAt: now,
  };

  // Save to Neo4j
  await widgetdc_mcp('graph.write_cypher', {
    query: `
      CREATE (t:KanbanTask {
        id: $id,
        title: $title,
        status: $status,
        assignee: $assignee,
        priority: $priority,
        createdAt: datetime(),
        updatedAt: datetime()
      })
    `,
    params: newTask,
  });

  // Notify Slack
  await notify({
    level: 'info',
    title: '📋 New Task Created',
    message: `*${task.title}*\nAssignee: ${task.assignee ?? 'Unassigned'}\nPriority: ${task.priority ?? 'medium'}`,
    source: 'Kanban',
    channel: '#agent-status',
  });

  return newTask;
}

/**
 * Move a Kanban task to a new status
 */
export async function kanbanMove(
  taskId: string,
  newStatus: KanbanTask['status']
): Promise<{ success: boolean; task?: KanbanTask; error?: string }> {
  try {
    const result = await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (t:KanbanTask {id: $taskId})
        SET t.status = $newStatus, t.updatedAt = datetime()
        RETURN t.id AS id, t.title AS title, t.status AS status,
               t.assignee AS assignee, t.priority AS priority
      `,
      params: { taskId, newStatus },
    }) as { results?: KanbanTask[] };

    const task = result?.results?.[0];
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    // Notify on important status changes
    if (newStatus === 'done') {
      await notify({
        level: 'success',
        title: '✅ Task Completed',
        message: `*${task.title}*\nCompleted by: ${task.assignee ?? 'Unknown'}`,
        source: 'Kanban',
        channel: '#agent-status',
      });
    }

    return { success: true, task };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Get Kanban board state
 */
export async function kanbanBoard(): Promise<{
  backlog: KanbanTask[];
  todo: KanbanTask[];
  in_progress: KanbanTask[];
  review: KanbanTask[];
  done: KanbanTask[];
}> {
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (t:KanbanTask)
      RETURN t.id AS id, t.title AS title, t.status AS status,
             t.assignee AS assignee, t.priority AS priority,
             t.createdAt AS createdAt, t.updatedAt AS updatedAt
      ORDER BY t.priority DESC, t.createdAt ASC
    `,
  }) as { results?: KanbanTask[] };

  const tasks = result?.results ?? [];

  return {
    backlog: tasks.filter(t => t.status === 'backlog'),
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    review: tasks.filter(t => t.status === 'review'),
    done: tasks.filter(t => t.status === 'done'),
  };
}

/**
 * Post Kanban board to Slack
 */
export async function kanbanPost(): Promise<{ sent: boolean; error?: string }> {
  const board = await kanbanBoard();

  const formatColumn = (name: string, tasks: KanbanTask[]) => {
    if (tasks.length === 0) return `*${name}:* (empty)`;
    return `*${name}:*\n${tasks.map(t => 
      `• ${t.priority === 'critical' ? '🔴' : t.priority === 'high' ? '🟠' : '⚪'} ${t.title}${t.assignee ? ` (@${t.assignee})` : ''}`
    ).join('\n')}`;
  };

  const message = [
    formatColumn('📥 Backlog', board.backlog),
    formatColumn('📋 To Do', board.todo),
    formatColumn('🔄 In Progress', board.in_progress),
    formatColumn('👀 Review', board.review),
    formatColumn('✅ Done (recent)', board.done.slice(0, 5)),
  ].join('\n\n');

  return notify({
    level: 'info',
    title: '📊 Kanban Board',
    message,
    source: 'Kanban',
    channel: '#agent-status',
  });
}

// ─── Skill Router ─────────────────────────────────────────────────────────

export async function slack_bridge(action = 'help', ...args: string[]): Promise<unknown> {
  switch (action.toLowerCase().trim()) {
    case 'notify':
      if (!args[0] || !args[1]) {
        return { error: 'Brug: /slack notify <title> <message>' };
      }
      return notify({ title: args[0], message: args.slice(1).join(' ') });

    case 'alert':
      if (!args[0] || !args[1]) {
        return { error: 'Brug: /slack alert <title> <message>' };
      }
      return alertCritical(args[0], args.slice(1).join(' '));

    case 'kanban':
    case 'board':
      return kanbanBoard();

    case 'kanban-post':
      return kanbanPost();

    case 'task-create':
      if (!args[0]) {
        return { error: 'Brug: /slack task-create <title> [assignee] [priority]' };
      }
      return kanbanCreate({
        title: args[0],
        assignee: args[1],
        priority: args[2] as any,
      });

    case 'task-move':
      if (!args[0] || !args[1]) {
        return { error: 'Brug: /slack task-move <taskId> <status>' };
      }
      return kanbanMove(args[0], args[1] as any);

    default:
      return {
        help: 'Slack Bridge — Notifications & Kanban 📢',
        commands: {
          '/slack notify <title> <message>': 'Send notification',
          '/slack alert <title> <message>': 'Send critical alert',
          '/slack board': 'Vis Kanban board',
          '/slack kanban-post': 'Post Kanban til Slack',
          '/slack task-create <title> [assignee] [priority]': 'Opret task',
          '/slack task-move <taskId> <status>': 'Flyt task (backlog/todo/in_progress/review/done)',
        },
      };
  }
}

export default slack_bridge;
