/**
 * Slack Bridge Skill — Full Agent Communication Hub
 *
 * Features:
 * - Send notifications via WidgeTDC Backend
 * - Individual agent channels (#agent-{id})
 * - @mention routing to specific agents
 * - Kanban board management
 * - Hourly agent status updates
 * - Agent-to-agent messaging
 *
 * Agent Channels:
 * - #agent-status — Platform-wide status & alerts
 * - #agent-main — Kaptajn Klo (main agent)
 * - #agent-orchestrator — Dirigenten (orchestrator)
 * - #agent-analyst — Analytikeren
 * - #agent-writer — Skribleren
 * - #agent-researcher — Forskeren
 * - #agent-developer — Udvikleren
 * - #agent-security — Sikkerhedsvagten
 * - #agent-devops — DevOps Ninja
 * - #agent-qa — QA Mesteren
 * - #agent-ux — UX Designeren
 * - #agent-data — Data Scientist
 * - #agent-pm — Projekt Manager
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

const BACKEND = process.env.WIDGETDC_BACKEND_URL || 'https://backend-production-d3da.up.railway.app';

// ─── Agent Registry ───────────────────────────────────────────────────────

export const AGENTS = [
  { id: 'main', name: 'Kaptajn Klo', emoji: '🦀', channel: '#agent-main' },
  { id: 'orchestrator', name: 'Dirigenten', emoji: '🎭', channel: '#agent-orchestrator' },
  { id: 'analyst', name: 'Analytikeren', emoji: '📊', channel: '#agent-analyst' },
  { id: 'writer', name: 'Skribleren', emoji: '✍️', channel: '#agent-writer' },
  { id: 'researcher', name: 'Forskeren', emoji: '🔬', channel: '#agent-researcher' },
  { id: 'developer', name: 'Udvikleren', emoji: '💻', channel: '#agent-developer' },
  { id: 'security', name: 'Sikkerhedsvagten', emoji: '🛡️', channel: '#agent-security' },
  { id: 'devops', name: 'DevOps Ninja', emoji: '🚀', channel: '#agent-devops' },
  { id: 'qa', name: 'QA Mesteren', emoji: '🧪', channel: '#agent-qa' },
  { id: 'ux', name: 'UX Designeren', emoji: '🎨', channel: '#agent-ux' },
  { id: 'data', name: 'Data Scientist', emoji: '📈', channel: '#agent-data' },
  { id: 'pm', name: 'Projekt Manager', emoji: '📋', channel: '#agent-pm' },
] as const;

export type AgentId = typeof AGENTS[number]['id'];

export function getAgent(id: string) {
  return AGENTS.find(a => a.id === id);
}

export function getAgentChannel(id: string): string {
  const agent = getAgent(id);
  return agent?.channel ?? `#agent-${id}`;
}

// ─── Types ────────────────────────────────────────────────────────────────

export type SlackLevel = 'info' | 'warning' | 'critical' | 'success';

export interface SlackPayload {
  level?: SlackLevel;
  title: string;
  message: string;
  source?: string;
  fields?: Record<string, string>;
  channel?: string;
}

export interface AgentMessage {
  from: AgentId | string;
  to: AgentId | string;
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  replyTo?: string;
  threadId?: string;
}

interface KanbanTask {
  id: string;
  title: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  assignee?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  updatedAt: string;
}

// ─── Core Notification ────────────────────────────────────────────────────

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
        channel: payload.channel,
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
 * Send to agent-specific channel
 */
export async function notifyAgent(
  agentId: AgentId | string,
  title: string,
  message: string,
  level: SlackLevel = 'info'
): Promise<{ sent: boolean; error?: string }> {
  const agent = getAgent(agentId);
  const channel = agent?.channel ?? `#agent-${agentId}`;
  const emoji = agent?.emoji ?? '🤖';

  return notify({
    level,
    title: `${emoji} ${title}`,
    message,
    source: agent?.name ?? agentId,
    channel,
  });
}

