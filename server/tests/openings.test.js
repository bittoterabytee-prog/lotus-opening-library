import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, withHttp, api, play } from './helpers.js';

describe('named openings and branches', () => {
  it('12. named openings can be created, loaded, edited, and deleted', async () => {
    const ctx = testApp(':memory:');
    await withHttp(ctx.app, async (base) => {
      const created = await api(base, 'POST', '/api/sessions', { reuseActive: true });
      const sessionId = created.data.session.id;
      await play(base, sessionId, 'e4');
      await play(base, sessionId, 'e5');

      const saved = await api(base, 'POST', '/api/openings', {
        sessionId,
        name: 'Test Opening',
        source: 'Lotus Lesson 1',
        notes: 'Acceptance line',
      });
      assert.equal(saved.status, 201);
      assert.equal(saved.data.name, 'Test Opening');
      assert.equal(saved.data.pgn, '1. e4 e5');

      const listed = await api(base, 'GET', '/api/openings?q=Test');
      assert.equal(listed.data.openings.length, 1);

      const edited = await api(base, 'PATCH', `/api/openings/${saved.data.id}`, {
        name: 'Test Opening Updated',
        notes: 'Edited',
      });
      assert.equal(edited.data.name, 'Test Opening Updated');

      const played = await api(base, 'POST', `/api/openings/${saved.data.id}/play`);
      assert.equal(played.status, 200);
      assert.equal(played.data.history.map((m) => m.san).join(' '), 'e4 e5');

      const deleted = await api(base, 'DELETE', `/api/openings/${saved.data.id}`);
      assert.equal(deleted.status, 200);

      const after = await api(base, 'GET', '/api/openings');
      assert.equal(after.data.openings.length, 0);

      const probe = await api(base, 'POST', '/api/sessions', { force: true });
      const afterE4 = await play(base, probe.data.session.id, 'e4');
      assert.ok(afterE4.data.suggestions.some((s) => s.san === 'e5'), 'shared history must survive opening delete');
    });
    ctx.close();
  });

  it('13. multiple opening branches work correctly', async () => {
    const ctx = testApp(':memory:');
    await withHttp(ctx.app, async (base) => {
      const a = await api(base, 'POST', '/api/sessions', { reuseActive: true });
      await play(base, a.data.session.id, 'e4');
      await play(base, a.data.session.id, 'e5');
      await api(base, 'POST', '/api/openings', {
        sessionId: a.data.session.id,
        name: 'Open Game',
        source: 'Lotus Lesson 1',
      });

      const b = await api(base, 'POST', '/api/sessions', { force: true });
      await play(base, b.data.session.id, 'e4');
      await play(base, b.data.session.id, 'c5');
      await api(base, 'POST', '/api/openings', {
        sessionId: b.data.session.id,
        name: 'Sicilian',
        source: 'Lotus Lesson 1',
      });

      const list = await api(base, 'GET', '/api/openings');
      assert.equal(list.data.openings.length, 2);

      const probe = await api(base, 'POST', '/api/sessions', { force: true });
      const afterE4 = await play(base, probe.data.session.id, 'e4');
      const sans = afterE4.data.suggestions.map((s) => s.san).sort();
      assert.deepEqual(sans, ['c5', 'e5']);
      const e5 = afterE4.data.suggestions.find((s) => s.san === 'e5');
      assert.ok(e5.openingNames.includes('Open Game'));
    });
    ctx.close();
  });

  it('11. restarting the board does not delete library data', async () => {
    const ctx = testApp(':memory:');
    await withHttp(ctx.app, async (base) => {
      const created = await api(base, 'POST', '/api/sessions', { reuseActive: true });
      await play(base, created.data.session.id, 'e4');
      await play(base, created.data.session.id, 'e5');
      await api(base, 'POST', '/api/openings', {
        sessionId: created.data.session.id,
        name: 'Keep Me',
      });

      const restarted = await api(base, 'POST', `/api/sessions/${created.data.session.id}/restart`);
      assert.equal(restarted.data.session.ply, 0);
      assert.notEqual(restarted.data.session.id, created.data.session.id);

      const openings = await api(base, 'GET', '/api/openings');
      assert.equal(openings.data.openings.length, 1);

      const afterE4 = await play(base, restarted.data.session.id, 'e4');
      assert.ok(afterE4.data.suggestions.some((s) => s.san === 'e5'));
    });
    ctx.close();
  });
});
