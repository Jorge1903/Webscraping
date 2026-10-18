import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const empty = () => ({ users: [], sessions: {}, jobs: [], results: [] });
async function readLegacy(file) {
  try { return { ...empty(), ...JSON.parse(await fs.readFile(file, 'utf8')) }; }
  catch (error) { if (error.code === 'ENOENT') return empty(); throw error; }
}

// A single backend owns the in-memory state. Revision checks prevent another
// process from silently overwriting newer state during overlapping deploys.
export async function openStorage({ file, connectionString = process.env.DATABASE_URL }) {
  let queue = Promise.resolve();
  if (connectionString) {
    const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 10000, query_timeout: 15000 });
    pool.on('error', () => console.error('Se interrumpió una conexión con PostgreSQL.'));
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS monitor_state (
        id integer PRIMARY KEY CHECK (id = 1), state jsonb NOT NULL,
        revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      const existing = await pool.query('SELECT id FROM monitor_state WHERE id=1');
      if (!existing.rowCount) {
        const initial = await readLegacy(file);
        initial.sessions = {}; // Do not migrate session tokens across environments.
        await pool.query('INSERT INTO monitor_state (id, state) VALUES (1, $1::jsonb) ON CONFLICT DO NOTHING', [JSON.stringify(initial)]);
      }
      const { rows: [row] } = await pool.query('SELECT state, revision FROM monitor_state WHERE id = 1');
      let revision = row.revision;
      return {
        kind: 'postgresql', state: { ...empty(), ...row.state },
        save(state) {
          const payload = JSON.stringify(state);
          const task = queue.catch(() => {}).then(async () => {
            const saved = await pool.query('UPDATE monitor_state SET state=$1::jsonb, revision=revision+1, updated_at=now() WHERE id=1 AND revision=$2 RETURNING revision', [payload, revision]);
            if (!saved.rowCount) throw new Error('Otra instancia modificó los datos. Reinicia este servidor antes de guardar.');
            revision = saved.rows[0].revision;
          });
          queue = task;
          return task;
        },
        async health() { await pool.query('SELECT 1'); },
        async close() { await queue.catch(() => {}); await pool.end(); }
      };
    } catch (error) { await pool.end(); throw error; }
  }
  // Never fall back to ephemeral files when PostgreSQL was configured but fails.
  if (process.env.RENDER === 'true') throw new Error('Configura DATABASE_URL: Render requiere PostgreSQL para conservar las cuentas.');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const state = await readLegacy(file);
  return {
    kind: 'json', state,
    save(value) {
      const payload = JSON.stringify(value, null, 2);
      const task = queue.catch(() => {}).then(async () => {
        await fs.writeFile(`${file}.tmp`, payload);
        await fs.rename(`${file}.tmp`, file);
      });
      queue = task;
      return task;
    },
    async health() { await fs.access(path.dirname(file)); },
    async close() { await queue; }
  };
}
