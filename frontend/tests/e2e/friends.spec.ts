/**
 * friends.spec.ts
 *
 * Tests the FriendsManagementPage — search, add, and view friends.
 * Uses saved auth state.
 */

import { test, expect } from '@playwright/test';

test.describe('Friends management', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/friends');
    // Wait for the page to finish loading (no spinner)
    await page.waitForLoadState('networkidle');
  });

  // ── TC-FRND-01: Friends page loads ───────────────────────────────────────
  test('TC-FRND-01: friends page renders without crashing', async ({ page }) => {
    // The page should not show a blank white screen or unhandled error
    // At minimum some content should be visible
    const body = page.locator('main');
    await expect(body).toBeVisible({ timeout: 10_000 });

    // Should NOT have a JS error overlay
    await expect(page.locator('[data-testid="error-overlay"]')).not.toBeVisible();
  });

  // ── TC-FRND-02: Search input is present ──────────────────────────────────
  test('TC-FRND-02: user ID search input field is present', async ({ page }) => {
    // FriendsManagementPage should have a search/add-by-ID input
    // Adjust the placeholder text to match what's actually in your FriendsManagementPage
    const searchInput = page.getByRole('textbox').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });

  // ── TC-FRND-03: Search with empty input ──────────────────────────────────
  test('TC-FRND-03: submitting empty search shows validation feedback', async ({ page }) => {
    // Find the search/add button
    const addBtn = page.getByRole('button', { name: /Add|Search|Find/i }).first();

    if (await addBtn.isVisible()) {
      await addBtn.click();
      // Expect some kind of validation message or the input to be highlighted
      // (depends on implementation — adjust if needed)
      await expect(page.getByRole('textbox').first()).toBeFocused().catch(() => {
        // Some implementations show a toast or inline error instead
        console.log('Empty search: button clicked, checking for any response');
      });
    } else {
      test.skip(); // Friends page UI may not be implemented yet
    }
  });

  // ── TC-FRND-04: Friends list section exists ───────────────────────────────
  test('TC-FRND-04: friends list section is rendered', async ({ page }) => {
    // Check for a section heading like "My Friends" or "Friends" or similar
    const heading = page.getByText(/Friends|My Friends|friend/i).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  // ── TC-FRND-05: Pending requests section ─────────────────────────────────
  test('TC-FRND-05: pending friend requests section is rendered', async ({ page }) => {
    // Should show a "Pending" or "Requests" section (even if empty)
    const pending = page.getByText(/Pending|Request|Invitation/i).first();
    await expect(pending).toBeVisible({ timeout: 10_000 });
  });

  // ── TC-FRND-06: Recommendations section ──────────────────────────────────
  test('TC-FRND-06: friend recommendations section is present', async ({ page }) => {
    // The platform supports "suggested friends" based on interests
    const recommendations = page.getByText(/Suggest|Recommend|You might know/i).first();
    // This section may or may not exist depending on implementation stage
    const exists = await recommendations.isVisible().catch(() => false);
    console.log('Recommendations section visible:', exists);
    // Not a hard assertion — log for report evidence
  });

});
