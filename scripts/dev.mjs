import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".env")) await import("./setup.mjs");
process.loadEnvFile(".env");
// Nitro also reads PORT. Keep development independent of production settings.
process.env.HOST = "0.0.0.0";
process.env.PORT = "3000";

if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
  console.error(
    "请先运行 pnpm setup，或在 .env 中设置至少 12 个字符的 ADMIN_PASSWORD。",
  );
  process.exit(1);
}
const options = {
  stdio: "inherit",
  env: process.env,
  detached: process.platform !== "win32",
};
const children = [
  spawn("go", ["run", "./cmd/blog"], { ...options, cwd: "backend" }),
  spawn("pnpm", ["dev:web"], options),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") console.error(error.message);
    }
  }
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 0));
}
