import { existsSync, readFileSync } from "node:fs";

// Docker Compose resolves variables from the shell first and .env second, so
// mirror that precedence instead of trusting .env alone.
function loadEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(
      line,
    );
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const effective = { ...loadEnvFile(".env"), ...process.env };
const password = effective.ADMIN_PASSWORD ?? "";
const bytes = Buffer.byteLength(password, "utf8");

const problems = [];
if (password === "") {
  problems.push("尚未设置 ADMIN_PASSWORD：运行 pnpm setup，或在 .env 中设置。");
} else if (bytes < 12 || bytes > 512) {
  problems.push(`ADMIN_PASSWORD 必须为 12–512 字节，当前为 ${bytes} 字节。`);
}

if (problems.length > 0) {
  console.error("部署配置检查未通过，已停止，未开始构建：");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("部署配置检查通过。");
