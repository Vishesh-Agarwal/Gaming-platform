const SETTINGS_KEY = 'gp-user-settings-v1';

export const DEFAULT_USER_SETTINGS = {
  theme: 'default',
  mobileControls: 'auto-gas',
  soundEffects: true,
  username: '',
  nickname: '',
  avatar: 'pilot',
};

export const PROFILE_AVATARS = [
  { id: 'pilot', label: 'Pilot', icon: 'P' },
  { id: 'bolt', label: 'Bolt', icon: 'B' },
  { id: 'crown', label: 'Crown', icon: 'C' },
  { id: 'target', label: 'Target', icon: 'T' },
  { id: 'spark', label: 'Spark', icon: 'S' },
  { id: 'shield', label: 'Shield', icon: 'D' },
];

function normalizeSettings(value = {}) {
  return {
    theme: ['default', 'light', 'arcade'].includes(value.theme) ? value.theme : DEFAULT_USER_SETTINGS.theme,
    mobileControls: ['auto-gas', 'manual-gas'].includes(value.mobileControls)
      ? value.mobileControls
      : DEFAULT_USER_SETTINGS.mobileControls,
    soundEffects: typeof value.soundEffects === 'boolean' ? value.soundEffects : DEFAULT_USER_SETTINGS.soundEffects,
    username: typeof value.username === 'string' ? value.username.slice(0, 24) : DEFAULT_USER_SETTINGS.username,
    nickname: typeof value.nickname === 'string' ? value.nickname.slice(0, 24) : DEFAULT_USER_SETTINGS.nickname,
    avatar: PROFILE_AVATARS.some((a) => a.id === value.avatar) ? value.avatar : DEFAULT_USER_SETTINGS.avatar,
  };
}

export function applyTheme(theme = DEFAULT_USER_SETTINGS.theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'default') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

export function applySoundPreference(settings = getUserSettings()) {
  if (typeof window === 'undefined') return;
  const muted = settings.soundEffects ? '0' : '1';
  window.localStorage?.setItem('gameSoundMuted', muted);
  window.localStorage?.setItem('kt-muted', muted);
}

export function getUserSettings() {
  if (typeof window === 'undefined') return DEFAULT_USER_SETTINGS;
  try {
    const raw = window.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) {
      return normalizeSettings({
        soundEffects: window.localStorage?.getItem('gameSoundMuted') !== '1',
      });
    }
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(patch) {
  const next = normalizeSettings({ ...getUserSettings(), ...patch });
  if (typeof window !== 'undefined') {
    window.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(next));
  }
  applyTheme(next.theme);
  applySoundPreference(next);
  return next;
}

export function initUserSettings() {
  const settings = getUserSettings();
  applyTheme(settings.theme);
  applySoundPreference(settings);
  return settings;
}
