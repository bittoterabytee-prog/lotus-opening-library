import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testApp, withHttp, api, play } from './helpers.js';

describe('core learning workflow', { concurrency: false }, () => {
  /** @type {ReturnType<typeof testApp>} */
  let ctx;
  let base;

  before(async () => {
    ctx = testApp(':memory:');
    ctx.server = createServer(ctx.app);
    await new Promise((resolve) => ctx.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${ctx.server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => ctx.server.close(resolve));
    ctx.close();
  });

  it('1. a new position returns no suggestions', async () => {
    const created = await api(base, 'POST', '/api/sessions', { reuseActive: true });
    assert.equal(created.status, 201);
    assert.deepEqual(created.data.suggestions, []);
    const start = await api(
      base,
      'GET',
      `/api/suggestions?fen=${encodeURIComponent(created.data.fen)}`,
    );
    assert.equal(start.status, 200);
    assert.deepEqual(start.data.suggestions, []);
  });

  it('2. recording e4 followed by e5 saves the observations', async () => {
    const created = await api(base, 'POST', '/api/sessions', { force: true });
    const sessionId = created.data.session.id;
    const e4 = await play(base, sessionId, 'e4', 'evt-e4');
    const e5 = await play(base, sessionId, 'e5', 'evt-e5');
    assert.equal(e4.status, 200);
    assert.equal(e5.status, 200);
    assert.equal(e4.data.history[0].san, 'e4');
    assert.equal(e5.data.history[1].san, 'e5');

    const count = ctx.db.prepare('SELECT COUNT(*) AS n FROM observations').get();
    assert.ok(Number(count.n) >= 2);
  });

  it('4. returning to the position after e4 suggests e5', async () => {
    const created = await api(base, 'POST', '/api/sessions', { force: true });
    const sessionId = created.data.session.id;
    await play(base, sessionId, 'e4');
    const afterE4 = await play(base, sessionId, 'e5');
    const names = afterE4.data.suggestions.map((s) => s.san);
    // Black just played e5; suggestions are for White's second move — may be empty.
    void names;
    const fresh = await api(base, 'POST', '/api/sessions', { force: true });
    const again = await play(base, fresh.data.session.id, 'e4');
    const sans = again.data.suggestions.map((s) => s.san);
    assert.ok(sans.includes('e5'), `expected e5 in ${sans.join(',')}`);
  });

  it('5. recording c5 from the same position displays both e5 and c5', async () => {
    const created = await api(base, 'POST', '/api/sessions', { force: true });
    await play(base, created.data.session.id, 'e4');
    await play(base, created.data.session.id, 'c5');
    const probe = await api(base, 'POST', '/api/sessions', { force: true });
    const afterE4 = await play(base, probe.data.session.id, 'e4');
    const sans = afterE4.data.suggestions.map((s) => s.san).sort();
    assert.deepEqual(sans, ['c5', 'e5']);
  });

  it('6. encounter counts increase accurately', async () => {
    const first = await api(base, 'POST', '/api/sessions', { force: true });
    await play(base, first.data.session.id, 'e4');
    await play(base, first.data.session.id, 'e5');
    const probe = await api(base, 'POST', '/api/sessions', { force: true });
    const afterE4 = await play(base, probe.data.session.id, 'e4');
    const e5 = afterE4.data.suggestions.find((s) => s.san === 'e5');
    const c5 = afterE4.data.suggestions.find((s) => s.san === 'c5');
    assert.ok(e5.encounterCount >= 2);
    assert.equal(c5.encounterCount, 1);
    assert.ok(e5.percentage > c5.percentage);
  });

  it('7. the same move played from a different position is not grouped', async () => {
    const other = await api(base, 'POST', '/api/sessions', { force: true });
    await play(base, other.data.session.id, 'Nf3');
    await play(base, other.data.session.id, 'Nc6');
    const afterNc6 = await play(base, other.data.session.id, 'e4');
    const e4Here = afterNc6.data.history.find((m) => m.san === 'e4');
    assert.ok(e4Here);

    const startSession = await api(base, 'POST', '/api/sessions', { force: true });
    const startState = startSession.data;
    const e4FromStart = startState.suggestions.find((s) => s.san === 'e4');
    const nf3FromStart = startState.suggestions.find((s) => s.san === 'Nf3');
    assert.ok(e4FromStart);
    assert.ok(nf3FromStart);

    const afterNf3Nc6 = await play(base, startSession.data.session.id, 'Nf3');
    await play(base, startSession.data.session.id, 'Nc6');
    // Suggestions at that position should have e4 from THIS position only.
    // Re-fetch by playing until after Nc6 in a probe that stops there.
    const probe = await api(base, 'POST', '/api/sessions', { force: true });
    await play(base, probe.data.session.id, 'Nf3');
    const atNc6 = await play(base, probe.data.session.id, 'Nc6');
    const e4 = atNc6.data.suggestions.find((s) => s.san === 'e4');
    assert.ok(e4);
    assert.equal(e4.encounterCount, 1, 'e4 after Nf3 Nc6 must not inherit start-position e4 counts');
    void afterNf3Nc6;
  });

  it('9. illegal moves are rejected', async () => {
    const created = await api(base, 'POST', '/api/sessions', { force: true });
    const illegal = await play(base, created.data.session.id, 'e2e5');
    assert.equal(illegal.status, 400);
    assert.match(String(illegal.data.error), /illegal|invalid/i);
    const state = await api(base, 'GET', `/api/sessions/${created.data.session.id}`);
    assert.equal(state.data.session.ply, 0);
  });

  it('10. undo restores the correct position and session progress', async () => {
    const created = await api(base, 'POST', '/api/sessions', { force: true });
    const sessionId = created.data.session.id;
    await play(base, sessionId, 'e4');
    await play(base, sessionId, 'e5');
    const undone = await api(base, 'POST', `/api/sessions/${sessionId}/undo`);
    assert.equal(undone.status, 200);
    assert.equal(undone.data.session.ply, 1);
    assert.equal(undone.data.history[0].san, 'e4');
    assert.match(undone.data.fen, /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b /);

    const observationsBefore = Number(ctx.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n);
    await play(base, sessionId, 'e5', 'retry-e5');
    const observationsAfter = Number(ctx.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n);
    assert.equal(observationsAfter, observationsBefore, 'redo of the same move must not double-count');
  });

  it('duplicate clientEventId does not create a second observation', async () => {
    const created = await api(base, 'POST', '/api/sessions', { force: true });
    const sessionId = created.data.session.id;
    const a = await play(base, sessionId, 'd4', 'dup-d4');
    const b = await play(base, sessionId, 'd4', 'dup-d4');
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.data.session.ply, b.data.session.ply);
    const n = ctx.db.prepare(
      "SELECT COUNT(*) AS n FROM observations WHERE client_event_id = 'dup-d4'",
    ).get();
    assert.equal(Number(n.n), 1);
  });
});

describe('3. restarting the app does not lose saved moves', () => {
  it('reopens the same sqlite file and still has e4 and e5', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lotus-'));
    const dbPath = join(dir, 'lotus.sqlite');
    const first = testApp(dbPath);
    await withHttp(first.app, async (base) => {
      const created = await api(base, 'POST', '/api/sessions', { reuseActive: true });
      await play(base, created.data.session.id, 'e4');
      await play(base, created.data.session.id, 'e5');
    });
    first.close();

    const second = testApp(dbPath);
    await withHttp(second.app, async (base) => {
      const created = await api(base, 'POST', '/api/sessions', { force: true });
      const afterE4 = await play(base, created.data.session.id, 'e4');
      const sans = afterE4.data.suggestions.map((s) => s.san);
      assert.ok(sans.includes('e5'));
    });
    second.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
