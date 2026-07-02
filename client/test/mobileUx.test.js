import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const lobby = readFileSync(new URL('../src/pages/Lobby.jsx', import.meta.url), 'utf8');
const game = readFileSync(new URL('../src/pages/Game.jsx', import.meta.url), 'utf8');
const karts = readFileSync(new URL('../src/games/Karts.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('lobby exposes mobile chat drawer controls and swipe handlers', () => {
  assert.match(lobby, /mobile-chat-fab/);
  assert.match(lobby, /mobile-chat-close/);
  assert.match(lobby, /onShellTouchStart/);
  assert.match(lobby, /onShellTouchEnd/);
  assert.match(css, /\.app\.mobile-chat-open\s+\.chat-side/);
  assert.match(css, /\.mobile-chat-fab/);
  assert.match(css, /\.chat-side\s*{[\s\S]*position:\s*fixed[\s\S]*height:\s*100dvh/);
  assert.match(css, /\.chat-side\s*{[\s\S]*width:\s*100vw/);
  assert.doesNotMatch(lobby, /Back to games/);
  assert.match(lobby, /aria-label="Close chat"/);
  assert.match(css, /\.mobile-chat-close\s*{[\s\S]*position:\s*absolute/);
});

test('game shell renders a landscape prompt for games that require it', () => {
  assert.match(game, /requiresLandscape/);
  assert.match(game, /orientation-gate/);
  assert.match(css, /orientation:\s*portrait[\s\S]*\.orientation-gate/);
});

test('landscape games attempt fullscreen orientation lock and clean up on exit', () => {
  assert.match(game, /requestFullscreen/);
  assert.match(game, /orientation\.lock\('landscape'\)/);
  assert.match(game, /orientation\.lock\('portrait'\)/);
  assert.match(game, /exitFullscreen/);
  assert.match(game, /landscape-game-page/);
  assert.match(game, /landscape-leave/);
  assert.match(game, /Enter landscape/);
  assert.match(css, /\.game-page\.landscape-game-page/);
  assert.match(css, /\.landscape-game-page\s+\.landscape-leave/);
  assert.match(css, /\.orientation-gate button/);
});

test('Tank Duel keeps controls visible in landscape fullscreen mode', () => {
  assert.match(css, /\.landscape-game-page\s+\.art-wrap\s*\{[\s\S]*height:\s*100dvh/);
  assert.match(css, /\.landscape-game-page\s+\.art-stage\s*\{[\s\S]*height:\s*100dvh/);
  assert.match(css, /\.landscape-game-page\s+\.art-console\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /\.landscape-game-page\s+\.art-console\s*\{[\s\S]*bottom:\s*max\(10px,\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.landscape-game-page\s+\.art-fire\s*\{[\s\S]*min-height:\s*52px/);
});

test('karts mobile controls use auto gas, steering, brake, reverse, and fire', () => {
  assert.match(karts, /touchInputRef/);
  assert.match(karts, /fireTapRef/);
  assert.doesNotMatch(karts, /pointer:\s*coarse/);
  assert.match(karts, /touch\.reverse\s*\?\s*-1/);
  assert.match(karts, /touch\.brake\s*\?\s*-0\.35/);
  assert.match(karts, /:\s*1/);
  assert.match(karts, /kt-left/);
  assert.match(karts, /kt-right/);
  assert.match(karts, /kt-brake/);
  assert.match(karts, /kt-reverse/);
  assert.match(karts, /kt-fire/);
  assert.match(karts, /kt-racebar/);
  assert.match(karts, /kt-control-icon/);
  assert.doesNotMatch(karts, /onPointerLeave=\{setTouchControl\('fire'/);
  assert.match(karts, /onLostPointerCapture=\{setTouchControl\('fire',\s*false\)\}/);
  assert.doesNotMatch(karts, /phase\s*===\s*'playing'/);
  assert.match(css, /\.kt-touch-controls/);
  assert.match(css, /\.kt-fire/);
  assert.match(css, /\.kt-speed-vignette/);
});

test('settings are available from the lobby and initialize app preferences', () => {
  assert.match(app, /initUserSettings/);
  assert.match(lobby, /showSettings/);
  assert.match(lobby, /Settings/);
  assert.match(lobby, /settings-panel/);
  assert.match(lobby, /theme/);
  assert.match(lobby, /mobileControls/);
  assert.match(lobby, /soundEffects/);
  assert.match(karts, /getUserSettings/);
  assert.match(karts, /manual-gas/);
  assert.match(css, /data-theme='light'/);
  assert.match(css, /data-theme='arcade'/);
});

test('mobile bottom menu uses icons and profile contains logout', () => {
  assert.match(lobby, /mobile-menu-fab/);
  assert.match(lobby, /mobile-action-icon/);
  assert.match(lobby, /showProfile/);
  assert.match(lobby, /profile-panel/);
  assert.match(lobby, /nickname/);
  assert.match(lobby, /avatar/);
  assert.match(lobby, /onLogout/);
  assert.match(lobby, /aria-label="Open menu"/);
  assert.match(lobby, /aria-label="Open chat"/);
  assert.doesNotMatch(lobby, /<span>Chat<\/span>/);
  assert.match(css, /\.mobile-bottom-actions/);
  assert.match(css, /\.mobile-menu-sheet/);
  assert.match(css, /\.profile-avatar-grid/);
});
