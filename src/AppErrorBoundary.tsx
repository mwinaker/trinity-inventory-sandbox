import { Component, type ErrorInfo, type ReactNode } from 'react'
import { getAppErrorDiagnostic } from './app-error.ts'
import { clearLegacyLocalToolState } from './app-storage.ts'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  failed: boolean
  diagnostic: string
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false, diagnostic: '' }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { failed: true, diagnostic: getAppErrorDiagnostic(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Trinity interface failed to render', {
      message: error.message,
      componentStack: info.componentStack,
    })

    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        name: error.name,
        message: error.message,
        path: window.location.pathname,
        userAgent: window.navigator.userAgent,
      }),
    }).catch(() => {})
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="sales-portal-shell">
        <section className="panel sales-portal-login">
          <div className="section-heading">
            <p className="eyebrow">Trinity team access</p>
            <h1>The tool did not finish opening</h1>
          </div>
          <p className="empty-state">
            This is a display failure, not an automatic PIN reset. Retry will clear only obsolete
            device-cached inventory and reload the live Shopify source of truth. Your PIN session
            will stay signed in.
          </p>
          {this.state.diagnostic ? (
            <details className="shopify-reconnect-fallback">
              <summary>Technical detail</summary>
              <code>{this.state.diagnostic}</code>
            </details>
          ) : null}
          <button
            type="button"
            onClick={() => {
              clearLegacyLocalToolState()
              window.location.reload()
            }}
          >
            Clear device cache and retry
          </button>
        </section>
      </main>
    )
  }
}
