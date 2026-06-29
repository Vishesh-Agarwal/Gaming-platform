import { useState } from 'react';

const TEAM_NAMES = ['Red', 'Blue'];

function roleClass(role) {
  return role ? `role-${role}` : '';
}

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || `Player ${seat + 1}`;
}

export function Thumbnail() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="120" height="120" fill="#1d1a24" />
      <g transform="translate(15 18)">
        {Array.from({ length: 25 }, (_, i) => (
          <rect key={i} x={(i % 5) * 18} y={Math.floor(i / 5) * 16} width="15" height="12" rx="2" fill={i % 7 === 0 ? '#e85f70' : i % 5 === 0 ? '#5b8cff' : '#f1ece5'} opacity="0.9" />
        ))}
      </g>
    </svg>
  );
}

export default function Codenames({ room, youAreIndex, onMove }) {
  const state = room.state;
  const [word, setWord] = useState('');
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const myTurn = room.status === 'playing' && state.turn === youAreIndex;
  const teamId = state.teams?.[youAreIndex] ?? 0;
  const isSpy = state.spymasters?.includes(youAreIndex);
  const votes = state.votes || {};

  const submitClue = (event) => {
    event.preventDefault();
    if (!word.trim()) return;
    onMove({ word, count });
    setWord('');
  };
  const submitNote = (event) => {
    event.preventDefault();
    if (!note.trim()) return;
    onMove({ type: 'teamNote', text: note });
    setNote('');
  };

  return (
    <div className="code">
      <div className="code-head">
        <span className={`code-team t${teamId}`}>{TEAM_NAMES[teamId]} {isSpy ? 'Spymaster' : 'Guesser'}</span>
        <span>{state.phase === 'clue' ? `${TEAM_NAMES[state.turnTeam]} clue` : `${TEAM_NAMES[state.turnTeam]} guesses`}</span>
        {state.deck && <span className="code-deck">{state.deck}</span>}
        {state.clue && <b>{state.clue.word} · {state.clue.count}</b>}
      </div>
      <div className="code-grid">
        {state.cards.map((card, i) => (
          <button
            key={`${card.word}-${i}`}
            className={`code-card ${roleClass(card.role)}${card.revealed ? ' revealed' : ''}`}
            disabled={!myTurn || state.phase !== 'guess' || isSpy || card.revealed}
            onClick={() => onMove({ index: i })}
          >
            <span>{card.word}</span>
            {card.role && <small>{card.role}</small>}
            {votes[i]?.length > 0 && <em>{votes[i].length}</em>}
          </button>
        ))}
      </div>
      <div className="code-panel">
        <div className="code-notes">
          <div className="code-note-log">
            {(state.teamNotes || []).slice(-4).map((row) => (
              <span key={row.id}><b>{playerName(room, row.seat, youAreIndex)}:</b> {row.text}</span>
            ))}
          </div>
          <form className="code-note-form" onSubmit={submitNote}>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Team note" />
            <button className="ghost" disabled={!note.trim()}>Send</button>
          </form>
        </div>
        {state.phase === 'clue' && isSpy && myTurn && (
          <form className="code-clue" onSubmit={submitClue}>
            <input value={word} onChange={(e) => setWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} placeholder="CLUE" />
            <input type="number" min="1" max="4" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            <button>Give clue</button>
          </form>
        )}
        {state.phase === 'guess' && !isSpy && myTurn && (
          <>
            <div className="code-votes">
              {state.cards.map((card, i) => (
                !card.revealed && <button key={card.word} className="ghost" onClick={() => onMove({ type: 'vote', index: i })}>{card.word}</button>
              ))}
            </div>
            <button className="ghost" onClick={() => onMove({ endTurn: true })}>End turn</button>
          </>
        )}
      </div>
    </div>
  );
}
