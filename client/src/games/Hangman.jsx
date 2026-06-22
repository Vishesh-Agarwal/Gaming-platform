// Hangman — 2-player word-setter duel, scored over N rounds (client). Server is
// authoritative and hides the secret word (rooms.publicRoom strips state.secret);
// the hint is public. A round = two legs (each player guesses once). Per leg:
// solve -> 10 - wrong, miss -> 0. Phases: setting -> guessing -> legover ->
// (after both legs) roundover -> ... -> done.
import { useEffect, useRef, useState } from 'react';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="hm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a2440" />
          <stop offset="100%" stopColor="#171327" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="url(#hm-bg)" />
      <g stroke="#b39ddb" strokeWidth="4" fill="none" strokeLinecap="round">
        <line x1="24" y1="100" x2="64" y2="100" />
        <line x1="40" y1="100" x2="40" y2="22" />
        <line x1="40" y1="22" x2="82" y2="22" />
        <line x1="82" y1="22" x2="82" y2="36" />
      </g>
      <circle cx="82" cy="44" r="8" fill="none" stroke="#ff8ad1" strokeWidth="4" />
      <line x1="82" y1="52" x2="82" y2="74" stroke="#ff8ad1" strokeWidth="4" strokeLinecap="round" />
      <line x1="82" y1="58" x2="72" y2="68" stroke="#ff8ad1" strokeWidth="4" strokeLinecap="round" />
      <line x1="82" y1="58" x2="92" y2="68" stroke="#ff8ad1" strokeWidth="4" strokeLinecap="round" />
      <text x="20" y="118" fontFamily="monospace" fontSize="13" fill="#8b7fc7">_ _ A _</text>
    </svg>
  );
}

function Gallows({ wrong }) {
  const stroke = wrong >= 6 ? '#ff5d6c' : '#c9bdf0';
  return (
    <svg viewBox="0 0 160 180" width="180" height="200">
      <g stroke="#7c6fb0" strokeWidth="6" strokeLinecap="round" fill="none">
        <line x1="20" y1="168" x2="100" y2="168" />
        <line x1="45" y1="168" x2="45" y2="16" />
        <line x1="45" y1="16" x2="120" y2="16" />
        <line x1="120" y1="16" x2="120" y2="34" />
      </g>
      <g stroke={stroke} strokeWidth="5" strokeLinecap="round" fill="none">
        {wrong >= 1 && <circle cx="120" cy="48" r="14" />}
        {wrong >= 2 && <line x1="120" y1="62" x2="120" y2="104" />}
        {wrong >= 3 && <line x1="120" y1="74" x2="102" y2="90" />}
        {wrong >= 4 && <line x1="120" y1="74" x2="138" y2="90" />}
        {wrong >= 5 && <line x1="120" y1="104" x2="104" y2="128" />}
        {wrong >= 6 && <line x1="120" y1="104" x2="136" y2="128" />}
      </g>
    </svg>
  );
}

