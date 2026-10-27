import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { MoveArrows } from './MoveArrows';
import type { Suggestion } from '../types';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const GLYPHS: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

type Props = {
  fen: string;
  lastMove?: { from: string; to: string } | null;
  inCheck?: boolean;
  turn?: 'w' | 'b';
  disabled?: boolean;
  suggestions?: Suggestion[];
  hoverUci?: string | null;
  onHoverSuggestion?: (uci: string | null) => void;
  onMove: (uci: string) => void;
};

function squareName(rankIndex: number, fileIndex: number): Square {
  return `${FILES[fileIndex]}${8 - rankIndex}` as Square;
}

export function ChessBoard({
  fen,
  lastMove,
  inCheck,
  turn,
  disabled,
  suggestions = [],
  hoverUci = null,
  onHoverSuggestion,
  onMove,
}: Props) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);

  useEffect(() => {
    setSelected(null);
    setPromotion(null);
  }, [fen]);

  const board = chess.board();
  const legal = selected
    ? chess.moves({ square: selected, verbose: true })
    : [];
  const legalDests = new Set(legal.map((move) => move.to));
  const suggestionDests = new Map<string, Suggestion[]>();
  for (const item of suggestions) {
    const dest = item.uci.slice(2, 4);
    const list = suggestionDests.get(dest) ?? [];
    list.push(item);
    suggestionDests.set(dest, list);
  }

  const kingSquare = useMemo(() => {
    if (!inCheck) return null;
    const color = chess.turn();
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const piece = board[rank][file];
        if (piece?.type === 'k' && piece.color === color) {
          return squareName(rank, file);
        }
      }
    }
    return null;
  }, [board, chess, inCheck]);

  function tryMove(from: Square, to: Square) {
    const options = chess.moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (options.length === 0) {
      setSelected(null);
      return;
    }
    if (options.some((move) => move.promotion)) {
      setPromotion({ from, to });
      return;
    }
    setSelected(null);
    onMove(`${from}${to}`);
  }

  function onSquareClick(square: Square) {
    if (disabled) return;
    if (promotion) {
      setPromotion(null);
      setSelected(null);
      return;
    }
    const piece = chess.get(square);
    if (selected && legalDests.has(square)) {
      tryMove(selected, square);
      return;
    }
    if (!selected) {
      const matches = suggestionDests.get(square) ?? [];
      if (matches.length === 1 && piece?.color !== chess.turn()) {
        onMove(matches[0].uci);
        return;
      }
    }
    if (piece && piece.color === chess.turn()) {
      setSelected(square);
      return;
    }
    setSelected(null);
  }

  function choosePromotion(piece: 'q' | 'r' | 'b' | 'n') {
    if (!promotion) return;
    onMove(`${promotion.from}${promotion.to}${piece}`);
    setPromotion(null);
    setSelected(null);
  }

  const showArrows = !selected && !promotion;

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="Chessboard, White at the bottom">
        {board.map((rank, rankIndex) =>
          rank.map((piece, fileIndex) => {
            const square = squareName(rankIndex, fileIndex);
            const light = (rankIndex + fileIndex) % 2 === 0;
            const hoverDest = hoverUci && hoverUci.slice(2, 4) === square;
            const hoverFrom = hoverUci && hoverUci.slice(0, 2) === square;
            const classes = [
              'square',
              light ? 'light' : 'dark',
              selected === square ? 'selected' : '',
              lastMove && (lastMove.from === square || lastMove.to === square) ? 'last' : '',
              kingSquare === square ? 'check' : '',
              hoverDest || hoverFrom ? 'arrow-target' : '',
            ].filter(Boolean).join(' ');
            const isCapture = Boolean(piece) && legalDests.has(square);
            const code = piece ? `${piece.color}${piece.type.toUpperCase()}` : '';
            return (
              <div
                key={square}
                role="gridcell"
                tabIndex={0}
                className={classes}
                aria-label={square}
                onClick={() => onSquareClick(square)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSquareClick(square);
                  }
                }}
              >
                {rankIndex === 7 && (
                  <span className="coord file">{FILES[fileIndex]}</span>
                )}
                {fileIndex === 0 && (
                  <span className="coord rank">{8 - rankIndex}</span>
                )}
                {piece && (
                  <span className={`piece ${piece.color === 'w' ? 'white' : 'black'}`}>
                    {GLYPHS[code]}
                  </span>
                )}
                {legalDests.has(square) && !piece && <span className="legal-dot" />}
                {isCapture && <span className="legal-ring" />}
                {promotion?.to === square && (
                  <div className="promotion">
                    {(['q', 'r', 'b', 'n'] as const).map((item) => {
                      const color = turn === 'b' ? 'b' : 'w';
                      const glyph = GLYPHS[`${color}${item.toUpperCase()}`];
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            choosePromotion(item);
                          }}
                        >
                          {glyph}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }),
        )}
      </div>
      <MoveArrows
        suggestions={suggestions}
        hidden={!showArrows}
        hoverUci={hoverUci}
        disabled={disabled}
        onHover={onHoverSuggestion ?? (() => undefined)}
        onPlay={onMove}
      />
    </div>
  );
}
