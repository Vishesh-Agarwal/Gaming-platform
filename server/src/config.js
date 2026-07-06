// Central runtime configuration. Reads process.env once, applies safe dev
// defaults, and FAILS FAST in production when a security-critical value is
// missing. Import `config` everywhere; never read process.env for these values
// directly. `loadConfig` is exported pure so tests can inject a fake env.
const DEV_SECRET = 'dev-secret-change-me';

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const jwtSecret = env.JWT_SECRET || DEV_SECRET;
  if (isProd && (!env.JWT_SECRET || jwtSecret === DEV_SECRET)) {
    throw new Error('JWT_SECRET must be set to a strong, unique value in production.');
  }

  let corsOrigin;
  if (isProd) {
    const raw = String(env.CLIENT_ORIGIN || '').trim();
    if (!raw) throw new Error('CLIENT_ORIGIN must list the allowed web origin(s) in production.');
    corsOrigin = raw.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    corsOrigin = env.CLIENT_ORIGIN || true; // reflect any origin in dev (LAN testing)
  }

  return {
    nodeEnv,
    isProd,
    port: Number(env.PORT) || 3001,
    jwtSecret,
    corsOrigin,
    // Until room/lobby state is externalized, a single stray throw should NOT
    // nuke every in-RAM game — so we default to staying up. Set to '1' once a
    // process manager + durable state exist and restart-on-crash is safe.
    exitOnUncaught: env.EXIT_ON_UNCAUGHT === '1',
    // Number of proxy hops to trust for client IP (rate limiting). 0 = none.
    trustProxy: Number(env.TRUST_PROXY) || 0,
  };
}

const config = loadConfig();
export default config;
