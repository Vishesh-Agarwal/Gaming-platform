// Skribble - multiplayer drawing and guessing. The drawer sees the secret word;
// guessers see only its shape and submit guesses through game moves.

export const WORDS = [
  // single words — animals
  'elephant', 'penguin', 'octopus', 'spider', 'whale', 'giraffe', 'kangaroo',
  'butterfly', 'dolphin', 'flamingo', 'hedgehog', 'jellyfish', 'ladybug',
  'lobster', 'ostrich', 'peacock', 'porcupine', 'raccoon', 'rhinoceros',
  'scorpion', 'seahorse', 'squirrel', 'tortoise', 'walrus', 'woodpecker',
  'crocodile', 'chameleon', 'bat', 'owl', 'shark', 'snail', 'crab', 'moose',
  'panda', 'sloth', 'camel', 'gorilla', 'lion', 'tiger', 'zebra',
  // single words — food
  'apple', 'banana', 'hamburger', 'pizza', 'watermelon', 'pretzel', 'pancake',
  'spaghetti', 'sandwich', 'cupcake', 'doughnut', 'croissant', 'pineapple',
  'avocado', 'broccoli', 'mushroom', 'popcorn', 'taco', 'sushi', 'waffle',
  'lollipop', 'cheese', 'carrot', 'strawberry', 'hotdog',
  // single words — objects
  'anchor', 'backpack', 'balloon', 'book', 'camera', 'clock', 'crown',
  'diamond', 'drum', 'flower', 'guitar', 'jacket', 'key', 'kite', 'ladder',
  'pencil', 'telescope', 'toothbrush', 'umbrella', 'binoculars', 'candle',
  'compass', 'dumbbell', 'envelope', 'flashlight', 'hammock', 'harmonica',
  'hourglass', 'joystick', 'kettle', 'lantern', 'microphone', 'microscope',
  'padlock', 'perfume', 'scissors', 'stapler', 'stethoscope', 'suitcase',
  'trophy', 'typewriter', 'wheelbarrow', 'whistle', 'wrench', 'zipper',
  'accordion', 'saxophone', 'trumpet', 'violin', 'xylophone', 'boomerang',
  'chandelier', 'fountain', 'hanger', 'magnet', 'mirror', 'pillow', 'shovel',
  'skateboard', 'snorkel', 'sponge', 'swing', 'toaster', 'vacuum',
  // single words — places & nature
  'bridge', 'castle', 'campfire', 'cloud', 'island', 'lighthouse', 'moon',
  'mountain', 'planet', 'rainbow', 'volcano', 'waterfall', 'desert', 'glacier',
  'cave', 'canyon', 'iceberg', 'meteor', 'tornado', 'geyser', 'oasis',
  'pyramid', 'windmill', 'skyscraper', 'stadium', 'igloo', 'barn', 'circus',
  'harbor', 'jungle', 'orchard', 'palace', 'prison', 'subway', 'temple',
  // single words — vehicles & characters
  'airplane', 'bicycle', 'firetruck', 'helicopter', 'robot', 'rocket',
  'sailboat', 'train', 'ambulance', 'bulldozer', 'canoe', 'gondola',
  'motorcycle', 'submarine', 'tractor', 'astronaut', 'ballerina',
  'cowboy', 'dragon', 'genie', 'juggler', 'knight', 'magician', 'mermaid',
  'ninja', 'pirate', 'scarecrow', 'skeleton', 'snowman', 'unicorn', 'vampire',
  'werewolf', 'wizard', 'zombie', 'cheerleader', 'firefighter', 'plumber',
  // single words — misc drawables
  'sandcastle', 'sunflower', 'tree', 'cactus', 'earthquake', 'fireworks',
  'footprint', 'karate', 'lightning', 'moustache', 'shadow', 'sneeze',
  'tattoo', 'yoga', 'dizzy', 'hiccup', 'applause', 'cannonball',
  // two-word prompts
  'birthday cake', 'ice cream', 'paint brush', 'soccer ball', 'traffic light',
  'sleeping bag', 'basketball hoop', 'rain forest', 'electric guitar',
  'coffee cup', 'flying saucer', 'roller coaster', 'paper airplane',
  'space station', 'rubber duck', 'garden hose', 'wooden spoon', 'magic wand',
  'beach umbrella', 'baseball bat', 'bunk bed', 'cable car', 'candy cane',
  'cheese grater', 'disco ball', 'ferris wheel', 'fire hydrant',
  'fishing rod', 'fortune cookie', 'jump rope', 'lawn mower', 'lava lamp',
  'north pole', 'palm tree', 'phone booth', 'picnic basket',
  'pillow fight', 'polar bear', 'pogo stick', 'post office', 'punching bag',
  'sand dune', 'security camera', 'shooting star', 'shopping cart',
  'smoke signal', 'snow globe', 'spider web', 'swimming pool', 'tea party',
  'tennis racket', 'time machine', 'tow truck', 'treasure chest',
  'vending machine', 'washing machine', 'water slide', 'wind chime',
  'wrecking ball',
  // three-word prompts
  'hot air balloon', 'ice cream cone', 'birthday party hat',
  'pirate treasure map', 'rock paper scissors', 'hide and seek',
  'trick or treat', 'pot of gold', 'glass of milk', 'bowl of soup',
  'stack of pancakes', 'hole in one', 'house of cards', 'man on moon',
  'message in bottle', 'needle in haystack', 'rabbit in hat',
  'ship in bottle', 'walk the plank', 'water balloon fight', 'cherry on top',
  'three legged race', 'tip of iceberg', 'upside down cake',
  'elephant in room', 'chocolate chip cookie', 'peanut butter sandwich',
];
export const PACKS = {
  mixed: WORDS,
  simple: WORDS.filter((word) => word.split(/\s+/).length === 1),
  party: [
    'birthday cake', 'pizza', 'hamburger', 'coffee cup', 'soccer ball',
    'basketball hoop', 'birthday party hat', 'baseball bat', 'rubber duck',
    'magic wand', 'beach umbrella', 'watermelon', 'ice cream', 'guitar',
    'drum', 'disco ball', 'pillow fight', 'fireworks', 'candy cane',
    'popcorn', 'cupcake', 'ferris wheel', 'tea party', 'lollipop',
  ],
};
const MODES = [
  { id: 'mixed', name: 'Mixed Pack' },
  { id: 'simple', name: 'Simple Pack' },
  { id: 'party', name: 'Party Pack' },
];

