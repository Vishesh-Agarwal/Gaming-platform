// Smash Karts lobby thumbnail — intentionally three-free so the lobby grid never
// pulls Three.js into the main bundle (the Karts component itself is lazy-loaded).
export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="kt-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#241a3a" />
          <stop offset="100%" stopColor="#10131f" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#kt-bg)" />
      <polygon points="20,88 100,88 86,58 34,58" fill="#1b2233" stroke="#3a4060" strokeWidth="1.5" />
      <g>
        <rect x="40" y="62" width="20" height="12" rx="3" fill="#ff5d6c" transform="rotate(-8 50 68)" />
        <rect x="68" y="68" width="20" height="12" rx="3" fill="#5cc8ff" transform="rotate(10 78 74)" />
      </g>
      <circle cx="60" cy="30" r="10" fill="#ffd24a" opacity="0.85" />
    </svg>
  );
}
