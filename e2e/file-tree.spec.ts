import { test, expect } from './electron-app'

test.describe('File Tree Panel', () => {
  test('shows Explorer tab and project button', async ({ window }) => {
    // Explorer tab should be visible
    await expect(window.getByText('Explorer').first()).toBeVisible()

    // Click Explorer tab to ensure it's active
    await window.getByText('Explorer').first().click()
    await window.waitForTimeout(300)

    // Should show Open/Change Project button
    const btn = window.locator('button:has-text("Open Project"), button:has-text("Change Project")')
    await expect(btn).toBeVisible()
  })
})
