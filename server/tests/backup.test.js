import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupsEnabled } from '../src/services/backup.js';

describe('automatic library backup', () => {
  it('skips in-memory and temp databases so tests do not write the real backup', () => {
    assert.equal(backupsEnabled(':memory:'), false);
    assert.equal(backupsEnabled(join(tmpdir(), 'lotus-test.sqlite')), false);
  });
});
