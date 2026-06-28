// Pool — 2-player cue sports. Server simulates each shot; this renders the table,
// takes aim input, replays the shot frames, then settles to state.
export function Thumbnail() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <rect x="6" y="20" width="88" height="60" rx="8" fill="#5a3a20" />
      <rect x="12" y="26" width="76" height="48" rx="4" fill="#1f7a4d" />
      {[[16, 30], [50, 28], [84, 30], [16, 70], [50, 72], [84, 70]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="4.5" fill="#0c1f16" />
      ))}
      <circle cx="34" cy="50" r="5" fill="#f4f0e6" />
      <circle cx="50" cy="50" r="5" fill="#2a2a2a" />
      <circle cx="62" cy="46" r="5" fill="#e4b53a" />
      <circle cx="62" cy="55" r="5" fill="#d8453a" />
    </svg>
  );
}

export default function Pool() {
  return <div className="pool-loading">Loading table…</div>;
}
