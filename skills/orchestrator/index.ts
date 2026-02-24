/**
 * Orchestrator Skill for OpenClaw
 *
 * Multi-agent task orchestration: supervisor HITL, agent.task lifecycle.
 * All tools are proxied via widgetdc_mcp — this skill provides slash commands and documentation.
 */

import { widgetdc_mcp } from '../widgetdc-mcp/index';

export async function supervisor(action: string, ...args: string[]) {
  switch (action?.toLowerCase()) {
    case 'status':
      return widgetdc_mcp('supervisor.status', {});
    case 'pause':
      return widgetdc_mcp('supervisor.pause', {});
    case 'resume':
      return widgetdc_mcp('supervisor.resume', {});
    case 'diagnostics':
      return widgetdc_mcp('supervisor.diagnostics', {});
    case 'boot':
      return widgetdc_mcp('supervisor.boot_manifest', {});
    default:
      return {
        help: 'Kommandoer: status, pause, resume, diagnostics, boot',
        tools: ['supervisor.status', 'supervisor.pause', 'supervisor.resume', 'supervisor.hitl_request', 'supervisor.hitl_response', 'supervisor.hitl_pending'],
      };
  }
}

export async function task(action: string, taskId?: string, payload?: string) {
  switch (action?.toLowerCase()) {
    case 'create':
      try {
        return widgetdc_mcp('agent.task.create', typeof payload === 'string' ? JSON.parse(payload || '{}') : (payload || {}));
      } catch {
        return { error: 'Invalid JSON payload. Use: task("create", undefined, \'{"title":"...","type":"..."}\')' };
      }
    case 'fetch':
      return widgetdc_mcp('agent.task.fetch', { agentId: taskId });
    case 'claim':
      return widgetdc_mcp('agent.task.claim', { taskId: taskId! });
    case 'complete':
      try {
        const result = payload ? (typeof payload === 'string' ? JSON.parse(payload) : payload) : {};
        return widgetdc_mcp('agent.task.complete', { taskId: taskId!, result });
      } catch {
        return { error: 'Invalid JSON result. Use: task("complete", "<taskId>", \'{"summary":"..."}\')' };
      }
    case 'fail':
      return widgetdc_mcp('agent.task.fail', { taskId: taskId!, reason: payload || 'Unknown' });
    case 'status':
      return widgetdc_mcp('agent.task.status', { taskId: taskId! });
    default:
      return {
        help: 'Kommandoer: create <type> <payload>, fetch [agentId], claim <taskId>, complete <taskId> <result>, fail <taskId> <reason>, status <taskId>',
        tools: ['agent.task.create', 'agent.task.fetch', 'agent.task.claim', 'agent.task.start', 'agent.task.complete', 'agent.task.fail', 'agent.task.log', 'agent.task.status'],
      };
  }
}
