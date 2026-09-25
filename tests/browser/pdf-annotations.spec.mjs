import { test, expect } from '@playwright/test'
import { annotatedPdfFixture } from './pdf-fixture.ts'

test('imports real PDF comments and highlights into persistent review notes', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?notes')
  await expect(page.getByText('Keep existing notes.')).toBeVisible()
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import PDF annotations' }).click()
  await (await picker).setFiles({ name: 'review.pdf', mimeType: 'application/pdf', buffer: Buffer.from(annotatedPdfFixture()) })
  await expect(page.getByRole('status')).toHaveText('Added 2 annotations to notes.')
  await expect(page.getByText('Please explain the method.')).toBeVisible()
  await expect(page.getByText('Check this claim.')).toBeVisible()
  await expect(page.getByText('The efficient method works.')).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('notes'))).toContain('- [ ] Page 1 · Highlight · Reviewer')
  await page.reload()
  await expect(page.getByText('Keep existing notes.')).toBeVisible()
  await expect(page.getByText('Please explain the method.')).toBeVisible()
  expect(errors).toEqual([])
})
