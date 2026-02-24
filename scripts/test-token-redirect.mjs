/**
 * Test that /chat and /openclaw redirect to include token
 * Run: node scripts/test-token-redirect.mjs
 */
const BASE = 'https://openclaw-production-9570.up.railway.app';

async function testRedirect(path, followRedirect = false) {
  const res = await fetch(BASE + path, {
    redirect: followRedirect ? 'follow' : 'manual',
    headers: { 'Accept': 'text/html' },
  });
  if (res.status === 307 || res.status === 302) {
    const loc = res.headers.get('location') || '';
    const hasToken = loc.includes('token=');
    return { path, redirect: true, location: loc.slice(0, 80) + '...', hasToken };
  }
  return { path, redirect: false, status: res.status };
}

async function main() {
  console.log('Testing token redirect for Control UI paths...\n');

  const r1 = await testRedirect('/chat');
  const r2 = await testRedirect('/chat?session=main');
  const r3 = await testRedirect('/openclaw');

  console.log('/chat:', r1.redirect ? (r1.hasToken ? '✓ redirect with token' : '✗ redirect without token') : 'no redirect');
  console.log('/chat?session=main:', r2.redirect ? (r2.hasToken ? '✓ redirect with token' : '✗ redirect without token') : 'no redirect');
  console.log('/openclaw:', r3.redirect ? (r3.hasToken ? '✓ redirect with token' : '✗ redirect without token') : 'no redirect');

  const ok = [r1, r2, r3].every((r) => r.redirect && r.hasToken);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
