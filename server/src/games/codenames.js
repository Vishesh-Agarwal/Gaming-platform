// Codenames Lite - 4-player fixed teams: seats 0/2 red, 1/3 blue.

// Classic deck: concrete nouns with plenty of cross-associations, in the
// spirit of the board game's base set.
const WORDS = `
ALIEN AMAZON ANCHOR ANGEL ANT APPLE ARM ARROW BAND BANK
BARK BAT BATTERY BEACH BEAR BEARD BELL BELT BERLIN BOARD
BOMB BOND BOOT BOTTLE BOW BOXER BRIDGE BRUSH BUCKET BUFFALO
BUG BUTTON CANVAS CAPITAL CARD CARROT CASINO CAST CASTLE CAT
CELL CENTER CHAIR CHARGE CHEST CHICK CHINA CHOCOLATE CHURCH CIRCLE
CLIFF CLOAK CLUB CODE COLD COMB COMPOUND CONCERT COURT COVER
CRANE CRASH CRICKET CROSS CROWN CYCLE DANCE DATE DECK DIAMOND
DICE DINOSAUR DISEASE DOCTOR DOG DRAGON DRESS DRILL DROP DUCK
DWARF EAGLE EGYPT ENGINE EYE FACE FAIR FALL FAN FENCE
FIELD FIGHTER FIGURE FILE FILM FIRE FISH FLUTE FLY FOOT
FOREST FORK FRAME GAME GAS GHOST GIANT GLASS GLOVE GOLD
GRACE GRASS GREECE GREEN GROUND HAM HAND HARBOR HAWK HEAD
HEART HELICOPTER HIMALAYAS HOLE HOOD HOOK HORN HORSE HOSPITAL HOTEL
ICE INDIA IRON IVORY JACK JAM JET JUPITER KANGAROO KETCHUP
KEY KID KING KIWI KNIFE KNIGHT LAB LAP LASER LAWYER
LEAD LEMON LID LIFE LIGHT LIMOUSINE LINE LINK LION LITTER
LOCK LOG LONDON LUCK MAIL MAMMOTH MAPLE MARBLE MARCH MASS
MATCH MERCURY MEXICO MICROSCOPE MILLIONAIRE MINE MINT MISSILE MODEL MOLE
MOON MOSCOW MOUNT MOUSE MOUTH MUG NAIL NEEDLE NET NINJA
NOTE NOVEL NURSE NUT OCTOPUS OIL OLIVE OPERA ORANGE ORGAN
PALM PAN PANTS PAPER PARACHUTE PARK PART PASS PASTE PENGUIN
PHOENIX PIANO PIE PILOT PIN PIPE PIRATE PISTOL PIT PITCH
PLANE PLATE PLATYPUS PLAY PLOT POINT POISON POLE POLICE POOL
PORT POST POUND PRESS PRINCESS PUMPKIN PUPIL PYRAMID QUEEN RABBIT
RACKET RAY REVOLUTION RING ROBIN ROBOT ROCK ROME ROOT ROSE
ROULETTE ROUND ROW RULER SATELLITE SATURN SCALE SCHOOL SCIENTIST SCORPION
SCREEN SCUBA SEAL SERVER SHADOW SHAKESPEARE SHARK SHIP SHOE SHOP
SHOT SINK SKYSCRAPER SLIP SLUG SMUGGLER SNOW SOCK SOLDIER SOUL
SOUND SPACE SPELL SPIDER SPIKE SPINE SPOT SPRING SPY SQUARE
STADIUM STAFF STAR STATE STICK STOCK STRAW STREAM STRIKE STRING
SUB SUIT SUPERHERO SWING SWITCH TABLE TABLET TAG TAIL TAP
TEACHER TELESCOPE TEMPLE THEATER THIEF THUMB TICK TIE TIGER TIME
TOKYO TOOTH TORCH TOWER TRACK TRAIN TRIANGLE TRIP TRUNK TUBE
TURKEY UNDERTAKER UNICORN VACUUM VAN VET WAKE WALL WAR WASHER
WATCH WATER WAVE WEB WELL WHALE WHIP WIND WITCH WORM YACHT ZEBRA
`.trim().split(/\s+/);
export const DECKS = {
  classic: WORDS,
  mythic: ['PHOENIX', 'ORACLE', 'TEMPLE', 'TITAN', 'NEBULA', 'CROWN', 'SWORD', 'SHIELD', 'RUNE', 'GIANT', 'MERMAID', 'CYCLOPS', 'DRAGON', 'CASTLE', 'QUEST', 'SPELL', 'THRONE', 'GOBLET', 'HARP', 'MIRROR', 'COMET', 'VAMPIRE', 'UNICORN', 'LABYRINTH', 'TORCH'],
  tech: ['ROUTER', 'PIXEL', 'SERVER', 'ROBOT', 'LASER', 'CIPHER', 'DRONE', 'SATELLITE', 'BROWSER', 'CLOUD', 'DATABASE', 'PYTHON', 'KERNEL', 'MATRIX', 'VECTOR', 'PORTAL', 'SCREEN', 'SIGNAL', 'TOKEN', 'WALLET', 'WIDGET', 'MODULE', 'SCRIPT', 'PACKET', 'CONSOLE'],
};
const MODES = [
  { id: 'classic', name: 'Classic Deck' },
  { id: 'mythic', name: 'Mythic Deck' },
  { id: 'tech', name: 'Tech Deck' },
];
const TEAMS = ['red', 'blue'];

