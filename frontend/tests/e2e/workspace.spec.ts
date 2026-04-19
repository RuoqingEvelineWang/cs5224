import { test, expect } from '@playwright/test';

// evt-001: [TEST: Submit Availability] Weekend Hike — status COLLECTING_AVAILABILITY
// evt-002: [TEST: Pick Time & Venue] Japanese Dinner — status SCHEDULING (creator view)

test.describe('Event workspace', () => {

  // FR7 — TC-WS-01: Availability grid renders for a COLLECTING_AVAILABILITY event
  test('TC-WS-01: availability grid renders when event is collecting availability', async ({ page }) => {
    await page.goto('/events/evt-001/workspace');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });

    // The availability tab heading and the time grid should be visible
    await expect(page.getByText('Select your available time slots.')).toBeVisible({ timeout: 10_000 });

    // The grid is rendered as an overflow container with time cells
    await expect(page.locator('.overflow-x-auto').first()).toBeVisible();
  });

  // FR7 — TC-WS-02: Submit Availability button is disabled when no slots are selected
  test('TC-WS-02: Submit Availability button is disabled until at least one time slot is selected', async ({ page }) => {
    await page.goto('/events/evt-001/workspace');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });

    // Button text includes slot count: "Submit Availability (0 slots)"
    // It is disabled when selectedSlots.size === 0
    const submitBtn = page.getByRole('button', { name: /Submit Availability/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    await expect(submitBtn).toBeDisabled();
  });

  // FR8 — TC-WS-03: Creator sees the voting grid and slot selection UI in SCHEDULING state
  test('TC-WS-03: creator sees the Slot Voting grid and all-submitted banner in SCHEDULING state', async ({ page }) => {
    await page.goto('/events/evt-002/workspace');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });

    // The blue banner tells the creator all participants have submitted
    await expect(
      page.getByText(/All .* participants have submitted/i)
    ).toBeVisible({ timeout: 10_000 });

    // The Slot Voting tab is active
    await expect(page.getByRole('button', { name: /Slot Voting/i })).toBeVisible();

    // The voting grid container is present
    await expect(page.locator('.overflow-x-auto').first()).toBeVisible();
  });

  // FR8 + FR10 — TC-WS-04: Selecting a time slot reveals the Choose Venue button
  test('TC-WS-04: selecting a time slot in voting grid reveals the Choose Venue button', async ({ page }) => {
    await page.goto('/events/evt-002/workspace');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/All .* participants have submitted/i)).toBeVisible({ timeout: 10_000 });

    // Click the first highlighted (non-empty) voting cell
    // Highlighted cells have bg-indigo-100 or bg-indigo-400 class
    // const firstVotedCell = page.locator('.bg-indigo-100, .bg-indigo-400').first();
    // await firstVotedCell.click();
    const votingGrid = page.locator('.overflow-x-auto').first();
    const firstVotedCell = votingGrid.locator('.bg-indigo-100, .bg-indigo-400').first();
    await firstVotedCell.click();

    // After selecting a slot, the Choose Venue button appears
    // await expect(page.getByRole('button', { name: /Choose Venue/i })).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('button', { name: /Choose Venue/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  // FR10 — TC-WS-05: Venue tab shows venue cards after a time slot is selected
  test('TC-WS-05: navigating to the Venue tab shows recommended venue cards', async ({ page }) => {
    await page.goto('/events/evt-002/workspace');
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/All .* participants have submitted/i)).toBeVisible({ timeout: 10_000 });

    // Select the first available slot
    // const firstVotedCell = page.locator('.bg-indigo-100, .bg-indigo-400').first();
    // await firstVotedCell.click();
    // Scope the voted cell search inside the voting grid container only
    const votingGrid = page.locator('.overflow-x-auto').first();
    const firstVotedCell = votingGrid.locator('.bg-indigo-100, .bg-indigo-400').first();
    await firstVotedCell.click();

    // Navigate to the Venue tab
    await page.getByRole('button', { name: /Choose Venue/i }).click();

    // Wait for venue cards to load
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });

    // Venue cards each have a "Select This Venue" button
    await expect(
      page.getByRole('button', { name: 'Select This Venue' }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

});
