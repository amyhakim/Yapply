import assert from 'node:assert/strict';
import test from 'node:test';
import { api, postJson } from '../lib/client-api';

test('room creation uses the same-origin API and a JSON request', async (t) => {
  let request: { path: unknown; options?: RequestInit } | undefined;
  t.mock.method(globalThis, 'fetch', async (path: unknown, options?: RequestInit) => {
    request = { path, options };
    return Response.json({ id: 'match-id' }, { status: 201 });
  });
  assert.deepEqual(await postJson('/api/matches', { language: 'es' }), { id: 'match-id' });
  assert.equal(request?.path, '/api/matches');
  assert.equal(request?.options?.method, 'POST');
  assert.equal(request?.options?.body, JSON.stringify({ language: 'es' }));
});

test('API errors preserve useful room-join feedback', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Room code has expired or has been used' }, { status: 409 }));
  await assert.rejects(postJson('/api/invites/join', { code: '0123456789' }), /expired or has been used/);
});

test('a non-JSON gateway error produces actionable text', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
  await assert.rejects(api('/api/session'), /Request failed \(502\)/);
});
