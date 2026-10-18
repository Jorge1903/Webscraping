import { safePreview, selectedValues, normalizeSelectors, recognizeFields, htmlText } from "./page-tools.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openStorage } from './storage.js';
import { readHtmlResponse } from './html-response.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = process.env.MONITOR_DB_PATH || path.join(ROOT_DIR, "data", "db.json");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SCHEDULER_TICK_MS = 1000;
const ALLOWED_INTERVALS = new Set([5]);
const DEFAULT_VISIBLE_FIELDS = ["pagePreview", "image", "name", "price", "currency", "availability", "description", "checkedAt", "history"];
const ALLOWED_VISIBLE_FIELDS = new Set([...DEFAULT_VISIBLE_FIELDS, "sourceUrl"]);
let storage;
let schedulerTimer;
let activeChecks = 0;

let db = {
  users: [],
  sessions: {},
  jobs: [],
  results: []
};

async function ensureDb() {
  storage = await openStorage({ file: DB_PATH });
  db = storage.state;
  for (const job of db.jobs) {
    delete job.running;
    job.intervalMinutes = 5;
  }
  let changed = storage.kind === 'json';
  if (process.env.ENABLE_DEMO_ACCOUNT !== 'false' && !db.users.some(user => user.email === 'demo@local.test')) {
    db.users.push({ id: randomId(), email: 'demo@local.test', passwordHash: hashPassword('password123'), createdAt: new Date().toISOString() });
    changed = true;
  }
  if (changed) await saveDb();
  console.log(`Almacenamiento listo: ${storage.kind}`);
}

async function saveDb() {
  return storage.save(db);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) throw new Error("Body demasiado grande");
  }
  return body ? JSON.parse(body) : {};
}

function randomId() {
  return crypto.randomBytes(16).toString("hex");
}

function cleanString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parsePrice(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const match = raw.match(/[\d.,]+/);
  if (!match) return null;
  const normalized = match[0].replace(/,/g, "");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function decodeEntities(value) { return cleanString(htmlText(value)); }

function stripTags(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
  );
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{64}$/i.test(stored)) return false;
  const [salt, expected] = stored.split(":");
  const hash = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [decodeURIComponent(cookie.slice(0, index)), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function createSession(userId) {
  const token = randomId();
  db.sessions[token] = {
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  };
  return token;
}

function getUserFromRequest(req) {
  const token = parseCookies(req).session;
  if (!token || !db.sessions[token]) return null;
  const session = db.sessions[token];
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    delete db.sessions[token];
    return null;
  }
  return db.users.find((user) => user.id === session.userId) || null;
}

function requireUser(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: "Necesitas iniciar sesión." });
    return null;
  }
  return user;
}

function absolutize(url, baseUrl) {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url || "";
  }
}

function metaContent(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regexes = [
      new RegExp(`<meta(?=[^>]*(?:property|name)=["']${escaped}["'])[^>]*content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta(?=[^>]*content=["']([^"']+)["'])[^>]*(?:property|name)=["']${escaped}["'][^>]*>`, "i")
    ];
    for (const regex of regexes) {
      const match = html.match(regex);
      if (match?.[1]) return decodeEntities(match[1]);
    }
  }
  return "";
}

function titleContent(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

function buildPreviewErrorPage(message, sourceUrl = "") {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 28px;
        box-sizing: border-box;
        font-family: Arial, sans-serif;
        color: #e8edf5;
        background: #0d121c;
      }
      main {
        max-width: 640px;
        border: 1px solid #2b3546;
        border-radius: 14px;
        background: #141d2b;
        padding: 28px;
        box-shadow: 0 18px 48px rgba(19, 30, 48, 0.12);
      }
      h1 { margin: 0 0 10px; font-size: 24px; }
      p { margin: 0; color: #a6b6cc; line-height: 1.5; }
      a { display: inline-block; margin-top: 16px; color: #86d7c2; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>No se pudo generar la miniatura</h1>
      <p>${cleanString(message)}</p>
      ${sourceUrl ? `<a href="${sourceUrl}" target="_blank" rel="noreferrer">Abrir producto</a>` : ""}
    </main>
  </body>
</html>`;
}

function buildPreviewDocument(html, sourceUrl) { return safePreview(html, sourceUrl); }

async function fetchProductPage(targetUrl, options) {
  const target = new URL(targetUrl);
  // The browser's published Docker port is not the server's container port.
  if (['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && target.pathname === '/example-product.html') {
    return new Response(await fs.readFile(path.join(ROOT_DIR, 'public', 'example-product.html')), { headers: { 'content-type': 'text/html' } });
  }
  return fetch(targetUrl, options);
}

async function fetchPagePreview(targetUrl) {
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    throw new Error("La URL debe iniciar con http:// o https://.");
  }

  let response;
  try {
    response = await fetchProductPage(targetUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ProductMonitorPreview/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "es-MX,es;q=0.9,en;q=0.7"
      },
      signal: AbortSignal.timeout(25000),
      redirect: "follow"
    });
  } catch {
    throw new Error("La tienda no dejó abrir la página desde el servidor local.");
  }

  if (!response.ok) {
    throw new Error(`La tienda respondió ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error("La URL no devolvió una página HTML.");
  }

  const html = await readHtmlResponse(response);
  return buildPreviewDocument(html, response.url || targetUrl);
}

function collectJsonLdItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(collectJsonLdItems);
  if (typeof value !== "object") return [];
  return [value, ...collectJsonLdItems(value["@graph"])];
}

