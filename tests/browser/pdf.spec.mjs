import { test, expect } from '@playwright/test'

test('real PDF worker renders canvas, text and annotations across zoom and generations', async ({
  page
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const text = page.locator('.textLayer span').filter({ hasText: 'The efficient method works.' })
  await expect(text).toBeVisible()
  await expect(page.locator('.annotationLayer a')).toHaveAttribute('href', 'https://example.org/')
  const buffer = page.locator('.preview-page-buffer')
  await expect.poll(() => buffer.evaluate((canvas) => canvas.width)).toBeGreaterThan(0)
  await page.evaluate(() => {
    window.blankPdfFrames = 0
    window.monitorPdf = true
    const sample = () => {
      const page = document.querySelector('[data-pdf-generation="1"] .react-pdf__Page')
      if (page) {
        const visible = [...page.querySelectorAll('canvas')].some((canvas) => {
          const style = getComputedStyle(canvas)
          return (
            canvas.width > 0 &&
            canvas.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        })
        if (!visible) window.blankPdfFrames++
      }
      if (window.monitorPdf) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  for (const action of ['Zoom in', 'Zoom out', 'Zoom in']) {
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect(text).toBeVisible()
    await expect
      .poll(() =>
        buffer.evaluate((canvas) => {
          const pixels = canvas
            .getContext('2d')
            .getImageData(0, 0, canvas.width, canvas.height).data
          return pixels.some(
            (value, index) => index % 4 === 0 && value < 100 && pixels[index + 3] > 0
          )
        })
      )
      .toBe(true)
    await expect
      .poll(() => buffer.evaluate((canvas) => canvas.width * canvas.height))
      .toBeLessThanOrEqual(2_000_000)
  }
  expect(
    await page.evaluate(() => {
      window.monitorPdf = false
      return window.blankPdfFrames
    })
  ).toBe(0)
  await page.getByRole('button', { name: 'Recompile' }).click()
  await expect(page.locator('[data-pdf-generation="2"] .textLayer')).toContainText(
    'The revised method works.'
  )
  await expect(page.locator('[data-pdf-generation="1"]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('PDF drag selection highlights real Monaco and carries into Markdown', async ({ page }) => {
  await page.goto('/')
  const text = page.locator('.textLayer span').filter({ hasText: 'The efficient method works.' })
  await expect(text).toBeVisible()
  const bounds = await text.boundingBox()
  await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + bounds.height / 2, { steps: 20 })
  await page.mouse.up()
  await expect(page.getByTestId('source-highlight')).toContainText('efficient method')
  await expect(page.locator('.monaco-editor .editor-preview-selection')).toBeVisible()
  await page.getByRole('button', { name: 'Toggle Markdown' }).click()
  const markdown = page.getByRole('textbox', { name: 'Markdown source' })
  await expect(markdown).toBeVisible()
  await expect
    .poll(() =>
      markdown.evaluate((area) => area.value.slice(area.selectionStart, area.selectionEnd))
    )
    .toContain('efficient method')
})

test('Ctrl+click on PDF moves the real Monaco editor to the source line', async ({ page }) => {
  await page.goto('/')
  const text = page.locator('.textLayer span').filter({ hasText: 'The efficient method works.' })
  await expect(text).toBeVisible()
  await text.click({ modifiers: ['Control'] })
  await expect(page.locator('.monaco-editor .editor-flash-line')).toBeVisible()
  await expect(page.getByTestId('source-editor')).toHaveAttribute('data-cursor-line', '2')
  await expect.poll(() => page.locator('.monaco-editor').evaluate((editor) => editor.contains(document.activeElement))).toBe(true)
})

test('PDF search stays in the viewer and follows the displayed generation', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.textLayer span').first()).toBeVisible()
  await page.getByRole('button', { name: 'Find in PDF', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Find in PDF', exact: true })
  await expect(input).toBeFocused()
  await input.fill('efficient')
  await expect(page.locator('.pdf-search-highlight')).toBeVisible()
  await expect(page.getByRole('search')).toContainText('1 / 1')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.locator('.pdf-search-highlight')).toBeVisible()
  await page.getByRole('button', { name: 'Recompile' }).click()
  await expect(page.locator('[data-pdf-generation="2"] .textLayer')).toContainText('revised')
  await expect(page.getByRole('search')).toContainText('0 / 0')
  await input.fill('revised')
  await expect(page.locator('[data-pdf-generation="2"] .pdf-search-current')).toBeVisible()
  await input.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(page.locator('.pdf-search-highlight')).toHaveCount(0)
})

test('document find opens the active TeX or Markdown search surface', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.getByRole('button', { name: 'Find document', exact: true }).click()
  await expect(page.locator('.monaco-editor .find-widget')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Find', exact: true })).toBeFocused()
  await page.getByRole('textbox', { name: 'Find', exact: true }).fill('efficient')
  await expect(page.locator('.monaco-editor .find-widget')).toContainText('1 of 1')
  await page.getByRole('button', { name: 'Toggle Markdown' }).click()
  await page.getByRole('button', { name: 'Find document', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Find in document', exact: true })
  await expect(input).toBeFocused()
  await input.fill('method')
  const area = page.getByRole('textbox', { name: 'Markdown source' })
  await expect.poll(() => area.evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('method')
  await input.press('Escape')
  await expect(area).toBeFocused()
  await expect(input).toHaveCount(0)
})

for (const mode of ['continuous', 'single']) {
  test(`PDF search reaches unrendered pages in ${mode} mode and counts repeated occurrences`, async ({ page }) => {
    await page.goto('/?multipage')
    await expect(page.locator('[data-page-number="1"] .textLayer')).toBeVisible()
    if (mode === 'single') await page.getByRole('button', { name: 'Single page' }).click()
    await expect(page.locator('[data-page-number="24"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Find in PDF', exact: true }).click()
    const input = page.getByRole('textbox', { name: 'Find in PDF', exact: true })
    await input.fill('distant target')
    await expect(page.getByRole('search')).toContainText('1 / 3')
    const current = page.locator('.pdf-search-current')
    await expect(page.locator('[data-page-number="12"] .pdf-search-current')).toBeVisible()
    const firstX = await current.evaluate((element) => element.getBoundingClientRect().x)
    await input.press('Enter')
    await expect(page.getByRole('search')).toContainText('2 / 3')
    await expect.poll(async () => (await current.boundingBox())?.x).toBeGreaterThan(firstX)
    await input.press('Enter')
    await expect(page.getByRole('search')).toContainText('3 / 3')
    await expect(page.locator('[data-page-number="24"] .pdf-search-current')).toBeVisible()
    await input.press('Enter')
    await expect(page.getByRole('search')).toContainText('1 / 3')
    await expect(page.locator('[data-page-number="12"] .pdf-search-current')).toBeVisible()
    await input.press('Escape')
    await expect(page.locator('.pdf-search-highlight')).toHaveCount(0)
  })
}
