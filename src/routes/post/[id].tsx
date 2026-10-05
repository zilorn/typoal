import { Meta, Title } from "@solidjs/meta";
import { A, createAsync, useParams } from "@solidjs/router";
import { HttpStatusCode } from "@solidjs/start";
import { createMemo, createSignal, For, Show } from "solid-js";
import MarkdownContent from "~/components/MarkdownContent";
import Cover from "~/components/Cover";
import Icon from "~/components/Icon";
import { getArticle, getArticles, getSite } from "~/lib/queries";
import { formatDate, readingTime } from "~/lib/types";

export const route = {
  preload: ({ params }: { params: { id: string } }) =>
    getArticle(params.id || ""),
};
export default function Post() {
  const params = useParams();
  const article = createAsync(() => getArticle(params.id || ""));
  const articles = createAsync(() => getArticles());
  const site = createAsync(() => getSite());
  const related = createMemo(() =>
    (articles() || [])
      .filter((a) => a.id !== params.id)
      .sort(
        (a, b) =>
          Number(b.category === article()?.category) -
          Number(a.category === article()?.category),
      )
      .slice(0, 2),
  );
  const [copyState, setCopyState] = createSignal("");
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("链接已复制");
    } catch {
      setCopyState("请从浏览器地址栏复制链接");
    }
  }
  return (
    <main id="main" class="container inner-page post-page">
      <Show
        when={article()}
        fallback={
          <div class="empty-state">
            <HttpStatusCode code={404} />
            <Title>文章未找到 · typoal</Title>
            <span class="eyebrow">404 — A PAGE NOT YET WRITTEN</span>
            <h1>这一页，暂时还没有</h1>
            <p>文章可能已被删除、移到了新地址，或尚未发布。</p>
            <A class="button primary" href="/">
              回到首页
            </A>
          </div>
        }
      >
        {(a) => (
          <>
            <Title>
              {a().title} · {site()?.name || "typoal"}
            </Title>
            <Meta name="description" content={a().excerpt} />
            <Meta property="og:title" content={a().title} />
            <Meta property="og:description" content={a().excerpt} />
            <Meta property="og:type" content="article" />
            <A class="back-link" href="/">
              <Icon name="back" size={17} />
              回到文章列表
            </A>
            <header class="post-header">
              <span class="category-label">{a().category}</span>
              <h1>{a().title}</h1>
              <p class="post-excerpt">{a().excerpt}</p>
              <div class="post-meta">
                <span class="mini-avatar">t.</span>
                <span>{site()?.author}</span>
                <span class="dot-separator">·</span>
                <time datetime={a().publishedAt}>
                  {formatDate(a().publishedAt)}
                </time>
                <span class="dot-separator">·</span>
                <span class="reading-time">
                  <Icon name="clock" size={14} />约{" "}
                  {readingTime(a().content || "")} 分钟
                </span>
              </div>
            </header>
            <div class="post-cover">
              <Cover kind={a().cover} large />
            </div>
            <article class="prose post-content">
              <MarkdownContent html={a().html || ""} />
            </article>
            <div class="post-ending">
              <span class="post-ending-star">✳</span>
              <p>谢谢你，把时间留给这一页。</p>
              <div class="post-tags">
                <For each={a().tags}>{(tag) => <span># {tag}</span>}</For>
              </div>
              <button class="button" onClick={copyLink}>
                <Icon
                  name={copyState() === "链接已复制" ? "check" : "copy"}
                  size={16}
                />
                {copyState() || "分享这一页"}
              </button>
              <span class="sr-only" role="status">
                {copyState()}
              </span>
            </div>
            <Show when={related().length > 0}>
              <section class="related-posts">
                <div class="section-heading">
                  <div>
                    <span class="eyebrow">KEEP WANDERING</span>
                    <h2>
                      不妨再翻一页<span class="heading-dot">.</span>
                    </h2>
                  </div>
                </div>
                <div class="related-grid">
                  <For each={related()}>
                    {(post) => (
                      <A
                        href={`/post/${encodeURIComponent(post.id)}`}
                        class="related-card"
                      >
                        <span class="category-label">{post.category}</span>
                        <h3>{post.title}</h3>
                        <span class="text-link">
                          继续阅读
                          <Icon name="arrow" size={16} />
                        </span>
                      </A>
                    )}
                  </For>
                </div>
              </section>
            </Show>
          </>
        )}
      </Show>
    </main>
  );
}
