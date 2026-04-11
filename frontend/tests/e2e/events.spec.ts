import { test, expect } from '@playwright/test';

test.describe('Event creation wizard', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/events/new');
    // Wait for the friends list to finish loading before interacting
    // await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Invite Friends' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible();
  });

  // TC-EVT-01: Continue button is disabled when no friend is selected (Step 1)
  test('TC-EVT-01: Continue button is disabled until at least one friend is selected', async ({ page }) => {
    // Step 1 heading
    // await expect(page.getByText('Invite Friends')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Invite Friends' })).toBeVisible();

    const continueBtn = page.getByRole('button', { name: /Continue/i });
    await expect(continueBtn).toBeDisabled();
  });

  // TC-EVT-02: Selecting a friend enables Continue and advances to Step 2
  test('TC-EVT-02: selecting a friend enables Continue and navigates to Step 2', async ({ page }) => {
    // Bob and Charlie are added as friends by the seed script
    // Click the first available friend card (any friend will do)
    const firstFriendCard = page.locator('button.rounded-xl.border').first();
    await firstFriendCard.click();

    const continueBtn = page.getByRole('button', { name: /Continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Step 2 heading
    // await expect(page.getByText('Event Details')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Event Details' })).toBeVisible();
  });

  // TC-EVT-03: Filling in all required fields on Step 2 enables the Create button
  test('TC-EVT-03: filling required fields on Step 2 enables the Create & Open Workspace button', async ({ page }) => {
    // --- Step 1: select a friend ---
    const firstFriendCard = page.locator('button.rounded-xl.border').first();
    await firstFriendCard.click();
    await page.getByRole('button', { name: /Continue/i }).click();
    // await expect(page.getByText('Event Details')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Event Details' })).toBeVisible();

    // --- Step 2: fill in required fields ---
    await page.getByPlaceholder('e.g. Badminton Meetup, Sunday Brunch').fill('Test Event');

    // Use dates that are guaranteed to be in the future relative to today
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() + 1);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 3);

    const fmt = (d: Date) => d.toISOString().split('T')[0]; // YYYY-MM-DD

    await page.locator('input[type="date"]').nth(0).fill(fmt(startDate));
    await page.locator('input[type="date"]').nth(1).fill(fmt(endDate));

    // canCreate becomes true — Create button should be enabled
    const createBtn = page.getByRole('button', { name: /Create & Open Workspace/i });
    await expect(createBtn).toBeEnabled();
  });

});
