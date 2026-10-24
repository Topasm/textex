import { test, expect } from '@playwright/test'

// The Linux AppImage ships a WebKitGTK whose ReadableStream has no async
// iterator, and pdf.js 6 reads text content with `for await`. Strip the
// protocol before any page script runs so every browser exercises the
// renderer's polyfill instead of its own engine support.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete ReadableStream.prototype[Symbol.asyncIterator]
    delete ReadableStream.prototype.values
  })
})

test('Find in PDF matches fixture text when ReadableStream is not async iterable', async ({
  page
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(
    page.locator('.textLayer span').filter({ hasText: 'The efficient method works.' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Find in PDF' }).click()
  const search = page.getByRole('search', { name: 'Find in PDF' })
  await search.getByRole('textbox').fill('efficient method')
  await expect(search.getByRole('status')).toHaveText('1 / 1')
  await expect(page.locator('.pdf-search-highlight.pdf-search-current')).toHaveCount(1)
  await expect(page.getByText('Could not search the PDF')).toHaveCount(0)
  expect(errors).toEqual([])
  // The renderer, not the engine, restored the protocol the init script removed.
  await expect(
    page.evaluate(() => typeof ReadableStream.prototype[Symbol.asyncIterator])
  ).resolves.toBe('function')
})
