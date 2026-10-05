import { A } from "@solidjs/router";
import type { Article } from "~/lib/types";
import { formatDate } from "~/lib/types";
import Cover from "./Cover";
import Icon from "./Icon";

export default function ArticleCard(props: { article: Article }) {
  return (
    <article class="article-card">
      <A
        class="card-cover-link"
        href={`/post/${encodeURIComponent(props.article.id)}`}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Cover kind={props.article.cover} />
      </A>
      <div class="card-body">
        <div class="card-meta">
          <span class={`category-label category-${props.article.cover}`}>
            {props.article.category}
          </span>
          <time datetime={props.article.publishedAt}>
            {formatDate(props.article.publishedAt, true)}
          </time>
        </div>
        <h3>
          <A href={`/post/${encodeURIComponent(props.article.id)}`}>
            {props.article.title}
          </A>
        </h3>
        <p>{props.article.excerpt}</p>
        <div class="card-bottom">
          <span class="card-tags">
            {props.article.tags
              .slice(0, 2)
              .map((tag) => `# ${tag}`)
              .join("　")}
          </span>
          <A
            class="card-arrow"
            href={`/post/${encodeURIComponent(props.article.id)}`}
            aria-label={`阅读：${props.article.title}`}
          >
            <Icon name="arrow-up" size={18} />
          </A>
        </div>
      </div>
    </article>
  );
}
