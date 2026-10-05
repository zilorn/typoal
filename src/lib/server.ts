import "server-only";
import { renderMarkdown } from "./markdown";
import type { Article } from "./types";

export async function readPublic<T>(path: string): Promise<T> {
  const response = await fetch(
    `${process.env.API_URL || "http://127.0.0.1:8080"}${path}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error("暂时无法加载内容，请稍后重试。");
  return response.json();
}

export async function readArticle(id: string): Promise<Article | null> {
  const response = await fetch(
    `${process.env.API_URL || "http://127.0.0.1:8080"}/api/articles/${encodeURIComponent(id)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("暂时无法加载文章，请稍后重试。");
  const article: Article = await response.json();
  return { ...article, html: renderMarkdown(article.content || "") };
}
