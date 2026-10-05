import { A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { HttpStatusCode } from "@solidjs/start";
export default function NotFound() {
  return (
    <main id="main" class="container inner-page empty-state">
      <HttpStatusCode code={404} />
      <Title>未找到页面 · typoal</Title>
      <span class="eyebrow">404 — LOST BETWEEN THE PAGES</span>
      <h1>好像翻过头了</h1>
      <p>这里还没有一页文字，回到首页看看吧。</p>
      <A class="button primary" href="/">
        回到首页
      </A>
    </main>
  );
}
