// Word bank for Hangman. Lets a setter grab a random word (optionally from a
// chosen category) instead of typing one — and gives the guesser a category clue.
// All words are A–Z only, 3–12 letters (matching the engine's MIN/MAX_LEN).
export const CATEGORIES = [
  { id: 'animals', label: 'Animals' },
  { id: 'countries', label: 'Countries' },
  { id: 'food', label: 'Food' },
  { id: 'sports', label: 'Sports' },
  { id: 'movies', label: 'Movies' },
  { id: 'science', label: 'Science' },
];

const WORDS = {
  animals: ['ELEPHANT', 'GIRAFFE', 'DOLPHIN', 'KANGAROO', 'PENGUIN', 'LEOPARD', 'OCTOPUS', 'HEDGEHOG', 'TORTOISE', 'FLAMINGO', 'PANDA', 'OTTER'],
  countries: ['BRAZIL', 'CANADA', 'JAPAN', 'NIGERIA', 'FRANCE', 'MEXICO', 'EGYPT', 'NORWAY', 'THAILAND', 'PORTUGAL', 'KENYA', 'ICELAND'],
  food: ['PIZZA', 'AVOCADO', 'NOODLES', 'PANCAKE', 'BURRITO', 'MANGO', 'PRETZEL', 'LASAGNA', 'CROISSANT', 'WAFFLE', 'HUMMUS', 'OMELETTE'],
  sports: ['SOCCER', 'TENNIS', 'CRICKET', 'BOXING', 'HOCKEY', 'CYCLING', 'ROWING', 'SKIING', 'CLIMBING', 'BASEBALL', 'SURFING', 'FENCING'],
  movies: ['AVATAR', 'GLADIATOR', 'INCEPTION', 'JAWS', 'TITANIC', 'FROZEN', 'MATRIX', 'ALADDIN', 'COCO', 'INTERSTELLAR', 'ROCKY', 'DUNE'],
  science: ['GRAVITY', 'NEUTRON', 'GENOME', 'PHOTON', 'MAGNET', 'OXYGEN', 'GALAXY', 'ENZYME', 'PROTEIN', 'VOLCANO', 'CIRCUIT', 'ECLIPSE'],
};

const labelOf = (id) => CATEGORIES.find((c) => c.id === id)?.label || null;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Returns { word, category(id), hint } for a random word. If categoryId is unknown
// or omitted, a random category is chosen.
export function randomWord(categoryId) {
  const id = WORDS[categoryId] ? categoryId : pick(CATEGORIES).id;
  return { word: pick(WORDS[id]), category: id, hint: labelOf(id) };
}

export function isCategory(id) {
  return !!WORDS[id];
}
