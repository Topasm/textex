/**
 * Clipboard-to-LaTeX image support. Screenshot tools put a bitmap on the
 * clipboard with no file name, so the paste path has to derive both the
 * extension and a stable, filesystem-safe name from the MIME type.
 */

/** MIME types LaTeX engines can include directly, mapped to their extension. */
const CLIPBOARD_IMAGE_EXTENSIONS = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/bmp', '.bmp'],
  ['image/webp', '.webp'],
  ['image/svg+xml', '.svg']
])

export interface ClipboardImage {
  file: File
  fileName: string
}

export function clipboardImageExtension(mimeType: string): string | null {
  const normalized = mimeType.split(';')[0].trim().toLowerCase()
  return CLIPBOARD_IMAGE_EXTENSIONS.get(normalized) ?? null
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/**
 * Builds `pasted-YYYYMMDD-HHMMSS.ext` in local time. The native writer never
 * overwrites, so two pastes within the same second get a numbered sibling
 * rather than clobbering the first image.
 */
export function clipboardImageFileName(mimeType: string, timestamp: Date): string | null {
  const extension = clipboardImageExtension(mimeType)
  if (!extension) return null
  const date = `${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(timestamp.getDate())}`
  const time = `${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`
  return `pasted-${date}-${time}${extension}`
}

/**
 * Keeps a copied file's own name when it is usable, because a named figure is
 * easier to recognize later than a timestamp. The clipboard's MIME type still
 * decides the extension so the citation always matches the written bytes.
 */
function clipboardFileName(file: File, generatedName: string): string {
  const sourceName = file.name.split(/[\\/]/).pop()?.trim() ?? ''
  const extensionIndex = sourceName.lastIndexOf('.')
  if (extensionIndex <= 0 || extensionIndex === sourceName.length - 1) return generatedName
  const stem = sourceName
    .slice(0, extensionIndex)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
    .replace(/-{2,}/gu, '-')
  if (!stem) return generatedName
  return `${stem}${generatedName.slice(generatedName.lastIndexOf('.'))}`
}

/**
 * Returns the first pasted image, ignoring the text flavors that accompany it.
 */
export function findClipboardImage(
  clipboardData: DataTransfer | null,
  timestamp: Date = new Date()
): ClipboardImage | null {
  if (!clipboardData) return null
  const fromFiles = Array.from(clipboardData.files ?? [])
  const fromItems = Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  for (const file of [...fromFiles, ...fromItems]) {
    const generatedName = clipboardImageFileName(file.type, timestamp)
    if (!generatedName) continue
    return { file, fileName: clipboardFileName(file, generatedName) }
  }
  return null
}
