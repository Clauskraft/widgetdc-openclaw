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
 */

const BACKEND = process.env.WIDGETDC_BACKEND_URL || 'https://backend-production-d3da.up.railway.app';

export type SlackLevel = 'info' | 'warning' | 'critical' | 'success';

export interface SlackPayload {
  level?: SlackLevel;
  title: string;
  message: string;
  source?: string;
  fields?: Record<string, string>;
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
