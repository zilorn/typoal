import { Title, Meta } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import Dialog from "~/components/Dialog";
import Icon from "~/components/Icon";
import { api, ApiError } from "~/lib/api";
import { formatDate, type Article } from "~/lib/types";

export default function Admin() {
  const [loading, setLoading] = createSignal(true);
  const [authenticated, setAuthenticated] = createSignal(false);
  const [password, setPassword] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [articles, setArticles] = createSignal<Article[]>([]);
  const [filter, setFilter] = createSignal("all");
  const [search, setSearch] = createSignal("");
  const [deleting, setDeleting] = createSignal<Article | null>(null);
  const [passwordOpen, setPasswordOpen] = createSignal(false);
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [passwordBusy, setPasswordBusy] = createSignal(false);
  const [passwordError, setPasswordError] = createSignal("");
  const filtered = createMemo(() =>
    articles().filter(
      (a) =>
        (filter() === "all" || a.status === filter()) &&
        a.title.toLowerCase().includes(search().trim().toLowerCase()),
    ),
  );
  function handleError(e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      setAuthenticated(false);
      setArticles([]);
    }
    setError(e instanceof Error ? e.message : "操作失败，请重试。");
  }
  async function loadArticles() {
    setArticles(await api<Article[]>("articles?scope=all"));
  }
  onMount(async () => {
    try {
      const session = await api<{ authenticated: boolean }>("auth/session");
      setAuthenticated(session.authenticated);
      if (session.authenticated) await loadArticles();
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  });
  async function signIn(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("auth/login", {
        method: "POST",
        body: JSON.stringify({ password: password() }),
      });
      setPassword("");
      setAuthenticated(true);
      await loadArticles();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await api("auth/logout", { method: "POST" });
      setAuthenticated(false);
      setArticles([]);
      setNotice("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    const article = deleting();
    if (!article) return;
    setBusy(true);
    setError("");
    try {
      await api(`articles/${article.id}`, { method: "DELETE" });
      setArticles(articles().filter((a) => a.id !== article.id));
      setDeleting(null);
      setNotice("文章已删除。");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  function resetPasswordForm() {
    setPasswordOpen(false);
    setPasswordError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }
  function closePasswordDialog() {
    if (passwordBusy()) return;
    resetPasswordForm();
  }
  async function changePassword(e: SubmitEvent) {
    e.preventDefault();
    setPasswordError("");
    if (newPassword() !== confirmPassword()) {
      setPasswordError("两次输入的新密码不一致。");
      return;
    }
    setPasswordBusy(true);
    try {
      await api("auth/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: currentPassword(),
          newPassword: newPassword(),
        }),
      });
      resetPasswordForm();
      setNotice("密码已修改，其他设备上的登录已失效。");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        resetPasswordForm();
        handleError(err);
        return;
      }
      setPasswordError(
        err instanceof Error ? err.message : "修改失败，请稍后重试。",
      );
    } finally {
      setPasswordBusy(false);
    }
  }
  return (
    <main id="main" class="container inner-page admin-page">
      <Title>文章管理 · typoal</Title>
      <Meta name="robots" content="noindex, nofollow" />
      <Show
        when={!loading()}
        fallback={
          <div class="loading-state">
            <span class="loading-dot" />
            正在打开你的书桌…
          </div>
        }
      >
        <Show
          when={authenticated()}
          fallback={
            <section class="login-layout">
              <div class="login-intro">
                <span class="eyebrow">YOUR WORDS BELONG HERE</span>
                <h1>
                  欢迎回到
                  <br />
                  你的书桌<span class="heading-dot">.</span>
                </h1>
                <p>
                  一个想法，一段文字。
                  <br />
                  今天，又有什么想记录的？
                </p>
                <span class="login-star" aria-hidden="true">
                  ✳
                </span>
              </div>
              <form class="login-card" onSubmit={signIn}>
                <span class="login-lock">
                  <Icon name="lock" size={24} />
                </span>
                <h2>作者登录</h2>
                <p>输入管理密码，继续你的创作。</p>
                <label class="field-label" for="admin-password">
                  管理密码
                </label>
                <input
                  id="admin-password"
                  class="field-input"
                  type="password"
                  autocomplete="current-password"
                  required
                  maxlength={512}
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  placeholder="输入你的管理密码"
                />
                <Show when={error()}>
                  <p class="error-message" role="alert">
                    {error()}
                  </p>
                </Show>
                <button
                  class="button primary login-submit"
                  type="submit"
                  disabled={busy()}
                >
                  {busy() ? "正在登录…" : "进入我的书桌"}
                  <Icon name="arrow" size={17} />
                </button>
                <p class="login-note">
                  初始密码保存在 <code>.env</code> 的
                  <br />
                  <code>ADMIN_PASSWORD</code> 中，登录后可修改。
                </p>
                <A href="/" class="back-link">
                  <Icon name="back" size={15} />
                  回到博客
                </A>
              </form>
            </section>
          }
        >
          <div class="admin-heading">
            <div class="page-intro">
              <span class="eyebrow">YOUR WRITING DESK</span>
              <h1>
                我的书桌<span class="heading-dot">.</span>
              </h1>
              <p>整理想法，让每一篇文字都有自己的位置。</p>
            </div>
            <div class="admin-heading-actions">
              <button
                class="button"
                disabled={busy()}
                onClick={() => {
                  setError("");
                  setPasswordError("");
                  setPasswordOpen(true);
                }}
              >
                <Icon name="lock" size={16} />
                修改密码
              </button>
              <button class="button" disabled={busy()} onClick={signOut}>
                <Icon name="logout" size={16} />
                退出
              </button>
              <A class="button primary" href="/admin/editor">
                <Icon name="plus" size={18} />
                新建文章
              </A>
            </div>
          </div>
          <div class="stats-grid">
            <div>
              <span>全部文章</span>
              <strong>
                {articles().length}
                <small>篇</small>
              </strong>
            </div>
            <div>
              <span>已经发布</span>
              <strong>
                {articles().filter((a) => a.status === "published").length}
                <small>篇</small>
              </strong>
            </div>
            <div>
              <span>正在酝酿</span>
              <strong>
                {articles().filter((a) => a.status === "draft").length}
                <small>篇草稿</small>
              </strong>
            </div>
          </div>
          <Show when={error()}>
            <div class="error-message" role="alert">
              {error()}{" "}
              <button
                class="text-link"
                onClick={async () => {
                  setError("");
                  try {
                    await loadArticles();
                  } catch (e) {
                    handleError(e);
                  }
                }}
              >
                重试
              </button>
            </div>
          </Show>
          <Show when={notice()}>
            <div class="success-message" role="status">
              <Icon name="check" size={17} />
              {notice()}
              <button
                class="icon-button"
                aria-label="关闭提示"
                onClick={() => setNotice("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </Show>
          <div class="admin-filters">
            <div class="category-tabs">
              <For
                each={[
                  ["all", "全部"],
                  ["published", "已发布"],
                  ["draft", "草稿"],
                ]}
              >
                {([value, label]) => (
                  <button
                    classList={{ selected: filter() === value }}
                    aria-pressed={filter() === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                )}
              </For>
            </div>
            <label class="search-field">
              <Icon name="search" size={17} />
              <input
                type="search"
                aria-label="搜索管理文章"
                placeholder="查找文章…"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
            </label>
          </div>
          <div class="admin-article-list">
            <Show
              when={filtered().length > 0}
              fallback={
                <div class="empty-state">
                  <Icon name="pen" size={35} />
                  <h2>{search() ? "没有匹配的文章" : "下一篇，从这里开始"}</h2>
                  <p>
                    {search()
                      ? "试试其他关键词。"
                      : "记录此刻的想法，草稿也很好。"}
                  </p>
                  <A class="button primary" href="/admin/editor">
                    写第一篇文章
                  </A>
                </div>
              }
            >
              <div class="admin-list-head">
                <span>文章</span>
                <span>状态</span>
                <span>最后修改</span>
                <span>操作</span>
              </div>
              <For each={filtered()}>
                {(a) => (
                  <article class="admin-article-row">
                    <div class="admin-article-title">
                      <span class={`article-mini-cover mini-${a.cover}`}>
                        <Icon
                          name={
                            a.cover === "code"
                              ? "code"
                              : a.cover === "nature"
                                ? "leaf"
                                : "book"
                          }
                          size={22}
                        />
                      </span>
                      <div>
                        <A href={`/admin/editor?id=${a.id}`}>{a.title}</A>
                        <p>
                          {a.category}
                          <Show when={a.featured}>
                            <span class="dot-separator">·</span>
                            <span class="featured-text">精选</span>
                          </Show>
                        </p>
                      </div>
                    </div>
                    <span class={`status-badge status-${a.status}`}>
                      {a.status === "published" ? "已发布" : "草稿"}
                    </span>
                    <time class="admin-article-date" datetime={a.updatedAt}>
                      {formatDate(a.updatedAt)}
                    </time>
                    <div class="row-actions">
                      <Show when={a.status === "published"}>
                        <A
                          href={`/post/${encodeURIComponent(a.id)}`}
                          class="icon-button"
                          aria-label={`查看：${a.title}`}
                          title="查看文章"
                        >
                          <Icon name="eye" size={17} />
                        </A>
                      </Show>
                      <A
                        href={`/admin/editor?id=${a.id}`}
                        class="icon-button"
                        aria-label={`编辑：${a.title}`}
                        title="编辑文章"
                      >
                        <Icon name="edit" size={17} />
                      </A>
                      <button
                        class="icon-button danger-icon"
                        aria-label={`删除：${a.title}`}
                        title="删除文章"
                        onClick={() => {
                          setError("");
                          setDeleting(a);
                        }}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </article>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </Show>
      <Dialog
        open={!!deleting()}
        title="删除这篇文章？"
        onClose={() => {
          if (!busy()) setDeleting(null);
        }}
      >
        <p>「{deleting()?.title}」将被永久删除。</p>
        <p class="muted">删除后无法恢复，请确认已保存需要保留的内容。</p>
        <Show when={error()}>
          <p class="error-message" role="alert">
            {error()}
          </p>
        </Show>
        <div class="dialog-actions">
          <button
            class="button"
            disabled={busy()}
            onClick={() => setDeleting(null)}
          >
            保留文章
          </button>
          <button class="button danger" disabled={busy()} onClick={remove}>
            {busy() ? "正在删除…" : "确认删除"}
          </button>
        </div>
      </Dialog>
      <Dialog
        open={passwordOpen()}
        title="修改管理密码"
        onClose={closePasswordDialog}
      >
        <form class="password-form" onSubmit={changePassword}>
          <p class="dialog-note">
            修改后，其他设备上的登录会失效，需要重新登录。
          </p>
          <label class="field-label" for="current-password">
            当前密码
          </label>
          <input
            id="current-password"
            class="field-input"
            type="password"
            autocomplete="current-password"
            required
            maxlength={512}
            value={currentPassword()}
            onInput={(e) => setCurrentPassword(e.currentTarget.value)}
          />
          <label class="field-label" for="new-password">
            新密码
          </label>
          <input
            id="new-password"
            class="field-input"
            type="password"
            autocomplete="new-password"
            required
            minlength={12}
            maxlength={512}
            value={newPassword()}
            onInput={(e) => setNewPassword(e.currentTarget.value)}
            placeholder="至少 12 个字符"
          />
          <label class="field-label" for="confirm-password">
            确认新密码
          </label>
          <input
            id="confirm-password"
            class="field-input"
            type="password"
            autocomplete="new-password"
            required
            minlength={12}
            maxlength={512}
            value={confirmPassword()}
            onInput={(e) => setConfirmPassword(e.currentTarget.value)}
            placeholder="再次输入新密码"
          />
          <Show when={passwordError()}>
            <p class="error-message" role="alert">
              {passwordError()}
            </p>
          </Show>
          <div class="dialog-actions">
            <button
              type="button"
              class="button"
              disabled={passwordBusy()}
              onClick={closePasswordDialog}
            >
              取消
            </button>
            <button
              type="submit"
              class="button primary"
              disabled={passwordBusy()}
            >
              {passwordBusy() ? "正在保存…" : "保存新密码"}
            </button>
          </div>
        </form>
      </Dialog>
    </main>
  );
}
