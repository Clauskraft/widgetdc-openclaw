/**
 * Test that /chat and /openclaw redirect to include hash token
 * Run: node scripts/test-token-redirect.mjs
 */
const BASE = 'https://openclaw-production-9570.up.railway.app';

async function testBootstrap(path) {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    headers: { 'Accept': 'text/html' },
  });
  const text = await res.text();
  const hasBootstrapMarker = text.includes('_oc_bootstrapped');
  const hasHashToken = text.includes("#' + url.hash") || text.includes("hashParams.set('token'");
  return { path, status: res.status, hasBootstrapMarker, hasHashToken };
}

async function main() {
  console.log('Testing token redirect for Control UI paths...\n');

  const r1 = await testBootstrap('/chat');
  const r2 = await testBootstrap('/chat?session=main');
  const r3 = await testBootstrap('/openclaw');
  const r4 = await testBootstrap('/openclaw/chat');
  const r5 = await testBootstrap('/openclaw/chat?session=main');

  console.log('/chat:', r1.status === 200 ? (r1.hasBootstrapMarker && r1.hasHashToken ? '✓ bootstrap page with hash token' : '✗ bootstrap page missing token marker') : `unexpected status ${r1.status}`);
  console.log('/chat?session=main:', r2.status === 200 ? (r2.hasBootstrapMarker && r2.hasHashToken ? '✓ bootstrap page with hash token' : '✗ bootstrap page missing token marker') : `unexpected status ${r2.status}`);
  console.log('/openclaw:', r3.status === 200 ? (r3.hasBootstrapMarker && r3.hasHashToken ? '✓ bootstrap page with hash token' : '✗ bootstrap page missing token marker') : `unexpected status ${r3.status}`);
  console.log('/openclaw/chat:', r4.status === 200 ? (r4.hasBootstrapMarker && r4.hasHashToken ? '✓ bootstrap page with hash token' : '✗ bootstrap page missing token marker') : `unexpected status ${r4.status}`);
  console.log('/openclaw/chat?session=main:', r5.status === 200 ? (r5.hasBootstrapMarker && r5.hasHashToken ? '✓ bootstrap page with hash token' : '✗ bootstrap page missing token marker') : `unexpected status ${r5.status}`);

  const ok = [r1, r2, r3, r4, r5].every((r) => r.status === 200 && r.hasBootstrapMarker && r.hasHashToken);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
