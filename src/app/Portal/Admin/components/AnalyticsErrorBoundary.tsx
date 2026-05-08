"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onRetry?: () => void;
};

type State = {
  hasError: boolean;
};

export default class AnalyticsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[analytics-boundary]", error, errorInfo);
  }

  private retry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide">Analytics temporariamente indisponível</p>
        <h3 className="mt-1 text-sm font-bold">Ocorreu um erro no módulo de analytics.</h3>
        <p className="mt-1 text-sm opacity-90">Pode continuar a usar o portal enquanto este bloco é recuperado.</p>
        <button
          type="button"
          onClick={this.retry}
          className="mt-3 inline-flex rounded-xl border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          Tentar novamente
        </button>
      </section>
    );
  }
}
