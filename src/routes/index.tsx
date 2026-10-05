import { Meta, Title } from "@solidjs/meta";
import { A, createAsync } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import ArticleCard from "~/components/ArticleCard";
import Cover from "~/components/Cover";
import Icon from "~/components/Icon";
import { getArticles, getSite } from "~/lib/queries";
import { formatDate } from "~/lib/types";

export const route = {
  preload: () => {
    void getArticles();
    void getSite();
  },
};

export default function Home() {
  const articles = createAsync(() => getArticles());
  const site = createAsync(() => getSite());
  const [category, setCategory] = createSignal("全部");
  const [search, setSearch] = createSignal("");
  const [limit, setLimit] = createSignal(6);
  const categories = createMemo(() => [
    "全部",
    ...new Set((articles() || []).map((a) => a.category)),
  ]);
  const filtered = createMemo(() =>
    (articles() || []).filter(
      (a) =>
        (category() === "全部" || a.category === category()) &&
        (!search().trim() ||
          `${a.title} ${a.excerpt} ${a.category} ${a.tags.join(" ")}`
            .toLowerCase()
            .includes(search().trim().toLowerCase())),
    ),
  );
  const featured = createMemo(() => (articles() || []).find((a) => a.featured));
  const tags = createMemo(() =>
    [...new Set((articles() || []).flatMap((a) => a.tags))].slice(0, 12),
  );
  function selectCategory(value: string) {
    setCategory(value);
    setLimit(6);
  }
  return (
    <main id="main" class="container home-page">
      <Title>{site()?.name || "typoal"} · 把日子写成值得回看的页</Title>
      <Meta
        name="description"
        content="一个关于技术、生活与阅读的个人博客。认真生活，慢慢记录。"
      />
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow">
            <span class="tiny-star">✳</span>A SMALL CORNER OF THE INTERNET
          </div>
          <h1>
            把日子写成
            <br />
            <span class="hero-highlight">
              值得回看的页<span class="hero-punctuation">。</span>
            </span>
          </h1>
          <p>
            记录技术的探索，生活的片刻，和一些不着急的想法。
            <br class="desktop-break" />
            欢迎来到我的小小世界。
          </p>
          <a href="#articles" class="hero-link">
            翻开最新一页
            <Icon name="arrow" size={18} />
          </a>
        </div>
        <div class="hero-decoration" aria-hidden="true">
          <span class="hero-decoration-star">✳</span>
          <span class="hero-handwritten">
            words, life
            <br />& little things.
          </span>
          <span class="hero-decoration-line" />
          <span class="hero-edition">PERSONAL JOURNAL — VOL. 01</span>
        </div>
      </section>
      <Show when={featured() && !search() && category() === "全部"}>
        <section class="featured-section" aria-label="精选文章">
          <div class="section-top">
            <span class="eyebrow">THE EDITOR'S PICK</span>
            <span class="section-mini">一篇想让你先读到的文章</span>
          </div>
          <Show when={featured()}>
            {(article) => (
              <A
                href={`/post/${encodeURIComponent(article().id)}`}
                class="featured-card"
              >
                <Cover kind={article().cover} large />
                <div class="featured-copy">
                  <span class="featured-label">
                    <span />
                    精选文章
                  </span>
                  <h2>{article().title}</h2>
                  <p>{article().excerpt}</p>
                  <div class="featured-bottom">
                    <span>
                      {formatDate(article().publishedAt)}
                      <span class="dot-separator">·</span>
                      {article().category}
                    </span>
                    <span class="round-arrow">
                      <Icon name="arrow" />
                    </span>
                  </div>
                </div>
              </A>
            )}
          </Show>
        </section>
      </Show>
      <div class="content-layout">
        <section id="articles" class="articles-section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">RECENT STORIES</span>
              <h2>
                最近写下的<span class="heading-dot">.</span>
              </h2>
            </div>
            <span class="article-count">{filtered().length} 篇文章</span>
          </div>
          <div class="filter-bar">
            <div class="category-tabs" role="group" aria-label="按分类筛选">
              <For each={categories()}>
                {(item) => (
                  <button
                    classList={{ selected: category() === item }}
                    aria-pressed={category() === item}
                    onClick={() => selectCategory(item)}
                  >
                    {item}
                  </button>
                )}
              </For>
            </div>
          </div>
          <label class="search-field">
            <Icon name="search" size={18} />
            <input
              type="search"
              placeholder="搜索文章、标签或关键词…"
              aria-label="搜索文章"
              value={search()}
              onInput={(e) => {
                setSearch(e.currentTarget.value);
                setLimit(6);
              }}
            />
            <Show when={search()}>
              <button
                type="button"
                class="search-clear"
                onClick={() => setSearch("")}
                aria-label="清空搜索"
              >
                <Icon name="close" size={15} />
              </button>
            </Show>
            <span class="search-hint">探索一下</span>
          </label>
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="empty-state small">
                <Icon name="book" size={32} />
                <h3>{search() ? "这一页，还没找到" : "这里还有很多可能"}</h3>
                <p>
                  {search()
                    ? "试试其他关键词，或者换一个分类。"
                    : "新的故事正在路上。"}
                </p>
                <Show when={search() || category() !== "全部"}>
                  <button
                    class="button"
                    onClick={() => {
                      setSearch("");
                      selectCategory("全部");
                    }}
                  >
                    查看全部文章
                  </button>
                </Show>
              </div>
            }
          >
            <div class="article-grid">
              <For each={filtered().slice(0, limit())}>
                {(article) => <ArticleCard article={article} />}
              </For>
            </div>
          </Show>
          <Show when={filtered().length > limit()}>
            <button
              class="load-more button"
              onClick={() => setLimit(limit() + 6)}
            >
              再翻几页
              <Icon name="plus" size={17} />
            </button>
          </Show>
          <Show when={filtered().length > 0 && filtered().length <= limit()}>
            <div class="end-note">
              <span />
              写到这里，下次再见
              <span />
            </div>
          </Show>
        </section>
        <aside class="home-sidebar">
          <section class="profile-card">
            <div class="profile-top">
              <span class="eyebrow">THE PERSON BEHIND</span>
              <span class="profile-spark">✳</span>
            </div>
            <div class="avatar">
              t<span>.</span>
            </div>
            <h3>
              你好，我是 {site()?.author || "typoal 作者"}
              <span class="wave">☀</span>
            </h3>
            <p>{site()?.bio}</p>
            <div class="profile-status">
              <span />
              在这里，慢慢生长
            </div>
            <A href="/about" class="text-link">
              多了解我一点
              <Icon name="arrow" size={16} />
            </A>
          </section>
          <section class="sidebar-section">
            <span class="eyebrow">EXPLORE BY TOPIC</span>
            <h3>字里行间</h3>
            <div class="topic-list">
              <For each={categories().filter((c) => c !== "全部")}>
                {(item, index) => (
                  <button
                    onClick={() => {
                      selectCategory(item);
                      document
                        .getElementById("articles")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <span class="topic-icon">
                      <Icon
                        name={
                          index() % 3 === 0
                            ? "pen"
                            : index() % 3 === 1
                              ? "code"
                              : "leaf"
                        }
                        size={17}
                      />
                    </span>
                    <span>{item}</span>
                    <span class="topic-count">
                      {
                        (articles() || []).filter((a) => a.category === item)
                          .length
                      }
                    </span>
                    <Icon name="chevron" size={14} />
                  </button>
                )}
              </For>
            </div>
          </section>
          <section class="sidebar-section">
            <span class="eyebrow">LITTLE CONNECTIONS</span>
            <h3>散落的关键词</h3>
            <div class="tag-cloud">
              <For each={tags()}>
                {(tag) => (
                  <button
                    onClick={() => {
                      setSearch(tag);
                      selectCategory("全部");
                      document
                        .getElementById("articles")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    # {tag}
                  </button>
                )}
              </For>
            </div>
          </section>
          <a href="/rss.xml" class="subscribe-card">
            <span class="subscribe-icon">
              <Icon name="rss" size={22} />
            </span>
            <h3>不想错过下一页？</h3>
            <p>
              用 RSS 订阅，让新的文字
              <br />
              安静地来到你身边。
            </p>
            <span class="text-link">
              订阅这个博客
              <Icon name="arrow-up" size={16} />
            </span>
          </a>
          <div class="sidebar-footnote">
            “ 日常不必盛大，
            <br />
            &nbsp; 值得记录就好。 ”
          </div>
        </aside>
      </div>
    </main>
  );
}
