import { test, expect } from '@playwright/test';

test.describe('Profile page', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/profile');
    // ProfileTab fetches the current user — wait for the form to finish loading
    await expect(page.locator('.animate-spin')).not.toBeVisible({ timeout: 15_000 });
  });

  // TC-PROF-01: Profile page renders the expected form fields
  test('TC-PROF-01: profile page loads with name, postal code, transport and interest fields', async ({ page }) => {
    // Name textbox — no placeholder or label association in ProfilePage
    await expect(page.locator('input[type="text"]').first()).toBeVisible();

    // Postal code
    await expect(page.getByPlaceholder('e.g. 530111')).toBeVisible();

    // Transport type buttons
    await expect(page.getByRole('button', { name: 'Walking' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Car' })).toBeVisible();

    // Interest tags
    await expect(page.getByRole('button', { name: 'Badminton' })).toBeVisible();
  });

  // TC-PROF-02: Entering a non-6-digit postal code and saving shows a validation error
  test('TC-PROF-02: invalid postal code triggers a validation error on save', async ({ page }) => {
    // Clear the current postal code and type an incomplete one
    const postalInput = page.getByPlaceholder('e.g. 530111');
    await postalInput.clear();
    await postalInput.fill('123');

    // ProfileTab uses a <form onSubmit={handleSave}>, find the Save Changes button
    await page.getByRole('button', { name: /Save Changes/i }).click();

    // handleSave checks postalCode.length !== 6 and sets the error string
    await expect(page.getByText(/valid 6-digit postal code/i)).toBeVisible({ timeout: 5_000 });
  });

});
