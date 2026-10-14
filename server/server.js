import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = path.join(ROOT_DIR, "data", "db.json");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SCHEDULER_TICK_MS = 30 * 1000;
const ALLOWED_INTERVALS = new Set([5, 10, 30]);
const DEFAULT_VISIBLE_FIELDS = ["pagePreview", "image", "name", "price", "currency", "availability", "description", "checkedAt", "history"];
const ALLOWED_VISIBLE_FIELDS = new Set([...DEFAULT_VISIBLE_FIELDS, "sourceUrl"]);
let saveQueue = Promise.resolve();

let db = {
  users: [],
  sessions: {},
  jobs: [],
  results: []
};

async function ensureDb() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    db = { ...db, ...JSON.parse(raw) };
    for (const job of db.jobs) {
      delete job.running;
      if (Array.isArray(job.visibleFields) && !job.visibleFields.includes("pagePreview")) {
        job.visibleFields = ["pagePreview", ...job.visibleFields];
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await saveDb();
  }
}

async function saveDb() {
  const payload = JSON.stringify(db, null, 2);
  const tempPath = `${DB_PATH}.tmp`;
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      await fs.writeFile(tempPath, payload);
      await fs.rename(tempPath, DB_PATH);
    });
  return saveQueue;
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

function decodeEntities(value) {
  return cleanString(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

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
    sendJson(res, 401, { error: "Necesitas iniciar sesion." });
    return null;
  }
  return user;
}

function absolutize(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url || "";
  }
}

function getAttribute(html, attr) {
  const match = String(html || "").match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? decodeEntities(match[1]) : "";
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
        color: #253044;
        background: #f4f7fb;
      }
      main {
        max-width: 640px;
        border: 1px solid #d7e0ea;
        border-radius: 14px;
        background: #fff;
        padding: 28px;
        box-shadow: 0 18px 48px rgba(19, 30, 48, 0.12);
      }
      h1 { margin: 0 0 10px; font-size: 24px; }
      p { margin: 0; color: #5c6879; line-height: 1.5; }
      a { display: inline-block; margin-top: 16px; color: #095268; font-weight: 700; }
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

function buildPreviewDocument(html, sourceUrl) {
  const baseTag = `<base href="${sourceUrl}">`;
  const safeHtml = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi, "")
    .replace(/<meta[^>]+content=["'][^"']*content-security-policy[^"']*["'][^>]*>/gi, "")
    .replace(/<form\b/gi, "<div data-preview-form")
    .replace(/<\/form>/gi, "</div>");

  const previewStyle = `<style>
    html, body { min-height: 100%; }
    body { pointer-events: none !important; overflow: hidden !important; }
    a, button, input, select, textarea { pointer-events: none !important; }
    img, picture, video { max-width: 100%; }
    * { scrollbar-width: none !important; }
    *::-webkit-scrollbar { display: none !important; }
  </style>`;

  if (/<head[^>]*>/i.test(safeHtml)) {
    return safeHtml.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${previewStyle}`);
  }

  return `<!doctype html><html><head>${baseTag}${previewStyle}</head><body>${safeHtml}</body></html>`;
}

async function fetchPagePreview(targetUrl) {
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    throw new Error("La URL debe iniciar con http:// o https://.");
  }

  let response;
  try {
    response = await fetch(targetUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ProductMonitorPreview/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "es-MX,es;q=0.9,en;q=0.7"
      },
      redirect: "follow"
    });
  } catch {
    throw new Error("La tienda no dejo abrir la pagina desde el servidor local.");
  }

  if (!response.ok) {
    throw new Error(`La tienda respondio ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error("La URL no devolvio una pagina HTML.");
  }

  const html = await response.text();
  return buildPreviewDocument(html, response.url || targetUrl);
}

function firstMatch(html, regex) {
  const match = html.match(regex);
  return match ? match[0] : "";
}

function findElement(html, selector) {
  if (!selector) return "";
  const trimmed = selector.trim();

  if (trimmed.includes(" ")) {
    return trimmed.split(/\s+/).reduce((currentHtml, part) => findElement(currentHtml, part), html);
  }

  if (trimmed.startsWith("#")) {
    const id = trimmed.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return firstMatch(html, new RegExp(`<([a-z0-9-]+)(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/\\1>`, "i")) ||
      firstMatch(html, new RegExp(`<[a-z0-9-]+(?=[^>]*\\bid=["']${id}["'])[^>]*\\/?>`, "i"));
  }

  if (trimmed.startsWith(".")) {
    const className = trimmed.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return firstMatch(html, new RegExp(`<([a-z0-9-]+)(?=[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'])[^>]*>[\\s\\S]*?<\\/\\1>`, "i")) ||
      firstMatch(html, new RegExp(`<[a-z0-9-]+(?=[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'])[^>]*\\/?>`, "i"));
  }

  const tag = trimmed.match(/^[a-z][a-z0-9-]*/i)?.[0];
  if (tag) {
    return firstMatch(html, new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "i")) ||
      firstMatch(html, new RegExp(`<${tag}\\b[^>]*\\/?>`, "i"));
  }

  return "";
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
    response = await fetch(job.url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ProductMonitor/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "es-MX,es;q=0.9,en;q=0.7"
      },
      redirect: "follow"
    });
  } catch {
    throw new Error("No se pudo abrir la pagina desde el servidor. Puede ser bloqueo de la tienda, DNS/red local o proteccion anti-bots.");
  }

  if (!response.ok) {
    throw new Error(`La pagina respondio ${response.status}`);
  }

  const html = await response.text();
  const jsonLd = extractJsonLdProduct(html);
  const nameElement = findElement(html, job.selectors.name);
  const priceElement = findElement(html, job.selectors.price);
  const imageElement = findElement(html, job.selectors.image);
  const pageText = stripTags(html).slice(0, 20000);

  const name =
    stripTags(nameElement) ||
    jsonLd.name ||
    metaContent(html, ["og:title", "twitter:title"]) ||
    titleContent(html);
  const rawPrice =
    stripTags(priceElement) ||
    jsonLd.price ||
    metaContent(html, ["product:price:amount", "og:price:amount", "twitter:data1"]) ||
    extractPriceFromText(pageText);
  const image =
    getAttribute(imageElement, "src") ||
    getAttribute(imageElement, "data-src") ||
    getAttribute(imageElement, "content") ||
    jsonLd.image ||
    metaContent(html, ["og:image", "twitter:image"]);

  const finalPrice = cleanString(jsonLd.currency && rawPrice && !rawPrice.includes(jsonLd.currency) ? `${jsonLd.currency} ${rawPrice}` : rawPrice) || "Precio no detectado";

  return {
    name: cleanString(name) || "Nombre no detectado",
    price: finalPrice,
    priceValue: parsePrice(finalPrice),
    currency: cleanString(jsonLd.currency || metaContent(html, ["product:price:currency", "og:price:currency"])),
    availability: cleanString(jsonLd.availability || metaContent(html, ["product:availability", "og:availability"])),
    description: cleanString(jsonLd.description || metaContent(html, ["og:description", "twitter:description", "description"])),
    image: absolutize(image, job.url),
    sourceUrl: response.url,
    checkedAt: new Date().toISOString()
  };
}

