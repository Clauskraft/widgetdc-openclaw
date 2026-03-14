import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const VALID_STATUSES = new Set(['PASS', 'BUG', 'BLOCKED_ENVIRONMENT']);
const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), 'artifacts', 'frontend-e2e');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildRunContext(args) {
  const surface = sanitizeSegment(args.surface ?? 'unknown-surface');
  const flow = sanitizeSegment(args.flow ?? 'smoke');
  const url = args.url;
  if (!url) {
    throw new Error('Missing required argument: --url');
  }
  const runId = args.runId ?? `${surface}-${flow}-${Date.now()}`;
  const outputDir = path.resolve(args.outputDir ?? DEFAULT_OUTPUT_ROOT, sanitizeSegment(runId));
  ensureDir(outputDir);
  return {
    runId,
    surface,
    flow,
    url,
    outputDir,
    headless: (args.headless ?? 'true') !== 'false',
  };
}

function baseResult(ctx) {
  return {
    status: 'BLOCKED_ENVIRONMENT',
    runId: ctx.runId,
    surface: ctx.surface,
    flow: ctx.flow,
    url: ctx.url,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    evidence: {
      screenshot: null,
      trace: null,
      console: [],
      pageErrors: [],
      networkFailures: [],
    },
    assertions: [],
    summary: '',
  };
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    throw new Error(`Playwright is not installed or not resolvable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runSurfaceCheck(ctx) {
  const started = Date.now();
  const result = baseResult(ctx);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: ctx.headless });
  const tracePath = path.join(ctx.outputDir, 'trace.zip');
  const screenshotPath = path.join(ctx.outputDir, 'final.png');
  const consolePath = path.join(ctx.outputDir, 'console.json');
  const pageErrorPath = path.join(ctx.outputDir, 'page-errors.json');
  const networkPath = path.join(ctx.outputDir, 'network-failures.json');
  const page = await browser.newPage();

  page.on('console', (message) => {
    result.evidence.console.push({
      type: message.type(),
      text: message.text(),
    });
  });

  page.on('pageerror', (error) => {
    result.evidence.pageErrors.push(String(error));
  });

  page.on('requestfailed', (request) => {
    result.evidence.networkFailures.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? 'unknown',
    });
  });

  await page.context().tracing.start({ screenshots: true, snapshots: true });

  try {
    const response = await page.goto(ctx.url, { waitUntil: 'networkidle', timeout: 45000 });
    const httpStatus = response?.status() ?? null;
    result.assertions.push({ name: 'page.goto', ok: !!response, detail: `status=${httpStatus}` });

    const bodyVisible = await page.locator('body').isVisible().catch(() => false);
    result.assertions.push({ name: 'body-visible', ok: bodyVisible, detail: '' });

    if (!response || (httpStatus !== null && httpStatus >= 400) || !bodyVisible) {
      result.status = 'BUG';
      result.summary = `Initial surface load failed for ${ctx.surface}`;
    } else if (result.evidence.pageErrors.length > 0 || result.evidence.networkFailures.length > 0) {
      result.status = 'BUG';
      result.summary = `Runtime defects detected for ${ctx.surface}`;
    } else {
      result.status = 'PASS';
      result.summary = `Baseline surface load passed for ${ctx.surface}`;
    }
  } catch (error) {
    result.status = 'BLOCKED_ENVIRONMENT';
    result.summary = error instanceof Error ? error.message : String(error);
  } finally {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    await page.context().tracing.stop({ path: tracePath }).catch(() => undefined);
    await browser.close().catch(() => undefined);
    result.evidence.screenshot = screenshotPath;
    result.evidence.trace = tracePath;
    fs.writeFileSync(consolePath, JSON.stringify(result.evidence.console, null, 2));
    fs.writeFileSync(pageErrorPath, JSON.stringify(result.evidence.pageErrors, null, 2));
    fs.writeFileSync(networkPath, JSON.stringify(result.evidence.networkFailures, null, 2));
    result.finishedAt = new Date().toISOString();
    result.durationMs = Date.now() - started;
  }

  if (!VALID_STATUSES.has(result.status)) {
    throw new Error(`Invalid result status produced: ${result.status}`);
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ctx = buildRunContext(args);
  const result = await runSurfaceCheck(ctx);
  const resultPath = path.join(ctx.outputDir, 'result.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ resultPath, status: result.status, summary: result.summary }, null, 2));
  process.exit(result.status === 'PASS' ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
