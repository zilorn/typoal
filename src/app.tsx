import { MetaProvider } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { ErrorBoundary, Suspense } from "solid-js";
import { Header, Footer } from "~/components/Layout";
import "./app.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <a class="skip-link" href="#main">
            跳到主要内容
          </a>
          <Header />
          <ErrorBoundary
            fallback={(error, reset) => (
              <main id="main" class="container empty-state">
                <span class="eyebrow">SOMETHING WENT WRONG</span>
                <h1>暂时无法加载</h1>
                <p>{error.message || "请稍后重试"}</p>
                <button class="button primary" onClick={reset}>
                  重新加载
                </button>
              </main>
            )}
          >
            <Suspense
              fallback={
                <main id="main" class="container loading-state">
                  <span class="loading-dot" />
                  正在翻开这一页…
                </main>
              }
            >
              {props.children}
            </Suspense>
          </ErrorBoundary>
          <Footer />
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
