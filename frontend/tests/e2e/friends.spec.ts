import { test, expect } from '@playwright/test';

test.describe('Friends management', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/friends');
    // Wait for the loading spinner to clear before making assertions
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });
  });

  // TC-FRND-01: Friends page loads and shows Bob and Charlie from seed data
  test('TC-FRND-01: accepted friends from seed data are visible in Current Friends', async ({ page }) => {
    // Seed data adds Bob and Charlie as accepted friends
    await expect(page.getByText('Bob')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Charlie')).toBeVisible({ timeout: 10_000 });
  });

  // TC-FRND-02: Evan's incoming request is shown with Accept and Decline buttons
  test('TC-FRND-02: incoming friend request from Evan shows Accept and Decline buttons', async ({ page }) => {
    // Seed data creates Evan as an incoming request
    await expect(page.getByText('Evan')).toBeVisible({ timeout: 10_000 });

    // Both action buttons must be present for the incoming request
    // There may be multiple Accept/Decline buttons if there are multiple requests,
    // so we scope the assertion to the first pair
    await expect(page.getByRole('button', { name: 'Accept' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Decline' }).first()).toBeVisible();
  });

});