export default function Hangman({ room, youAreIndex, onMove }) {
  const st = room.state;
  const {
    phase, round, totalRounds, leg, setter, guesser, wordLength, revealed, guessed,
    wrong, maxWrong, hint, scores, roundPoints, legResult, history,
  } = st;
  const iAmSetter = youAreIndex === setter;
  const iAmGuesser = youAreIndex === guesser;
  const myTurn = room.status === 'playing' && st.turn === youAreIndex;
  const opp = 1 - youAreIndex;

  const [wordInput, setWordInput] = useState('');
  const [hintInput, setHintInput] = useState('');
  const [countdown, setCountdown] = useState(null);
  const nextSentRef = useRef(false);
  const lastSeqRef = useRef(st.seq);
  const boomRef = useRef(null);

  const them = (idx) =>
    idx === youAreIndex ? 'You' : room.players.find((p) => p.index === idx)?.username || 'Opponent';

  useEffect(() => { setWordInput(''); setHintInput(''); }, [phase, round, leg]);

  // reset the advance guard whenever the server state changes
  useEffect(() => {
    if (st.seq !== lastSeqRef.current) {
      lastSeqRef.current = st.seq;
      nextSentRef.current = false;
      setCountdown(null);
    }
  }, [st.seq]);

  const advance = () => {
    if (nextSentRef.current) return;
    nextSentRef.current = true;
    onMove({ next: true });
  };

  // physical keyboard for the guesser
  useEffect(() => {
    if (!(phase === 'guessing' && iAmGuesser && myTurn)) return;
    const onKey = (e) => {
      const L = e.key.toUpperCase();
      if (/^[A-Z]$/.test(L) && !guessed.includes(L)) onMove({ letter: L });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, iAmGuesser, myTurn, guessed, onMove]);

  // legover: auto-advance after a short reveal
  useEffect(() => {
    if (phase !== 'legover') return;
    let n = 3;
    setCountdown(n);
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(id); setCountdown(0); advance(); }
      else setCountdown(n);
    }, 850);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, st.seq]);

  // explosion when a leg ends in a miss
  useEffect(() => {
    if (phase !== 'legover' || !legResult || legResult.solved) return;
    const canvas = boomRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ox = W * 0.75, oy = H * 0.42;
    const colors = ['#ff5d6c', '#ffb24d', '#b388ff', '#22e0ff', '#ffffff'];
    const parts = Array.from({ length: 64 }, () => {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 5.5;
      return { x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, life: 1,
        size: 2 + Math.random() * 4, col: colors[(Math.random() * colors.length) | 0] };
    });
    let raf, last = performance.now(), start = last;
    const loop = (now) => {
      const dt = Math.min(2.5, (now - last) / 16.67); last = now;
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of parts) {
        p.vy += 0.12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= 0.013 * dt;
        if (p.life > 0) {
          alive = true;
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.col;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.globalAlpha = 1;
      if (alive && now - start < 2200) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, legResult]);

  const submitWord = (e) => {
    e.preventDefault();
    const w = wordInput.toUpperCase().replace(/[^A-Z]/g, '');
    const h = hintInput.trim();
    if (w.length < 3 || w.length > 12 || !h) return;
    onMove({ word: w, hint: h });
  };

  const wrongLetters = guessed.filter((L) => !(revealed || []).includes(L));

  const statusText = () => {
    if (phase === 'done') return 'Match over';
    if (phase === 'roundover') return `Round ${round} complete`;
    if (phase === 'legover') return legResult ? `${them(legResult.guesser)} ${legResult.solved ? 'solved it' : 'missed'}` : '';
    if (phase === 'setting') return iAmSetter ? `Set a word for ${them(guesser)}` : `${them(setter)} is choosing a word…`;
    return iAmGuesser ? 'Your guess' : `${them(guesser)} is guessing your word`;
  };

  // word tiles: during legover, reveal the whole word (missed letters in red)
  const renderWord = () => {
    if (phase === 'legover' && legResult) {
      return legResult.word.split('').map((ch, i) => {
        const got = (revealed || [])[i] != null;
        return <span key={i} className={`hm-tile ${got ? 'shown' : 'missed'}`}>{ch}</span>;
      });
    }
    return (revealed || []).map((c, i) => (
      <span key={i} className={`hm-tile ${c ? 'shown' : ''}`}>{c || ''}</span>
    ));
  };

  return (
    <div className="hm-wrap">
      <div className="hm-status">
        <span className="hm-round">ROUND {round}/{totalRounds}</span>
        <span>{statusText()}</span>
        <span className="hm-score-chip">
          You <b>{scores[youAreIndex]}</b> · {them(opp)} <b>{scores[opp]}</b>
        </span>
      </div>

      {phase === 'setting' && iAmSetter && (
        <form className="hm-setform" onSubmit={submitWord}>
          <input className="hm-input" value={wordInput} autoFocus placeholder="SECRET WORD"
            maxLength={12}
            onChange={(e) => setWordInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 12))} />
          <input className="hm-hintinput" value={hintInput} placeholder="Hint for your opponent"
            maxLength={60} onChange={(e) => setHintInput(e.target.value)} />
          <button type="submit" disabled={wordInput.length < 3 || !hintInput.trim()}>Set word</button>
          <p className="hm-hint muted">3–12 letters + a hint. {them(guesser)} sees only the hint.</p>
        </form>
      )}

      {phase === 'setting' && !iAmSetter && (
        <p className="hm-wait muted">⏳ {them(setter)} is thinking of a word…</p>
      )}

      {(phase === 'guessing' || phase === 'legover') && (
        <>
          {hint && <div className="hm-hintbar">💡 <b>Hint:</b> {hint}</div>}
          <div className="hm-stage">
            <div className="hm-gallows-wrap">
              <Gallows wrong={wrong} />
              <canvas ref={boomRef} className="hm-boom" />
            </div>
            <div className="hm-right">
              <div className="hm-word">{renderWord()}</div>
              <div className="hm-misses">
                <span>Misses {wrong}/{maxWrong}</span>
                {wrongLetters.length > 0 && <span className="hm-wrongs">{wrongLetters.join(' ')}</span>}
              </div>
            </div>
          </div>
        </>
      )}

      {phase === 'guessing' && iAmGuesser && (
        <div className="hm-keyboard">
          {ALPHABET.map((L) => {
            const used = guessed.includes(L);
            const isWrong = used && !(revealed || []).includes(L);
            return (
              <button key={L} className={`hm-key ${used ? (isWrong ? 'wrong' : 'right') : ''}`}
                disabled={used || !myTurn} onClick={() => onMove({ letter: L })}>{L}</button>
            );
          })}
        </div>
      )}

      {phase === 'guessing' && iAmSetter && (
        <p className="hm-wait muted">👀 Watching {them(guesser)} guess your word…</p>
      )}

      {phase === 'legover' && legResult && (
        <div className="hm-legover">
          <div className={`hm-legmsg ${legResult.solved ? 'good' : 'bad'}`}>
            {them(legResult.guesser)} {legResult.solved ? 'solved' : 'missed'} <b>{legResult.word}</b>
            <span className="hm-pts">+{legResult.points}</span>
          </div>
          <button className="hm-skip" type="button" onClick={advance}>
            {countdown != null ? `Continue (${countdown})` : 'Continue'} ▶
          </button>
        </div>
      )}

      {(phase === 'roundover' || phase === 'done') && (
        <Scoreboard
          phase={phase} round={round} totalRounds={totalRounds} history={history}
          scores={scores} youAreIndex={youAreIndex} them={them}
          result={room.result} onContinue={advance}
        />
      )}
    </div>
  );
}

function Scoreboard({ phase, round, totalRounds, history, scores, youAreIndex, them, result, onContinue }) {
  const opp = 1 - youAreIndex;
  const done = phase === 'done';
  const outcome = !done ? null
    : scores[youAreIndex] === scores[opp] ? 'DRAW'
    : scores[youAreIndex] > scores[opp] ? 'YOU WIN' : 'YOU LOSE';

  return (
    <div className="hm-board">
      <div className="hm-board-title">{done ? outcome : `Round ${round} of ${totalRounds} complete`}</div>
      <div className="hm-board-final">
        <span>You <b>{scores[youAreIndex]}</b></span>
        <span className="hm-vs">vs</span>
        <span>{them(opp)} <b>{scores[opp]}</b></span>
      </div>
      {history.length > 0 && (
        <table className="hm-table">
          <thead>
            <tr><th>Round</th><th>You</th><th>{them(opp)}</th></tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.round}>
                <td>{h.round}</td>
                <td>+{h.points[youAreIndex]}</td>
                <td>+{h.points[opp]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!done && <button className="hm-skip" type="button" onClick={onContinue}>Next round ▶</button>}
    </div>
  );
}
