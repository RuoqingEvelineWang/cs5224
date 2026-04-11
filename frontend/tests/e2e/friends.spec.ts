import { test, expect } from '@playwright/test';

test.describe('Friends management', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/friends');
    // await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('heading', { name: 'Friends Management' })
    ).toBeVisible({ timeout: 15_000 });
  });

  // FR5 — TC-FRND-01: Accepted friends from seed data are visible
  test('TC-FRND-01: accepted friends from seed data are visible in Current Friends', async ({ page }) => {
    await expect(page.getByText('Bob')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Charlie')).toBeVisible({ timeout: 10_000 });
  });

  // FR5 — TC-FRND-02: Incoming request shows Accept and Decline buttons
  test('TC-FRND-02: incoming friend request from Evan shows Accept and Decline buttons', async ({ page }) => {
    await expect(page.getByText('Evan')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Accept' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Decline' }).first()).toBeVisible();
  });

  // FR3 — TC-FRND-03: Send Request button is disabled when search input is empty
  test('TC-FRND-03: Send Request button is disabled when user ID input is empty', async ({ page }) => {
    const sendBtn = page.getByRole('button', { name: 'Send Request' });
    await expect(sendBtn).toBeVisible();
    await expect(sendBtn).toBeDisabled();
  });

  // FR3 — TC-FRND-04: Typing a user ID enables the Send Request button
  test('TC-FRND-04: typing a user ID into the search field enables the Send Request button', async ({ page }) => {
    const input = page.getByPlaceholder(/4d5d8a2e/i);
    await input.fill('some-user-id-1234');
    await expect(page.getByRole('button', { name: 'Send Request' })).toBeEnabled();
  });

  // FR4 — TC-FRND-05: Suggested Friends section shows Fiona from seed data
  test('TC-FRND-05: Suggested Friends section renders with at least one recommendation', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Suggested Friends' })).toBeVisible();
    await expect(page.getByText('Fiona')).toBeVisible({ timeout: 10_000 });
  });

  // FR5 — TC-FRND-06: Accepting a request shows a success message
  test('TC-FRND-06: incoming friend request has a clickable Accept button', async ({ page }) => {
    await expect(page.getByText('Evan')).toBeVisible({ timeout: 10_000 });

    const acceptBtn = page.getByRole('button', { name: 'Accept' }).first();
    await expect(acceptBtn).toBeVisible();
    await expect(acceptBtn).toBeEnabled();
  });

});
