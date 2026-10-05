import { A, useLocation } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import Icon from "./Icon";

export function Header() {
  const location = useLocation();
  const [menu, setMenu] = createSignal(false);
  const [dark, setDark] = createSignal(false);
  onMount(() => setDark(document.documentElement.dataset.theme === "dark"));
  function toggleTheme() {
    const value = !dark();
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
    try {
      localStorage.setItem("typoal-theme", value ? "dark" : "light");
    } catch {
      /* Theme still works when storage is unavailable. */
    }
  }
  return (
    <header class="site-header">
      <div class="container header-inner">
        <A
          href="/"
          class="brand"
          aria-label="typoal 首页"
          onClick={() => setMenu(false)}
        >
          <span class="brand-mark">
            <Icon name="book" size={23} />
          </span>
          <span>
            typoal<span class="brand-period">.</span>
          </span>
        </A>
        <nav class="desktop-nav" aria-label="主导航">
          <A href="/" end activeClass="active">
            文章
          </A>
          <A href="/archive" activeClass="active">
            归档
          </A>
          <A href="/about" activeClass="active">
            关于
          </A>
        </nav>
        <div class="header-actions">
          <button
            class="icon-button theme-toggle"
            onClick={toggleTheme}
            aria-label={dark() ? "切换浅色模式" : "切换深色模式"}
          >
            <Icon name={dark() ? "sun" : "moon"} size={18} />
          </button>
          <A class="button header-write" href="/admin">
            <Icon name="pen" size={16} />
            <span>
              {location.pathname.startsWith("/admin") ? "文章管理" : "写点什么"}
            </span>
          </A>
          <button
            class="icon-button mobile-menu-button"
            aria-expanded={menu()}
            aria-controls="mobile-navigation"
            aria-label={menu() ? "关闭导航" : "打开导航"}
            onClick={() => setMenu(!menu())}
          >
            <Icon name={menu() ? "close" : "menu"} />
          </button>
        </div>
      </div>
      <Show when={menu()}>
        <nav
          id="mobile-navigation"
          class="mobile-nav container"
          aria-label="手机导航"
        >
          <A href="/" end onClick={() => setMenu(false)}>
            文章
          </A>
          <A href="/archive" onClick={() => setMenu(false)}>
            归档
          </A>
          <A href="/about" onClick={() => setMenu(false)}>
            关于
          </A>
          <A href="/admin" onClick={() => setMenu(false)}>
            文章管理
          </A>
        </nav>
      </Show>
    </header>
  );
}

export function Footer() {
  return (
    <footer class="site-footer">
      <div class="container footer-inner">
        <div>
          <A class="footer-brand" href="/">
            typoal.
          </A>
          <span class="footer-note">认真生活，慢慢记录。</span>
        </div>
        <div class="footer-links">
          <span>© {new Date().getFullYear()} typoal</span>
          <a href="/rss.xml" class="rss-link">
            <Icon name="rss" size={15} />
            RSS 订阅
          </a>
          <A href="/admin">管理</A>
        </div>
      </div>
    </footer>
  );
}