function extractJsonLdProduct(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1].trim());
      const product = collectJsonLdItems(parsed).find((item) => {
        const type = item?.["@type"];
        return type === "Product" || (Array.isArray(type) && type.includes("Product"));
      });
      if (product) {
        const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
        const image = Array.isArray(product.image) ? product.image[0] : product.image;
        return {
          name: cleanString(product.name),
          description: cleanString(product.description),
          price: cleanString(offers.price || offers.lowPrice || offers.highPrice || ""),
          currency: cleanString(offers.priceCurrency || ""),
          image: cleanString(image || ""),
          availability: cleanString(offers.availability || "")
        };
      }
    } catch {
      // Some sites publish malformed JSON-LD. Continue with meta/selector extraction.
    }
  }
  return {};
}

function extractPriceFromText(text) {
  return cleanString(text.match(/(?:[$€£]\s?[\d.,]+|[\d.,]+\s?(?:MXN|USD|EUR))/i)?.[0] || "");
}

async function scrapeHtml(job) {
  let response;
  try {
    response = await fetchProductPage(job.url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ProductMonitor/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "es-MX,es;q=0.9,en;q=0.7"
      },
      signal: AbortSignal.timeout(25000),
      redirect: "follow"
    });
  } catch {
    throw new Error("No se pudo abrir la página desde el servidor. Puede ser bloqueo de la tienda, DNS/red local o protección anti-bots.");
  }

  if (!response.ok) {
    throw new Error(`La página respondió ${response.status}`);
  }

  const html = await readHtmlResponse(response);
  const jsonLd = extractJsonLdProduct(html);
  const sourceUrl = response.url || job.url;
  const selected = selectedValues(html, job.selectors, sourceUrl);
  const recognized = recognizeFields(html, sourceUrl);
  const pageText = stripTags(html).slice(0, 20000);

  const name =
    selected.name ||
    jsonLd.name ||
    recognized.values.name ||
    metaContent(html, ["og:title", "twitter:title"]) ||
    titleContent(html);
  const rawPrice =
    selected.price ||
    jsonLd.price ||
    recognized.values.price ||
    metaContent(html, ["product:price:amount", "og:price:amount", "twitter:data1"]) ||
    extractPriceFromText(pageText);
  const image =
    selected.image ||
    jsonLd.image ||
    recognized.values.image ||
    metaContent(html, ["og:image", "twitter:image"]);

  const currency = selected.currency || jsonLd.currency || recognized.values.currency || metaContent(html, ["product:price:currency", "og:price:currency"]);
  const finalPrice = cleanString(currency && rawPrice && !rawPrice.includes(currency) ? `${currency} ${rawPrice}` : rawPrice) || "Precio no detectado";

  return {
    name: decodeEntities(name) || "Nombre no detectado",
    price: finalPrice,
    priceValue: parsePrice(finalPrice),
    currency: cleanString(selected.currency || jsonLd.currency || recognized.values.currency || metaContent(html, ["product:price:currency", "og:price:currency"])),
    availability: cleanString(selected.availability || jsonLd.availability || recognized.values.availability || metaContent(html, ["product:availability", "og:availability"])),
    description: decodeEntities(selected.description || jsonLd.description || recognized.values.description || metaContent(html, ["og:description", "twitter:description", "description"])),
    image: absolutize(image, job.url),
    sourceUrl,
    detectedSelectors: recognized.selectors,
    checkedAt: new Date().toISOString()
  };
}

