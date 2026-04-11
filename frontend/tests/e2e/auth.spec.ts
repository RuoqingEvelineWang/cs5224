/**
 * auth.spec.ts
 *
 * Tests the AuthPage component — Sign In, Sign Up, and Confirm flows.
 * These tests intentionally do NOT use saved auth state (they test the login page itself).
 */

import { test, expect } from '@playwright/test';

// Override storageState for auth tests — we want a fresh unauthenticated session
test.use({ storageState: { cookies: [], origins: [] } });

const TEST_EMAIL = process.env.TEST_EMAIL ?? 'your-test-account@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'YourTestPassword123!';

test.describe('Authentication page', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Confirm we are on the auth page (not logged in)
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible({ timeout: 15_000 });
  });

  // ── TC-AUTH-01: Sign In page renders correctly ────────────────────────────
  test('TC-AUTH-01: sign-in form renders with all required fields', async ({ page }) => {
    // Brand panel visible on desktop
    await expect(page.getByText('Plan meetups,')).toBeVisible();

    // Email and password fields exist
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••').first()).toBeVisible();

    // Sign In button
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    // "Don't have an account? Sign up" link
    await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();
  });

  // ── TC-AUTH-02: Successful login ─────────────────────────────────────────
  test('TC-AUTH-02: successful sign-in navigates away from auth page', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL);
    await page.getByPlaceholder('••••••••').first().fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // After login, URL should change (to / or /onboarding equivalent)
    await page.waitForURL(url => url.pathname !== '/auth' && url.pathname !== '/', { timeout: 20_000 })
      .catch(() => {
        // App uses status state, URL stays at '/', but Dashboard should be visible
      });

    // Either Dashboard or Onboarding should render
    const isDashboard = await page.getByText('Dashboard').isVisible().catch(() => false);
    const isOnboarding = await page.getByText('Set up your profile').isVisible().catch(() => false);

    expect(isDashboard || isOnboarding).toBe(true);
  });

  // ── TC-AUTH-03: Wrong password shows error ────────────────────────────────
  test('TC-AUTH-03: wrong password displays an error banner', async ({ page }) => {
    await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL);
    await page.getByPlaceholder('••••••••').first().fill('WrongPassword999!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // ErrorBanner renders with a red background
    // Cognito typically returns "Incorrect username or password."
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 10_000 });
  });

  // ── TC-AUTH-04: Empty fields show error ──────────────────────────────────
  test('TC-AUTH-04: clicking sign-in with empty fields shows validation error', async ({ page }) => {
    // Click Sign In without filling anything
    await page.getByRole('button', { name: 'Sign In' }).click();

    // The SignInForm checks for empty fields before calling Cognito
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5_000 });
  });

  // ── TC-AUTH-05: Switch to Sign Up ────────────────────────────────────────
  test('TC-AUTH-05: clicking "Sign up" switches to registration form', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign up' }).click();

    // Sign Up form should appear
    await expect(page.getByText('Create account')).toBeVisible();
    await expect(page.getByPlaceholder('Min. 8 characters')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  // ── TC-AUTH-06: Sign Up password mismatch ────────────────────────────────
  test('TC-AUTH-06: mismatched passwords on sign-up shows validation error', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign up' }).click();

    await page.getByPlaceholder('you@example.com').fill('newuser@test.com');
    await page.getByPlaceholder('Min. 8 characters').fill('Password123!');
    await page.getByPlaceholder('••••••••').last().fill('DifferentPass456!');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.locator('.bg-red-50')).toContainText('Passwords do not match');
  });

  // ── TC-AUTH-07: Sign Up short password ───────────────────────────────────
  test('TC-AUTH-07: password shorter than 8 chars shows validation error', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign up' }).click();

    await page.getByPlaceholder('you@example.com').fill('newuser@test.com');
    await page.getByPlaceholder('Min. 8 characters').fill('abc');
    await page.getByPlaceholder('••••••••').last().fill('abc');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.locator('.bg-red-50')).toContainText('at least 8 characters');
  });

  // ── TC-AUTH-08: Switch back from Sign Up to Sign In ──────────────────────
  test('TC-AUTH-08: "Sign in" link on sign-up form returns to login', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByText('Create account')).toBeVisible();

    await page.getByRole('button', { name: 'Sign in' }).click();

    // Back to Sign In
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

});