const PICK_TIMEOUT_MS = 20000;
const DRAW_TIMEOUT_MS = 90000;
// The client flushes a stroke segment roughly every 70ms of continuous
// drawing (Skribble.jsx STREAM_MS), so a full 90s turn draws ~1300 segments.
// Cap comfortably above that so a whole turn's lines are never trimmed away.
const MAX_STROKES = 2000;
const MAX_POINTS = 160;
const COLORS = new Set(['#f1ece5', '#18151c', '#f2b049', '#3fc7ad', '#e8806a', '#e85f70', '#5fbf86', '#5b8cff']);

function nextRand(n) {
  return (Math.imul(n, 1664525) + 1013904223) >>> 0;
}

function wordCount(word) {
  return String(word).trim().split(/\s+/).filter(Boolean).length;
}

function choicePool(wordsPerPrompt, pack = 'mixed', customWords = []) {
  const custom = Array.isArray(customWords)
    ? customWords.filter((word) => wordCount(word) === wordsPerPrompt)
    : [];
  const base = (PACKS[pack] || WORDS).filter((word) => wordCount(word) === wordsPerPrompt);
  return custom.length >= 2 ? custom : base;
}

function pickWords(seed, turnNo, choices, wordsPerPrompt, pack, customWords) {
  const pool = choicePool(wordsPerPrompt, pack, customWords);
  let n = (seed + Math.imul(turnNo + 1, 2654435761)) >>> 0;
  n = nextRand(nextRand(n));
  const picked = [];
  for (let i = 0; picked.length < choices && picked.length < pool.length; i += 1) {
    n = nextRand(n + i);
    const word = pool[n % pool.length];
    if (!picked.includes(word)) picked.push(word);
  }
  return picked.length ? picked : [WORDS[0]];
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function wordShape(word) {
  return word.replace(/[A-Za-z0-9]/g, '_');
}

function makeGuessed(seatCount, drawer) {
  const guessed = Array(seatCount).fill(false);
  guessed[drawer] = true;
  return guessed;
}

function appendLog(state, entry) {
  return [...state.chat.slice(-35), { id: state.seq + 1, ...entry }];
}

function startTurn(state, turnNo, carry = {}) {
  const drawer = turnNo % state.seatCount;
  const choices = pickWords(state.seed, turnNo, state.choiceCount, state.wordsPerPrompt, state.pack, state.customWords);
  return {
    ...state,
    ...carry,
    phase: 'choosing',
    turnNo,
    round: Math.floor(turnNo / state.seatCount) + 1,
    drawer,
    turn: drawer,
    guessed: makeGuessed(state.seatCount, drawer),
    strokes: [],
    wordShape: '',
    wordLength: 0,
    secret: { choices, word: null },
  };
}

function beginDrawing(state, word) {
  return {
    ...state,
    phase: 'drawing',
    strokes: [],
    wordShape: wordShape(word),
    wordLength: normalize(word).length,
    secret: { ...(state.secret || {}), word },
    chat: appendLog(state, { kind: 'system', text: `${wordCount(word)} word prompt selected.` }),
    seq: state.seq + 1,
  };
}

function advanceTurn(state, reason) {
  const reveal = state.secret?.word || '';
  const nextTurn = state.turnNo + 1;
  const chat = appendLog(state, {
    kind: 'system',
    text: reason === 'complete'
      ? `Everyone got it. The word was ${reveal}.`
      : `Time. The word was ${reveal}.`,
  });

  if (nextTurn >= state.seatCount * state.maxRounds) {
    return {
      ...state,
      phase: 'over',
      turnNo: nextTurn,
      turn: null,
      drawer: null,
      strokes: [],
      guessed: Array(state.seatCount).fill(true),
      chat,
      secret: null,
      seq: state.seq + 1,
    };
  }

  return startTurn(state, nextTurn, { chat, seq: state.seq + 1 });
}

export function createInitialState(options, seatCount = 2) {
  const safeSeats = Math.max(2, Math.min(6, Number(seatCount) || 2));
  const rounds = Math.max(1, Math.min(5, Math.floor(Number(options?.rounds) || 2)));
  const choiceCount = Math.max(2, Math.min(5, Math.floor(Number(options?.choiceCount) || 3)));
  const wordsPerPrompt = Math.max(1, Math.min(3, Math.floor(Number(options?.wordsPerPrompt) || 1)));
  const seed = Number.isInteger(options?.seed) ? options.seed >>> 0 : Math.floor(Math.random() * 0xffffffff);
  const pack = PACKS[options?.mode] ? options.mode : 'mixed';
  const customWords = Array.isArray(options?.customWords) ? options.customWords : [];
  const base = {
    mode: 'custom',
    pack,
    seed,
    seatCount: safeSeats,
    maxRounds: rounds,
    choiceCount,
    wordsPerPrompt,
    customWords,
    round: 1,
    turnNo: 0,
    turn: 0,
    drawer: 0,
    strokes: [],
    chat: [{ id: 0, kind: 'system', text: 'Round 1 started.' }],
    scores: Array(safeSeats).fill(0),
    guessed: makeGuessed(safeSeats, 0),
    wordShape: '',
    wordLength: 0,
    phase: 'choosing',
    seq: 0,
    secret: null,
  };
  return startTurn(base, 0);
}

function cleanStroke(move) {
  const points = Array.isArray(move?.points) ? move.points.slice(0, MAX_POINTS) : [];
  if (points.length < 2) return null;
  const clean = points.map((p) => ({
    x: Math.max(0, Math.min(1, Number(p?.x))),
    y: Math.max(0, Math.min(1, Number(p?.y))),
  }));
  if (clean.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const color = COLORS.has(move?.color) ? move.color : '#f1ece5';
  const size = Math.max(2, Math.min(18, Math.floor(Number(move?.size) || 5)));
  return { points: clean, color, size };
}

export function applyMove(state, seat, move) {
  if (state.phase === 'over') return { error: 'Game is over.' };

  if (state.phase === 'choosing') {
    if (move?.type !== 'chooseWord') return { error: 'Choose a word first.' };
    if (seat !== state.drawer) return { error: 'Only the drawer can choose the word.' };
    const word = String(move?.word || '');
    if (!state.secret?.choices?.includes(word)) return { error: 'Choose one of the offered words.' };
    return { state: beginDrawing(state, word) };
  }

  if (move?.type === 'stroke') {
    if (seat !== state.drawer) return { error: 'Only the drawer can draw.' };
    const stroke = cleanStroke(move);
    if (!stroke) return { error: 'Draw a longer stroke.' };
    return {
      state: {
        ...state,
        strokes: [...state.strokes.slice(-(MAX_STROKES - 1)), { id: state.seq + 1, ...stroke }],
        seq: state.seq + 1,
      },
    };
  }

  if (move?.type === 'clear') {
    if (seat !== state.drawer) return { error: 'Only the drawer can clear the board.' };
    return { state: { ...state, strokes: [], seq: state.seq + 1 } };
  }

  if (move?.type !== 'guess') return { error: 'Unknown move.' };
  if (seat === state.drawer) return { error: 'The drawer cannot guess.' };
  if (state.guessed[seat]) return { error: 'You already guessed this word.' };

  const raw = String(move?.text || '').trim().slice(0, 48);
  if (!raw) return { error: 'Enter a guess.' };
  const correct = normalize(raw) === normalize(state.secret?.word);
  const chatEntry = correct
    ? { kind: 'guess', seat, correct: true }
    : { kind: 'guess', seat, text: raw, correct: false };
  const chat = appendLog(state, chatEntry);

  if (!correct) return { state: { ...state, chat, seq: state.seq + 1 } };

  const alreadyCorrect = state.guessed.filter(Boolean).length - 1;
  const guessPoints = Math.max(35, 100 - alreadyCorrect * 15);
  const scores = state.scores.slice();
  scores[seat] += guessPoints;
  scores[state.drawer] += 35;
  const guessed = state.guessed.slice();
  guessed[seat] = true;

  const next = { ...state, chat, guessed, scores, seq: state.seq + 1 };
  const allGuessersDone = guessed.every(Boolean);
  return { state: allGuessersDone ? advanceTurn(next, 'complete') : next };
}

export function getResult(state) {
  if (state.phase !== 'over') return { over: false, winner: null, draw: false, scores: state.scores };
  const best = Math.max(...state.scores);
  const leaders = state.scores.map((score, seat) => ({ score, seat })).filter((row) => row.score === best);
  return {
    over: true,
    winner: leaders.length === 1 ? leaders[0].seat : null,
    draw: leaders.length !== 1,
    scores: state.scores,
  };
}

export function onTimeout(state) {
  if (state.phase === 'over') return { state };
  if (state.phase === 'choosing') return { state: beginDrawing(state, state.secret?.choices?.[0] || WORDS[0]) };
  return { state: advanceTurn(state, 'timeout') };
}

export function publicState(state, seat) {
  const { secret, ...pub } = state;
  return {
    ...pub,
    word: seat === state.drawer ? secret?.word || null : null,
    choices: seat === state.drawer && state.phase === 'choosing' ? secret?.choices || [] : [],
  };
}

export default {
  id: 'skribble',
  name: 'Skribble',
  type: 'turn-based',
  minPlayers: 2,
  maxPlayers: 6,
  optionsSpec: {
    rounds: { type: 'int', min: 1, max: 5, default: 2, label: 'Rounds' },
    choiceCount: { type: 'int', min: 2, max: 5, default: 3, label: 'Word choices' },
    wordsPerPrompt: { type: 'int', min: 1, max: 3, default: 1, label: 'Words per prompt' },
    customWords: { type: 'textList', maxItems: 60, maxLength: 36, minLength: 2, label: 'Custom prompts' },
  },
  modes: MODES,
  turnTimeoutMs: (state) => (state.phase === 'choosing' ? PICK_TIMEOUT_MS : state.phase === 'drawing' ? DRAW_TIMEOUT_MS : null),
  createInitialState,
  applyMove,
  getResult,
  onTimeout,
  publicState,
};
