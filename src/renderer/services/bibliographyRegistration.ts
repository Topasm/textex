import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import type { BibliographyRegistrationRequest } from '../store/useProjectStore'

export function queueBibliographyRegistration(bibliographyPath: string): void {
  const editor = useEditorStore.getState()
  const filePath = editor.activeFilePath
  if (!filePath || !/\.tex$/i.test(filePath)) return
  const content = documentRegistry.snapshot(filePath)?.text
  if (content === undefined) return
  const bibliographyFile = bibliographyPath.split(/[\\/]/).at(-1)
  if (!bibliographyFile) return
  const request = buildBibliographyRegistration(filePath, content, bibliographyFile)
  if (request) useProjectStore.getState().setBibliographyRegistrationRequest(request)
}

export function buildBibliographyRegistration(
  filePath: string,
  content: string,
  bibliographyFile: string
): BibliographyRegistrationRequest | null {
  const escapedFile = escapeRegExp(bibliographyFile)
  const stem = bibliographyFile.replace(/\.bib$/i, '')
  const bibliography = /\\bibliography\s*\{([^}]*)\}/i
  const existing = bibliography.exec(content)
  const registeredWithBibtex = existing?.[1]
    .split(',')
    .some((entry) => entry.trim().replace(/\.bib$/i, '') === stem)
  if (
    new RegExp(String.raw`\\addbibresource(?:\[[^\]]*\])?\{[^}]*${escapedFile}[^}]*\}`, 'i').test(
      content
    ) ||
    registeredWithBibtex
  ) {
    return null
  }

  const usesBiblatex =
    /\\addbibresource(?:\[[^\]]*\])?\{/i.test(content) ||
    /\\usepackage(?:\[[^\]]*\])?\{[^}]*\bbiblatex\b[^}]*\}/i.test(content)
  if (usesBiblatex) {
    const command = `\\addbibresource{${bibliographyFile}}`
    return {
      filePath,
      bibliographyFile,
      originalContent: content,
      proposedContent: insertBefore(content, /\\begin\s*\{document\}/i, `${command}\n`),
      command,
      mode: 'biblatex'
    }
  }

  if (existing) {
    const entries = existing[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    const command = `\\bibliography{${[...entries, stem].join(',')}}`
    return {
      filePath,
      bibliographyFile,
      originalContent: content,
      proposedContent:
        content.slice(0, existing.index) +
        command +
        content.slice(existing.index + existing[0].length),
      command,
      mode: 'bibtex'
    }
  }

  const hasStyle = /\\bibliographystyle\s*\{[^}]+\}/i.test(content)
  const command = `${hasStyle ? '' : '\\bibliographystyle{plain}\n'}\\bibliography{${stem}}`
  return {
    filePath,
    bibliographyFile,
    originalContent: content,
    proposedContent: insertBefore(content, /\\end\s*\{document\}/i, `${command}\n`),
    command,
    mode: 'bibtex'
  }
}

function insertBefore(content: string, marker: RegExp, insertion: string): string {
  const match = marker.exec(content)
  if (!match) return `${content.replace(/\s*$/, '')}\n\n${insertion}`
  return `${content.slice(0, match.index)}${insertion}${content.slice(match.index)}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
