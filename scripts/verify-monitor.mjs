import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { safePreview, selectedValues, htmlText } from '../server/page-tools.js';
import { recognizedSelection } from '../src/field-selection.js';

const temp = await fs.mkdtemp(path.resolve('data', 'monitor-verify-'));
const database = path.join(temp, 'db.json');
let price = 1299;
let requests = 0;
const fixture = http.createServer((req, res) => {
  requests++;
  res.setHeader('content-type', 'text/html');
  res.end(`<html><head><title>Zapatos de prueba</title></head><body><main><h1>Zapatos de prueba</h1><section><span>$9999</span><span class="price">$${price}</span></section><img src="/shoe.png"><p>Disponible</p></main><script>alert(1)</script></body></html>`);
});
fixture.listen(0, '127.0.0.1');
await once(fixture, 'listening');
const source = `http://127.0.0.1:${fixture.address().port}/product`;
const portProbe = http.createServer();
portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
const server = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(port), MONITOR_DB_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = ''; server.stderr.on('data', chunk => { stderr += chunk; });
server.stdout.on('data', chunk => { stderr += chunk; });
const base = `http://127.0.0.1:${port}`;
let cookie = '';
async function api(route, method = 'GET', body) {
  const response = await fetch(base + route, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data: await response.json() };
}
async function until(callback, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = await callback(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 100)); }
  const state = await api('/api/jobs').catch(error => ({ error: error.message }));
  throw new Error('Tiempo agotado. ' + stderr + JSON.stringify(state));
}
try {
  assert.equal(htmlText('LEVI&apos;S &iquest;Descripci&oacute;n?'), "LEVI'S ¿Descripción?");
  await until(async () => { try { return (await fetch(base + '/api/me')).ok; } catch { return false; } });
  assert.equal((await api('/api/register', 'POST', { email: 'verify@local.test', password: 'verify123456' })).status, 201);
  const selectors = { price: 'body > main:nth-of-type(1) > section:nth-of-type(1) > span:nth-of-type(2)', name: 'h1', image: 'img', availability: 'main > p' };
  const preview = await api('/api/preview', 'POST', { url: source, selectors });
  assert.equal(preview.data.data.priceValue, 1299);
  assert.equal(preview.data.data.availability, 'Disponible');
  assert.equal(preview.data.data.image, new URL('/shoe.png', source).href);
  const auto = await api('/api/preview', 'POST', { url: source });
  assert.equal(auto.data.data.priceValue, 1299, 'La detección automática debe elegir el precio y no otro número de la página');
  assert.equal(auto.data.data.name, 'Zapatos de prueba');
  assert.ok(auto.data.data.detectedSelectors.price);
  const fields = [{key:'name',previewKey:'name'}, {key:'price',previewKey:'price'}, {key:'image',previewKey:'image'}, {key:'description',previewKey:'description'}];
  assert.deepEqual(recognizedSelection(fields, auto.data.data), ['name', 'price', 'image']);
  assert.deepEqual(recognizedSelection(fields, auto.data.data, { price: false }), ['name', 'image']);
  assert.deepEqual(recognizedSelection(fields, auto.data.data, Object.fromEntries(fields.map(field => [field.key, false]))), []);
  const document = await fetch(base + '/api/page-preview?url=' + encodeURIComponent(source), { headers: { cookie } });
  assert.ok(document.headers.get('content-security-policy').includes("script-src 'none'"));
  assert.ok(!(await document.text()).includes('<script'));
  assert.throws(() => selectedValues('<p>Otro</p>', { price: '.missing' }, source), /ya no existe/);
  const sanitized = safePreview('<base href="https://bad.test"><meta http-equiv="refresh" content="0;url=https://bad.test"><img src="x" onerror="alert(1)"><iframe src="x"></iframe>', source);
  assert.ok(!sanitized.includes('onerror')); assert.ok(!sanitized.includes('<iframe')); assert.ok(!sanitized.includes('refresh'));
  const payload = { title: 'Prueba real', url: source, selectors, intervalMinutes: 5, visibleFields: ['name', 'price', 'availability'], active: true };
  assert.equal((await api('/api/jobs', 'POST', { ...payload, intervalMinutes: 10 })).status, 400);
  const created = await api('/api/jobs', 'POST', payload);
  assert.equal(created.status, 201);
  const id = created.data.job.id;
  await until(async () => { const job = (await api('/api/jobs')).data.jobs[0]; return job?.results.length === 1 && !job.running; });
  price = 1099;
  const manual = await api(`/api/jobs/${id}/run`, 'POST');
  assert.equal(manual.data.result.data.priceValue, 1099);
  assert.equal(manual.data.job.results[1].data.priceValue, 1299);
  const cleared = await api(`/api/jobs/${id}`, 'PUT', { ...payload, visibleFields: [] });
  assert.deepEqual(cleared.data.job.visibleFields, [], 'Desmarcar todo debe conservar la selección vacía');
  // Restart with an overdue five-minute check, using an isolated test database.
  server.kill(); await once(server, 'exit');
  const saved = JSON.parse(await fs.readFile(database, 'utf8'));
  saved.jobs[0].lastRunAt = new Date(Date.now() - 301000).toISOString();
  await fs.writeFile(database, JSON.stringify(saved));
  price = 899;
  const scheduledServer = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(port), MONITOR_DB_PATH: database }, stdio: 'ignore' });
  try {
    await until(async () => { try { return (await api('/api/jobs')).data.jobs[0]?.results[0]?.data?.priceValue === 899; } catch { return false; } });
    const updated = (await api('/api/jobs')).data.jobs[0];
    assert.equal(updated.results.length, 3);
    assert.equal(updated.intervalMinutes, 5);
    assert.deepEqual(updated.visibleFields, [], 'Reiniciar el servidor no debe volver a seleccionar los datos excluidos');
    assert.ok(requests >= 5);
    console.log('OK: selección CSS exacta, imagen, disponibilidad, vista segura, intervalo único de 5 min, petición manual, historial y ejecución automática vencida.');
  } finally { scheduledServer.kill(); await once(scheduledServer, 'exit'); }
} finally {
  if (server.exitCode === null && !server.killed) { server.kill(); await once(server, 'exit'); }
  fixture.close();
  await fs.rm(temp, { recursive: true, force: true });
}
