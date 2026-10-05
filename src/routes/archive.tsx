import { Title } from "@solidjs/meta";
import { A, createAsync } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import Icon from "~/components/Icon";
import { getArticles } from "~/lib/queries";
import { formatDate } from "~/lib/types";

export const route = { preload: () => getArticles() };
export default function Archive() {
  const articles = createAsync(() => getArticles());
  const groups = createMemo(() => {
    const map = new Map<string, NonNullable<ReturnType<typeof articles>>>();
    for (const a of articles() || []) {
      const year = new Date(a.publishedAt).getFullYear().toString();
      map.set(year, [...(map.get(year) || []), a]);
    }
    return [...map.entries()];
  });
  return (
    <main id="main" class="container inner-page archive-page">
      <Title>文章归档 · typoal</Title>
      <div class="page-intro">
        <span class="eyebrow">EVERY PAGE TELLS A STORY</span>
        <h1>
          时间里的文字<span class="heading-dot">.</span>
        </h1>
        <p>一路走来，留下的 {articles()?.length || 0} 篇记录。</p>
      </div>
      <Show
        when={groups().length > 0}
        fallback={
          <div class="empty-state">
            <h2>故事即将开始</h2>
            <p>发布第一篇文章，它就会出现在这里。</p>
            <A class="button" href="/admin">
              去写一篇
            </A>
          </div>
        }
      >
        <For each={groups()}>
          {([year, posts]) => (
            <section class="archive-year">
              <div class="archive-year-heading">
                <h2>{year}</h2>
                <span>{posts.length} 篇</span>
              </div>
              <For each={posts}>
                {(a) => (
                  <A
                    class="archive-row"
                    href={`/post/${encodeURIComponent(a.id)}`}
                  >
                    <time datetime={a.publishedAt}>
                      {formatDate(a.publishedAt, true)}
                    </time>
                    <span class="archive-title">
                      {a.title}
                      <span class="archive-category">{a.category}</span>
                    </span>
                    <Icon name="arrow-up" size={20} />
                  </A>
                )}
              </For>
            </section>
          )}
        </For>
      </Show>
    </main>
  );
}
