import { test, expect } from '@playwright/test'

for (const width of [300, 420]) {
  test(`PDF search preserves the toolbar and page position at ${width}px`, async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.textLayer span').first()).toBeVisible()
    await page.locator('.preview-container').evaluate((element, size) => { element.style.width = `${size}px` }, width)
    const toolbar = page.getByRole('toolbar', { name: 'PDF', exact: true })
    await expect.poll(async () => (await toolbar.boundingBox()).height).toBe(40)
    const before = await toolbar.boundingBox()
    const canvas = await page.locator('.react-pdf__Page__canvas').first().boundingBox()
    await page.getByRole('button', { name: 'Find in PDF', exact: true }).click()
    const search = page.getByRole('search', { name: 'Find in PDF' })
    await expect(search).toBeVisible()
    const after = await toolbar.boundingBox()
    const popup = await search.boundingBox()
    const nextCanvas = await page.locator('.react-pdf__Page__canvas').first().boundingBox()
    expect(after.height).toBe(before.height)
    expect(nextCanvas.y).toBeCloseTo(canvas.y, 0)
    expect(popup.x).toBeGreaterThanOrEqual(after.x)
    expect(popup.x + popup.width).toBeLessThanOrEqual(after.x + after.width)
    await page.getByRole('textbox', { name: 'Find in PDF', exact: true }).press('Escape')
    await expect(search).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Find in PDF', exact: true })).toBeFocused()
  })
}

for (const theme of ['dark', 'light']) {
  test(`compact cards align actions and avoid overflow in ${theme} theme`, async ({ page }) => {
    await page.goto('/?ui&width=300')
    await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
    const header = page.locator('.ai-edit-review-header')
    await expect(header).toBeVisible()
    const undo = await page.getByRole('button', { name: 'Undo', exact: true }).boundingBox()
    const check = await page.getByRole('button', { name: 'Compile to check', exact: true }).boundingBox()
    expect(undo.height).toBe(28)
    expect(check.height).toBe(32)
    expect(undo.y + undo.height / 2).toBeCloseTo(check.y + check.height / 2, 0)
    for (const row of await page.locator('.log-entry-row').all()) {
      const icon = await row.locator('.log-entry-icon').boundingBox()
      const fix = await row.getByRole('button', { name: 'Fix', exact: true }).boundingBox()
      expect(Math.abs(icon.y + icon.height / 2 - fix.y - fix.height / 2)).toBeLessThanOrEqual(2)
    }
    await expect(page.locator('.reference-row-head strong')).toHaveText('Efficient Attention for Long-Context Scientific Document Understanding')
    expect(await page.locator('.reference-row-head strong').evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
    await page.getByRole('button', { name: 'Link PDF evidence', exact: true }).click()
    const select = page.getByRole('combobox', { name: 'Reference PDF', exact: true })
    await expect(select).toBeVisible()
    const input = await page.getByRole('spinbutton', { name: 'PDF page', exact: true }).boundingBox()
    const read = await page.getByRole('button', { name: 'Read page', exact: true }).boundingBox()
    expect(input.height).toBe(32)
    expect(read.height).toBe(32)
    expect(read.y).toBe(input.y)
    for (const panel of await page.locator('[data-testid$="-panel"]').all()) {
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
  })
}

for (const width of [300, 420]) {
  test(`research controls and popovers stay inside a ${width}px panel`, async ({ page }) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/?research-ui&width=${width}`)
    const sort = page.getByRole('combobox', { name: 'Sort references' })
    await expect(sort).toBeVisible()
    const config = await page.locator('.research-config-row').boundingBox()
    const collection = page.locator('.zotero-collection-trigger')
    const triggerBox = await collection.boundingBox()
    const sortBox = await sort.boundingBox()
    expect(triggerBox.width).toBe(config.width)
    expect(triggerBox.height).toBe(32)
    expect(sortBox.height).toBe(32)
    expect(sortBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height)
    for (const button of await page.locator('.research-config-row > button').all()) {
      const box = await button.boundingBox()
      expect(box.height).toBe(28)
      expect(box.y + box.height / 2).toBe(sortBox.y + sortBox.height / 2)
    }
    await collection.click()
    const picker = await page.locator('.zotero-collection-popover').boundingBox()
    expect(picker.x).toBe(config.x)
    expect(picker.width).toBe(config.width)
    await collection.press('Escape')
    await expect(page.locator('.zotero-collection-popover')).not.toBeVisible()

    const tools = page.locator('.research-chat-tools summary')
    await tools.click()
    const popover = page.locator('.research-chat-tools-popover')
    const popupBox = await popover.boundingBox()
    const composerBox = await page.locator('.research-chat-composer-shell').boundingBox()
    expect(popupBox.x).toBeGreaterThanOrEqual(composerBox.x)
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(composerBox.x + composerBox.width)
    const draft = popover.getByRole('button', { name: 'AI Draft', exact: true })
    await draft.focus()
    await draft.press('Escape')
    await expect(popover).not.toBeVisible()
    await expect(tools).toBeFocused()
    await tools.click()
    await page.locator('.research-chat-heading').click()
    await expect(popover).not.toBeVisible()
    await tools.click()
    await popover.getByRole('button', { name: 'Resume Codex', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(popover).not.toBeVisible()

    const model = await page.getByRole('combobox', { name: 'Research Chat model' }).boundingBox()
    const send = await page.locator('.research-chat-send').boundingBox()
    expect(model.height).toBe(32)
    expect(send.height).toBe(32)
    expect(model.y).toBe(send.y)
    await page.getByRole('textbox', { name: 'Research question' }).fill('Summarize this paper')
    await page.locator('.research-chat-send').click()
    await expect(page.locator('.research-chat-stop')).toBeVisible()
    const stop = await page.locator('.research-chat-stop').boundingBox()
    const busyModel = await page.getByRole('combobox', { name: 'Research Chat model' }).boundingBox()
    expect(stop.height).toBe(32)
    expect(stop.y).toBe(busyModel.y)
    for (const panel of await page.locator('[data-testid$="-panel"]').all()) {
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
    expect(errors).toEqual([])
  })
}

test('translated research controls fit a narrow panel', async ({ page }) => {
  for (const locale of ['de', 'fr', 'ko']) {
    await page.goto(`/?research-ui&width=300&locale=${locale}`)
    await expect(page.locator('.reference-sort-select')).toBeVisible()
    await page.locator('.research-chat-tools summary').click()
    for (const selector of ['.research-config-row', '.reference-health', '.research-chat-composer', '.research-chat-tools-popover']) {
      expect(await page.locator(selector).evaluate((element) => element.scrollWidth <= element.clientWidth), `${locale} ${selector}`).toBe(true)
    }
    const popup = await page.locator('.research-chat-tools-popover').boundingBox()
    const composer = await page.locator('.research-chat-composer-shell').boundingBox()
    expect(popup.x).toBeGreaterThanOrEqual(composer.x)
    expect(popup.x + popup.width).toBeLessThanOrEqual(composer.x + composer.width)
  }
})
