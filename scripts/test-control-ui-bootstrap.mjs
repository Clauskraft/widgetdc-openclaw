/**
 * Test that hosted OpenClaw wrapper exposes the Control UI bootstrap config
 * on the prefixed path used by the embedded /openclaw UI.
 *
 * Run: node scripts/test-control-ui-bootstrap.mjs
 */
const BASE = 'https://openclaw-production-9570.up.railway.app';

async function fetchJson(path) {
  const res = await fetch(BASE + path, {
    redirect: 'follow',
    headers: { Accept: 'application/json' },
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    path,
    status: res.status,
    url: res.url,
    json,
    text,
  };
}

function hasBootstrapShape(result) {
  return Boolean(
    result.json &&
      typeof result.json === 'object' &&
      ('serverVersion' in result.json || 'assistantName' in result.json || 'assistantAgentId' in result.json)
  );
}

async function main() {
  console.log('Testing hosted Control UI bootstrap config...\n');

  const canonical = await fetchJson('/__openclaw/control-ui-config.json');
  const prefixed = await fetchJson('/openclaw/__openclaw/control-ui-config.json');

  console.log('/__openclaw/control-ui-config.json:', canonical.status, hasBootstrapShape(canonical) ? '✓ bootstrap json' : '✗ invalid bootstrap json');
  console.log('/openclaw/__openclaw/control-ui-config.json:', prefixed.status, hasBootstrapShape(prefixed) ? '✓ bootstrap json' : '✗ invalid bootstrap json');

  const ok = [canonical, prefixed].every((result) => result.status === 200 && hasBootstrapShape(result));
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
