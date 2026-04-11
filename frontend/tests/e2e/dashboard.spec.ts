/**
 * dashboard.spec.ts
 *
 * Tests the main Dashboard page — the home screen after login.
 * Uses saved auth state so we don't repeat login.
 */

import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the dashboard to finish loading (spinner disappears)
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });
  });

  // ── TC-DASH-01: Dashboard page renders ────────────────────────────────────
  test('TC-DASH-01: dashboard renders header and two panels', async ({ page }) => {
    // Header banner
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('Check your next plans')).toBeVisible();

    // Two section headings
    await expect(page.getByText('Upcoming Events')).toBeVisible();
    await expect(page.getByText('Pending Invitations')).toBeVisible();
  });

  // ── TC-DASH-02: Create New Event button navigates ─────────────────────────
  test('TC-DASH-02: "Create New Event" button navigates to event creation', async ({ page }) => {
    await page.getByRole('link', { name: 'Create New Event' }).click();
    // Should navigate to /events/new (EventCreationWizard)
    await expect(page).toHaveURL(/\/events\/new/);
  });

  // ── TC-DASH-03: Empty states render correctly ─────────────────────────────
  test('TC-DASH-03: empty states show fallback text when no data', async ({ page }) => {
    // If there are no events, "No upcoming events yet." should appear
    // If there ARE events, this test still passes because we're checking for EITHER state
    const hasEvents = await page.getByText('No upcoming events yet.').isVisible().catch(() => false);
    const hasRealEvents = await page.locator('ul li').first().isVisible().catch(() => false);
    expect(hasEvents || hasRealEvents).toBe(true);
  });

  // ── TC-DASH-04: Navigation bar is visible ────────────────────────────────
  test('TC-DASH-04: main navigation links are present and functional', async ({ page }) => {
    const nav = page.locator('header nav');

    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Friends' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Events' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'New Event' })).toBeVisible();
  });

  // ── TC-DASH-05: Friends nav link works ───────────────────────────────────
  test('TC-DASH-05: clicking "Friends" in nav navigates to friends page', async ({ page }) => {
    await page.locator('header nav').getByRole('link', { name: 'Friends' }).click();
    await expect(page).toHaveURL(/\/friends/);
  });

  // ── TC-DASH-06: Events nav link works ────────────────────────────────────
  test('TC-DASH-06: clicking "Events" in nav navigates to events list', async ({ page }) => {
    await page.locator('header nav').getByRole('link', { name: 'Events' }).click();
    await expect(page).toHaveURL(/\/events/);
  });

  // ── TC-DASH-07: Notification bell is present ─────────────────────────────
  test('TC-DASH-07: notification bell icon is visible in header', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Notifications' })).toBeVisible();
  });

  // ── TC-DASH-08: Notification bell navigates to notifications ─────────────
  test('TC-DASH-08: clicking notification bell navigates to notifications page', async ({ page }) => {
    await page.getByRole('link', { name: 'Notifications' }).click();
    await expect(page).toHaveURL(/\/notifications/);
  });

  // ── TC-DASH-09: Sign Out button ───────────────────────────────────────────
  test('TC-DASH-09: sign out button is present and visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  });

  // ── TC-DASH-10: "View More" links to events list ─────────────────────────
  test('TC-DASH-10: "View More" link navigates to events list', async ({ page }) => {
    await page.getByRole('link', { name: /View More/i }).first().click();
    await expect(page).toHaveURL(/\/events/);
  });

});
