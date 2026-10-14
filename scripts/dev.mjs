import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";

const HOST = "127.0.0.1";

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function findPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No hay puertos libres entre ${startPort} y ${startPort + 19}.`);
}

const apiPort = await findPort(3001);
const apiTarget = `http://${HOST}:${apiPort}`;
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));

console.log(`API configurada en ${apiTarget}`);

const children = [
  spawn(process.execPath, ["server/server.js"], {
    env: { ...process.env, HOST, PORT: String(apiPort) },
    stdio: "inherit"
  }),
  spawn(process.execPath, [viteBin, "--host", HOST], {
    env: { ...process.env, API_TARGET: apiTarget },
    stdio: "inherit"
  })
];

let shuttingDown = false;

function shutdown(signal) {
  shuttingDown = true;
  for (const child of children) child.kill(signal);
  process.exit(0);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const other of children) {
      if (other !== child) other.kill("SIGTERM");
    }
    if (code || signal) {
      process.exit(code || 1);
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
