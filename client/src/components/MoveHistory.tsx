import type { HistoryMove } from '../types';

type Props = {
  history: HistoryMove[];
  ply: number;
  onGoto: (ply: number) => void;
};

export function MoveHistory({ history, ply, onGoto }: Props) {
  const pairs: Array<{ n: number; white?: HistoryMove; black?: HistoryMove }> = [];
  for (const move of history) {
    const n = Math.ceil(move.ply / 2);
    let pair = pairs.find((item) => item.n === n);
    if (!pair) {
      pair = { n };
      pairs.push(pair);
    }
    if (move.ply % 2 === 1) pair.white = move;
    else pair.black = move;
  }

  if (history.length === 0) {
    return (
      <section className="card">
        <h2>Move history</h2>
        <div className="empty">The scoresheet is empty. Start from the initial position.</div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Move history</h2>
      <div className="scoresheet">
        {pairs.map((pair) => (
          <div key={pair.n} style={{ display: 'contents' }}>
            <span className="n">{pair.n}.</span>
            <button
              type="button"
              className={ply === pair.white?.ply ? 'current' : ''}
              onClick={() => pair.white && onGoto(pair.white.ply)}
            >
              {pair.white?.san ?? ''}
            </button>
            <button
              type="button"
              className={ply === pair.black?.ply ? 'current' : ''}
              onClick={() => pair.black && onGoto(pair.black.ply)}
            >
              {pair.black?.san ?? ''}
            </button>
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        Click a move to step through the saved sequence. Playing a different move after going back
        starts a new branch.
      </p>
    </section>
  );
}