async function runJob(job) {
  if (job.running || activeChecks >= 2) return null;
  activeChecks++;
  job.running = true;
  const startedAt = new Date().toISOString();
  try {
    const data = await scrapeHtml(job);
    const result = {
      id: randomId(),
      jobId: job.id,
      status: "ok",
      data,
      createdAt: data.checkedAt
    };
    db.results.unshift(result);
    db.results = db.results.slice(0, 500);
    job.lastRunAt = startedAt;
    job.lastStatus = "ok";
    job.lastError = "";
    await saveDb();
    return result;
  } catch (error) {
    const result = {
      id: randomId(),
      jobId: job.id,
      status: "error",
      error: error.message,
      createdAt: new Date().toISOString()
    };
    db.results.unshift(result);
    db.results = db.results.slice(0, 500);
    job.lastRunAt = startedAt;
    job.lastStatus = "error";
    job.lastError = error.message;
    await saveDb();
    return result;
  }
  finally { delete job.running; activeChecks--; }
}

function serializeJob(job) {
  return {
    ...job,
    visibleFields: normalizeVisibleFields(job.visibleFields),
    results: db.results.filter((result) => result.jobId === job.id).slice(0, 100)
  };
}

function normalizeVisibleFields(fields) {
  if (!Array.isArray(fields)) return DEFAULT_VISIBLE_FIELDS;
  const cleanFields = fields.filter((field) => ALLOWED_VISIBLE_FIELDS.has(field));
  return [...new Set(cleanFields)];
}

