import { expect, test } from '@playwright/test';

const SERVER_URL = process.env.E2E_SERVER_URL || 'http://127.0.0.1:3001';
const PASSWORD = 'playwright-pass-123';

const GAME_NAMES = [
  'Tic-Tac-Toe',
  'Ghost Rider',
  'Tank Duel',
  'Hangman',
  'Smash Karts',
  'Ludo',
  'Carrom',
  'Pool',
  'Connect Four',
  'Skribble',
  'Word Duel',
  'Battleship',
  'Checkers',
  'Reversi',
  'Dots & Boxes',
  'Boggle Race',
  'Codenames Lite',
  'Color Cards',
  'Micro Chess',
];

const BOT_GAMES = [
  { name: 'Tic-Tac-Toe', root: '.ttt', action: async (page) => page.locator('.ttt-cell:not([disabled]), .ttt-minicell:not([disabled])').first().click() },
  { name: 'Connect Four', root: '.c4', action: async (page) => page.getByLabel(/Drop in column/).first().click() },
  { name: 'Reversi', root: '.rev', action: async (page) => page.locator('.rev-cell.legal').first().click() },
  { name: 'Dots & Boxes', root: '.dbx', action: async (page) => page.locator('.dbx-edge:not(.taken):not([disabled])').first().click() },
  {
    name: 'Codenames Lite',
    root: '.code',
    bots: 3,
    action: async (page) => {
      await page.locator('.code-clue input[placeholder="CLUE"]').fill('TEST');
      await page.getByRole('button', { name: 'Give clue' }).click();
    },
  },
  { name: 'Color Cards', root: '.uno', action: async (page) => page.getByRole('button', { name: 'Draw' }).click() },
  {
    name: 'Micro Chess',
    root: '.mc',
    action: async (page) => {
      await page.locator('.mc-cell').nth(15).click();
      await page.locator('.mc-cell').nth(10).click();
    },
  },
];

function uniqueUsername() {
  return `pw${Date.now().toString(36).slice(-8)}${Math.random().toString(36).slice(2, 6)}`;
}

function gameCard(page, name) {
  return page.locator('.game-card').filter({ hasText: name });
}

