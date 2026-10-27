import type { Suggestion } from '../types';

export const ARROW_COLORS = ['#81b64c', '#f0c75e', '#5d9ece', '#e28c3a', '#c45c4a'];

type Point = { x: number; y: number };

function squareCenter(square: string): Point {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return { x: file + 0.5, y: 8 - rank + 0.5 };
}

function isKnightMove(from: string, to: string) {
  const df = Math.abs(to.charCodeAt(0) - from.charCodeAt(0));
  const dr = Math.abs(Number(to[1]) - Number(from[1]));
  return df * dr === 2;
}

function knightWaypoint(from: string, to: string): Point {
  const fromFile = from.charCodeAt(0) - 97;
  const fromRank = Number(from[1]);
  const toFile = to.charCodeAt(0) - 97;
  const toRank = Number(to[1]);
  const df = toFile - fromFile;
  const dr = toRank - fromRank;
  const twoOnFile = Math.abs(df) === 2;
  const file = twoOnFile ? fromFile + df : fromFile;
  const rank = twoOnFile ? fromRank : fromRank + dr;
  return { x: file + 0.5, y: 8 - rank + 0.5 };
}

function unit(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len, len };
}

function along(from: Point, to: Point, distance: number): Point {
  const { ux, uy } = unit(from, to);
  return { x: from.x + ux * distance, y: from.y + uy * distance };
}

function filledArrow(from: Point, to: Point, halfW: number, headLen = 0.42, headHalf = 0.24) {
  const { ux, uy, len } = unit(from, to);
  const usable = Math.max(0.2, len);
  const tip = { x: from.x + ux * usable, y: from.y + uy * usable };
  const base = { x: tip.x - ux * Math.min(headLen, usable * 0.55), y: tip.y - uy * Math.min(headLen, usable * 0.55) };
  const px = -uy;
  const py = ux;
  const pts = [
    [from.x + px * halfW, from.y + py * halfW],
    [base.x + px * halfW, base.y + py * halfW],
    [base.x + px * headHalf, base.y + py * headHalf],
    [tip.x, tip.y],
    [base.x - px * headHalf, base.y - py * headHalf],
    [base.x - px * halfW, base.y - py * halfW],
    [from.x - px * halfW, from.y - py * halfW],
  ];
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

type Props = {
  suggestions: Suggestion[];
  hidden?: boolean;
  hoverUci: string | null;
  disabled?: boolean;
  onHover: (uci: string | null) => void;
  onPlay: (uci: string) => void;
};

export function MoveArrows({ suggestions, hidden, hoverUci, disabled, onHover, onPlay }: Props) {
  if (hidden || suggestions.length === 0) return null;

  return (
    <svg className="move-arrows" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true">
      {suggestions.map((item, index) => {
        const from = item.uci.slice(0, 2);
        const to = item.uci.slice(2, 4);
        const color = ARROW_COLORS[index % ARROW_COLORS.length];
        const active = hoverUci === item.uci;
        const weight = Math.max(0.12, Math.min(0.28, 0.12 + (item.percentage / 100) * 0.16));
        const origin = squareCenter(from);
        const dest = squareCenter(to);
        const knight = isKnightMove(from, to);
        const elbow = knight ? knightWaypoint(from, to) : null;
        const start = along(origin, elbow ?? dest, 0.44);
        const tip = along(dest, elbow ?? origin, 0.18);
        const halfW = (active ? weight + 0.05 : weight) / 2;
        const opacity = active ? 1 : index === 0 ? 0.94 : 0.8;
        const caption = `${item.san} ${Math.round(item.percentage)}%`;
        const labelWidth = Math.max(0.95, caption.length * 0.125 + 0.22);
        const body = elbow
          ? filledArrow(elbow, tip, halfW)
          : filledArrow(start, tip, halfW);
        const lead = elbow
          ? `M ${start.x} ${start.y} L ${elbow.x} ${elbow.y}`
          : null;

        return (
          <g
            key={item.uci}
            className={`move-arrow${active ? ' is-hover' : ''}`}
            onMouseEnter={() => onHover(item.uci)}
            onMouseLeave={() => onHover(null)}
            onClick={(event) => {
              event.stopPropagation();
              if (!disabled) onPlay(item.uci);
            }}
          >
            <title>{`${item.san} · ${item.encounterCount} observed encounters`}</title>
            {lead && (
              <path
                d={lead}
                fill="none"
                stroke={color}
                strokeWidth={halfW * 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
              />
            )}
            <polygon
              className="arrow-hit"
              points={body}
              fill={color}
              opacity={opacity}
            />
            <g className="arrow-label" transform={`translate(${dest.x} ${Math.max(0.28, dest.y - 0.42)})`}>
              <rect
                x={-labelWidth / 2}
                y={-0.2}
                width={labelWidth}
                height={0.38}
                rx={0.08}
                fill="#12150fe6"
                stroke={color}
                strokeWidth={0.035}
              />
              <text x={0} y={0.08} textAnchor="middle" fontSize={0.22}>
                {caption}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
