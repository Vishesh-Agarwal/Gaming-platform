// Carrom — 2-player board game. Server simulates each flick; this renders the
// board, takes aim input, replays the shot frames, then settles to state.
export function Thumbnail() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <rect x="6" y="6" width="88" height="88" rx="6" fill="#3a2a18" />
      <rect x="12" y="12" width="76" height="76" rx="3" fill="#caa46a" />
      {[[18, 18], [82, 18], [18, 82], [82, 82]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="6" fill="#1c140b" />
      ))}
      <circle cx="50" cy="50" r="16" fill="none" stroke="#9c7b46" strokeWidth="2" />
      <circle cx="50" cy="50" r="5" fill="#e4453a" />
      <circle cx="42" cy="50" r="4" fill="#f4f0e6" />
      <circle cx="58" cy="50" r="4" fill="#2a2a2a" />
    </svg>
  );
}

export default function Carrom() {
  return <div className="carrom-loading">Loading board…</div>;
}
