/**
 * Shared import path for images that arrive as bytes rather than as a project
 * file: OS drag-and-drop and clipboard paste both copy into `images/` and cite
 * the copy with a project-relative path.
 */

export const MAX_IMPORTED_IMAGE_BYTES = 50 * 1024 * 1024

/** Directory every imported image lands in, relative to the project root. */
export const IMPORTED_IMAGE_DIRECTORY = 'images'

export interface ImportedImage {
  /** Forward-slash path relative to the project root, for `\includegraphics`. */
  relativePath: string
  /** Final on-disk name, which the native layer may have de-duplicated. */
  fileName: string
}

export function pathSeparator(projectRoot: string): string {
  return projectRoot.includes('\\') ? '\\' : '/'
}

/**
 * Copies the bytes into the project's images directory. The native writer
 * decides the final name, so the caller must cite the returned path instead of
 * the requested one.
 */
export async function importImageIntoProject(
  projectRoot: string,
  fileName: string,
  bytes: Uint8Array
): Promise<ImportedImage> {
  const separator = pathSeparator(projectRoot)
  const directory = `${projectRoot.replace(/[\\/]$/, '')}${separator}${IMPORTED_IMAGE_DIRECTORY}`
  await window.api.createDirectory(directory)
  const imported = await window.api.writeFileBinary(`${directory}${separator}${fileName}`, bytes)
  const importedFileName = imported.filePath.split(/[\\/]/).pop() || fileName
  return {
    relativePath: `${IMPORTED_IMAGE_DIRECTORY}/${importedFileName}`,
    fileName: importedFileName
  }
}
