// A game tile: artwork (image) on top, name below. Click to open the invite flow.
export default function GameCard({ game, onClick }) {
  const Thumb = game.thumbnail;
  return (
    <button
      className="game-card"
      style={{ '--card-accent': game.accent || 'var(--accent)' }}
      onClick={() => onClick(game)}
    >
      <div className="game-thumb">
        {Thumb ? <Thumb /> : <div className="game-thumb-fallback">🎮</div>}
      </div>
      <div className="game-name">{game.name}</div>
    </button>
  );
}
