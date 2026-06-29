// Battleship - 2-player hidden-fleet turn game.

const SIZE = 10;
export const FLEET = [
  { id: 'carrier', name: 'Carrier', size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'destroyer', name: 'Destroyer', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'patrol', name: 'Patrol Boat', size: 2 },
];

const key = (x, y) => `${x},${y}`;

function emptyBoard() {
  return { ready: false, ships: [], shots: [] };
}

export function createInitialState() {
  return {
    size: SIZE,
    fleet: FLEET,
    boards: [emptyBoard(), emptyBoard()],
    phase: 'setup',
    turn: null,
    lastShot: null,
    scans: [1, 1],
    scanResults: [[], []],
    scores: [0, 0],
    seq: 0,
  };
}

function normalizeCells(cells) {
  if (!Array.isArray(cells)) return null;
  const out = cells.map((c) => ({ x: Number(c?.x), y: Number(c?.y) }));
  if (out.some((c) => !Number.isInteger(c.x) || !Number.isInteger(c.y) || c.x < 0 || c.y < 0 || c.x >= SIZE || c.y >= SIZE)) {
    return null;
  }
  return out;
}

function validateShip(ship, spec, occupied) {
  if (ship?.id !== spec.id) return `${spec.name} is missing.`;
  const cells = normalizeCells(ship.cells);
  if (!cells || cells.length !== spec.size) return `${spec.name} must cover ${spec.size} cells.`;

  const unique = new Set(cells.map((c) => key(c.x, c.y)));
  if (unique.size !== cells.length) return `${spec.name} overlaps itself.`;

  const xs = [...new Set(cells.map((c) => c.x))];
  const ys = [...new Set(cells.map((c) => c.y))];
  const straight = xs.length === 1 || ys.length === 1;
  if (!straight) return `${spec.name} must be straight.`;
  const sorted = cells.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const adjacent = xs.length === 1
      ? cur.x === prev.x && cur.y === prev.y + 1
      : cur.y === prev.y && cur.x === prev.x + 1;
    if (!adjacent) return `${spec.name} must be contiguous.`;
  }
  for (const c of cells) {
    const k = key(c.x, c.y);
    if (occupied.has(k)) return 'Ships cannot overlap.';
    occupied.add(k);
  }
  return null;
}

function validateFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return { error: 'Place every ship.' };
  const byId = new Map(ships.map((ship) => [ship?.id, ship]));
  const occupied = new Set();
  const clean = [];
  for (const spec of FLEET) {
    const ship = byId.get(spec.id);
    const error = validateShip(ship, spec, occupied);
    if (error) return { error };
    clean.push({ id: spec.id, name: spec.name, size: spec.size, cells: normalizeCells(ship.cells), hits: [] });
  }
  return { ships: clean };
}

function shipAt(board, x, y) {
  return board.ships.find((ship) => ship.cells.some((c) => c.x === x && c.y === y)) || null;
}

function allSunk(board) {
  return board.ships.length > 0 && board.ships.every((ship) => ship.hits.length >= ship.size);
}

function scanArea(board, x, y) {
  let ships = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
      if (shipAt(board, cx, cy)) ships += 1;
    }
  }
  return ships;
}

export function applyMove(state, seat, move) {
  if (state.phase === 'done') return { error: 'Game is over.' };
  if (seat !== 0 && seat !== 1) return { error: 'Invalid player.' };

  if (state.phase === 'setup') {
    if (move?.type !== 'place') return { error: 'Place your fleet first.' };
    const { ships, error } = validateFleet(move.ships);
    if (error) return { error };
    const boards = state.boards.map((board, i) => (i === seat ? { ready: true, ships, shots: [] } : board));
    const bothReady = boards.every((board) => board.ready);
    return {
      state: {
        ...state,
        boards,
        phase: bothReady ? 'playing' : 'setup',
        turn: bothReady ? 0 : null,
        seq: state.seq + 1,
      },
    };
  }

  if (state.turn !== seat) return { error: 'Not your turn.' };
  const x = Number(move?.x);
  const y = Number(move?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
    return { error: 'Choose a target on the board.' };
  }

  if (move?.type === 'scan') {
    if ((state.scans?.[seat] || 0) <= 0) return { error: 'Radar scan already used.' };
    const opponent = seat === 0 ? 1 : 0;
    const scans = (state.scans || [1, 1]).slice();
    scans[seat] -= 1;
    const scanResults = (state.scanResults || [[], []]).map((arr) => arr.slice());
    scanResults[seat].push({ x, y, ships: scanArea(state.boards[opponent], x, y) });
    return {
      state: {
        ...state,
        scans,
        scanResults,
        turn: opponent,
        lastShot: { by: seat, x, y, result: 'scan' },
        seq: state.seq + 1,
      },
    };
  }

  if (move?.type !== 'fire') return { error: 'Fire at a target.' };

  const boards = state.boards.map((board) => ({
    ...board,
    ships: board.ships.map((ship) => ({ ...ship, cells: ship.cells.map((c) => ({ ...c })), hits: ship.hits.map((h) => ({ ...h })) })),
    shots: board.shots.map((shot) => ({ ...shot })),
  }));
  const shooter = boards[seat];
  const target = boards[seat === 0 ? 1 : 0];
  if (shooter.shots.some((shot) => shot.x === x && shot.y === y)) return { error: 'You already fired there.' };

  const ship = shipAt(target, x, y);
  let result = 'miss';
  let sunk = null;
  if (ship) {
    result = 'hit';
    if (!ship.hits.some((h) => h.x === x && h.y === y)) ship.hits.push({ x, y });
    if (ship.hits.length >= ship.size) {
      result = 'sunk';
      sunk = ship.id;
    }
  }
  shooter.shots.push({ x, y, result, sunk });
  const won = allSunk(target);
  const scores = state.scores.slice();
  scores[seat] = target.ships.reduce((sum, s) => sum + s.hits.length, 0);

  return {
    state: {
      ...state,
      boards,
      phase: won ? 'done' : 'playing',
      turn: won ? null : seat === 0 ? 1 : 0,
      lastShot: { by: seat, x, y, result, sunk },
      scores,
      seq: state.seq + 1,
    },
  };
}

export function getResult(state) {
  if (state.phase !== 'done') return { over: false, winner: null, draw: false, scores: state.scores };
  const winner = state.lastShot?.by ?? null;
  return { over: true, winner, draw: false, scores: state.scores };
}

export function publicState(state, seat) {
  const opponent = seat === 0 ? 1 : 0;
  const own = state.boards[seat] || emptyBoard();
  const enemy = state.boards[opponent] || emptyBoard();
  return {
    size: state.size,
    fleet: state.fleet,
    phase: state.phase,
    turn: state.turn,
    lastShot: state.lastShot,
    scores: state.scores,
    scans: state.scans || [1, 1],
    targetScans: state.scanResults?.[seat] || [],
    seq: state.seq,
    ready: state.boards.map((board) => board.ready),
    ownBoard: own,
    targetShots: own.shots,
    incomingShots: enemy.shots,
    revealedEnemyShips: state.phase === 'done' ? enemy.ships : [],
  };
}

export default {
  id: 'battleship',
  name: 'Battleship',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 2,
  createInitialState,
  applyMove,
  getResult,
  publicState,
};
