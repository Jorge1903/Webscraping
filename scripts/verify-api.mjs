import assert from 'node:assert/strict';
import { api } from '../src/api.js';
const originalFetch = globalThis.fetch;
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, ms, ...args) => originalTimeout(callback, Math.min(ms, 5), ...args);
let calls = 0;
try {
  globalThis.fetch = async () => ++calls === 1 ? new Response('Bad Gateway', { status: 502 }) : Response.json({ jobs: [] });
  assert.deepEqual(await api('/api/jobs'), { jobs: [] });
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 }); };
  await assert.rejects(api('/api/login', { method: 'POST', body: {} }), error => error.status === 401);
  assert.equal(calls, 1);
  calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('Bad Gateway', { status: 502 }); };
  await assert.rejects(api('/api/register', { method: 'POST', body: {} }), error => error.status === 502);
  assert.equal(calls, 1, 'Las escrituras no se deben repetir automáticamente');
  globalThis.fetch = async () => new Response('<html>Vista segura</html>');
  assert.match(await api('/api/page-preview', { responseType: 'text' }), /Vista segura/);
  console.log('OK: recuperación de 502, errores 401, vista HTML y escrituras sin duplicados.');
} finally { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimeout; }
