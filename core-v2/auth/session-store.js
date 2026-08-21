'use strict';

const crypto = require('crypto');

class SessionStore {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS gp2_sessions (
        token_hash VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        device_id VARCHAR(255),
        user_agent TEXT,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_gp2_sessions_user_id ON gp2_sessions(user_id)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_gp2_sessions_expires_at ON gp2_sessions(expires_at)');
  }

  hash(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
  }

  async create(userId, options = {}) {
    if (!userId) throw new Error('userId is required');
    const days = Number(options.days || 30);
    const token = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hash(token);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO gp2_sessions
       (token_hash, user_id, expires_at, device_id, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [tokenHash, userId, expiresAt, options.deviceId || null, options.userAgent || null]
    );

    return { token, expiresAt: expiresAt.toISOString() };
  }

  async validate(token) {
    if (!token) return null;
    const tokenHash = this.hash(token);
    const { rows } = await this.pool.query(
      `SELECT token_hash, user_id, created_at, expires_at, revoked_at, device_id, last_seen_at
       FROM gp2_sessions
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    if (!rows.length) return null;

    await this.pool.query(
      'UPDATE gp2_sessions SET last_seen_at = NOW() WHERE token_hash = $1',
      [tokenHash]
    );

    return {
      userId: rows[0].user_id,
      createdAt: rows[0].created_at,
      expiresAt: rows[0].expires_at,
      deviceId: rows[0].device_id,
      lastSeenAt: rows[0].last_seen_at
    };
  }

  async revoke(token) {
    if (!token) return false;
    const result = await this.pool.query(
      'UPDATE gp2_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
      [this.hash(token)]
    );
    return result.rowCount > 0;
  }

  async revokeAllForUser(userId) {
    const result = await this.pool.query(
      'UPDATE gp2_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
    return result.rowCount;
  }

  async cleanupExpired() {
    const result = await this.pool.query(
      `DELETE FROM gp2_sessions
       WHERE expires_at < NOW() - INTERVAL '7 days'
          OR revoked_at < NOW() - INTERVAL '7 days'`
    );
    return result.rowCount;
  }
}

module.exports = SessionStore;
