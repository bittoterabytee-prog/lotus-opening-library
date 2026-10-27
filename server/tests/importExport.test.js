import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, withHttp, api, play } from './helpers.js';

describe('import and export', () => {
  it('14. import validation prevents malformed data from corrupting the database', async () => {
    const ctx = testApp(':memory:');
    await withHttp(ctx.app, async (base) => {
      const created = await api(base, 'POST', '/api/sessions', { reuseActive: true });
      await play(base, created.data.session.id, 'e4');

      const beforeMoves = Number(ctx.db.prepare('SELECT COUNT(*) AS n FROM moves').get().n);
      const beforeObs = Number(ctx.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n);

      const badJson = await fetch(`${base}/api/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      });
      assert.equal(badJson.status, 400);

      const wrongFormat = await api(base, 'POST', '/api/import', { hello: 'world' });
      assert.equal(wrongFormat.status, 400);
      assert.match(String(wrongFormat.data.error), /validation/i);

      const illegalLine = await api(base, 'POST', '/api/import', {
        format: 'lotus-opening-library',
        version: 1,
        openings: [{ name: 'Bad', line: [{ san: 'Ke5' }] }],
      });
      assert.equal(illegalLine.status, 400);

      const afterMoves = Number(ctx.db.prepare('SELECT COUNT(*) AS n FROM moves').get().n);
      const afterObs = Number(ctx.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n);
      assert.equal(afterMoves, beforeMoves);
      assert.equal(afterObs, beforeObs);
    });
    ctx.close();
  });

  it('exports and re-imports named openings and encounter history', async () => {
    const ctx = testApp(':memory:');
    await withHttp(ctx.app, async (base) => {
      const created = await api(base, 'POST', '/api/sessions', { reuseActive: true });
      await play(base, created.data.session.id, 'e4');
      await play(base, created.data.session.id, 'e5');
      await api(base, 'POST', '/api/openings', {
        sessionId: created.data.session.id,
        name: 'Test Opening',
      });

      const exported = await api(base, 'GET', '/api/export');
      assert.equal(exported.data.format, 'lotus-opening-library');
      assert.equal(exported.data.version, 1);
      assert.ok(exported.data.openings.length >= 1);

      const other = testApp(':memory:');
      await withHttp(other.app, async (otherBase) => {
        const imported = await api(otherBase, 'POST', '/api/import', exported.data);
        assert.equal(imported.status, 200);
        const openings = await api(otherBase, 'GET', '/api/openings');
        assert.equal(openings.data.openings[0].name, 'Test Opening');

        const session = await api(otherBase, 'POST', '/api/sessions', { force: true });
        const afterE4 = await play(otherBase, session.data.session.id, 'e4');
        assert.ok(afterE4.data.suggestions.some((s) => s.san === 'e5'));
      });
      other.close();
    });
    ctx.close();
  });
});
