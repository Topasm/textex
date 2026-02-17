import { useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'

export function usePackageDetection(content: string): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      const currentContent = useAppStore.getState().content
      const pkgRegex = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g
      const packages = new Set<string>()
      let pkgMatch: RegExpExecArray | null

      while ((pkgMatch = pkgRegex.exec(currentContent)) !== null) {
        pkgMatch[1].split(',').forEach((pkg) => packages.add(pkg.trim()))
      }

      const detected = Array.from(packages).sort()
      const current = useAppStore.getState().detectedPackages
      if (JSON.stringify(detected) !== JSON.stringify(current)) {
        useAppStore.getState().setDetectedPackages(detected)

        if (detected.length > 0) {
          window.api.loadPackageData(detected).then((data) => {
            useAppStore.getState().setPackageData(data)
          }).catch(() => {})
        } else {
          useAppStore.getState().setPackageData({})
        }
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [content])
}
