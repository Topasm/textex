import { useCallback } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'
import { logError } from '../../utils/errorMessage'

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Detects \usepackage commands in the current editor content and loads package metadata.
 * Content-change scheduling is handled by useContentChangeCoordinator in EditorPane.
 */
export function usePackageDetection(): { detectPackages: () => void } {
  const detectPackages = useCallback(() => {
    const currentContent = useEditorStore.getState().content
    const pkgRegex = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g
    const packages = new Set<string>()
    let pkgMatch: RegExpExecArray | null

    while ((pkgMatch = pkgRegex.exec(currentContent)) !== null) {
      pkgMatch[1].split(',').forEach((pkg) => packages.add(pkg.trim()))
    }

    const detected = Array.from(packages).sort()
    const current = useProjectStore.getState().detectedPackages
    if (!arraysEqual(detected, current)) {
      useProjectStore.getState().setDetectedPackages(detected)

      if (detected.length > 0) {
        window.api
          .loadPackageData(detected)
          .then((data) => {
            useProjectStore.getState().setPackageData(data)
          })
          .catch((err) => logError('loadPackageData', err))
      } else {
        useProjectStore.getState().setPackageData({})
      }
    }
  }, [])

  return { detectPackages }
}
