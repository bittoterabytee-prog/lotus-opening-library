import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { positionKeyFromFen, PositionKeyError, START_FEN } from '../src/lib/positionKey.js';

describe('position key generation', () => {
  it('uses placement, side, castling, and en passant, but not clocks', () => {
    const a = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const b = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 12 44';
    assert.equal(positionKeyFromFen(a), positionKeyFromFen(b));
    assert.equal(
      positionKeyFromFen(a),
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
    );
  });

  it('8. different castling rights produce distinct position keys', () => {
    const withRights = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const withoutRights = 'r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1';
    assert.notEqual(positionKeyFromFen(withRights), positionKeyFromFen(withoutRights));
  });

  it('keeps legally relevant en passant in the key', () => {
    const withEp = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const withoutEp = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
    assert.notEqual(positionKeyFromFen(withEp), positionKeyFromFen(withoutEp));
    assert.match(positionKeyFromFen(withEp), / d6$/);
  });

  it('omits en passant from chess.js FEN when no capture is legal', () => {
    const chess = new Chess();
    chess.move('e4');
    assert.equal(positionKeyFromFen(chess.fen()).split(' ')[3], '-');
    assert.notEqual(positionKeyFromFen(chess.fen()), positionKeyFromFen(START_FEN));
  });

  it('rejects malformed FEN', () => {
    assert.throws(() => positionKeyFromFen('not-a-fen'), PositionKeyError);
    assert.throws(() => positionKeyFromFen(''), PositionKeyError);
  });
});
