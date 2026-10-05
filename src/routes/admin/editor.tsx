import { Title, Meta } from "@solidjs/meta";
import {
  A,
  useBeforeLeave,
  useNavigate,
  useSearchParams,
  revalidate,
} from "@solidjs/router";
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createStore } from "solid-js/store";
import MarkdownContent from "~/components/MarkdownContent";
import Cover from "~/components/Cover";
import Dialog from "~/components/Dialog";
import Icon from "~/components/Icon";
import { api, ApiError } from "~/lib/api";
import { getArticle, getArticles } from "~/lib/queries";
import {
  readingTime,
  type Article,
  type ArticleInput,
  type Cover as CoverType,
} from "~/lib/types";

const initial: ArticleInput = {
  title: "",
  excerpt: "",
  content: "",
  category: "随笔",
  tags: [],
  cover: "paper",
  status: "draft",
  featured: false,
};
export default function Editor() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = createStore<ArticleInput>({ ...initial, tags: [] });
  const [id, setID] = createSignal<string | null>(
    typeof params.id === "string" ? params.id : null,
  );
  const [loading, setLoading] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [loadError, setLoadError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [tagsText, setTagsText] = createSignal("");
  const [mode, setMode] = createSignal<"edit" | "preview">("edit");
  const [html, setHTML] = createSignal("");
  const [previewBusy, setPreviewBusy] = createSignal(false);
  const [previewError, setPreviewError] = createSignal("");
  const [loginNeeded, setLoginNeeded] = createSignal(false);
  const [password, setPassword] = createSignal("");
  const [snapshot, setSnapshot] = createSignal(
    JSON.stringify({ ...initial, tagsText: "" }),
  );
  const [leaveAction, setLeaveAction] = createSignal<(() => void) | null>(null);
  let textarea!: HTMLTextAreaElement;
  const dirty = createMemo(
    () => JSON.stringify({ ...form, tagsText: tagsText() }) !== snapshot(),
  );
  function markSaved() {
    setSnapshot(JSON.stringify({ ...form, tagsText: tagsText() }));
  }
  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : "操作失败，请重试。");
    if (e instanceof ApiError && e.status === 401) setLoginNeeded(true);
  }
  onMount(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty()) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    onCleanup(() => window.removeEventListener("beforeunload", beforeUnload));
    void (async () => {
      try {
        const session = await api<{ authenticated: boolean }>("auth/session");
        if (!session.authenticated) {
          navigate("/admin", { replace: true });
          return;
        }
        if (id()) {
          const a = await api<Article>(`articles/${id()}?scope=all`);
          setForm({
            title: a.title,
            excerpt: a.excerpt,
            content: a.content || "",
            category: a.category,
            tags: a.tags,
            cover: a.cover,
            status: a.status,
            featured: a.featured,
          });
          setTagsText(a.tags.join(", "));
        }
        markSaved();
      } catch (e) {
        fail(e);
        setLoadError(e instanceof Error ? e.message : "无法读取文章");
      } finally {
        setLoading(false);
      }
    })();
  });
  useBeforeLeave((event) => {
    if (!dirty() || loading()) return;
    event.preventDefault();
    setLeaveAction(() => () => event.retry(true));
  });
  async function preview() {
    setMode("preview");
    setPreviewBusy(true);
    setPreviewError("");
    try {
      const result = await api<{ html: string }>("preview", {
        method: "POST",
        body: JSON.stringify({ content: form.content }),
      });
      setHTML(result.html);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "暂时无法预览");
      if (e instanceof ApiError && e.status === 401) setLoginNeeded(true);
    } finally {
      setPreviewBusy(false);
    }
  }
  function insert(before: string, after = "", placeholder = "文字") {
    if (mode() !== "edit") return;
    const start = textarea.selectionStart,
      end = textarea.selectionEnd;
    const selected = form.content.slice(start, end) || placeholder;
    setForm(
      "content",
      form.content.slice(0, start) +
        before +
        selected +
        after +
        form.content.slice(end),
    );
    textarea.focus();
    textarea.setSelectionRange(
      start + before.length,
      start + before.length + selected.length,
    );
  }
  async function save(status: "draft" | "published") {
    setError("");
    setNotice("");
    if (!form.title.trim()) {
      setError("先给这篇文章起个标题吧。");
      document.getElementById("article-title")?.focus();
      return;
    }
    if (!form.content.trim()) {
      setError("写下一点正文，再保存文章。");
      setMode("edit");
      textarea?.focus();
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        status,
        tags: tagsText()
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const a = await api<Article>(id() ? `articles/${id()}` : "articles", {
        method: id() ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setID(a.id);
      setForm("status", a.status);
      setForm("tags", a.tags);
      setForm("excerpt", a.excerpt);
      setTagsText(a.tags.join(", "));
      markSaved();
      setParams({ id: a.id }, { replace: true });
      await revalidate([getArticles.key, getArticle.key]);
      setNotice(
        status === "published"
          ? "文章已发布，读者现在就能看见它。"
          : "草稿已保存，慢慢写，不着急。",
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function reLogin(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("auth/login", {
        method: "POST",
        body: JSON.stringify({ password: password() }),
      });
      setPassword("");
      setLoginNeeded(false);
      setNotice("已重新登录，输入已保留，可以继续保存。");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" class="container inner-page editor-page">
      <Title>{id() ? "编辑文章" : "新建文章"} · typoal</Title>
      <Meta name="robots" content="noindex, nofollow" />
      <Show
        when={!loading()}
        fallback={
          <div class="loading-state">
            <span class="loading-dot" />
            正在准备纸笔…
          </div>
        }
      >
        <Show
          when={!loadError()}
          fallback={
            <div class="empty-state">
              <h1>文章暂时无法打开</h1>
              <p role="alert">{loadError()}</p>
              <button
                class="button primary"
                onClick={() => window.location.reload()}
              >
                重新加载
              </button>
              <A class="button" href="/admin">
                回到书桌
              </A>
            </div>
          }
        >
          <div class="editor-top">
            <div>
              <A class="back-link" href="/admin">
                <Icon name="back" size={17} />
                我的书桌
              </A>
              <h1>
                {id() ? "再打磨一下" : "新的一页"}
                <span class="heading-dot">.</span>
              </h1>
            </div>
            <span class="editor-save-state">
              <span
                classList={{ "unsaved-dot": dirty(), "saved-dot": !dirty() }}
              />
              {dirty() ? "有未保存的修改" : "已保存"}
            </span>
          </div>
          <Show when={error()}>
            <div class="error-message" role="alert">
              {error()}
            </div>
          </Show>
          <Show when={notice()}>
            <div class="success-message" role="status">
              <Icon name="check" size={17} />
              {notice()}
              <Show when={form.status === "published"}>
                <A
                  href={`/post/${encodeURIComponent(id() || "")}`}
                  class="text-link"
                >
                  查看文章
                  <Icon name="arrow-up" size={15} />
                </A>
              </Show>
            </div>
          </Show>
          <div class="editor-layout">
            <section class="writing-panel">
              <label class="sr-only" for="article-title">
                文章标题
              </label>
              <input
                id="article-title"
                class="title-input"
                placeholder="给这一页起个名字…"
                value={form.title}
                maxlength={120}
                onInput={(e) => setForm("title", e.currentTarget.value)}
              />
              <div class="markdown-heading">
                <span>
                  <Icon name="pen" size={16} />
                  Markdown 编辑器
                </span>
                <div
                  class="editor-mode-tabs"
                  role="group"
                  aria-label="编辑模式"
                >
                  <button
                    classList={{ selected: mode() === "edit" }}
                    aria-pressed={mode() === "edit"}
                    onClick={() => setMode("edit")}
                  >
                    编辑
                  </button>
                  <button
                    classList={{ selected: mode() === "preview" }}
                    aria-pressed={mode() === "preview"}
                    onClick={preview}
                  >
                    预览
                  </button>
                </div>
              </div>
              <div class="markdown-toolbar" aria-label="Markdown 格式工具">
                <button
                  disabled={mode() !== "edit"}
                  onClick={() => insert("## ", "", "标题")}
                  aria-label="插入标题"
                >
                  H<span>2</span>
                </button>
                <button
                  disabled={mode() !== "edit"}
                  onClick={() => insert("**", "**")}
                  aria-label="加粗"
                >
                  <b>B</b>
                </button>
                <button
                  disabled={mode() !== "edit"}
                  onClick={() => insert("*", "*")}
                  aria-label="斜体"
                >
                  <i>I</i>
                </button>
                <span class="toolbar-divider" />
                <button
                  disabled={mode() !== "edit"}
                  onClick={() => insert("\n- ", "\n", "列表项目")}
                  aria-label="插入列表"
                >
                  ☷
                </button>
                <button
                  disabled={mode() !== "edit"}
                  onClick={() => insert("\n> ", "\n", "引用文字")}
                  aria-label="插入引用"
                >
                  “
                </button>
                <button
                  disabled={mode() !== "edit"}
                  onClick={() =>
                    insert("[", "](https://example.com)", "链接文字")
                  }
                  aria-label="插入链接"
                >
                  ↗
                </button>
                <button
                  disabled={mode() !== "edit"}
                  onClick={() =>
                    insert("![", "](https://example.com/image.jpg)", "图片描述")
                  }
                  aria-label="插入图片"
                >
                  ▧
                </button>
                <button
                  disabled={mode() !== "edit"}
                  onClick={() => insert("\n```\n", "\n```\n", "代码")}
                  aria-label="插入代码块"
                >
                  <Icon name="code" size={17} />
                </button>
                <button
                  disabled={mode() !== "edit"}
                  onClick={() =>
                    insert(
                      "\n",
                      "\n",
                      "| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |",
                    )
                  }
                  aria-label="插入表格"
                >
                  ▦
                </button>
              </div>
              <Show when={mode() === "edit"}>
                <textarea
                  ref={textarea}
                  class="markdown-input"
                  aria-label="Markdown 正文"
                  spellcheck={false}
                  placeholder={
                    "从一个想法开始，慢慢写。\n\n## 一个小标题\n\n这里支持 **Markdown**，也支持你的每一种表达。"
                  }
                  value={form.content}
                  onInput={(e) => setForm("content", e.currentTarget.value)}
                />
              </Show>
              <Show when={mode() === "preview"}>
                <div class="markdown-preview prose">
                  <Show
                    when={!previewBusy()}
                    fallback={<div class="loading-state">正在生成预览…</div>}
                  >
                    <Show
                      when={!previewError()}
                      fallback={
                        <p class="error-message" role="alert">
                          {previewError()}
                        </p>
                      }
                    >
                      <Show
                        when={form.content.trim()}
                        fallback={
                          <p class="preview-placeholder">
                            写点什么，再来看看这一页的样子。
                          </p>
                        }
                      >
                        <MarkdownContent html={html()} />
                      </Show>
                    </Show>
                  </Show>
                </div>
              </Show>
              <div class="editor-word-count">
                <span>
                  {form.content.length} 字符<span class="dot-separator">·</span>
                  约 {readingTime(form.content)} 分钟阅读
                </span>
                <span>支持 Markdown</span>
              </div>
            </section>
            <aside class="editor-settings">
              <section class="settings-card">
                <h2>这一页的细节</h2>
                <label class="field-label" for="article-category">
                  分类
                </label>
                <input
                  class="field-input"
                  id="article-category"
                  list="categories"
                  maxlength={32}
                  value={form.category}
                  onInput={(e) => setForm("category", e.currentTarget.value)}
                />
                <datalist id="categories">
                  <option value="随笔" />
                  <option value="技术" />
                  <option value="生活" />
                  <option value="阅读" />
                </datalist>
                <label class="field-label" for="article-tags">
                  标签
                </label>
                <input
                  class="field-input"
                  id="article-tags"
                  placeholder="写作, 日常, 灵感"
                  value={tagsText()}
                  onInput={(e) => setTagsText(e.currentTarget.value)}
                />
                <p class="field-help">用逗号分隔，最多 8 个标签。</p>
                <label class="field-label" for="article-excerpt">
                  文章摘要
                </label>
                <textarea
                  class="field-input excerpt-input"
                  id="article-excerpt"
                  maxlength={300}
                  placeholder="用几句话，介绍这篇文章。留空将从正文生成。"
                  value={form.excerpt}
                  onInput={(e) => setForm("excerpt", e.currentTarget.value)}
                />
                <label class="featured-checkbox">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) =>
                      setForm("featured", e.currentTarget.checked)
                    }
                  />
                  <span>在首页精选展示</span>
                </label>
              </section>
              <section class="settings-card cover-settings">
                <h2>选一张封面</h2>
                <p class="field-help">让文字，也有自己的颜色。</p>
                <div class="cover-options">
                  <For
                    each={
                      [
                        ["paper", "纸上想法"],
                        ["code", "创造之间"],
                        ["nature", "沿途风景"],
                        ["sunset", "日常微光"],
                      ] as [CoverType, string][]
                    }
                  >
                    {([kind, label]) => (
                      <button
                        classList={{ selected: form.cover === kind }}
                        aria-label={`封面：${label}`}
                        aria-pressed={form.cover === kind}
                        onClick={() => setForm("cover", kind)}
                      >
                        <Cover kind={kind} />
                        <span>
                          {label}
                          <Show when={form.cover === kind}>
                            <Icon name="check" size={14} />
                          </Show>
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </section>
            </aside>
          </div>
          <div class="editor-action-bar">
            <div>
              <span class={`status-badge status-${form.status}`}>
                {form.status === "published" ? "已发布" : "草稿"}
              </span>
              <span class="editor-action-note">每一页，都值得认真对待。</span>
            </div>
            <div class="editor-buttons">
              <button
                class="button"
                disabled={busy()}
                onClick={() => save("draft")}
              >
                <Icon name="save" size={17} />
                {busy()
                  ? "正在保存…"
                  : form.status === "published"
                    ? "转为草稿"
                    : "保存草稿"}
              </button>
              <button
                class="button primary"
                disabled={busy()}
                onClick={() => save("published")}
              >
                <Icon name="arrow-up" size={17} />
                {busy()
                  ? "正在保存…"
                  : form.status === "published"
                    ? "保存并更新"
                    : "发布文章"}
              </button>
            </div>
          </div>
        </Show>
      </Show>
      <Dialog
        open={!!leaveAction()}
        title="还有未保存的文字"
        onClose={() => setLeaveAction(null)}
      >
        <p>离开后，这次修改会丢失。要先留下来保存吗？</p>
        <div class="dialog-actions">
          <button
            class="button"
            onClick={() => {
              const leave = leaveAction();
              setLeaveAction(null);
              leave?.();
            }}
          >
            放弃修改并离开
          </button>
          <button class="button primary" onClick={() => setLeaveAction(null)}>
            继续编辑
          </button>
        </div>
      </Dialog>
      <Dialog
        open={loginNeeded()}
        title="重新登录，继续写作"
        onClose={() => {
          if (!busy()) setLoginNeeded(false);
        }}
      >
        <p>登录已过期，你写下的内容仍然保留在这里。</p>
        <form onSubmit={reLogin}>
          <label class="field-label" for="relogin-password">
            管理密码
          </label>
          <input
            id="relogin-password"
            class="field-input"
            type="password"
            autocomplete="current-password"
            required
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
          <Show when={error()}>
            <p class="error-message" role="alert">
              {error()}
            </p>
          </Show>
          <div class="dialog-actions">
            <button class="button primary" disabled={busy()} type="submit">
              {busy() ? "正在登录…" : "重新登录"}
            </button>
          </div>
        </form>
      </Dialog>
    </main>
  );
}
