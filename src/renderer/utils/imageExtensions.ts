export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.svg',
  '.webp'
])

export function isImageFile(fileName: string): boolean {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}
