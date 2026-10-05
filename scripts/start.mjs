process.env.NODE_ENV = "production";
process.env.HOST = "0.0.0.0";
process.env.PORT ||= "42731";
if (["3000", "8080"].includes(process.env.PORT)) {
  console.error("生产环境不能使用开发端口 3000 或 8080；请使用 42731。");
  process.exit(1);
}
await import("../.output/server/index.mjs");
