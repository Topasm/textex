import './LoadingFallback.css'

export type LoadingFallbackVariant = 'workspace' | 'pane' | 'modal' | 'page' | 'panel' | 'floating'

interface LoadingFallbackProps {
  label: string
  variant?: LoadingFallbackVariant
  overlayOwner?: 'help' | 'settings' | 'aiDraft' | 'templateGallery'
}

/** Contextual, accessible feedback for renderer chunks and long-lived UI hydration. */
export function LoadingFallback({ label, variant = 'pane', overlayOwner }: LoadingFallbackProps) {
  return (
    <div
      className={`loading-fallback loading-fallback--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      data-app-overlay-owner={overlayOwner}
    >
      <div className="loading-fallback__card">
        <span className="loading-fallback__spinner" aria-hidden="true" />
        <span className="loading-fallback__label">{label}</span>
        {variant !== 'floating' && (
          <span className="loading-fallback__skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
      </div>
    </div>
  )
}
