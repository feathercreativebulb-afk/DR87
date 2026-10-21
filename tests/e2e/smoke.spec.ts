import { expect, test } from '@playwright/test';

// Phase 1 gate: the repo build boots offline-capable, loads every model and track, and races.
test('boots, loads all vehicles and starts a race', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const failed: string[] = [];
  // the browser cancels preloads of music that isn't playing (ERR_ABORTED); that is not a failure
  page.on('requestfailed', (r) => { if (!/ABORTED/.test(r.failure()?.errorText ?? '')) failed.push(r.url()); });
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

  // headless browsers render WebGL in software (~2–6 fps): use the lightest preset so the race moves
  await page.addInitScript(() => {
    try { localStorage.setItem('dustrunner-quality', 'saver'); localStorage.setItem('dustrunner-look', 'off'); } catch { /* storage blocked */ }
  });
  await page.goto('./');
  await expect(page.locator('#gl')).toBeVisible();
  await expect(page.locator('#boot')).toHaveCount(0);

  // every GLB vehicle becomes selectable once its model has loaded
  for (const id of ['vTank', 'vWalker', 'vJet', 'vQuad', 'vRally', 'vHover', 'vDrone']) {
    await expect(page.locator(`#${id}`), id).toBeEnabled({ timeout: 45_000 });
  }

  // no request leaves the site: three, loaders and fonts are bundled
  const external = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((u) => !u.startsWith(location.origin)));
  expect(external).toEqual([]);

  await page.locator('#toWorld').click();
  await page.locator('#startBtn').click();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#pauseBtn')).toBeVisible();

  // hold the throttle through the countdown; the race clock must start running
  await page.keyboard.down('ArrowUp');
  const clock = page.locator('#time');
  const t0 = await clock.textContent();
  await expect.poll(async () => (await clock.textContent()) !== t0, { timeout: 90_000 }).toBe(true);
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: test.info().outputPath('racing.png') });

  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
