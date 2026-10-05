import { query } from "@solidjs/router";
import type { Article, Site } from "./types";

export const getArticles = query(async () => {
  "use server";
  const { readPublic } = await import("./server");
  return readPublic<Article[]>("/api/articles");
}, "articles");

export const getSite = query(async () => {
  "use server";
  const { readPublic } = await import("./server");
  return readPublic<Site>("/api/site");
}, "site");

export const getArticle = query(async (id: string) => {
  "use server";
  const { readArticle } = await import("./server");
  return readArticle(id);
}, "article");
