import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={(props) => (
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover"
          />
          <meta name="theme-color" content="#f8f7f3" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link
            rel="alternate"
            type="application/rss+xml"
            title="typoal RSS"
            href="/rss.xml"
          />
          <script>{`try{document.documentElement.dataset.theme=localStorage.getItem('typoal-theme')||'light'}catch{}`}</script>
          {props.assets}
        </head>
        <body>
          <div id="app">{props.children}</div>
          {props.scripts}
        </body>
      </html>
    )}
  />
));
