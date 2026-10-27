import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testApp, withHttp, api, play } from './helpers.js';

describe('session resume', () => {
  it('15. app startup resumes an unfinished session', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lotus-resume-'));
    const dbPath = join(dir, 'lotus.sqlite');
    const first = testApp(dbPath);
    let sessionId;
    await withHttp(first.app, async (base) => {
      const created = await api(base, 'POST', '/api/sessions', { reuseActive: true, lessonName: 'Lotus Lesson 1' });
      sessionId = created.data.session.id;
      await play(base, sessionId, 'e4');
    });
    first.close();

    const second = testApp(dbPath);
    await withHttp(second.app, async (base) => {
      const active = await api(base, 'GET', '/api/sessions/active');
      assert.equal(active.status, 200);
      assert.equal(active.data.session.id, sessionId);
      assert.equal(active.data.state.session.ply, 1);
      assert.equal(active.data.state.history[0].san, 'e4');
      assert.equal(active.data.session.lessonName, 'Lotus Lesson 1');
    });
    second.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a second active session without force', async () => {
    const ctx = testApp(':memory:');
    await withHttp(ctx.app, async (base) => {
      const first = await api(base, 'POST', '/api/sessions', { reuseActive: true });
      const second = await api(base, 'POST', '/api/sessions', {});
      assert.equal(second.status, 409);
      assert.equal(second.data.details.session.id, first.data.session.id);
    });
    ctx.close();
  });
});
