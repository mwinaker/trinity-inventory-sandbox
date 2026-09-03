import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  failed: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Trinity interface failed to render', {
      message: error.message,
      componentStack: info.componentStack,
    })
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
            This is a display failure, not an automatic PIN reset. Reload the tool to retry the
            live Shopify connection.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload Trinity tool
          </button>
        </section>
      </main>
    )
  }
}
