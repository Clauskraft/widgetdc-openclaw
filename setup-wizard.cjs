const { chromium } = require('playwright');

const BASE_URL = 'https://openclaw-production-9570.up.railway.app';
const SETUP_PASSWORD = 'WidgeTDC2026';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage();

  console.log('Navigating to /setup...');
  await page.goto(`${BASE_URL}/setup`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: 'step1-loaded.png' });
  console.log('Page loaded. Screenshot: step1-loaded.png');

  // Enter password if prompted
  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Password prompt detected — entering...');
    await passwordInput.fill(SETUP_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'step2-after-password.png' });
    console.log('Password entered. Screenshot: step2-after-password.png');
  } else {
    console.log('No password prompt — already authenticated or auto-passed.');
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'step3-setup-state.png' });

  // Log page content for inspection
  const bodyText = await page.locator('body').innerText().catch(() => 'N/A');
  console.log('\n--- PAGE CONTENT ---');
  console.log(bodyText.substring(0, 2000));
  console.log('--- END ---\n');

  console.log('Done. Check screenshots: step1-loaded.png, step2-after-password.png, step3-setup-state.png');
  await browser.close();
})();
