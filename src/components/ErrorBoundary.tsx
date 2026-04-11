import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** When this value changes, the boundary resets (e.g. pass workspaceId) */
  resetKey?: string | null;
  /** Optional label shown in the fallback UI */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ""}]`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex h-full flex-col items-center justify-center gap-2 p-4"
          style={{ color: "var(--text-muted)" }}
        >
          <div className="text-xs" style={{ color: "var(--error)" }}>
            {this.props.label ? `${this.props.label} crashed` : "Something went wrong"}
          </div>
          <div
            className="max-w-full truncate text-[10px] font-mono"
            style={{ color: "var(--text-muted)" }}
            title={this.state.error.message}
          >
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-1 rounded px-3 py-1 text-xs"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
