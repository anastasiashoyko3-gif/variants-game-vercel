import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';

export async function createHarness() {
  const db = new PGlite();
  await db.exec(await readFile(new URL('../team_game_schema.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../neon_schema.sql', import.meta.url), 'utf8'));
  await db.exec("INSERT INTO team_codenames_bank(word) SELECT 'слово '||n FROM generate_series(1,100) n");
  // Match Neon's lazy query contract: transaction receives queries before execution.
  const sql = {
    query(text, params = []) {
      return { text, params, then(resolve, reject) { return db.query(text, params).then(r => r.rows).then(resolve, reject); } };
    },
    transaction(queries) {
      return db.transaction(async tx => {
        const results = [];
        for (const q of queries) results.push((await tx.query(q.text, q.params)).rows);
        return results;
      });
    }
  };
  const env = { DATABASE_URL: 'test-only', ADMIN_PASSWORD: 'local-test-only' };
  const context = vm.createContext({ Buffer, process: { env }, console, Date });
  const cache = new Map();
  async function load(name) {
    if (cache.has(name)) return cache.get(name);
    let mod;
    if (name === 'crypto' || name === '@neondatabase/serverless') {
      const exports = name === 'crypto' ? { default: crypto } : { neon: () => sql };
      mod = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context, identifier: name });
    } else {
      mod = new vm.SourceTextModule(await readFile(new URL(name, import.meta.url), 'utf8'), { context, identifier: name });
    }
    cache.set(name, mod);
    await mod.link((specifier, parent) => load(specifier.startsWith('.') ? new URL(specifier, new URL(parent.identifier, import.meta.url)).href : specifier));
    return mod;
  }
  const handlers = {};
  for (const name of ['team-game-admin', 'team-round1', 'team-play', 'team-live', 'team-restart', 'admin-db', 'game-db']) {
    const mod = await load(new URL('../api/' + name + '.js', import.meta.url).href);
    if (mod.status !== 'evaluated') await mod.evaluate();
    handlers[name] = mod.namespace.default;
  }
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() / 1000 + 3600 })).toString('base64url');
  const cookie = 'variants_admin_session=' + payload + '.' + crypto.createHmac('sha256', env.ADMIN_PASSWORD).update(payload).digest('base64url');
  async function call(name, body, options = {}) {
    const req = { method: body ? 'POST' : 'GET', body, query: options.query || {}, headers: { cookie: options.public ? '' : cookie } };
    let status = 200, data;
    const res = { status(value) { status = value; return this; }, json(value) { data = value; return this; } };
    await handlers[name](req, res);
    return { status, data: JSON.parse(JSON.stringify(data)) };
  }
  return { db, sql, call, cookie };
}
