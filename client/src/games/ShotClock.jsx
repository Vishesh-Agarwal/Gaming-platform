// A small countdown ring for timed turns (Blitz). Driven by the server's
// wall-clock `endsAt`; ticks locally so it stays smooth between snapshots.
import { useEffect, useState } from 'react';

export default function ShotClock({ endsAt, totalMs, active }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt || !totalMs) return null;
  const left = Math.max(0, endsAt - now);
  const secs = Math.ceil(left / 1000);
  const frac = Math.max(0, Math.min(1, left / totalMs));
  const R = 16, C = 2 * Math.PI * R;
  const urgent = left <= 5000;
  const color = urgent ? '#ff5d6c' : active ? '#2dd4bf' : '#9aa';

  return (
    <span className={`shotclock ${urgent ? 'urgent' : ''}`} title="Shot clock">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
        <circle
          cx="20" cy="20" r={R} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 20 20)"
        />
      </svg>
      <span className="shotclock-num" style={{ color }}>{secs}</span>
    </span>
  );
}
