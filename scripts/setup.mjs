import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.log("已存在 .env，保留现有配置。管理密码在 ADMIN_PASSWORD 中。");
} else {
  const password = randomBytes(18).toString("base64url");
  writeFileSync(
    ".env",
    readFileSync(".env.example", "utf8").replace(
      "ADMIN_PASSWORD=",
      `ADMIN_PASSWORD=${password}`,
    ),
    { mode: 0o600 },
  );
  console.log(
    `配置已创建。请保存管理密码：${password}\n运行 pnpm dev，然后访问 http://localhost:3000/admin 登录。`,
  );
}
