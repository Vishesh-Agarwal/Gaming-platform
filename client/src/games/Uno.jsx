import { useMemo, useState } from 'react';

const COLOR_ORDER = { red: 0, yellow: 1, green: 2, blue: 3 };
const VALUE_ORDER = { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, skip: 10, reverse: 11, draw2: 12, wild: 13, wildDraw4: 14 };

function playerName(room, seat, youAreIndex) {
  if (seat === youAreIndex) return 'You';
  return room.players.find((p) => p.index === seat)?.username || `Player ${seat + 1}`;
}

function cardLabel(card) {
  if (!card) return '';
  if (card.value === 'draw2') return '+2';
  if (card.value === 'wildDraw4') return '+4';
  if (card.value === 'reverse') return 'Rev';
  if (card.value === 'skip') return 'Skip';
  if (card.value === 'wild') return 'Wild';
  return card.value;
}

function canPlay(card, top, pendingDraw = 0) {
  if (pendingDraw > 0) return card?.value === 'draw2' || card?.value === 'wildDraw4';
  return card && top && (card.color === 'wild' || card.color === top.color || card.value === top.value);
}

function Card({ card, disabled = false, playable = false, onClick }) {
  return (
    <button
      type="button"
      className={`uno-card ${card?.color || 'back'}${playable ? ' playable' : ''}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={card ? `${card.color} ${cardLabel(card)}` : 'Card back'}
    >
      <span>{cardLabel(card) || 'CC'}</span>
      {card?.value && <small>{card.color}</small>}
    </button>
  );
}

export function Thumbnail() {
  const cards = [
    ['red', '7'],
    ['blue', 'Skip'],
    ['green', '+2'],
    ['yellow', 'Rev'],
  ];
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <rect width="120" height="120" fill="#19171f" />
      <g transform="translate(22 20) rotate(-8 38 40)">
        {cards.map(([color, label], i) => (
          <g key={`${color}-${label}`} transform={`translate(${i * 13} ${i % 2 ? 12 : 0}) rotate(${i * 8})`}>
            <rect width="35" height="54" rx="7" fill={`var(--uno-${color}, #fff)`} stroke="rgba(255,255,255,.55)" />
            <ellipse cx="17.5" cy="27" rx="12" ry="19" fill="rgba(255,255,255,.9)" />
            <text x="17.5" y="32" textAnchor="middle" fontFamily="sans-serif" fontSize="13" fontWeight="900" fill="#19171f">{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function Uno({ room, youAreIndex, onMove }) {
  const state = room.state;
  const hand = state.myHand || [];
  const [sortHand, setSortHand] = useState(false);
  const [wildColor, setWildColor] = useState('red');
  const myTurn = room.status === 'playing' && state.turn === youAreIndex && state.phase !== 'done';
  const direction = state.direction === -1 ? 'Counter-clockwise' : 'Clockwise';
  const lastSeat = state.lastPlay?.seat;
  const visibleHand = useMemo(() => {
    const indexed = hand.map((card, index) => ({ card, index }));
    if (!sortHand) return indexed;
    return indexed.slice().sort((a, b) => (
      (COLOR_ORDER[a.card.color] ?? 9) - (COLOR_ORDER[b.card.color] ?? 9)
      || (VALUE_ORDER[a.card.value] ?? 99) - (VALUE_ORDER[b.card.value] ?? 99)
    ));
  }, [hand, sortHand]);

  return (
    <div className="uno">
      <div className="uno-head">
        <div>
          <span className="uno-kicker">Color Cards</span>
          <h2>{myTurn ? 'Your turn' : `${playerName(room, state.turn, youAreIndex)} to play`}</h2>
        </div>
        <div className="uno-meta">
          <span>{direction}</span>
          <span>{state.deckCount || 0} in deck</span>
        </div>
      </div>

      <div className="uno-table">
        <div className="uno-pile">
          <span>Discard</span>
          <Card card={state.top} disabled />
        </div>
        <button type="button" className="uno-draw" disabled={!myTurn} onClick={() => onMove({ type: 'draw' })}>
          {state.pendingDraw ? `Draw ${state.pendingDraw}` : 'Draw Card'}
        </button>
        <div className="uno-pile">
          <span>Draw pile</span>
          <Card card={null} disabled />
        </div>
      </div>

      <div className="uno-players">
        {room.players.map((p) => (
          <div key={p.id} className={`${p.index === state.turn ? 'active' : ''} ${p.index === youAreIndex ? 'you' : ''}`}>
            <span>{playerName(room, p.index, youAreIndex)}</span>
            <b>{state.handCounts?.[p.index] ?? 0}</b>
            {p.index !== youAreIndex && state.handCounts?.[p.index] === 1 && !state.calledUno?.[p.index] && (
              <button type="button" className="uno-challenge" onClick={() => onMove({ type: 'challengeUno', target: p.index })}>Call</button>
            )}
          </div>
        ))}
      </div>

      {state.lastPlay && (
        <div className="uno-log">
          {state.lastPlay.draw
            ? `${playerName(room, lastSeat, youAreIndex)} drew ${state.lastPlay.count || 1}.`
            : state.lastPlay.callUno
              ? `${playerName(room, lastSeat, youAreIndex)} called UNO.`
              : state.lastPlay.challengeUno
                ? `${playerName(room, lastSeat, youAreIndex)} challenged ${playerName(room, state.lastPlay.target, youAreIndex)}.`
                : `${playerName(room, lastSeat, youAreIndex)} played ${state.lastPlay.card.color} ${cardLabel(state.lastPlay.card)}.`}
        </div>
      )}

      <div className="uno-tools">
        <div className="uno-wild-pick">
          {['red', 'yellow', 'green', 'blue'].map((c) => (
            <button key={c} type="button" className={`uno-dot ${c}${wildColor === c ? ' active' : ''}`} onClick={() => setWildColor(c)} aria-label={c} />
          ))}
        </div>
        <button type="button" className={state.calledUno?.[youAreIndex] ? '' : 'ghost'} disabled={hand.length !== 1} onClick={() => onMove({ type: 'callUno' })}>
          UNO
        </button>
        <button type="button" className={sortHand ? '' : 'ghost'} onClick={() => setSortHand((v) => !v)}>
          {sortHand ? 'Sorted' : 'Sort hand'}
        </button>
      </div>

      <div className="uno-hand" style={{ '--uno-hand-count': Math.max(hand.length, 1) }}>
        {visibleHand.map(({ card, index }) => {
          const playable = canPlay(card, state.top, state.pendingDraw || 0);
          return (
            <Card
              key={`${card.color}-${card.value}-${index}-${state.seq}`}
              card={card}
              playable={playable}
              disabled={!myTurn || !playable}
              onClick={() => onMove(card.color === 'wild' ? { index, color: wildColor } : { index })}
            />
          );
        })}
      </div>
    </div>
  );
}
