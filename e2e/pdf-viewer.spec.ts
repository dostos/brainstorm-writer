import { test, expect } from './electron-app'

test.describe('PDF Viewer Panel', () => {
  test('shows PDF content or empty state', async ({ window }) => {
    // If last project was auto-loaded and has a PDF, we see the viewer toolbar
    // If not, we see the empty state
    const emptyState = window.locator('text=Open a project to view PDF')
    const toolbar = window.locator('button:has-text("Scroll"), button:has-text("Page")')

    // One of these should be visible
    const emptyVisible = await emptyState.isVisible().catch(() => false)
    const toolbarVisible = await toolbar.isVisible().catch(() => false)
    expect(emptyVisible || toolbarVisible).toBe(true)
  })
})
