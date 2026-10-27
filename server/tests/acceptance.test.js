import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testApp, withHttp, api, play } from './helpers.js';

describe('V1 acceptance scenario A–L', () => {
  it('records e4/e5, suggests them later, branches with c5, names the line, and survives restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lotus-accept-'));
    const dbPath = join(dir, 'lotus.sqlite');
    const first = testApp(dbPath);

    await withHttp(first.app, async (base) => {
      const empty = await api(base, 'POST', '/api/sessions', { reuseActive: true });
      assert.equal(empty.data.suggestions.length, 0);

      await play(base, empty.data.session.id, 'e4');
      await play(base, empty.data.session.id, 'e5');
      assert.equal(
        Number(first.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n),
        2,
      );

      const session2 = await api(base, 'POST', '/api/sessions', { force: true });
      const afterE4 = await play(base, session2.data.session.id, 'e4');
      assert.ok(afterE4.data.suggestions.some((s) => s.san === 'e5'));

      const session3 = await api(base, 'POST', '/api/sessions', { force: true });
      await play(base, session3.data.session.id, 'e4');
      await play(base, session3.data.session.id, 'c5');

      const session4 = await api(base, 'POST', '/api/sessions', { force: true });
      const both = await play(base, session4.data.session.id, 'e4');
      const sans = both.data.suggestions.map((s) => s.san).sort();
      assert.deepEqual(sans, ['c5', 'e5']);
      assert.equal(both.data.suggestions.find((s) => s.san === 'e5').encounterCount, 1);
      assert.equal(both.data.suggestions.find((s) => s.san === 'c5').encounterCount, 1);

      await play(base, session4.data.session.id, 'e5');
      const named = await api(base, 'POST', '/api/openings', {
        sessionId: session4.data.session.id,
        name: 'Test Opening',
      });
      assert.equal(named.status, 201);
      assert.equal(named.data.name, 'Test Opening');
    });
    first.close();

    const second = testApp(dbPath);
    await withHttp(second.app, async (base) => {
      const openings = await api(base, 'GET', '/api/openings');
      assert.equal(openings.data.openings[0].name, 'Test Opening');
      const sessions = await api(base, 'GET', '/api/sessions');
      assert.ok(sessions.data.sessions.length >= 1);
      const probe = await api(base, 'POST', '/api/sessions', { force: true });
      const afterE4 = await play(base, probe.data.session.id, 'e4');
      const sans = afterE4.data.suggestions.map((s) => s.san).sort();
      assert.deepEqual(sans, ['c5', 'e5']);
    });
    second.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
