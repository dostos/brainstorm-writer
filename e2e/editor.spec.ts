import { test, expect } from './electron-app'

test.describe('Editor Panel', () => {
  test('shows empty state when no file is open', async ({ window }) => {
    await expect(window.locator('text=Open a file from the Explorer panel')).toBeVisible()
  })
})
