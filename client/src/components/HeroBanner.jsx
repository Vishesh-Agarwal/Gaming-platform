// Featured-game banner at the top of Home: big key art over a cinematic
// accent gradient, with Play / Quick Play CTAs.
export default function HeroBanner({ game, onPlay, onQuickPlay, searching = false }) {
  if (!game) return null;
  const Thumb = game.thumbnail;
  return (
    <section className="hero-banner" style={{ '--card-accent': game.accent || 'var(--accent)' }}>
      <div className="hero-copy">
        <span className="hero-kicker">Featured</span>
        <h2>{game.name}</h2>
        {game.rules && <p>{game.rules}</p>}
        <div className="hero-actions">
          <button type="button" onClick={() => onPlay(game)}>▶ Play</button>
          {onQuickPlay && (
            <button type="button" className="ghost" disabled={searching} onClick={() => onQuickPlay(game)}>
              {searching ? 'Searching…' : 'Quick Play'}
            </button>
          )}
        </div>
      </div>
      <div className="hero-art" aria-hidden>{Thumb ? <Thumb /> : null}</div>
    </section>
  );
}