/**
 * Send message from one agent to another
 */
export async function sendAgentMessage(msg: AgentMessage): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  const fromAgent = getAgent(msg.from);
  const toAgent = getAgent(msg.to);
  const toChannel = toAgent?.channel ?? `#agent-${msg.to}`;

  const priorityEmoji = msg.priority === 'urgent' ? '🔴' : msg.priority === 'high' ? '🟠' : '⚪';
  const fromName = fromAgent?.name ?? msg.from;
  const fromEmoji = fromAgent?.emoji ?? '🤖';

  // Log message to Neo4j
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        CREATE (m:AgentMessage {
          id: $messageId,
          fromAgent: $from,
          toAgent: $to,
          message: $message,
          priority: $priority,
          replyTo: $replyTo,
          threadId: $threadId,
          timestamp: datetime()
        })
      `,
      params: {
        messageId,
        from: msg.from,
        to: msg.to,
        message: msg.message,
        priority: msg.priority ?? 'normal',
        replyTo: msg.replyTo ?? null,
        threadId: msg.threadId ?? null,
      },
    });
  } catch (e) {
    console.warn(`[slack-bridge] Failed to log message: ${e}`);
  }

  // Send to Slack
  const result = await notify({
    level: msg.priority === 'urgent' ? 'critical' : msg.priority === 'high' ? 'warning' : 'info',
    title: `${priorityEmoji} Message from ${fromEmoji} ${fromName}`,
    message: msg.message,
    source: fromName,
    channel: toChannel,
    fields: msg.replyTo ? { 'Reply to': msg.replyTo } : undefined,
  });

  return { ...result, messageId };
}

/**
 * Broadcast message to all agents
 */
export async function broadcastToAgents(
  from: AgentId | string,
  message: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const agent of AGENTS) {
    if (agent.id === from) continue;

    const result = await sendAgentMessage({
      from,
      to: agent.id,
      message,
      priority,
    });

    if (result.sent) sent++;
    else failed++;
  }

  return { sent, failed };
}

/**
 * Parse @mentions from message and route to agents
 */
export async function routeMentions(
  from: AgentId | string,
  message: string
): Promise<{ routed: string[]; notFound: string[] }> {
  const mentionRegex = /@(\w+)/g;
  const mentions = [...message.matchAll(mentionRegex)].map(m => m[1].toLowerCase());

  const routed: string[] = [];
  const notFound: string[] = [];

  for (const mention of mentions) {
    const agent = AGENTS.find(a => a.id === mention || a.name.toLowerCase().includes(mention));

    if (agent) {
      await sendAgentMessage({
        from,
        to: agent.id,
        message: message.replace(/@\w+/g, '').trim(),
        priority: 'normal',
      });
      routed.push(agent.id);
    } else {
      notFound.push(mention);
    }
  }

  return { routed, notFound };
}

// ─── Quick Helpers ────────────────────────────────────────────────────────

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

/**
 * List all agent channels
 */
export function listAgentChannels(): { id: string; name: string; emoji: string; channel: string }[] {
  return AGENTS.map(a => ({
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    channel: a.channel,
  }));
}

// ─── Kanban Board ─────────────────────────────────────────────────────────

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

  // Notify assignee if specified
  if (task.assignee) {
    const agent = getAgent(task.assignee);
    if (agent) {
      await notifyAgent(agent.id, 'New Task Assigned', `*${task.title}*\nPriority: ${task.priority ?? 'medium'}`, 'info');
    }
  }

  await notify({
    level: 'info',
    title: '📋 New Task Created',
    message: `*${task.title}*\nAssignee: ${task.assignee ?? 'Unassigned'}\nPriority: ${task.priority ?? 'medium'}`,
    source: 'Kanban',
    channel: '#agent-status',
  });

  return newTask;
}

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

// ─── Message History ──────────────────────────────────────────────────────

export async function getAgentMessages(
  agentId: AgentId | string,
  limit = 20
): Promise<AgentMessage[]> {
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (m:AgentMessage)
      WHERE m.toAgent = $agentId OR m.fromAgent = $agentId
      RETURN m.id AS id, m.fromAgent AS from, m.toAgent AS to,
             m.message AS message, m.priority AS priority,
             m.replyTo AS replyTo, m.threadId AS threadId,
             m.timestamp AS timestamp
      ORDER BY m.timestamp DESC
      LIMIT $limit
    `,
    params: { agentId, limit },
  }) as { results?: AgentMessage[] };

  return result?.results ?? [];
}

