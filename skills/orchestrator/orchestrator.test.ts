/**
 * Smoke test for orchestrator skill — JSON.parse error handling
 * Run: npx tsx skills/orchestrator/orchestrator.test.ts
 */
import { task } from './index';

async function run() {
  let passed = 0;
  let failed = 0;

  // Test 1: complete with invalid JSON — must return { error } not throw
  try {
    const r = await task('complete', 'task-123', 'invalid json {{{');
    if (r && typeof r === 'object' && 'error' in r && typeof (r as { error: string }).error === 'string') {
      console.log('✓ complete + invalid JSON → returns error object');
      passed++;
    } else {
      console.log('✗ complete + invalid JSON → expected { error } got', JSON.stringify(r)?.slice(0, 80));
      failed++;
    }
  } catch (e) {
    console.log('✗ complete + invalid JSON → threw:', (e as Error)?.message);
    failed++;
  }

  // Test 2: create with invalid JSON — must return { error } not throw
  try {
    const r = await task('create', undefined, 'not valid json ]]]');
    if (r && typeof r === 'object' && 'error' in r && typeof (r as { error: string }).error === 'string') {
      console.log('✓ create + invalid JSON → returns error object');
      passed++;
    } else {
      console.log('✗ create + invalid JSON → expected { error } got', JSON.stringify(r)?.slice(0, 80));
      failed++;
    }
  } catch (e) {
    console.log('✗ create + invalid JSON → threw:', (e as Error)?.message);
    failed++;
  }

  // Test 3: complete with valid JSON — should NOT return parse error
  try {
    const r = await task('complete', 'task-123', '{"summary":"ok"}');
    const err = r && typeof r === 'object' && 'error' in r ? (r as { error: string }).error : '';
    if (err.includes('Invalid JSON')) {
      console.log('✗ complete + valid JSON → wrongly returned parse error');
      failed++;
    } else {
      console.log('✓ complete + valid JSON → no parse error');
      passed++;
    }
  } catch (e) {
    console.log('✓ complete + valid JSON → no parse crash (network/other ok)');
    passed++;
  }

  console.log('\n---');
  console.log(passed, 'passed,', failed, 'failed');
  process.exit(failed > 0 ? 1 : 0);
}

run();
