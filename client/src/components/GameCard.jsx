// A game tile styled like a neon arcade cabinet. Pointer parallax tilts the card
// toward the cursor and moves a highlight; click opens the invite flow.
import { useRef } from 'react';
import { modeSummary, playerCountLabel } from '../games/gameMeta.js';

export default function GameCard({ game, onClick, onQuickPlay, searching = false }) {
  const Thumb = game.thumbnail;
  const ref = useRef(null);
  const modes = Array.isArray(game.modes) ? game.modes : [];
  const summary = modeSummary(game);

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-py * 7).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(px * 9).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(px * 100 + 50).toFixed(1)}%`);
    el.style.setProperty('--my', `${(py * 100 + 50).toFixed(1)}%`);
  };
  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  const onCardKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(game);
    }
  };

  return (
    <div
      ref={ref}
      className="game-card"
      role="button"
      tabIndex={0}
      style={{ '--card-accent': game.accent || 'var(--accent)' }}
      onClick={() => onClick(game)}
      onKeyDown={onCardKeyDown}
      onMouseMove={onMove}
      onMouseLeave={reset}
    >
      <div className="game-thumb">
        {Thumb ? <Thumb /> : <div className="game-thumb-fallback">🎮</div>}
        <span className="play-cta">▶ Play</span>
        {onQuickPlay && (
          <button
            type="button"
            className={`quick-cta${searching ? ' searching' : ''}`}
            disabled={searching}
            title={searching ? 'Searching for players' : 'Match with anyone online'}
            onClick={(e) => { e.stopPropagation(); if (!searching) onQuickPlay(game); }}
          >
            {searching ? 'Searching…' : 'Quick Play'}
          </button>
        )}
      </div>
      <div className="game-name">
        <span>{game.name}</span>
        <span className="players-tag">{playerCountLabel(game)}</span>
      </div>
      {(summary || modes.length > 0) && (
        <div className="game-facts" aria-label="Game modes">
          {summary && <span className="mode-count">{summary}</span>}
          {modes.slice(0, 2).map((mode) => (
            <span key={mode.id || mode.name} className="game-mode-chip">{mode.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}
