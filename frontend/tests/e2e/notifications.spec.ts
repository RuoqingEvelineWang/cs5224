import { test, expect } from '@playwright/test';

test.describe('Notifications', () => {

  // TC-NOTIF-01: Notifications page loads and renders the list
  test('TC-NOTIF-01: notifications page loads and displays the notification list', async ({ page }) => {
    await page.goto('/notifications');
    // Wait for the loading spinner to clear
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });

    // The page heading is always visible regardless of notification count
    await expect(page.getByText('Notifications')).toBeVisible();

    // Seed data provides notifications, so the list should not be empty
    await expect(page.locator('ul li').first()).toBeVisible({ timeout: 10_000 });
  });

  // TC-NOTIF-02: ATTENDANCE_REQUEST notification shows Attend and Decline buttons
  test('TC-NOTIF-02: ATTENDANCE_REQUEST notification shows Attend and Decline action buttons', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });

    // Seed data includes a Board Game Night event with an ATTENDANCE_REQUEST notification
    // The Attend button uses bg-green-600, Decline uses border-red-200
    await expect(page.getByRole('button', { name: /Attend/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Decline/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  // TC-NOTIF-03: ALL_SUBMITTED notification shows the Select Time & Venue button
  test('TC-NOTIF-03: ALL_SUBMITTED notification shows Select Time & Venue button', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });

    // Seed data includes a Japanese Dinner event where all availability has been submitted
    await expect(
      page.getByRole('button', { name: /Select Time & Venue/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

});
