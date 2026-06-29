import { useEffect, useRef, useState } from 'react';

const COLORS = ['#18151c', '#f1ece5', '#f2b049', '#3fc7ad', '#e8806a', '#e85f70', '#5fbf86', '#5b8cff'];

function playerName(room, seat) {
  return room.players.find((p) => p.index === seat)?.username || `Player ${seat + 1}`;
}

function pathFrom(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 1000} ${p.y * 700}`).join(' ');
}

function hintedShape(shape, msLeft) {
  if (!shape || !shape.includes('_')) return shape;
  const elapsed = Math.max(0, 90000 - msLeft);
  const reveals = elapsed > 65000 ? 3 : elapsed > 45000 ? 2 : elapsed > 25000 ? 1 : 0;
  if (!reveals) return shape;
  let seen = 0;
  return shape.split('').map((ch, i) => {
    if (ch !== '_') return ch;
    if ((i + 1) % 3 === 0 && seen < reveals) {
      seen += 1;
      return '?';
    }
    return ch;
  }).join('');
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id="sk-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f1ece5" />
          <stop offset="100%" stopColor="#c9d8ee" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="#24202b" />
      <rect x="15" y="14" width="90" height="70" rx="7" fill="url(#sk-bg)" />
      <path d="M28 64 C40 34 52 75 64 48 S83 30 94 58" fill="none" stroke="#e85f70" strokeWidth="7" strokeLinecap="round" />
      <path d="M28 38 L48 28 L55 46 L36 56 Z" fill="#f2b049" stroke="#18151c" strokeWidth="3" />
      <g transform="translate(23 92)">
        <rect width="74" height="12" rx="6" fill="#18151c" />
        <circle cx="13" cy="6" r="4" fill="#3fc7ad" />
        <circle cx="31" cy="6" r="4" fill="#e8806a" />
        <circle cx="49" cy="6" r="4" fill="#5b8cff" />
        <circle cx="63" cy="6" r="4" fill="#f2b049" />
      </g>
    </svg>
  );
}

export default function Skribble({ room, youAreIndex, onMove }) {
  const state = room.state;
  const isDrawer = state.drawer === youAreIndex && room.status === 'playing';
  const isChoosing = state.phase === 'choosing';
  const isDrawing = state.phase === 'drawing';
  const canDraw = isDrawer && isDrawing;
  const alreadyGuessed = !!state.guessed?.[youAreIndex];
  const [color, setColor] = useState('#18151c');
  const [size, setSize] = useState(5);
  const [eraser, setEraser] = useState(false);
  const [replay, setReplay] = useState(false);
  const [replayPct, setReplayPct] = useState(100);
  const [guess, setGuess] = useState('');
  const [draft, setDraft] = useState([]);
  const [, tick] = useState(0);
  const drawing = useRef(false);
  const svgRef = useRef(null);

  useEffect(() => {
    setDraft([]);
    setReplay(false);
    setReplayPct(100);
    drawing.current = false;
  }, [state.turnNo, state.phase]);

  useEffect(() => {
    if (!room.turnEndsAt || room.status !== 'playing') return undefined;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [room.turnEndsAt, room.status]);

  const pointFor = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const startStroke = (event) => {
    if (!canDraw) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    setDraft([pointFor(event)]);
  };

  const moveStroke = (event) => {
    if (!drawing.current || !canDraw) return;
    const next = pointFor(event);
    setDraft((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.hypot(last.x - next.x, last.y - next.y) < 0.006) return prev;
      return [...prev, next].slice(-160);
    });
  };

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setDraft((points) => {
      if (points.length >= 2) onMove({ type: 'stroke', points, color: eraser ? '#f1ece5' : color, size: eraser ? Math.max(size, 12) : size });
      return [];
    });
  };

  const submitGuess = (event) => {
    event.preventDefault();
    const text = guess.trim();
    if (!text || isDrawer || alreadyGuessed || !isDrawing || room.status !== 'playing') return;
    onMove({ type: 'guess', text });
    setGuess('');
  };

  const turnTotal = isChoosing ? 20000 : 90000;
  const msLeft = room.turnEndsAt ? Math.max(0, room.turnEndsAt - Date.now()) : 0;
  const secondsLeft = Math.ceil(msLeft / 1000);
  const timerPct = room.turnEndsAt ? Math.max(0, Math.min(100, (msLeft / turnTotal) * 100)) : 0;
  const lowTime = secondsLeft <= 10;
  const currentWord = isDrawer ? (isChoosing ? 'Pick a word' : state.word) : (isChoosing ? 'Choosing...' : hintedShape(state.wordShape, msLeft));
  const drawerName = state.drawer == null ? 'No drawer' : playerName(room, state.drawer);
  const visibleStrokes = replay ? state.strokes.slice(0, Math.ceil((state.strokes.length * replayPct) / 100)) : state.strokes;

  return (
    <div className={`skrib ${isChoosing ? 'choosing' : ''}`}>
      <section className="skrib-stage">
        <div className="skrib-topline">
          <div>
            <span className="skrib-kicker">Round {state.round}/{state.maxRounds}</span>
            <b>{isChoosing ? `${drawerName} is choosing` : isDrawer ? 'Your word' : `${drawerName} is drawing`}</b>
          </div>
          <div className={`skrib-timer${lowTime ? ' low' : ''}`}>
            <svg viewBox="0 0 42 42" aria-hidden>
              <circle cx="21" cy="21" r="16" />
              <circle cx="21" cy="21" r="16" style={{ '--pct': timerPct }} />
            </svg>
            <span>{secondsLeft || 0}s</span>
          </div>
          <div className="skrib-word">{currentWord || 'Game over'}</div>
        </div>

        <div className="skrib-canvas-wrap">
          <svg
            ref={svgRef}
            className={`skrib-canvas${canDraw ? ' active' : ''}`}
            viewBox="0 0 1000 700"
            role="img"
            onPointerDown={startStroke}
            onPointerMove={moveStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={endStroke}
          >
            <rect width="1000" height="700" rx="16" fill="#f6f1e8" />
            {visibleStrokes.map((stroke) => (
              <path
                key={stroke.id}
                d={pathFrom(stroke.points)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.size * 2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {draft.length >= 2 && (
              <path
                d={pathFrom(draft)}
                fill="none"
                stroke={eraser ? '#f1ece5' : color}
                strokeWidth={(eraser ? Math.max(size, 12) : size) * 2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>

          {isChoosing && (
            <div className="skrib-choice-panel">
              {isDrawer ? (
                <>
                  <span className="skrib-kicker">Choose your prompt</span>
                  <div className="skrib-choice-grid">
                    {(state.choices || []).map((word) => (
                      <button key={word} type="button" onClick={() => onMove({ type: 'chooseWord', word })}>
                        {word}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="skrib-waiting">
                  <span className="skrib-kicker">Stand by</span>
                  <b>{drawerName}</b>
                  <p>is choosing from {state.choiceCount} prompts.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="skrib-tools">
          <div className="skrib-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`skrib-swatch${color === c ? ' selected' : ''}`}
                style={{ '--swatch': c }}
                disabled={!canDraw}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <label className="skrib-size">
            <span>Size</span>
            <input type="range" min="2" max="14" value={size} disabled={!canDraw} onChange={(e) => setSize(Number(e.target.value))} />
          </label>
          <button type="button" className={eraser ? '' : 'ghost'} disabled={!canDraw} onClick={() => setEraser((v) => !v)}>Eraser</button>
          <button type="button" className={replay ? '' : 'ghost'} disabled={!state.strokes.length} onClick={() => setReplay((v) => !v)}>Replay</button>
          {replay && (
            <input className="skrib-replay" type="range" min="0" max="100" value={replayPct} onChange={(e) => setReplayPct(Number(e.target.value))} />
          )}
          <button type="button" className="ghost" disabled={!canDraw} onClick={() => onMove({ type: 'clear' })}>Clear</button>
        </div>
      </section>

      <aside className="skrib-side">
        <div className="skrib-scores">
          {room.players.map((p) => (
            <div key={p.id} className={`skrib-score${p.index === state.drawer ? ' drawing' : ''}${state.guessed?.[p.index] && p.index !== state.drawer ? ' guessed' : ''}`}>
              <span>{p.index === youAreIndex ? 'You' : p.username}</span>
              <b>{state.scores?.[p.index] || 0}</b>
            </div>
          ))}
        </div>

        <div className="skrib-chat">
          <div className="skrib-chat-log">
            {state.chat.map((entry) => (
              <div key={entry.id} className={`skrib-msg ${entry.kind || 'system'}${entry.correct ? ' correct' : ''}`}>
                {entry.kind === 'guess' ? (
                  entry.correct ? (
                    <span><b>{playerName(room, entry.seat)}</b> guessed correctly.</span>
                  ) : (
                    <span><b>{playerName(room, entry.seat)}:</b> {entry.text}</span>
                  )
                ) : (
                  <span>{entry.text}</span>
                )}
              </div>
            ))}
          </div>
          <form className="skrib-guess" onSubmit={submitGuess}>
            <input
              value={guess}
              disabled={isDrawer || alreadyGuessed || !isDrawing || room.status !== 'playing'}
              onChange={(e) => setGuess(e.target.value)}
              placeholder={isChoosing ? 'Word is being chosen' : isDrawer ? 'Drawing turn' : alreadyGuessed ? 'Locked in' : 'Type a guess'}
              maxLength={48}
            />
            <button disabled={isDrawer || alreadyGuessed || !isDrawing || !guess.trim() || room.status !== 'playing'}>Send</button>
          </form>
        </div>
      </aside>
    </div>
  );
}
