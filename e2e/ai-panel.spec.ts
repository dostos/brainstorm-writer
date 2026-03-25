import { test, expect } from './electron-app'

// Helper: switch to AI Assistant tab (it's behind Explorer in Overleaf layout)
async function switchToAiTab(window: any) {
  const tab = window.getByText('AI Assistant').first()
  if (await tab.isVisible()) {
    await tab.click()
    await window.waitForTimeout(300)
  }
}

test.describe('AI Panel', () => {
  test('shows AI Assistant tab', async ({ window }) => {
    await expect(window.getByText('AI Assistant').first()).toBeVisible()
  })

  test('shows provider badges after switching to AI tab', async ({ window }) => {
    await switchToAiTab(window)
    await expect(window.locator('text=claude')).toBeVisible()
    await expect(window.locator('text=openai')).toBeVisible()
    await expect(window.locator('text=gemini')).toBeVisible()
  })

  test('provider badges are toggleable', async ({ window }) => {
    await switchToAiTab(window)
    const claudeBadge = window.locator('div:has-text("claude")').first()
    await claudeBadge.click()
    await window.waitForTimeout(200)
    await claudeBadge.click()
  })

  test('shows prompt textarea', async ({ window }) => {
    await switchToAiTab(window)
    const textarea = window.locator('textarea[placeholder*="instruction"]')
    await expect(textarea).toBeVisible()
  })

  test('shows Send button', async ({ window }) => {
    await switchToAiTab(window)
    await expect(window.locator('button:has-text("Send")')).toBeVisible()
  })

  test('shows context scope selector', async ({ window }) => {
    await switchToAiTab(window)
    await expect(window.getByText('Context:').first()).toBeVisible()
  })

  test('can type in prompt textarea', async ({ window }) => {
    await switchToAiTab(window)
    const textarea = window.locator('textarea[placeholder*="instruction"]')
    await textarea.fill('Make this more concise')
    await expect(textarea).toHaveValue('Make this more concise')
  })
})
