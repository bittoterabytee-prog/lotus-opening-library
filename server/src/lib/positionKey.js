/**
 * Canonical position identity for the opening tree.
 *
 * FEN fields used:
 *   1. piece placement
 *   2. side to move
 *   3. castling rights
 *   4. en-passant square (legally relevant only)
 *
 * Halfmove clock and fullmove number are excluded so two visits to the same
 * relevant position share continuations even if the clocks differ.
 *
 * Two identical-looking boards with different castling rights therefore
 * produce different keys and do not share suggestions.
 */

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class PositionKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PositionKeyError';
  }
}

export function positionKeyFromFen(fen) {
  if (typeof fen !== 'string' || !fen.trim()) {
    throw new PositionKeyError('Unknown or malformed position');
  }

  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) {
    throw new PositionKeyError('Unknown or malformed position');
  }

  const [placement, side, castling, enPassant] = parts;

  if (!/^[prnbqkPRNBQK1-8/]+$/.test(placement)) {
    throw new PositionKeyError('Unknown or malformed position');
  }
  if (side !== 'w' && side !== 'b') {
    throw new PositionKeyError('Unknown or malformed position');
  }
  if (!/^(-|[KQkq]+)$/.test(castling)) {
    throw new PositionKeyError('Unknown or malformed position');
  }
  if (!/^(-|[a-h][36])$/.test(enPassant)) {
    throw new PositionKeyError('Unknown or malformed position');
  }

  return `${placement} ${side} ${castling} ${enPassant}`;
}

export function representativeFenFromKey(positionKey, fenHint) {
  if (fenHint && positionKeyFromFen(fenHint) === positionKey) {
    return fenHint;
  }
  return `${positionKey} 0 1`;
}