async function runJob(job) {
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
}

function serializeJob(job) {
  return {
    ...job,
    visibleFields: normalizeVisibleFields(job.visibleFields),
    results: db.results.filter((result) => result.jobId === job.id).slice(0, 12)
  };
}

function normalizeVisibleFields(fields) {
  if (!Array.isArray(fields)) return DEFAULT_VISIBLE_FIELDS;
  const cleanFields = fields.filter((field) => ALLOWED_VISIBLE_FIELDS.has(field));
  return cleanFields.length ? [...new Set(cleanFields)] : DEFAULT_VISIBLE_FIELDS;
}

function validateJobPayload(payload) {
  const intervalMinutes = Number(payload.intervalMinutes);
  if (!payload.title || cleanString(payload.title).length < 2) throw new Error("Pon un nombre para este monitoreo.");
  if (!payload.url || !/^https?:\/\//i.test(payload.url)) throw new Error("La URL debe iniciar con http:// o https://.");
  if (!ALLOWED_INTERVALS.has(intervalMinutes)) throw new Error("El intervalo debe ser 5, 10 o 30 minutos.");
  return {
    title: cleanString(payload.title),
    url: payload.url.trim(),
    intervalMinutes,
    mode: "html",
    selectors: {
      name: cleanString(payload.selectors?.name),
      price: cleanString(payload.selectors?.price),
      image: cleanString(payload.selectors?.image)
    },
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
    selectors: {
      name: cleanString(payload.selectors?.name),
      price: cleanString(payload.selectors?.price),
      image: cleanString(payload.selectors?.image)
    }
  };
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/register") {
    const payload = await readBody(req);
    const email = cleanString(payload.email).toLowerCase();
    const password = String(payload.password || "");
    if (!email.includes("@") || password.length < 8) {
      return sendJson(res, 400, { error: "Usa un correo valido y contrasena de minimo 8 caracteres." });
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
      return sendJson(res, 401, { error: "Correo o contrasena incorrectos." });
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
        "x-frame-options": "SAMEORIGIN"
      });
      return res.end(html);
    } catch (error) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-frame-options": "SAMEORIGIN"
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
      return sendJson(res, 400, { error: error.message });
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
      runJob(job);
      return sendJson(res, 201, { job: serializeJob(job) });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const runMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9]+)\/run$/);
  if (req.method === "POST" && runMatch) {
    const job = db.jobs.find((item) => item.id === runMatch[1] && item.userId === user.id);
    if (!job) return sendJson(res, 404, { error: "Monitoreo no encontrado." });
    const result = await runJob(job);
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
  setInterval(() => {
    const now = Date.now();
    for (const job of db.jobs) {
      if (!job.active || job.running) continue;
      const lastRun = job.lastRunAt ? new Date(job.lastRunAt).getTime() : 0;
      const due = !lastRun || now - lastRun >= job.intervalMinutes * 60 * 1000;
      if (due) {
        job.running = true;
        runJob(job).finally(() => {
          delete job.running;
          saveDb().catch(() => {});
        });
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
      sendJson(res, 500, { error: error.message || "Error interno" });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`API lista en http://${HOST}:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
