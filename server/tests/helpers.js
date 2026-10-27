import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

export function testApp(dbPath = ':memory:') {
  return createApp({ dbPath, serveClient: false });
}

export async function withHttp(app, fn) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function api(base, method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: response.status, data };
}

export async function play(base, sessionId, move, clientEventId) {
  const body = { clientEventId };
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(move)) body.uci = move;
  else body.san = move;
  return api(base, 'POST', `/api/sessions/${sessionId}/moves`, body);
}
