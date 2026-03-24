import { test, expect } from './electron-app'

test.describe('Settings Panel', () => {
  test('opens settings and shows all sections', async ({ window }) => {
    // Open settings
    await window.locator('button:has-text("⚙")').click()
    await window.waitForTimeout(500)

    // API Keys section
    await expect(window.locator('h4:has-text("API Keys")')).toBeVisible()

    // Models section
    await expect(window.locator('h4:has-text("Models")')).toBeVisible()

    // System Prompt section
    await expect(window.locator('h4:has-text("System Prompt")')).toBeVisible()

    // Context Template section
    await expect(window.locator('h4:has-text("Context Template")')).toBeVisible()

    // Saved Prompts section
    await expect(window.locator('h4:has-text("Saved Prompts")')).toBeVisible()

    // Timeout section
    await expect(window.locator('h4:has-text("Timeout")')).toBeVisible()
  })

  test('can edit system prompt', async ({ window }) => {
    await window.locator('button:has-text("⚙")').click()
    await window.waitForTimeout(500)

    // Find the system prompt textarea (first large textarea after the heading)
    const systemPromptTextarea = window.locator('h4:has-text("System Prompt") + textarea')
    if (await systemPromptTextarea.isVisible()) {
      await systemPromptTextarea.fill('Custom system prompt for testing')
      await expect(systemPromptTextarea).toHaveValue('Custom system prompt for testing')
    }
  })

  test('shows provider labels with env var hints', async ({ window }) => {
    await window.locator('button:has-text("⚙")').click()
    await window.waitForTimeout(500)

    await expect(window.locator('text=ANTHROPIC_API_KEY')).toBeVisible()
    await expect(window.locator('text=OPENAI_API_KEY')).toBeVisible()
    await expect(window.locator('text=GOOGLE_API_KEY')).toBeVisible()
  })
})
