import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Path where Playwright will save the authenticated browser state
const AUTH_FILE = path.join(__dirname, '.auth/user.json');

// ─── FILL IN YOUR TEST ACCOUNT CREDENTIALS HERE ───────────────────────────────
const TEST_EMAIL = process.env.TEST_EMAIL ?? 'your-test-account@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'YourTestPassword123!';
// ──────────────────────────────────────────────────────────────────────────────

setup('authenticate once and save session', async ({ page }) => {
  // Ensure the .auth directory exists
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto('/');

  // Wait for the Sign In form to be visible
  await expect(page.getByText('Sign In')).toBeVisible({ timeout: 15_000 });

  // Fill in email
  await page.getByPlaceholder('you@example.com').first().fill(TEST_EMAIL);

  // Fill in password (the Field component renders type="password")
  await page.getByPlaceholder('••••••••').first().fill(TEST_PASSWORD);

  // Click the Sign In button (it's a <button type="button"> with text "Sign In")
  await page.getByRole('button', { name: 'Sign In' }).click();

  // After successful login, the app either goes to Onboarding or Dashboard.
  // We wait for a URL that is NOT the auth page.
  await page.waitForURL(url => !url.pathname.includes('/auth'), { timeout: 20_000 });

  // If onboarding appears (profile not yet set up), skip it:
  // The app shows OnboardingPage when profile.address is missing.
  // For the test account, ensure it already has a completed profile.
  // If you see the onboarding page here, complete it manually once in the browser first.
  const title = await page.title();
  console.log('Post-login page title:', title);

  // Save auth state (cookies + localStorage containing Cognito tokens)
  await page.context().storageState({ path: AUTH_FILE });
  console.log('Auth state saved to', AUTH_FILE);
});
