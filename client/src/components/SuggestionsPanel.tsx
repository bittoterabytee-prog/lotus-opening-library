import type { CSSProperties } from 'react';
import type { Suggestion } from '../types';
import { ARROW_COLORS } from './MoveArrows';

type Props = {
  suggestions: Suggestion[];
  disabled?: boolean;
  hoverUci: string | null;
  onHover: (uci: string | null) => void;
  onPlay: (uci: string) => void;
};

export function SuggestionsPanel({ suggestions, disabled, hoverUci, onHover, onPlay }: Props) {
  if (suggestions.length === 0) {
    return (
      <p className="arrow-hint">No known moves yet. Arrows appear after you record a line. Enter the move you see on Lotus Chess.</p>
    );
  }

  return (
    <div className="arrow-legend" aria-label="Known continuations">
      {suggestions.map((item, index) => (
        <button
          key={item.uci}
          type="button"
          className={`legend-chip${hoverUci === item.uci ? ' is-hover' : ''}`}
          style={{ '--chip': ARROW_COLORS[index % ARROW_COLORS.length] } as CSSProperties}
          disabled={disabled}
          onMouseEnter={() => onHover(item.uci)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(item.uci)}
          onBlur={() => onHover(null)}
          onClick={() => onPlay(item.uci)}
        >
          <span className="legend-swatch" />
          <strong>{item.san}</strong>
          <span>{item.percentage}%</span>
          <span className="count">{item.encounterCount}×</span>
        </button>
      ))}
    </div>
  );
}
