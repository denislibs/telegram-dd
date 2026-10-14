import { test } from '../e2e/fixtures'; // the strict fixture: a11y runs fail on console errors and stricterdom violations too
import { expectAccessible } from './axe';

// Example: one test per screen / state; the test title is the key of its entry in tests/a11y/baseline.json.
test('app shell', async ({ page }) => {
  await page.goto('/');
  await page.locator('#Main').waitFor();
  await expectAccessible(page);
});

test('app shell: the main placeholder only', async ({ page }) => {
  await page.goto('/');
  await page.locator('#Main').waitFor();
  await expectAccessible(page, '#Main');
});