export async function getUnreadMessages(agentId: AgentId | string): Promise<AgentMessage[]> {
  const result = await widgetdc_mcp('graph.read_cypher', {
    query: `
      MATCH (m:AgentMessage {toAgent: $agentId})
      WHERE NOT exists(m.readAt)
      RETURN m.id AS id, m.fromAgent AS from, m.toAgent AS to,
             m.message AS message, m.priority AS priority,
             m.replyTo AS replyTo, m.threadId AS threadId
      ORDER BY m.priority DESC, m.timestamp ASC
    `,
    params: { agentId },
  }) as { results?: AgentMessage[] };

  return result?.results ?? [];
}

export async function markMessageRead(messageId: string): Promise<boolean> {
  try {
    await widgetdc_mcp('graph.write_cypher', {
      query: `
        MATCH (m:AgentMessage {id: $messageId})
        SET m.readAt = datetime()
      `,
      params: { messageId },
    });
    return true;
  } catch {
    return false;
  }
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

    case 'agents':
    case 'channels':
      return {
        agents: listAgentChannels(),
        statusChannel: '#agent-status',
      };

    case 'message':
    case 'msg':
      if (!args[0] || !args[1]) {
        return { error: 'Brug: /slack message <to-agent> <message>' };
      }
      return sendAgentMessage({
        from: 'main',
        to: args[0],
        message: args.slice(1).join(' '),
      });

    case 'broadcast':
      if (!args[0]) {
        return { error: 'Brug: /slack broadcast <message>' };
      }
      return broadcastToAgents('main', args.join(' '));

    case 'route':
      if (!args[0]) {
        return { error: 'Brug: /slack route <message with @mentions>' };
      }
      return routeMentions('main', args.join(' '));

    case 'inbox':
      return getUnreadMessages(args[0] || 'main');

    case 'history':
      return getAgentMessages(args[0] || 'main', parseInt(args[1]) || 20);

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
        priority: args[2] as 'low' | 'medium' | 'high' | 'critical' | undefined,
      });

    case 'task-move':
      if (!args[0] || !args[1]) {
        return { error: 'Brug: /slack task-move <taskId> <status>' };
      }
      return kanbanMove(args[0], args[1] as KanbanTask['status']);

    default:
      return {
        help: 'Slack Bridge — Agent Communication Hub 📢',
        sections: {
          'Notifications': {
            '/slack notify <title> <message>': 'Send notification',
            '/slack alert <title> <message>': 'Send critical alert',
          },
          'Agent Messaging': {
            '/slack agents': 'List all agent channels',
            '/slack message <agent> <message>': 'Send message to agent',
            '/slack broadcast <message>': 'Send to all agents',
            '/slack route <message with @mentions>': 'Route @mentions to agents',
            '/slack inbox [agent]': 'Get unread messages',
            '/slack history [agent] [limit]': 'Get message history',
          },
          'Kanban Board': {
            '/slack board': 'Vis Kanban board',
            '/slack kanban-post': 'Post Kanban til Slack',
            '/slack task-create <title> [assignee] [priority]': 'Opret task',
            '/slack task-move <taskId> <status>': 'Flyt task',
          },
        },
        agentChannels: AGENTS.map(a => `${a.emoji} ${a.channel} — ${a.name}`),
      };
  }
}

export default slack_bridge;
