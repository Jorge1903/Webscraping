import path from 'node:path';
import { openStorage } from '../server/storage.js';

if (!process.env.DATABASE_URL) throw new Error('Configura DATABASE_URL antes de importar.');
const store = await openStorage({ file: path.resolve(process.argv[2] || 'data/db.json') });
try {
  console.log(JSON.stringify({ storage: store.kind, users: store.state.users.length, jobs: store.state.jobs.length, results: store.state.results.length }));
  console.log('La importación solo inicializa una base vacía. No sobrescribe datos existentes ni copia sesiones.');
} finally { await store.close(); }
