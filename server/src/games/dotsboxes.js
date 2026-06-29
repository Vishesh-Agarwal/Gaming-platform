// Dots and Boxes - 2-player edge claiming game.

const DEFAULT_BOXES = 4;
const MODES = [
  { id: 'classic', name: 'Classic' },
  { id: 'race', name: 'Score Race' },
  { id: 'sudden', name: 'Sudden Box' },
];

const edgeKey = (dir, r, c) => `${dir}:${r}:${c}`;

export function createInitialState(options) {
  const boxes = Math.max(3, Math.min(6, Math.floor(Number(options?.size) || DEFAULT_BOXES)));
  const mode = MODES.some((m) => m.id === options?.mode) ? options.mode : 'classic';
  const totalBoxes = boxes * boxes;
  return {
    mode,
    boxes,
    dots: boxes + 1,
    targetScore: mode === 'race' ? Math.floor(totalBoxes / 2) + 1 : mode === 'sudden' ? 1 : totalBoxes,
    edges: [],
    owners: Array(boxes * boxes).fill(null),
    turn: 0,
    scores: [0, 0],
    lastEdge: null,
    history: [],
    seq: 0,
  };
}

function validEdge(edge, boxes) {
  const dots = boxes + 1;
  const dir = edge?.dir;
  const r = Number(edge?.r);
  const c = Number(edge?.c);
  if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
  if (dir === 'h' && r >= 0 && r < dots && c >= 0 && c < boxes) return { dir, r, c };
  if (dir === 'v' && r >= 0 && r < boxes && c >= 0 && c < dots) return { dir, r, c };
  return null;
}

function boxEdges(r, c) {
  return [
    edgeKey('h', r, c),
    edgeKey('h', r + 1, c),
    edgeKey('v', r, c),
    edgeKey('v', r, c + 1),
  ];
}

function completedBoxes(edgeSet, owners, boxes) {
  const done = [];
  for (let r = 0; r < boxes; r += 1) {
    for (let c = 0; c < boxes; c += 1) {
      const i = r * boxes + c;
      if (owners[i] !== null) continue;
      if (boxEdges(r, c).every((k) => edgeSet.has(k))) done.push(i);
    }
  }
  return done;
}

export function applyMove(state, seat, move) {
  if (getResult(state).over) return { error: 'Game is over.' };
  if (state.turn !== seat) return { error: 'Not your turn.' };
  const edge = validEdge(move, state.boxes);
  if (!edge) return { error: 'Choose a valid edge.' };
  const k = edgeKey(edge.dir, edge.r, edge.c);
  if (state.edges.includes(k)) return { error: 'Edge already taken.' };

  const edges = [...state.edges, k];
  const edgeSet = new Set(edges);
  const owners = state.owners.slice();
  const made = completedBoxes(edgeSet, owners, state.boxes);
  for (const i of made) owners[i] = seat;
  const scores = state.scores.slice();
  scores[seat] += made.length;

  return {
    state: {
      ...state,
      edges,
      owners,
      scores,
      turn: made.length ? seat : seat === 0 ? 1 : 0,
      lastEdge: { ...edge, by: seat, boxes: made },
      history: [...(state.history || []).slice(-9), { by: seat, ...edge, boxes: made.length }],
      seq: state.seq + 1,
    },
  };
}

export function getResult(state) {
  if (state.mode === 'sudden' && Math.max(...state.scores) >= 1) {
    const winner = state.scores[0] === state.scores[1] ? null : state.scores[0] > state.scores[1] ? 0 : 1;
    return { over: true, winner, draw: winner === null, scores: state.scores };
  }
  if (state.mode === 'race' && Math.max(...state.scores) >= state.targetScore) {
    const winner = state.scores[0] === state.scores[1] ? null : state.scores[0] > state.scores[1] ? 0 : 1;
    return { over: true, winner, draw: winner === null, scores: state.scores };
  }
  const full = state.owners.every((owner) => owner !== null);
  if (!full) return { over: false, winner: null, draw: false, scores: state.scores };
  const winner = state.scores[0] === state.scores[1] ? null : state.scores[0] > state.scores[1] ? 0 : 1;
  return { over: true, winner, draw: winner === null, scores: state.scores };
}

export default {
  id: 'dotsboxes',
  name: 'Dots & Boxes',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  optionsSpec: {
    size: { type: 'int', min: 3, max: 6, default: 4, label: 'Board size' },
  },
  modes: MODES,
  createInitialState,
  applyMove,
  getResult,
};
