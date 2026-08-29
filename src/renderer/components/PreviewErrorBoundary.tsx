import React from 'react'
import { withTranslation, type WithTranslation } from 'react-i18next'

interface Props extends WithTranslation {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class PreviewErrorBoundaryInner extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): React.ReactNode {
    const { t } = this.props
    if (this.state.hasError) {
      return (
        <div className="preview-center preview-error">
          <div>
            <p>{t('previewPane.previewCrashed')}</p>
            {this.state.error && (
              <p style={{ fontSize: '0.85em', opacity: 0.8 }}>{this.state.error.message}</p>
            )}
            <button
              onClick={this.handleRetry}
              style={{ marginTop: '8px', padding: '4px 12px', cursor: 'pointer' }}
            >
              {t('previewPane.retry')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const PreviewErrorBoundary = withTranslation()(PreviewErrorBoundaryInner)
export default PreviewErrorBoundary
