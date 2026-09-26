import { expect, test } from '@playwright/test';

// Scaffold smoke E2E (roadmap 01, Deliverable 15) updated for the Phase 05
// shell: the root is now a guarded desk surface, so the unauthenticated
// journey is the redirect to sign-in rather than a public home page. Video
// recording produces the proof clip.
test('frontdesk sends an unauthenticated visitor to sign-in and identifies itself', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page).toHaveTitle('Silid Frontdesk');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Silid Frontdesk');
  await expect(page.getByLabel('Staff identifier')).toBeVisible();
});
