// A draggable vertical power stick (5–100). Click or drag anywhere on the track
// to set power; shared by Pool and Carrom.
import { useRef } from 'react';

export default function PowerBar({ value, onChange }) {
  const ref = useRef(null);
  const set = (e) => {
    const r = ref.current.getBoundingClientRect();
    let v = 1 - (e.clientY - r.top) / r.height;
    v = Math.max(0, Math.min(1, v));
    onChange(Math.round(5 + v * 95));
  };
  const pct = ((value - 5) / 95) * 100;
  return (
    <div className="powerbar" title="Drag to set power">
      <div
        className="powerbar-track"
        ref={ref}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
        onPointerMove={(e) => { if (e.buttons) set(e); }}
      >
        <div className="powerbar-fill" style={{ height: `${pct}%` }} />
        <div className="powerbar-knob" style={{ bottom: `calc(${pct}% - 6px)` }} />
      </div>
      <span className="powerbar-label">{value}</span>
    </div>
  );
}
