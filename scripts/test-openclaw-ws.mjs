/**
 * Test OpenClaw WebSocket connectivity
 * Run: node scripts/test-openclaw-ws.mjs
 */
import WebSocket from 'ws';

const BASE = 'wss://openclaw-production-9570.up.railway.app';
const PATHS = ['/', '/openclaw', '/openclaw/ws', '/chat', '/ws'];

async function testWs(path) {
  return new Promise((resolve) => {
    const url = BASE + path;
    const ws = new WebSocket(url, { handshakeTimeout: 8000 });
    const result = { path, url, connected: false, code: null, reason: '', error: null };

    ws.on('open', () => {
      result.connected = true;
      ws.close(1000);
    });

    ws.on('close', (code, reason) => {
      result.code = code;
      result.reason = reason?.toString() || '';
      if (!result.connected) resolve(result);
    });

    ws.on('error', (err) => {
      result.error = err.message;
      resolve(result);
    });

    ws.once('open', () => {
      result.connected = true;
      ws.close(1000);
      resolve(result);
    });
  });
}

async function main() {
  console.log('Testing OpenClaw WebSocket connectivity...\n');

  for (const path of PATHS) {
    const r = await testWs(path);
    const status = r.connected ? '✓ CONNECTED' : `✗ ${r.code || ''} ${r.reason || r.error || 'failed'}`.trim();
    console.log(`${path || '/'}: ${status}`);
  }

  const healthRes = await fetch('https://openclaw-production-9570.up.railway.app/healthz', { signal: AbortSignal.timeout(5000) }).catch(() => null);
  const health = healthRes?.ok ? (await healthRes.json()) : null;
  console.log('\n/healthz:', health ? JSON.stringify(health) : 'timeout/fail');
}

main().catch(console.error);
