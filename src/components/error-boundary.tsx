"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[50vh] p-6">
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm max-w-md w-full p-6 space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold leading-none tracking-tight">
                Something went wrong
              </h2>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. You can try again or refresh the
                page.
              </p>
            </div>
            {this.state.error && (
              <pre className="rounded-md bg-muted p-3 text-xs text-muted-foreground overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground shadow-sm h-9 px-4 py-2 hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
