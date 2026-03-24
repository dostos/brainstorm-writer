import { test, expect } from './electron-app'

test.describe('File Tree Panel', () => {
  test('shows Open/Change Project button', async ({ window }) => {
    // May show "Open Project" or "Change Project" if last project was auto-loaded
    const openBtn = window.locator('button:has-text("Open Project"), button:has-text("Change Project")')
    await expect(openBtn).toBeVisible()
  })
})
