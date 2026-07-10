import { useEffect, useRef, useState } from 'react';

const COLORS = ['#18151c', '#f1ece5', '#f2b049', '#3fc7ad', '#e8806a', '#e85f70', '#5fbf86', '#5b8cff'];
const CANVAS_BG = '#f6f1e8';
const STREAM_POINTS = 10;
const STREAM_MS = 70;

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
  const draftRef = useRef([]);
  const lastFlushAt = useRef(0);

  useEffect(() => {
    setDraft([]);
    setReplay(false);
    setReplayPct(100);
    drawing.current = false;
    draftRef.current = [];
    lastFlushAt.current = 0;
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
    // Block the native selection drag: without this, holding a stroke past the
    // canvas edge makes the browser auto-scroll the page to extend a selection.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    lastFlushAt.current = performance.now();
    const start = [pointFor(event)];
    draftRef.current = start;
    setDraft(start);
  };

  const flushDraftSegment = (force = false) => {
    const points = draftRef.current;
    const now = performance.now();
    if (points.length < 2) return;
    if (!force && points.length < STREAM_POINTS && now - lastFlushAt.current < STREAM_MS) return;
    onMove({
      type: 'stroke',
      points,
      color: eraser ? CANVAS_BG : color,
      size: eraser ? Math.max(size, 12) : size,
    });
    const tail = points.at(-1);
    draftRef.current = tail ? [tail] : [];
    setDraft(draftRef.current);
    lastFlushAt.current = now;
  };

  const moveStroke = (event) => {
    if (!drawing.current || !canDraw) return;
    const next = pointFor(event);
    const last = draftRef.current[draftRef.current.length - 1];
    if (last && Math.hypot(last.x - next.x, last.y - next.y) < 0.006) return;
    const points = [...draftRef.current, next];
    draftRef.current = points;
    setDraft(points);
    flushDraftSegment(false);
  };

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    flushDraftSegment(true);
    draftRef.current = [];
    setDraft([]);
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
  const rankedPlayers = [...room.players].sort((a, b) => (state.scores?.[b.index] || 0) - (state.scores?.[a.index] || 0) || a.index - b.index);

  return (
    <div className={`skrib ${isChoosing ? 'choosing' : ''}`}>
      <aside className="skrib-side skrib-players" aria-label="Players">
        <div className="skrib-panel-title">
          <span>Players</span>
          <b>{room.players.length}</b>
        </div>
        <div className="skrib-scores">
          {rankedPlayers.map((p, rank) => {
            const drawing = p.index === state.drawer;
            const guessed = state.guessed?.[p.index] && p.index !== state.drawer;
            return (
              <div key={p.id} className={`skrib-score${drawing ? ' drawing' : ''}${guessed ? ' guessed' : ''}`}>
                <span className="skrib-rank">{rank + 1}</span>
                <span className="skrib-avatar">{(p.index === youAreIndex ? 'Y' : p.username?.[0] || 'P').toUpperCase()}</span>
                <span className="skrib-score-main">
                  <span>{p.index === youAreIndex ? 'You' : p.username}</span>
                  <small className="skrib-score-meta">{drawing ? 'Drawing' : guessed ? 'Guessed' : 'Guessing'}</small>
                </span>
                <b>{state.scores?.[p.index] || 0}</b>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="skrib-stage skrib-board">
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
            <rect width="1000" height="700" rx="16" fill={CANVAS_BG} />
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
                stroke={eraser ? CANVAS_BG : color}
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

      <aside className="skrib-side skrib-chat-panel" aria-label="Guesses">
        <div className="skrib-chat-title">
          <span>Guesses</span>
          <b>{state.chat.filter((entry) => entry.kind === 'guess').length}</b>
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
