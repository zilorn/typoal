import { Title } from "@solidjs/meta";
import { A, createAsync } from "@solidjs/router";
import Icon from "~/components/Icon";
import { getSite } from "~/lib/queries";

export const route = { preload: () => getSite() };
export default function About() {
  const site = createAsync(() => getSite());
  return (
    <main id="main" class="container inner-page about-page">
      <Title>关于 · {site()?.name || "typoal"}</Title>
      <div class="page-intro">
        <span class="eyebrow">A LITTLE MORE ABOUT ME</span>
        <h1>
          文字背后的人<span class="heading-dot">.</span>
        </h1>
        <p>很高兴，在互联网的某个角落与你相遇。</p>
      </div>
      <div class="about-layout">
        <div class="about-portrait">
          <span class="about-asterisk">✳</span>
          <span class="about-letter">t.</span>
          <span class="eyebrow">
            ALWAYS CURIOUS.
            <br />
            ALWAYS CREATING.
          </span>
        </div>
        <div class="about-copy prose">
          <h2>你好，我是 {site()?.author || "typoal 作者"}。</h2>
          <p>{site()?.bio}</p>
          <p>
            我喜欢把想法变成可以触摸、可以使用的东西，也喜欢在日常里寻找小小的惊喜。这个博客是我的数字笔记本，装着技术探索、阅读笔记和生活里的细碎观察。
          </p>
          <h2>为什么有了这个地方</h2>
          <p>
            因为有些想法需要慢慢讲，有些片刻值得好好收藏。我希望在这里写得诚实一点、自在一点，让文字留下自己的节奏。
          </p>
          <blockquote>保持好奇，认真生活，慢慢记录。</blockquote>
          <h2>这里会写些什么</h2>
          <p>
            关于创造的过程，关于书里的世界，关于散步时看见的光，也关于那些暂时还没有答案的问题。
          </p>
          <p>如果你喜欢这里，欢迎通过 RSS 订阅。下一页写好时，我们再见。</p>
          <div class="about-actions">
            <a href="/rss.xml" class="button primary">
              <Icon name="rss" size={17} />
              RSS 订阅
            </a>
            <A href="/" class="button">
              去读几篇
              <Icon name="arrow" size={17} />
            </A>
          </div>
        </div>
      </div>
    </main>
  );
}