function nextRand(n) {
  return (Math.imul(n, 1664525) + 1013904223) >>> 0;
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

export function createInitialState(options, seatCount = 4) {
  const seed = Math.floor(Math.random() * 0xffffffff);
  const deck = DECKS[options?.mode] ? options.mode : 'classic';
  const words = shuffle(seed, DECKS[deck]).slice(0, 25);
  const roles = shuffle(seed ^ 0x9e3779b9, [
    ...Array(8).fill('red'),
    ...Array(8).fill('blue'),
    ...Array(8).fill('neutral'),
    'assassin',
  ]);
  return {
    seatCount,
    deck,
    teams: [0, 1, 0, 1],
    spymasters: [0, 1],
    cards: words.map((word, i) => ({ word, role: roles[i], revealed: false })),
    turnTeam: 0,
    phase: 'clue',
    clue: null,
    guessesLeft: 0,
    votes: {},
    teamNotes: [],
    scores: [0, 0, 0, 0],
    log: [],
    turn: 0,
    seq: 0,
  };
}

const teamOf = (seat) => (seat === 0 || seat === 2 ? 0 : 1);
const isSpymaster = (seat) => seat === 0 || seat === 1;
const clueSeat = (team) => team;
const guesserSeat = (team) => team === 0 ? 2 : 3;

function remaining(cards, role) {
  return cards.filter((c) => c.role === role && !c.revealed).length;
}

function nextTeam(team) {
  return team === 0 ? 1 : 0;
}

export function applyMove(state, seat, move) {
  if (getResult(state).over) return { error: 'Game is over.' };
  if (move?.type === 'teamNote') {
    const text = String(move?.text || '').trim().slice(0, 80);
    if (!text) return { error: 'Enter a team note.' };
    const team = teamOf(seat);
    return {
      state: {
        ...state,
        teamNotes: [...(state.teamNotes || []).slice(-24), { id: state.seq + 1, team, seat, text }],
        seq: state.seq + 1,
      },
    };
  }
  if (move?.type === 'vote') {
    if (state.phase !== 'guess') return { error: 'Vote during guessing.' };
    if (teamOf(seat) !== state.turnTeam || isSpymaster(seat)) return { error: 'Only active guessers can vote.' };
    const index = Number(move?.index);
    if (!Number.isInteger(index) || index < 0 || index >= state.cards.length || state.cards[index].revealed) return { error: 'Choose a live card.' };
    const votes = { ...(state.votes || {}) };
    for (const key of Object.keys(votes)) votes[key] = votes[key].filter((s) => s !== seat);
    votes[index] = [...(votes[index] || []), seat];
    return { state: { ...state, votes, seq: state.seq + 1 } };
  }
  if (state.turn !== seat) return { error: 'Not your turn.' };
  const team = state.turnTeam;

  if (state.phase === 'clue') {
    if (!isSpymaster(seat) || teamOf(seat) !== team) return { error: 'Only your spymaster gives clues.' };
    const word = String(move?.word || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 16);
    const count = Math.max(1, Math.min(4, Math.floor(Number(move?.count) || 1)));
    if (word.length < 2) return { error: 'Give a clue word.' };
    return {
      state: {
        ...state,
        clue: { word, count, by: seat },
        guessesLeft: count + 1,
        votes: {},
        phase: 'guess',
        turn: guesserSeat(team),
        log: [...state.log.slice(-18), { kind: 'clue', team, word, count }],
        seq: state.seq + 1,
      },
    };
  }

  if (move?.endTurn) {
    const nt = nextTeam(team);
    return { state: { ...state, votes: {}, turnTeam: nt, phase: 'clue', clue: null, guessesLeft: 0, turn: clueSeat(nt), seq: state.seq + 1 } };
  }

  if (teamOf(seat) !== team || isSpymaster(seat)) return { error: 'Only the active guesser can pick.' };
  const index = Number(move?.index);
  if (!Number.isInteger(index) || index < 0 || index >= state.cards.length) return { error: 'Choose a card.' };
  if (state.cards[index].revealed) return { error: 'Card already revealed.' };

  const cards = state.cards.map((c, i) => (i === index ? { ...c, revealed: true } : c));
  const card = cards[index];
  const scores = state.scores.slice();
  if (card.role === TEAMS[team]) scores[seat] += 1;
  const log = [...state.log.slice(-18), { kind: 'guess', team, seat, word: card.word, role: card.role }];

  if (card.role === 'assassin') {
    return { state: { ...state, cards, scores, votes: {}, phase: 'done', winnerTeam: nextTeam(team), log, seq: state.seq + 1 } };
  }
  if (remaining(cards, TEAMS[team]) === 0) {
    return { state: { ...state, cards, scores, votes: {}, phase: 'done', winnerTeam: team, log, seq: state.seq + 1 } };
  }
  const correct = card.role === TEAMS[team];
  const guessesLeft = state.guessesLeft - 1;
  if (!correct || guessesLeft <= 0) {
    const nt = nextTeam(team);
    return { state: { ...state, cards, scores, votes: {}, turnTeam: nt, phase: 'clue', clue: null, guessesLeft: 0, turn: clueSeat(nt), log, seq: state.seq + 1 } };
  }
  return { state: { ...state, cards, scores, votes: {}, guessesLeft, log, seq: state.seq + 1 } };
}

export function getResult(state) {
  if (state.phase !== 'done') return { over: false, winner: null, draw: false, scores: state.scores };
  const winnerSeats = state.winnerTeam === 0 ? [0, 2] : [1, 3];
  return { over: true, mode: 'teams', winner: state.winnerTeam, teams: [state.scores[2] || 0, state.scores[3] || 0], draw: false, scores: state.scores, winnerSeats };
}

export function publicState(state, seat) {
  const spy = isSpymaster(seat);
  const viewerTeam = teamOf(seat);
  return {
    ...state,
    teamNotes: (state.teamNotes || []).filter((note) => note.team === viewerTeam),
    cards: state.cards.map((card) => ({
      word: card.word,
      revealed: card.revealed,
      role: spy || card.revealed || state.phase === 'done' ? card.role : null,
    })),
  };
}

export default {
  id: 'codenames',
  name: 'Codenames Lite',
  type: 'turn-based',
  minPlayers: 4,
  maxPlayers: 4,
  modes: MODES,
  createInitialState,
  applyMove,
  getResult,
  publicState,
};
