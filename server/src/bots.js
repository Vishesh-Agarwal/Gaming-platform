const BOT_GAMES = new Set(['tictactoe', 'connect4', 'reversi', 'dotsboxes', 'microchess', 'uno', 'codenames', 'karts']);

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const copy = (value) => structuredClone(value);

export function supportsRoomBots(gameId) {
  return BOT_GAMES.has(gameId);
}

function candidatesFor(gameId, state, seat) {
  if (gameId === 'tictactoe') {
    if (state.mode === 'ultimate') {
      const boards = state.active != null && state.won[state.active] == null
        ? [state.active]
        : state.won.map((w, i) => (w == null ? i : -1)).filter((i) => i >= 0);
      const out = [];
      for (const board of boards) {
        state.boards[board].forEach((cell, i) => { if (cell == null) out.push({ board, cell: i }); });
      }
      return out;
    }
    const mine = state.board.filter((cell) => cell === seat).length;
    const total = state.board.filter((cell) => cell != null).length;
    if (state.mode === 'shifting' && mine >= 3 && total >= 6) {
      const adj = {
        0: [1, 3, 4], 1: [0, 2, 4], 2: [1, 5, 4],
        3: [0, 6, 4], 4: [0, 1, 2, 3, 5, 6, 7, 8],
        5: [2, 8, 4], 6: [3, 7, 4], 7: [6, 8, 4], 8: [5, 7, 4],
      };
      return state.board.flatMap((cell, from) => (
        cell === seat ? adj[from].filter((to) => state.board[to] == null).map((to) => ({ from, to })) : []
      ));
    }
    return state.board.map((cell, i) => (cell == null ? { cell: i } : null)).filter(Boolean);
  }

  if (gameId === 'connect4') {
    const drops = Array.from({ length: state.cols }, (_, col) => ({ col }))
      .filter((m) => (state.board[m.col]?.length || 0) < state.rows);
    if (state.mode !== 'popout') return drops;
    const pops = Array.from({ length: state.cols }, (_, col) => ({ col, action: 'pop' }))
      .filter((m) => state.board[m.col]?.[0] === seat);
    return [...drops, ...pops];
  }

  if (gameId === 'reversi') {
    const moves = state.board.map((cell, pos) => (cell == null ? { pos } : null)).filter(Boolean);
    return [...moves, { pass: true }];
  }

  if (gameId === 'dotsboxes') {
    const out = [];
    for (let r = 0; r < state.dots; r += 1) {
      for (let c = 0; c < state.boxes; c += 1) out.push({ dir: 'h', r, c });
    }
    for (let r = 0; r < state.boxes; r += 1) {
      for (let c = 0; c < state.dots; c += 1) out.push({ dir: 'v', r, c });
    }
    return out;
  }

  if (gameId === 'microchess') {
    const out = [];
    state.board.forEach((piece, from) => {
      if (piece?.owner !== seat) return;
      for (let to = 0; to < state.board.length; to += 1) out.push({ from, to });
    });
    return out;
  }

  if (gameId === 'uno') {
    const hand = state.secret?.hands?.[seat] || [];
    return [...hand.map((card, index) => (card.color === 'wild' ? { index, color: state.top?.color || 'red' } : { index })), { type: 'draw' }];
  }

  if (gameId === 'codenames') {
    if (state.phase === 'clue') return [{ word: 'STAR', count: 1 }];
    const team = state.teams?.[seat] ?? (seat === 0 || seat === 2 ? 0 : 1);
    const role = team === 0 ? 'red' : 'blue';
    const ownCards = state.cards
      .map((card, index) => (!card.revealed && card.role === role ? { index } : null))
      .filter(Boolean);
    if (ownCards.length) return ownCards;
    return state.cards.map((card, index) => (!card.revealed ? { index } : null)).filter(Boolean);
  }

  return [];
}

export function chooseBotMove(game, state, seat) {
  if (!supportsRoomBots(game.id)) return null;
  const legal = [];
  const winning = [];
  for (const move of candidatesFor(game.id, state, seat)) {
    const trial = game.applyMove(copy(state), seat, move);
    if (trial.error || !trial.state) continue;
    legal.push(move);
    const result = game.getResult(trial.state);
    const team = state.teams?.[seat];
    if (result.over && (result.winner === seat || (result.mode === 'teams' && result.winner === team))) winning.push(move);
  }
  return pick(winning.length ? winning : legal);
}
