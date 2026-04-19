import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

// ─── FILL IN YOUR TEST ACCOUNT CREDENTIALS HERE ───────────────────────────────
const TEST_EMAIL = process.env.TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? '';
// ──────────────────────────────────────────────────────────────────────────────

setup('log in once and save session', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL);
  await page.getByPlaceholder('••••••••').first().fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for the nav bar to appear — this only renders after successful login
  await expect(page.locator('header nav')).toBeVisible({ timeout: 20_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
