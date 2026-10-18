import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStorage } from '../server/storage.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'monitor-storage-'));
const file = path.join(directory, 'db.json');
const connectionString = process.env.MONITOR_TEST_DATABASE_URL || '';
let first, second;
try {
  await fs.writeFile(file, JSON.stringify({ users: [{ id: 'persistent-user' }], sessions: { old: { userId: 'persistent-user' } }, jobs: [], results: [] }));
  first = await openStorage({ file, connectionString });
  assert.equal(first.state.users[0].id, 'persistent-user');
  if (connectionString) assert.deepEqual(first.state.sessions, {});
  first.state.jobs.push({ id: 'saved-job' });
  await first.save(first.state);
  await first.close(); first = null;
  // PostgreSQL must no longer depend on the original JSON after migration.
  if (connectionString) await fs.unlink(file);
  second = await openStorage({ file, connectionString });
  assert.equal(second.state.users[0].id, 'persistent-user');
  assert.equal(second.state.jobs[0].id, 'saved-job');
  await second.health();
  if (connectionString) {
    first = await openStorage({ file, connectionString });
    await second.save(second.state);
    await assert.rejects(first.save(first.state), /Otra instancia/);
  }
  console.log(`OK: persistencia tras reinicio, migración y salud (${second.kind}).`);
} finally {
  await first?.close(); await second?.close();
  await fs.rm(directory, { recursive: true, force: true });
}
