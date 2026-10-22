import { createServer } from "node:http";
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "./src/app.mjs";
const port = Number(process.env.PORT || 3000);
const origin = process.env.PUBLIC_ORIGIN || `http://localhost:${port}`;
const backend =
  process.env.BACKEND_URL ||
  "https://sgau-backend-768113303451.us-central1.run.app/api/";
const secure = process.env.NODE_ENV === "production";
if (secure && !origin.startsWith("https://"))
  throw new Error("PUBLIC_ORIGIN debe usar HTTPS en producción.");
if (!backend.startsWith("https://"))
  throw new Error("BACKEND_URL debe usar HTTPS.");
const accessFile = resolve(process.env.ACCESS_FILE || "config/access.json");
let saving = Promise.resolve();
const loadAccess = async () => JSON.parse(await readFile(accessFile, "utf8"));
const saveAssignment = (username, assignment) => {
  const task = saving.then(async () => {
    const all = await loadAccess();
    Object.defineProperty(all, username, {
      value: assignment,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const temporary = accessFile + ".tmp";
    await writeFile(temporary, JSON.stringify(all, null, 2), { mode: 0o600 });
    await rename(temporary, accessFile);
  });
  saving = task.catch(() => {});
  return task;
};
const app = createApp({ origin, backend, secure, loadAccess, saveAssignment });
const server = createServer(app);
server.requestTimeout = 20000;
server.headersTimeout = 15000;
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`SGAU Web: ${origin}`),
);
