import { expect, test } from '@playwright/test';

// Scaffold smoke E2E (roadmap 01, Deliverable 15): the app loads and
// identifies itself; video recording produces the proof clip. Since Phase
// 03 the root is operator-only (Layer 2 proxy guard), so an anonymous
// visit lands on the sign-in screen, which carries the app identity.
test('platform-admin redirects anonymous visitors to sign-in and shows its identity', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page).toHaveTitle('Silid Platform Admin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Silid Platform Admin');
});
