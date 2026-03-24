import { test, expect } from './electron-app'

test.describe('App Launch', () => {
  test('window opens with correct title', async ({ window }) => {
    const title = await window.title()
    expect(title).toBe('Brainstorm Writer')
  })

  test('shows 4 dockview panels', async ({ window }) => {
    // Check for panel tab titles
    const tabs = window.locator('.dv-default-tab')
    await expect(tabs).not.toHaveCount(0)

    const tabTexts = await tabs.allTextContents()
    expect(tabTexts.some(t => t.includes('Explorer'))).toBe(true)
    expect(tabTexts.some(t => t.includes('Editor'))).toBe(true)
    expect(tabTexts.some(t => t.includes('PDF'))).toBe(true)
    expect(tabTexts.some(t => t.includes('AI'))).toBe(true)
  })

  test('shows gear button for settings', async ({ window }) => {
    const gearBtn = window.locator('button:has-text("⚙")')
    await expect(gearBtn).toBeVisible()
  })

  test('gear button opens settings panel', async ({ window }) => {
    await window.locator('button:has-text("⚙")').click()
    await window.waitForTimeout(500)

    // Settings panel should contain "API Keys" heading
    await expect(window.locator('text=API Keys')).toBeVisible()
  })
})
