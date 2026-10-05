import { request, expect } from "@playwright/test";

// Fixtures are created explicitly in the isolated test database only.
// Application startup and Docker deployment never insert article content.
export default async function setup() {
  const client = await request.newContext({ baseURL: "http://127.0.0.1:3100" });
  const initial = await client.get("/api/articles");
  expect(await initial.json()).toEqual([]);
  const login = await client.post("/api/auth/login", {
    data: { password: "typoal-e2e-password" },
  });
  expect(login.ok()).toBe(true);
  const categories = ["随笔", "技术", "生活", "阅读", "技术", "生活"];
  const covers = ["paper", "code", "nature", "sunset", "code", "sunset"];
  for (let i = 0; i < categories.length; i++) {
    const response = await client.post("/api/articles", {
      data: {
        title: `集成测试文章 ${i + 1}`,
        excerpt: "仅用于验证分类、搜索和阅读功能的测试数据。",
        content:
          '## 测试标题\n\n**测试正文**。\n\n```go\nfmt.Println("test")\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |',
        category: categories[i],
        cover: covers[i],
        tags: ["测试", "Markdown"],
        status: "published",
        featured: i === 0,
      },
    });
    expect(response.status()).toBe(201);
  }
  await client.dispose();
}