async function signupAndOpenLobby(page, request) {
  const response = await request.post(`${SERVER_URL}/api/auth/signup`, {
    data: { username: uniqueUsername(), password: PASSWORD },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const auth = await response.json();
  await page.addInitScript((value) => {
    window.localStorage.setItem('gp-auth', JSON.stringify(value));
  }, auth);
  await page.goto('/');
  await expect(page.locator('.games-grid')).toBeVisible();
}

async function expectNoClientErrors(page, run) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await run();
  expect(errors).toEqual([]);
}

async function startBotGame(page, game) {
  const card = gameCard(page, game.name);
  await expect(card).toBeVisible();
  await card.locator('.quick-cta').click();

  await expect(page.getByRole('dialog', { name: `${game.name} lobby` })).toBeVisible();
  const botSelect = page.locator('.lb-map').filter({ hasText: 'Bots' }).locator('select');
  await expect(botSelect).toBeVisible();
  await botSelect.selectOption(String(game.bots || 1));

  await page.getByRole('button', { name: "I'm ready" }).click();
  await expect(page.getByRole('button', { name: 'Start match' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start match' }).click();

  await expect(page.getByRole('heading', { name: game.name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rules' })).toBeVisible();
  await expect(page.locator(game.root)).toBeVisible();
}

test.describe('platform catalog and mobile shell', () => {
  test('shows all games and exposes mobile chat/menu controls', async ({ page, request }, testInfo) => {
    await expectNoClientErrors(page, async () => {
      await signupAndOpenLobby(page, request);

      for (const name of GAME_NAMES) {
        const card = gameCard(page, name);
        await expect(card, `${name} card`).toBeVisible();
        await expect(card.locator('.players-tag')).toBeVisible();
        await expect(card.locator('.quick-cta')).toBeVisible();
      }

      await gameCard(page, 'Battleship').press('Enter');
      await expect(page.getByRole('dialog', { name: 'Play Battleship' })).toBeVisible();
      await page.getByRole('button', { name: 'Close', exact: true }).click();

      if (testInfo.project.name === 'mobile-portrait') {
        await expect(page.getByLabel('Open chat')).toBeVisible();
        await page.getByLabel('Open chat').click();
        await expect(page.locator('.app')).toHaveClass(/mobile-chat-open/);
        await expect.poll(async () => {
          const box = await page.locator('.chat-side').boundingBox();
          return box?.x ?? Number.POSITIVE_INFINITY;
        }).toBeLessThan(25);
        const chatBox = await page.locator('.chat-side').boundingBox();
        expect(chatBox?.width).toBeGreaterThan(330);

        await page.getByLabel('Close chat').click();
        await page.getByLabel('Open menu').click();
        await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
        await expect(page.getByLabel('Settings')).toBeVisible();
        await expect(page.getByLabel('Profile')).toBeVisible();
      }
    });
  });

  test('saves account profile changes and reloads them from the server', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'profile persistence only needs one browser project');
    await expectNoClientErrors(page, async () => {
      await signupAndOpenLobby(page, request);
      const nextUsername = uniqueUsername();

      await page.locator('.profile-chip').click();
      await expect(page.getByRole('dialog', { name: 'Profile' })).toBeVisible();
      await page.getByLabel('Username').fill(nextUsername);
      await page.getByLabel('Display name').fill('Arcade Captain');
      await page.getByLabel('Nickname').fill('Captain');
      await page.getByLabel('Choose Crown avatar').click();
      await page.getByRole('button', { name: 'Save profile' }).click();
      await expect(page.getByRole('dialog', { name: 'Profile' })).toBeHidden();
      await expect(page.locator('.profile-chip')).toContainText('Arcade Captain');

      await page.reload();
      await expect(page.locator('.games-grid')).toBeVisible();
      await expect(page.locator('.profile-chip')).toContainText('Arcade Captain');

      await page.locator('.profile-chip').click();
      await expect(page.getByLabel('Username')).toHaveValue(nextUsername);
      await expect(page.getByLabel('Display name')).toHaveValue('Arcade Captain');
      await expect(page.getByLabel('Nickname')).toHaveValue('Captain');
    });
  });
});

test.describe('bot game smoke starts', () => {
  for (const game of BOT_GAMES) {
    test(`${game.name} starts from lobby and accepts one legal action`, async ({ page, request }) => {
      await expectNoClientErrors(page, async () => {
        await signupAndOpenLobby(page, request);
        await startBotGame(page, game);
        await game.action(page);
        await expect(page.locator(game.root)).toBeVisible();
        await page.getByRole('button', { name: /Leave|Forfeit|Back to lobby/ }).first().click();
      });
    });
  }
});

test.describe('smash karts smoke', () => {
  test('starts with a bot and exposes the arena controls', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-portrait', 'portrait shows the rotate-to-landscape gate');
    await expectNoClientErrors(page, async () => {
      await signupAndOpenLobby(page, request);

      await gameCard(page, 'Smash Karts').locator('.quick-cta').click();
      await expect(page.getByRole('dialog', { name: 'Smash Karts lobby' })).toBeVisible();
      await page.locator('.lb-map').filter({ hasText: 'Bots' }).locator('select').selectOption('1');
      await page.getByRole('button', { name: "I'm ready" }).click();
      await expect(page.getByRole('button', { name: 'Start match' })).toBeEnabled();
      await page.getByRole('button', { name: 'Start match' }).click();

      await expect(page.locator('.kt-stage')).toBeVisible();
      await expect(page.locator('.kt-canvas canvas')).toBeVisible();
      await expect(page.locator('.kt-racebar')).toBeVisible();

      if (testInfo.project.name === 'mobile-landscape') {
        await expect(page.getByLabel('Steer left')).toBeVisible();
        await expect(page.getByLabel('Steer right')).toBeVisible();
        await expect(page.getByLabel('Brake')).toBeVisible();
        await expect(page.getByLabel('Reverse')).toBeVisible();
        await expect(page.getByLabel('Fire weapon')).toBeVisible();
      } else {
        await page.keyboard.down('w');
        await page.keyboard.press('Space');
        await page.keyboard.up('w');
      }
    });
  });
});
