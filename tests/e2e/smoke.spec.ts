import { expect, test } from '@playwright/test';

// Halloween Night build: boots, signs up on the local test backend, loads every vehicle, and drives the practice track.
// (Online races are covered by the multi-browser test in the event notes; they need several GPUs' worth of rendering.)
test('boots, signs up, loads all vehicles and drives the practice track', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const failed: string[] = [];
  page.on('requestfailed', (r) => { if (!/ABORTED/.test(r.failure()?.errorText ?? '')) failed.push(r.url()); });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

  await page.addInitScript(() => {
    try { localStorage.setItem('dustrunner-quality', 'saver'); localStorage.setItem('dustrunner-look', 'off'); } catch { /* storage blocked */ }
  });
  await page.goto('./?local=1');
  await expect(page.locator('#gl')).toBeVisible();
  await expect(page.locator('#boot')).toHaveCount(0);

  // arcade sign-up: three characters and a PIN
  await expect(page.locator('#ev')).toHaveAttribute('data-view', 'signup', { timeout: 60_000 });
  await page.locator('.evSlot b').first().click();
  await page.keyboard.type('CIX');
  await page.locator('#evPin').fill('4321');
  await page.locator('#evSign').click();
  await expect(page.locator('#ev')).toHaveAttribute('data-view', 'lobby');
  await expect(page.locator('.evMe').first()).toHaveText('CIX');

  // every vehicle becomes selectable once its model has loaded
  for (const k of ['tank', 'walker', 'jet', 'quad', 'rally', 'hover', 'drone']) {
    await expect(page.locator(`.evLobby [data-v="lobby"] .evV[data-k="${k}"]`), k).toBeEnabled({ timeout: 60_000 });
  }

  // no request leaves the site on the local backend: three, loaders and fonts are bundled
  const external = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((u) => !u.startsWith(location.origin)));
  expect(external).toEqual([]);

  // practice: the Practice Grid, endless laps, swap vehicle on the go
  await page.locator('#evPractice').click();
  await expect(page.locator('#ev')).toHaveAttribute('data-view', 'practice');
  await page.keyboard.down('ArrowUp');
  const clock = page.locator('#time');
  const t0 = await clock.textContent();
  await expect.poll(async () => (await clock.textContent()) !== t0, { timeout: 90_000 }).toBe(true);
  if (await page.locator('#evSwap').isVisible()) await page.locator('#evSwap').click();   // phones open the swap bar from a button
  await page.locator('.evPracBar .evV[data-k="quad"]').click();
  await expect(page.locator('.evPracBar .evV[data-k="quad"]')).toHaveClass(/on/);
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: test.info().outputPath('practice.png') });
  await page.locator('#evPracBack').click();
  await expect(page.locator('#ev')).toHaveAttribute('data-view', 'lobby');

  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
