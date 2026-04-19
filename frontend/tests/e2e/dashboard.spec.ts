import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the loading spinner to disappear before asserting page content
    // await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Create New Event' })).toBeVisible({ timeout: 15_000 });
  });

  // TC-DASH-01: Dashboard renders both content panels after login
  test('TC-DASH-01: dashboard renders Upcoming Events and Pending Invitations panels', async ({ page }) => {
    // await expect(page.getByText('Dashboard')).toBeVisible();
    // await expect(page.getByText('Upcoming Events')).toBeVisible();
    // await expect(page.getByText('Pending Invitations')).toBeVisible();
    // TC-DASH-01
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upcoming Events' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pending Invitations' })).toBeVisible();
  });

  // TC-DASH-02: All navigation bar links route to the correct pages
  test('TC-DASH-02: nav bar links navigate to the correct routes', async ({ page }) => {
    const nav = page.locator('header nav');

    // Friends
    await nav.getByRole('link', { name: 'Friends' }).click();
    await expect(page).toHaveURL(/\/friends/);

    // Events
    await nav.getByRole('link', { name: 'Events' }).click();
    await expect(page).toHaveURL(/\/events/);

    // New Event
    await nav.getByRole('link', { name: 'New Event' }).click();
    await expect(page).toHaveURL(/\/events\/new/);

    // Back to Dashboard
    await nav.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');
  });

});
