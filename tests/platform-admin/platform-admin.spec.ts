import { expect, test } from '@playwright/test';

// Scaffold smoke E2E (roadmap 01, Deliverable 15): the app loads and
// identifies itself; video recording produces the proof clip.
test('platform-admin loads the root page and shows its identity', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Silid Platform Admin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Silid Platform Admin');
});
