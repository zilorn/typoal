import { test, expect, type Page } from "@playwright/test";

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
  }));
  expect(sizes.width).toBeLessThanOrEqual(sizes.viewport + 1);
}

async function signIn(page: Page) {
  await page.goto("/admin");
  await page
    .getByLabel("管理密码", { exact: true })
    .fill("typoal-e2e-password");
  await page.getByRole("button", { name: "进入我的书桌" }).click();
  await expect(page.getByRole("heading", { name: "我的书桌." })).toBeVisible();
}

test("public pages, filtering, reading and responsive navigation", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /把日子写成.*值得回看的页/ }),
  ).toBeVisible();
  await expect(page.locator(".article-card")).toHaveCount(6);
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-homepage.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `test-results/${info.project.name}-homepage-viewport.png`,
  });
  await expect(page.locator(".brand-mark svg path")).not.toHaveCount(0);
  await page.getByRole("button", { name: "技术", exact: true }).first().click();
  await expect(page.locator(".article-card")).toHaveCount(2);
  await page.getByLabel("搜索文章", { exact: true }).fill("不存在的关键词xyz");
  await expect(page.getByText("这一页，还没找到")).toBeVisible();
  await page.getByRole("button", { name: "查看全部文章" }).click();
  await expect(page.locator(".article-card")).toHaveCount(6);
  const toggle = page.getByRole("button", { name: "切换深色模式" });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "切换浅色模式" }).click();
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "打开导航" }).click();
    await page
      .locator("#mobile-navigation")
      .getByRole("link", { name: "归档", exact: true })
      .click();
  } else
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "归档", exact: true })
      .click();
  await expect(page.locator(".archive-row")).toHaveCount(6);
  await noOverflow(page);
  await page.goto("/about");
  await expect(
    page.getByRole("heading", { name: "文字背后的人." }),
  ).toBeVisible();
  await noOverflow(page);
  const published = await (await page.request.get("/api/articles")).json();
  await page.goto(`/post/${published[0].id}`);
  await expect(page.locator(".post-content table")).toBeVisible();
  await noOverflow(page);
  const feed = await page.request.get("/rss.xml");
  expect(feed.ok()).toBe(true);
  expect(await feed.text()).toContain('<rss version="2.0">');
  const missing = await page.goto("/post/this-post-does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "这一页，暂时还没有" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("author can create, preview, publish, edit and delete Markdown", async ({
  page,
  request,
}, info) => {
  await signIn(page);
  await noOverflow(page);
  await page.getByRole("link", { name: "新建文章" }).click();
  await expect(page.getByLabel("文章标题")).toBeVisible();
  await page.getByLabel("文章标题").fill("测试：我的 Markdown 文章");
  await page
    .getByLabel("Markdown 正文")
    .fill(
      '## 手机与桌面都能阅读\n\n**这是一篇测试文章**。\n\n> 写作从这里开始\n\n```go\nfmt.Println("typoal")\n```\n\n<script>window.__unsafe = true</script>',
    );
  await page.getByLabel("分类", { exact: true }).fill("技术");
  await page.getByLabel("标签", { exact: true }).fill("Markdown, 手机端");
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-editor.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator(".markdown-preview h2")).toHaveText(
    "手机与桌面都能阅读",
  );
  await expect(page.locator(".markdown-preview strong")).toBeVisible();
  expect(await page.evaluate(() => "__unsafe" in window)).toBe(false);
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  const articleID = new URL(page.url()).searchParams.get("id");
  expect(articleID).toMatch(/^[a-f0-9]{32}$/);
  expect((await request.get(`/api/articles/${articleID}`)).status()).toBe(404);
  await page.reload();
  await expect(page.getByLabel("文章标题")).toHaveValue(
    "测试：我的 Markdown 文章",
  );
  await expect(page.getByLabel("Markdown 正文")).toHaveValue(
    /手机与桌面都能阅读/,
  );
  await page.getByRole("button", { name: "发布文章", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文章已发布");
  expect((await request.get(`/api/articles/${articleID}`)).status()).toBe(200);
  await page.getByLabel("文章标题").fill("测试：已经修改的文章");
  await page.getByRole("link", { name: "我的书桌", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "还有未保存的文字" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑" }).click();
  await page.context().clearCookies();
  await page.getByRole("button", { name: "保存并更新", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "重新登录，继续写作" }),
  ).toBeVisible();
  await page
    .getByLabel("管理密码", { exact: true })
    .fill("typoal-e2e-password");
  await page.getByRole("button", { name: "重新登录", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByLabel("文章标题")).toHaveValue("测试：已经修改的文章");
  await page.getByRole("button", { name: "保存并更新", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文章已发布");
  await page.getByRole("link", { name: "查看文章", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/post/${articleID}$`));
  await expect(
    page.getByRole("heading", { name: "测试：已经修改的文章", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".post-content h2")).toBeVisible();
  await noOverflow(page);
  await page.goto("/admin");
  await expect(
    page.getByRole("link", { name: "测试：已经修改的文章", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "删除：测试：已经修改的文章", exact: true })
    .click();
  await page.getByRole("button", { name: "保留文章" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "删除：测试：已经修改的文章", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("status")).toContainText("文章已删除");
  expect((await request.get(`/api/articles/${articleID}`)).status()).toBe(404);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await expect(page.getByRole("heading", { name: "作者登录" })).toBeVisible();
});

test("375px pages and 390px editor do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const url of ["/", "/archive", "/about", "/admin"]) {
    await page.goto(url);
    await expect(page.locator("#main")).toBeVisible();
    await noOverflow(page);
  }
  await signIn(page);
  await page.goto("/admin/editor");
  await expect(page.getByLabel("文章标题")).toBeVisible();
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.goto("/admin/editor?id=does-not-exist");
  await expect(
    page.getByRole("heading", { name: "文章暂时无法打开" }),
  ).toBeVisible();
  await expect(page.getByLabel("文章标题")).not.toBeVisible();
  await noOverflow(page);
});

test("author can change the admin password and stay signed in", async ({
  page,
}, info) => {
  const current = "typoal-e2e-password";
  const updated = "typoal-e2e-updated-password";
  await signIn(page);
  await page.getByRole("button", { name: "修改密码" }).click();
  const dialog = page.getByRole("dialog", { name: "修改管理密码" });
  await expect(dialog).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-change-password.png`,
  });
  let changed = false;
  try {
    await dialog.getByLabel("当前密码", { exact: true }).fill(current);
    await dialog.getByLabel("新密码", { exact: true }).fill(updated);
    await dialog
      .getByLabel("确认新密码", { exact: true })
      .fill("typoal-e2e-mismatch-password");
    await dialog.getByRole("button", { name: "保存新密码" }).click();
    await expect(dialog.getByRole("alert")).toContainText("不一致");

    await dialog.getByLabel("当前密码", { exact: true }).fill("wrong-password");
    await dialog.getByLabel("确认新密码", { exact: true }).fill(updated);
    await dialog.getByRole("button", { name: "保存新密码" }).click();
    await expect(dialog.getByRole("alert")).toContainText("当前密码不正确");

    await dialog.getByLabel("当前密码", { exact: true }).fill(current);
    await dialog.getByLabel("确认新密码", { exact: true }).fill(updated);
    await dialog.getByRole("button", { name: "保存新密码" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("status")).toContainText("密码已修改");
    changed = true;
    // The device that changed the password keeps its refreshed session.
    await expect(
      page.getByRole("heading", { name: "我的书桌." }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "我的书桌." }),
    ).toBeVisible();

    const oldLogin = await page.request.post("/api/auth/login", {
      data: { password: current },
    });
    expect(oldLogin.status()).toBe(401);
    const newLogin = await page.request.post("/api/auth/login", {
      data: { password: updated },
    });
    expect(newLogin.ok()).toBe(true);
  } finally {
    if (changed) {
      // Restore the shared password so later project runs still sign in.
      const restored = await page.request.post("/api/auth/password", {
        data: { currentPassword: updated, newPassword: current },
      });
      expect(restored.ok()).toBe(true);
    }
  }
});
