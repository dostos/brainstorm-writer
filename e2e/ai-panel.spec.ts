import { test, expect } from './electron-app'

test.describe('AI Panel', () => {
  test('shows AI Assistant header', async ({ window }) => {
    await expect(window.getByText('AI Assistant').first()).toBeVisible()
  })

  test('shows provider badges (Claude, OpenAI, Gemini)', async ({ window }) => {
    await expect(window.locator('text=claude')).toBeVisible()
    await expect(window.locator('text=openai')).toBeVisible()
    await expect(window.locator('text=gemini')).toBeVisible()
  })

  test('provider badges are toggleable', async ({ window }) => {
    const claudeBadge = window.locator('div:has-text("claude")').first()
    // Click to deselect claude
    await claudeBadge.click()
    await window.waitForTimeout(200)
    // Click again to re-select
    await claudeBadge.click()
  })

  test('shows prompt textarea', async ({ window }) => {
    const textarea = window.locator('textarea[placeholder*="instruction"]')
    await expect(textarea).toBeVisible()
  })

  test('shows Send button', async ({ window }) => {
    await expect(window.locator('button:has-text("Send to All")')).toBeVisible()
  })

  test('shows context scope selector', async ({ window }) => {
    await expect(window.getByText('Context:').first()).toBeVisible()
    await expect(window.getByText('selection').first()).toBeVisible()
    await expect(window.getByText('section').first()).toBeVisible()
    await expect(window.getByText('full').first()).toBeVisible()
  })

  test('can type in prompt textarea', async ({ window }) => {
    const textarea = window.locator('textarea[placeholder*="instruction"]')
    await textarea.fill('Make this more concise')
    await expect(textarea).toHaveValue('Make this more concise')
  })
})
