import { forwardRef, type KeyboardEventHandler, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { ExclusiveAppOverlay } from '../../services/appOverlayPolicy'
import { ICON_SIZE } from './IconSystem'

interface ModalFrameProps {
  owner: ExclusiveAppOverlay
  titleId: string
  className?: string
  children: ReactNode
  onClose: () => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

export const ModalFrame = forwardRef<HTMLDivElement, ModalFrameProps>(function ModalFrame(
  { owner, titleId, className = '', children, onClose, onKeyDown },
  ref
) {
  return (
    <div
      className="modal-overlay"
      role="presentation"
      data-app-overlay-owner={owner}
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      <div
        ref={ref}
        className={`modal-content${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
})

interface ModalCloseButtonProps {
  onClick: () => void
  label?: string
}

export function ModalCloseButton({ onClick, label }: ModalCloseButtonProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className="close-button"
      onClick={onClick}
      aria-label={label ?? t('logPanel.close')}
    >
      <X size={ICON_SIZE.control} />
    </button>
  )
}
