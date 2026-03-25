import { test, expect } from './electron-app'

test.describe('App Launch', () => {
  test('window opens with correct title', async ({ window }) => {
    const title = await window.title()
    expect(title).toBe('Brainstorm Writer')
  })

  test('shows dockview panels', async ({ window }) => {
    const tabs = window.locator('.dv-default-tab')
    await expect(tabs).not.toHaveCount(0)
  })

  test('shows settings button', async ({ window }) => {
    // Settings button has title="Settings"
    const settingsBtn = window.locator('[title="Settings"]')
    await expect(settingsBtn).toBeVisible()
  })

  test('settings button opens settings panel', async ({ window }) => {
    await window.locator('[title="Settings"]').click()
    await window.waitForTimeout(500)
    await expect(window.locator('text=API Keys').or(window.locator('text=Providers'))).toBeVisible()
  })
})
