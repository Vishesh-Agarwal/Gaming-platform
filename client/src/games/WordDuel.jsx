import { useMemo, useState } from 'react';

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || `Player ${seat + 1}`;
}

function markRank(mark) {
  return mark === 'correct' ? 3 : mark === 'present' ? 2 : mark === 'absent' ? 1 : 0;
}

function keyboardMarks(rows) {
  const out = {};
  for (const row of rows) {
    row.guess.split('').forEach((letter, i) => {
      const mark = row.marks[i];
      if (markRank(mark) > markRank(out[letter])) out[letter] = mark;
    });
  }
  return out;
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="120" height="120" fill="#1d1a24" />
      <g transform="translate(18 18)">
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const palette = ['#3fc7ad', '#f2b049', '#2c2636', '#5fbf86', '#e8806a'];
            const fill = r < 3 ? palette[(r * 2 + c) % palette.length] : '#2c2636';
            return <rect key={`${r}-${c}`} x={c * 17} y={r * 17} width="13" height="13" rx="3" fill={fill} />;
          })
        )}
      </g>
      <path d="M29 105 H91" stroke="#f1ece5" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function Board({ title, rows, maxGuesses, wordLength, active, locked }) {
  return (
    <div className={`wd-board${active ? ' active' : ''}${locked ? ' locked' : ''}`}>
      <div className="wd-board-title">
        <span>{title}</span>
        {locked && <b>Locked</b>}
      </div>
      <div className="wd-grid" style={{ '--wd-len': wordLength }}>
        {Array.from({ length: maxGuesses }, (_, r) => {
          const row = rows[r];
          return Array.from({ length: wordLength }, (_, c) => {
            const letter = row?.guess?.[c] || '';
            const mark = row?.marks?.[c] || 'empty';
            return <span key={`${r}-${c}`} className={`wd-tile ${mark}`}>{letter}</span>;
          });
        })}
      </div>
      <div className="wd-row-notes">
        {rows.slice(-3).map((row, i) => (
          <span key={`${row.guess}-${i}`} className={row.improved ? 'hot' : ''}>
            {row.improved ? `Improved +${row.matchScore}` : `Match ${row.matchScore}`}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function WordDuel({ room, youAreIndex, onMove }) {
  const state = room.state;
  const [guess, setGuess] = useState('');
  const myRows = state.guesses?.[youAreIndex] || [];
  const oppIndex = youAreIndex === 0 ? 1 : 0;
  const oppRows = state.guesses?.[oppIndex] || [];
  const locked = !!state.locked?.[youAreIndex] || room.status !== 'playing';
  const keyboard = useMemo(() => keyboardMarks(myRows), [myRows]);
  const hints = state.hints || [];
  const hintsLeft = Math.max(0, 2 - hints.length);

  const submit = (event) => {
    event.preventDefault();
    const clean = guess.toUpperCase().replace(/[^A-Z]/g, '').slice(0, state.wordLength);
    if (clean.length !== state.wordLength || locked) return;
    onMove({ guess: clean });
    setGuess('');
  };

  const typeLetter = (letter) => {
    if (locked) return;
    setGuess((g) => `${g}${letter}`.slice(0, state.wordLength));
  };

  const status = () => {
    if (room.status === 'over') {
      if (state.draw) return `Draw. Answer: ${state.answer}`;
      return `${playerName(room, state.winner, youAreIndex)} solved ${state.answer}`;
    }
    if (state.locked?.[youAreIndex]) return 'Waiting for opponent';
    return 'Race to solve the word first';
  };

  return (
    <div className="wd">
      <div className="wd-hero">
        <span className="wd-kicker">Word Duel</span>
        <h3>{status()}</h3>
        <div className="wd-counts">
          <span>{myRows.length}/{state.maxGuesses} guesses</span>
          <span>{state.wordLength} letters</span>
          <span>{hintsLeft} hints</span>
        </div>
        <div className="wd-hints">
          {Array.from({ length: state.wordLength }, (_, i) => {
            const hint = hints.find((h) => h.index === i);
            return <span key={i} className={hint ? 'shown' : ''}>{hint?.letter || '_'}</span>;
          })}
        </div>
      </div>

      <div className="wd-boards">
        <Board
          title={playerName(room, youAreIndex, youAreIndex)}
          rows={myRows}
          maxGuesses={state.maxGuesses}
          wordLength={state.wordLength}
          active={!locked}
          locked={state.locked?.[youAreIndex]}
        />
        <Board
          title={playerName(room, oppIndex, youAreIndex)}
          rows={oppRows}
          maxGuesses={state.maxGuesses}
          wordLength={state.wordLength}
          active={false}
          locked={state.locked?.[oppIndex]}
        />
      </div>

      <form className="wd-entry" onSubmit={submit}>
        <input
          value={guess}
          disabled={locked}
          maxLength={state.wordLength}
          onChange={(e) => setGuess(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, state.wordLength))}
          placeholder={locked ? 'Board locked' : 'ENTER GUESS'}
          autoComplete="off"
        />
        <button disabled={locked || guess.length !== state.wordLength}>Guess</button>
        <button type="button" className="ghost" disabled={locked || hintsLeft <= 0} onClick={() => onMove({ type: 'hint' })}>Hint</button>
      </form>

      <div className="wd-keys">
        {KEY_ROWS.map((row) => (
          <div key={row} className="wd-key-row">
            {row.split('').map((letter) => (
              <button
                key={letter}
                type="button"
                className={`wd-key ${keyboard[letter] || ''}`}
                disabled={locked}
                onClick={() => typeLetter(letter)}
              >
                {letter}
              </button>
            ))}
          </div>
        ))}
        <div className="wd-key-row wd-actions">
          <button type="button" className="ghost" disabled={locked} onClick={() => setGuess((g) => g.slice(0, -1))}>Back</button>
          <button type="button" className="ghost" disabled={locked} onClick={() => setGuess('')}>Clear</button>
        </div>
      </div>
    </div>
  );
}
