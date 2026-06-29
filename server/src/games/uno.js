// Uno-style card game - compact multiplayer shedding game.

const COLORS = ['red', 'blue', 'green', 'yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
const HAND_SIZE = 7;

function nextRand(n) {
  return (Math.imul(n, 1664525) + 1013904223) >>> 0;
}

function makeDeck() {
  const deck = [];
  for (const color of COLORS) {
    for (const value of VALUES) deck.push({ color, value });
    for (const value of VALUES.slice(1)) deck.push({ color, value });
  }
  for (let i = 0; i < 4; i += 1) deck.push({ color: 'wild', value: 'wild' });
  for (let i = 0; i < 4; i += 1) deck.push({ color: 'wild', value: 'wildDraw4' });
  return deck;
}

function shuffle(seed, arr) {
  let n = seed >>> 0;
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    n = nextRand(n);
    const j = n % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const playable = (card, top, pendingDraw = 0) => {
  if (pendingDraw > 0) return card.value === 'draw2' || card.value === 'wildDraw4';
  return card.color === 'wild' || card.color === top.color || card.value === top.value;
};

function advance(turn, dir, count, steps = 1) {
  let t = turn;
  for (let i = 0; i < steps; i += 1) t = (t + dir + count) % count;
  return t;
}

function drawCards(secret, seat, n) {
  const hands = secret.hands.map((hand) => hand.slice());
  const deck = secret.deck.slice();
  for (let i = 0; i < n; i += 1) {
    if (!deck.length) break;
    hands[seat].push(deck.pop());
  }
  return { ...secret, hands, deck };
}

export function createInitialState(_options, seatCount = 2) {
  const seats = Math.max(2, Math.min(6, Number(seatCount) || 2));
  const seed = Math.floor(Math.random() * 0xffffffff);
  const deck = shuffle(seed, makeDeck());
  const hands = Array.from({ length: seats }, () => []);
  for (let i = 0; i < HAND_SIZE; i += 1) {
    for (let s = 0; s < seats; s += 1) hands[s].push(deck.pop());
  }
  let top = deck.pop();
  while (['skip', 'reverse', 'draw2', 'wild', 'wildDraw4'].includes(top.value)) {
    deck.unshift(top);
    top = deck.pop();
  }
  return {
    seatCount: seats,
    top,
    turn: 0,
    direction: 1,
    handCounts: hands.map((h) => h.length),
    scores: Array(seats).fill(0),
    phase: 'playing',
    pendingDraw: 0,
    calledUno: Array(seats).fill(false),
    lastPlay: null,
    seq: 0,
    secret: { hands, deck },
  };
}

export function applyMove(state, seat, move) {
  if (state.phase === 'done') return { error: 'Game is over.' };
  let secret = state.secret;

  if (move?.type === 'callUno') {
    if ((state.handCounts?.[seat] || 0) !== 1) return { error: 'You can call UNO at one card.' };
    const calledUno = (state.calledUno || Array(state.seatCount).fill(false)).slice();
    calledUno[seat] = true;
    return { state: { ...state, calledUno, lastPlay: { seat, callUno: true }, seq: state.seq + 1 } };
  }

  if (move?.type === 'challengeUno') {
    const target = Number(move?.target);
    if (!Number.isInteger(target) || target < 0 || target >= state.seatCount || target === seat) return { error: 'Choose another player.' };
    if ((state.handCounts?.[target] || 0) !== 1 || state.calledUno?.[target]) return { error: 'No missed UNO to challenge.' };
    secret = drawCards(secret, target, 2);
    const calledUno = (state.calledUno || Array(state.seatCount).fill(false)).slice();
    calledUno[target] = true;
    return {
      state: {
        ...state,
        secret,
        calledUno,
        handCounts: secret.hands.map((h) => h.length),
        lastPlay: { seat, challengeUno: true, target },
        seq: state.seq + 1,
      },
    };
  }

  if (state.turn !== seat) return { error: 'Not your turn.' };

  if (move?.type === 'draw') {
    const count = state.pendingDraw || 1;
    secret = drawCards(secret, seat, count);
    return {
      state: {
        ...state,
        secret,
        handCounts: secret.hands.map((h) => h.length),
        pendingDraw: 0,
        turn: advance(seat, state.direction, state.seatCount),
        lastPlay: { seat, draw: true, count },
        seq: state.seq + 1,
      },
    };
  }

  const index = Number(move?.index);
  const hand = secret.hands[seat] || [];
  if (!Number.isInteger(index) || index < 0 || index >= hand.length) return { error: 'Choose a card.' };
  const card = hand[index];
  if (!playable(card, state.top, state.pendingDraw || 0)) return { error: state.pendingDraw ? 'Stack a Draw 2 or draw the penalty.' : 'Card does not match color or value.' };
  let topCard = card;
  if (card.color === 'wild') {
    if (!COLORS.includes(move?.color)) return { error: 'Choose a wild color.' };
    topCard = { ...card, color: move.color, wild: true };
  }

  const hands = secret.hands.map((h) => h.slice());
  hands[seat].splice(index, 1);
  secret = { ...secret, hands };
  const scores = state.scores.slice();
  scores[seat] = HAND_SIZE - hands[seat].length;
  if (hands[seat].length === 0) {
    return {
      state: {
        ...state,
        top: topCard,
        secret,
        handCounts: hands.map((h) => h.length),
        scores,
        phase: 'done',
        pendingDraw: 0,
        lastPlay: { seat, card: topCard },
        seq: state.seq + 1,
      },
    };
  }

  let direction = state.direction;
  let steps = 1;
  let pendingDraw = state.pendingDraw || 0;
  if (card.value === 'reverse') {
    direction *= -1;
    if (state.seatCount === 2) steps = 2;
  } else if (card.value === 'skip') {
    steps = 2;
  } else if (card.value === 'draw2') {
    pendingDraw += 2;
  } else if (card.value === 'wildDraw4') {
    pendingDraw += 4;
  }
  const calledUno = (state.calledUno || Array(state.seatCount).fill(false)).slice();
  calledUno[seat] = hands[seat].length === 1 ? calledUno[seat] : false;

  return {
    state: {
      ...state,
      top: topCard,
      secret,
      direction,
      pendingDraw,
      calledUno,
      handCounts: secret.hands.map((h) => h.length),
      scores,
      turn: advance(seat, direction, state.seatCount, steps),
      lastPlay: { seat, card: topCard },
      seq: state.seq + 1,
    },
  };
}

export function getResult(state) {
  if (state.phase !== 'done') return { over: false, winner: null, draw: false, scores: state.scores };
  const winner = state.handCounts.findIndex((n) => n === 0);
  return { over: true, winner, draw: false, scores: state.scores };
}

export function publicState(state, seat) {
  const { secret, ...pub } = state;
  return {
    ...pub,
    myHand: secret?.hands?.[seat] || [],
    deckCount: secret?.deck?.length || 0,
  };
}

export default {
  id: 'uno',
  name: 'Color Cards',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 6,
  createInitialState,
  applyMove,
  getResult,
  publicState,
};
