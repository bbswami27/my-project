'use strict';

// GitPit production bootstrap.
// PostgreSQL already stores login sessions durably, but database.js validates
// sessions from its in-memory cache. Render restarts can therefore make a
// perfectly valid 30-day session appear logged out until it is rehydrated.

const db = require('./database');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function hydrateDurableSessions() {
  const hasDurableDbConfig = !!(
    process.env.DATABASE_URL ||
    process.env.PGURI ||
    process.env.POSTGRESQL_URL
  );

  // Local / JSON-only development must start immediately.
  if (!hasDurableDbConfig) {
    console.log('[SESSION] No PostgreSQL URL configured; using local session cache.');
    return;
  }

  const maxWaitMs = 8000;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    if (db.isPostgres && db.pgPool) {
      try {
        const result = await db.pgPool.query(
          `SELECT token, user_id, created_at, expires_at, expires_at_ms
           FROM cp_sessions
           WHERE expires_at_ms > $1
           ORDER BY created_at DESC`,
          [Date.now()]
        );

        const durable = (result.rows || []).map(row => ({
          token: row.token,
          userId: row.user_id,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : new Date(Number(row.expires_at_ms)).toISOString(),
          expiresAtMs: Number(row.expires_at_ms)
        }));

        const byToken = new Map();
        for (const s of (db.data.sessions || [])) {
          if (s && s.token && Number(s.expiresAtMs || 0) > Date.now()) byToken.set(s.token, s);
        }
        for (const s of durable) byToken.set(s.token, s);
        db.data.sessions = Array.from(byToken.values());

        console.log(`[SESSION] Rehydrated ${durable.length} active PostgreSQL sessions.`);
        return;
      } catch (err) {
        console.warn('[SESSION] Durable session hydration retry:', err.message);
      }
    }
    await sleep(250);
  }

  console.warn('[SESSION] PostgreSQL session hydration timed out; starting with local session cache.');
}

(async () => {
  await hydrateDurableSessions();
  require('./server');
})();
