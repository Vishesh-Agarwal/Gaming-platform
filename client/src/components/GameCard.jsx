// A game tile styled like a neon arcade cabinet. Pointer parallax tilts the card
// toward the cursor and moves a highlight; click opens the invite flow.
import { useRef } from 'react';

export default function GameCard({ game, onClick, onQuickPlay }) {
  const Thumb = game.thumbnail;
  const ref = useRef(null);

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

  return (
    <button
      ref={ref}
      className="game-card"
      style={{ '--card-accent': game.accent || 'var(--accent)' }}
      onClick={() => onClick(game)}
      onMouseMove={onMove}
      onMouseLeave={reset}
    >
      <div className="game-thumb">
        {Thumb ? <Thumb /> : <div className="game-thumb-fallback">🎮</div>}
        <span className="play-cta">▶ Play</span>
        {onQuickPlay && (
          <span
            className="quick-cta"
            role="button"
            tabIndex={0}
            title="Match with anyone online"
            onClick={(e) => { e.stopPropagation(); onQuickPlay(game); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onQuickPlay(game); } }}
          >
            ⚡ Quick Play
          </span>
        )}
      </div>
      <div className="game-name">
        <span>{game.name}</span>
        <span className="players-tag">1v1</span>
      </div>
    </button>
  );
}
