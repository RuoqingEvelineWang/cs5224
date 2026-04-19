import { test, expect } from '@playwright/test';

test.describe('Event creation wizard', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/events/new');
    // Wait for the friend list to finish loading
    await expect(page.getByRole('heading', { name: 'Invite Friends' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible();
  });

  // FR6 — TC-EVT-01: Continue button is disabled when no friend is selected
  test('TC-EVT-01: Continue button is disabled until at least one friend is selected', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Invite Friends' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue/i })).toBeDisabled();
  });

  // FR6 — TC-EVT-02: Selecting a friend enables Continue and advances to Step 2
  test('TC-EVT-02: selecting a friend enables Continue and navigates to Step 2', async ({ page }) => {
    const firstFriendCard = page.locator('button.rounded-xl.border').first();
    await firstFriendCard.click();

    await expect(page.getByRole('button', { name: /Continue/i })).toBeEnabled();
    await page.getByRole('button', { name: /Continue/i }).click();

    await expect(page.getByRole('heading', { name: 'Event Details' })).toBeVisible();
  });

  // FR6 — TC-EVT-03: Filling all required fields on Step 2 enables the Create button
  test('TC-EVT-03: filling required fields on Step 2 enables the Create & Open Workspace button', async ({ page }) => {
    const firstFriendCard = page.locator('button.rounded-xl.border').first();
    await firstFriendCard.click();
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByRole('heading', { name: 'Event Details' })).toBeVisible();

    await page.getByPlaceholder('e.g. Badminton Meetup, Sunday Brunch').fill('Test Event');

    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const start = new Date(today); start.setDate(today.getDate() + 1);
    const end = new Date(today); end.setDate(today.getDate() + 3);

    await page.locator('input[type="date"]').nth(0).fill(fmt(start));
    await page.locator('input[type="date"]').nth(1).fill(fmt(end));

    await expect(page.getByRole('button', { name: /Create & Open Workspace/i })).toBeEnabled();
  });

  // FR9 — TC-EVT-04: Venue type selection toggles the active button style
  test('TC-EVT-04: selecting a different venue type updates the active button style', async ({ page }) => {
    const firstFriendCard = page.locator('button.rounded-xl.border').first();
    await firstFriendCard.click();
    await page.getByRole('button', { name: /Continue/i }).click();
    await expect(page.getByRole('heading', { name: 'Event Details' })).toBeVisible();

    // Default is Cafe — click Park and verify it becomes active (indigo background)
    const parkBtn = page.getByRole('button', { name: 'Park', exact: true });
    await parkBtn.click();
    await expect(parkBtn).toHaveClass(/bg-indigo-600/);


    // Previous selection (Cafe) should no longer be active
    const venueContainer = page.locator('text=Venue Type').locator('..');
    const cafeBtn = venueContainer.getByRole('button').first();
    await expect(cafeBtn).not.toHaveClass(/bg-indigo-600/);
  });

});
