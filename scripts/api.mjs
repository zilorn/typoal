import { spawn } from "node:child_process";

const child = spawn("go", ["run", "./cmd/blog"], {
  cwd: "backend",
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
