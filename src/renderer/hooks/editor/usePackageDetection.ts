import { useEffect } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'
import { logError } from '../../utils/errorMessage'

export function usePackageDetection(content: string): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      const currentContent = useEditorStore.getState().content
      const pkgRegex = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g
      const packages = new Set<string>()
      let pkgMatch: RegExpExecArray | null

      while ((pkgMatch = pkgRegex.exec(currentContent)) !== null) {
        pkgMatch[1].split(',').forEach((pkg) => packages.add(pkg.trim()))
      }

      const detected = Array.from(packages).sort()
      const current = useProjectStore.getState().detectedPackages
      if (JSON.stringify(detected) !== JSON.stringify(current)) {
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
    }, 1500)

    return () => clearTimeout(timer)
  }, [content])
}
