'use strict';

const crypto = require('crypto');

class OtpStore {
  constructor(pool) { this.pool = pool; }

  async ensureSchema() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS gp2_otp_challenges (
      id VARCHAR(100) PRIMARY KEY,
      phone VARCHAR(50) NOT NULL,
      otp_hash VARCHAR(128) NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      verified_at TIMESTAMPTZ
    )`);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_gp2_otp_phone ON gp2_otp_challenges(phone)');
  }

  hash(id, otp) { return crypto.createHash('sha256').update(`${id}:${otp}`).digest('hex'); }

  async create(phone, otp, ttlMinutes = 5) {
    const id = `otp_${crypto.randomBytes(18).toString('hex')}`;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    await this.pool.query(`INSERT INTO gp2_otp_challenges(id,phone,otp_hash,expires_at) VALUES($1,$2,$3,$4)`, [id, phone, this.hash(id, otp), expiresAt]);
    return { challengeId: id, expiresAt: expiresAt.toISOString() };
  }

  async verify(challengeId, phone, otp) {
    const { rows } = await this.pool.query(`SELECT * FROM gp2_otp_challenges WHERE id=$1 AND phone=$2 LIMIT 1`, [challengeId, phone]);
    if (!rows.length) return { ok:false, reason:'invalid_challenge' };
    const row = rows[0];
    if (row.verified_at) return { ok:false, reason:'already_used' };
    if (new Date(row.expires_at).getTime() <= Date.now()) return { ok:false, reason:'expired' };
    if (row.attempts >= row.max_attempts) return { ok:false, reason:'too_many_attempts' };
    if (this.hash(challengeId, otp) !== row.otp_hash) {
      await this.pool.query('UPDATE gp2_otp_challenges SET attempts=attempts+1 WHERE id=$1', [challengeId]);
      return { ok:false, reason:'incorrect_otp' };
    }
    await this.pool.query('UPDATE gp2_otp_challenges SET verified_at=NOW() WHERE id=$1', [challengeId]);
    return { ok:true };
  }
}

module.exports = OtpStore;