function validateJobPayload(payload) {
  const intervalMinutes = Number(payload.intervalMinutes);
  if (!payload.title || cleanString(payload.title).length < 2) throw new Error("Escribe un nombre para este monitoreo.");
  if (!payload.url || !/^https?:\/\//i.test(payload.url)) throw new Error("La URL debe iniciar con http:// o https://.");
  if (!ALLOWED_INTERVALS.has(intervalMinutes)) throw new Error("El intervalo debe ser de 5 minutos.");
  return {
    title: cleanString(payload.title),
    url: payload.url.trim(),
    intervalMinutes,
    mode: "html",
    selectors: normalizeSelectors(payload.selectors),
    visibleFields: normalizeVisibleFields(payload.visibleFields),
    targetPrice: parsePrice(payload.targetPrice),
    active: payload.active !== false
  };
}

function validatePreviewPayload(payload) {
  if (!payload.url || !/^https?:\/\//i.test(payload.url)) throw new Error("La URL debe iniciar con http:// o https://.");
  return {
    id: "preview",
    url: payload.url.trim(),
    mode: "html",
    selectors: normalizeSelectors(payload.selectors)
  };
}

async function handleApi(req, res, url) {
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'GET' && url.pathname === '/api/health') {
    try { await storage.health(); return sendJson(res, 200, { ok: true, storage: storage.kind }); }
    catch { return sendJson(res, 503, { error: 'La base de datos no está disponible temporalmente.' }); }
  }
  if (req.method === "POST" && url.pathname === "/api/register") {
    const payload = await readBody(req);
    const email = cleanString(payload.email).toLowerCase();
    const password = String(payload.password || "");
    if (!email.includes("@") || password.length < 8) {
      return sendJson(res, 400, { error: "Usa un correo válido y contraseña de mínimo 8 caracteres." });
    }
    if (db.users.some((user) => user.email === email)) {
      return sendJson(res, 409, { error: "Ese correo ya existe." });
    }
    const user = { id: randomId(), email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    db.users.push(user);
    const token = createSession(user.id);
    await saveDb();
    res.setHeader("set-cookie", `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
    return sendJson(res, 201, { user: { id: user.id, email: user.email } });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const payload = await readBody(req);
    const email = cleanString(payload.email).toLowerCase();
    const user = db.users.find((item) => item.email === email);
    if (!user || !verifyPassword(String(payload.password || ""), user.passwordHash)) {
      return sendJson(res, 401, { error: "Correo o contraseña incorrectos." });
    }
    const token = createSession(user.id);
    await saveDb();
    res.setHeader("set-cookie", `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
    return sendJson(res, 200, { user: { id: user.id, email: user.email } });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const token = parseCookies(req).session;
    if (token) delete db.sessions[token];
    await saveDb();
    res.setHeader("set-cookie", "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    const currentUser = getUserFromRequest(req);
    return sendJson(res, 200, {
      user: currentUser ? { id: currentUser.id, email: currentUser.email } : null
    });
  }

  const user = requireUser(req, res);
  if (!user) return;

  if (req.method === "GET" && url.pathname === "/api/page-preview") {
    const targetUrl = url.searchParams.get("url") || "";
    try {
      const html = await fetchPagePreview(targetUrl);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-frame-options": "SAMEORIGIN",
        "content-security-policy": "sandbox allow-same-origin; script-src 'none'; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'"
      });
      return res.end(html);
    } catch (error) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-frame-options": "SAMEORIGIN",
        "content-security-policy": "sandbox allow-same-origin; script-src 'none'; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'"
      });
      return res.end(buildPreviewErrorPage(error.message, targetUrl));
    }
  }

  if (req.method === "GET" && url.pathname === "/api/jobs") {
    return sendJson(res, 200, { jobs: db.jobs.filter((job) => job.userId === user.id).map(serializeJob) });
  }

  if (req.method === "POST" && url.pathname === "/api/preview") {
    try {
      const job = validatePreviewPayload(await readBody(req));
      const data = await scrapeHtml(job);
      return sendJson(res, 200, { data });
    } catch (error) {
      return sendJson(res, error.status || 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/jobs") {
    try {
      const payload = validateJobPayload(await readBody(req));
      const job = {
        id: randomId(),
        userId: user.id,
        ...payload,
        lastRunAt: "",
        lastStatus: "pending",
        lastError: "",
        createdAt: new Date().toISOString()
      };
      db.jobs.unshift(job);
      await saveDb();
      runJob(job).catch(console.error);
      return sendJson(res, 201, { job: serializeJob(job) });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const runMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9]+)\/run$/);
  if (req.method === "POST" && runMatch) {
    const job = db.jobs.find((item) => item.id === runMatch[1] && item.userId === user.id);
    if (!job) return sendJson(res, 404, { error: "Monitoreo no encontrado." });
    if (job.running) return sendJson(res, 409, { error: "Ya hay una revisión en curso." });
    const result = await runJob(job);
    if (!result) return sendJson(res, 503, { error: 'Hay otras revisiones en curso. Espera unos segundos y vuelve a intentarlo.' });
    return sendJson(res, 200, { result, job: serializeJob(job) });
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9]+)$/);
  if (jobMatch) {
    const job = db.jobs.find((item) => item.id === jobMatch[1] && item.userId === user.id);
    if (!job) return sendJson(res, 404, { error: "Monitoreo no encontrado." });

    if (req.method === "PUT") {
      try {
        Object.assign(job, validateJobPayload(await readBody(req)));
        await saveDb();
        return sendJson(res, 200, { job: serializeJob(job) });
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (req.method === "DELETE") {
      db.jobs = db.jobs.filter((item) => item.id !== job.id);
      db.results = db.results.filter((result) => result.jobId !== job.id);
      await saveDb();
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: "Ruta API no encontrada." });
}

async function serveStatic(req, res, url) {
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(DIST_DIR, requestPath));
  if (!filePath.startsWith(DIST_DIR)) return sendText(res, 403, "Forbidden");

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp"
    }[ext] || "application/octet-stream";
    sendText(res, 200, file, contentType);
  } catch {
    try {
      const index = await fs.readFile(path.join(DIST_DIR, "index.html"), "utf8");
      sendText(res, 200, index, "text/html; charset=utf-8");
    } catch {
      sendText(res, 404, "Frontend no compilado. Ejecuta npm run build o usa npm run dev.");
    }
  }
}

function scheduleJobs() {
  schedulerTimer = setInterval(() => {
    const now = Date.now();
    for (const job of db.jobs) {
      if (!job.active || job.running) continue;
      const lastRun = job.lastRunAt ? new Date(job.lastRunAt).getTime() : 0;
      const due = !lastRun || now - lastRun >= job.intervalMinutes * 60 * 1000;
      if (due) {
        runJob(job).catch(console.error);
      }
    }
  }, SCHEDULER_TICK_MS);
}

async function main() {
  await ensureDb();
  scheduleJobs();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
      } else {
        await serveStatic(req, res, url);
      }
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.message || "Error interno" });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`API lista en http://${HOST}:${PORT}`);
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(schedulerTimer);
    server.close(async () => {
      while (activeChecks) await new Promise(resolve => setTimeout(resolve, 100));
      await storage.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 30000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
