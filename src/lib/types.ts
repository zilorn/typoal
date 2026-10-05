export type Cover = "paper" | "code" | "nature" | "sunset";
export type Article = {
  id: string;
  title: string;
  excerpt: string;
  content?: string;
  html?: string;
  category: string;
  tags: string[];
  cover: Cover;
  status: "draft" | "published";
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
};
export type ArticleInput = Pick<
  Article,
  "title" | "excerpt" | "category" | "tags" | "cover" | "status" | "featured"
> & { content: string };
export type Site = { name: string; author: string; bio: string };

export function formatDate(value: string, short = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未发布";
  return new Intl.DateTimeFormat("zh-CN", {
    year: short ? undefined : "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function readingTime(content: string) {
  const chinese = (content.match(/[\u3400-\u9fff]/g) ?? []).length;
  const words = content
    .replace(/[\u3400-\u9fff]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(chinese / 350 + words / 200));
}
