// Local-only QA: real API handlers over a disposable PostgreSQL database.
import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { createHarness } from './harness.js';
const h = await createHarness();
const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'mpa' });
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api/')) return vite.middlewares(req, res);
  let body = '';
  for await (const chunk of req) body += chunk;
  const name = url.pathname.slice(5);
  let result;
  try {
    if (name === 'admin-session') result = { status: 200, data: { ok: true } };
    else result = await h.call(name, body ? JSON.parse(body) : undefined, { query: Object.fromEntries(url.searchParams), public: url.searchParams.has('code') });
  } catch (e) { result = { status: 500, data: { error: e.message } }; }
  res.writeHead(result.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.data));
}).listen(5173, '127.0.0.1', () => console.log('Local disposable preview: http://127.0.0.1:5173/admin.html'));
