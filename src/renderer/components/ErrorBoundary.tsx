import React from 'react'
import { withTranslation, WithTranslation } from 'react-i18next'

interface Props extends WithTranslation {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryInner extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const { t } = this.props
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h1>{t('errorBoundary.title')}</h1>
            <p>{t('errorBoundary.message')}</p>
            {this.state.error && (
              <pre className="error-boundary-details">{this.state.error.message}</pre>
            )}
            <button className="error-boundary-reload" onClick={this.handleReload}>
              {t('errorBoundary.reload')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const ErrorBoundary = withTranslation()(ErrorBoundaryInner)
export default ErrorBoundary
