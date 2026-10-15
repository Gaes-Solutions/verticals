import { Component, Fragment, type ReactNode } from "react";

/** A failed read must never look like an empty directory or a loading screen forever. */
export class ScreenBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 };
  private startedAt = performance.now();

  static getDerivedStateFromError() {
    return { failed: true };
  }

  private onLoadError = (event: Event) => {
    const { startedAt } = (event as CustomEvent<{ startedAt: number }>).detail;
    // Ignore responses from the screen that was closed before this one mounted.
    if (startedAt >= this.startedAt) this.setState({ failed: true });
  };

  componentDidMount() {
    window.addEventListener("platform-load-error", this.onLoadError);
  }

  componentWillUnmount() {
    window.removeEventListener("platform-load-error", this.onLoadError);
  }

  render() {
    if (this.state.failed) {
      return (
        <section
          role="alert"
          className="mx-auto max-w-xl rounded-xl border border-red-200 bg-white p-6"
        >
          <h1 className="mb-2 font-bold text-slate-800 text-xl">No se pudo cargar esta pantalla</h1>
          <p className="mb-4 text-slate-600">
            Revisa tu conexión e inténtalo de nuevo. No se ha confirmado que la información esté
            vacía.
          </p>
          <button
            type="button"
            className="gx-btn-primary"
            onClick={() => {
              this.startedAt = performance.now();
              this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }));
            }}
          >
            Reintentar
          </button>
        </section>
      );
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
