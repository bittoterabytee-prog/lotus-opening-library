import { Chess } from 'chess.js';
import { HttpError } from './httpError.js';
import { PositionKeyError, positionKeyFromFen } from './positionKey.js';

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;

export function createGame(fen) {
  try {
    return fen ? new Chess(fen) : new Chess();
  } catch {
    throw new HttpError(400, 'Unknown or malformed position');
  }
}

export function canonicalFen(fen) {
  return createGame(fen).fen();
}

export function safePositionKey(fen) {
  try {
    return positionKeyFromFen(canonicalFen(fen));
  } catch (err) {
    if (err instanceof HttpError || err instanceof PositionKeyError) {
      throw new HttpError(400, 'Unknown or malformed position');
    }
    throw new HttpError(400, 'Unknown or malformed position');
  }
}

export function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/**
 * Accept SAN or UCI. Unknown-to-the-library moves are allowed when legal.
 * chess.js is the sole legality authority.
 */
export function applyMoveInput(chess, input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) {
    throw new HttpError(400, 'Move cannot be empty');
  }

  const uciMatch = trimmed.match(UCI_RE);
  const payload = uciMatch
    ? {
        from: uciMatch[1],
        to: uciMatch[2],
        promotion: uciMatch[3] ? uciMatch[3].toLowerCase() : undefined,
      }
    : trimmed;

  try {
    const move = chess.move(payload);
    if (!move) {
      throw new Error('illegal');
    }
    return move;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, `Invalid or illegal move: ${trimmed}`);
  }
}

export function applyUci(chess, uci) {
  return applyMoveInput(chess, uci);
}

export function gameStatus(chess) {
  const turn = chess.turn();
  const inCheck = chess.isCheck();
  const isCheckmate = chess.isCheckmate();
  const isStalemate = chess.isStalemate();
  const isDraw = chess.isDraw();
  const isGameOver = chess.isGameOver();

  let statusText;
  if (isCheckmate) {
    statusText = `Checkmate — ${turn === 'w' ? 'Black' : 'White'} wins`;
  } else if (isStalemate) {
    statusText = 'Stalemate';
  } else if (isDraw) {
    statusText = 'Draw';
  } else if (inCheck) {
    statusText = `${turn === 'w' ? 'White' : 'Black'} to move — check`;
  } else {
    statusText = `${turn === 'w' ? 'White' : 'Black'} to move`;
  }

  return {
    turn,
    inCheck,
    isCheckmate,
    isStalemate,
    isDraw,
    isGameOver,
    statusText,
  };
}
