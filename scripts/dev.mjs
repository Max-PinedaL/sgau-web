import { spawn } from "node:child_process";
const children = [
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build", "--watch"],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    ["--watch", "--env-file-if-exists=.env", "server.mjs"],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => stop(code || 0));
}
