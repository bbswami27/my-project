'use strict';

class UserStore {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS gp2_users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) UNIQUE NOT NULL,
        phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
        avatar TEXT,
        bio TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '').slice(-10);
    return digits.length === 10 ? `+91${digits}` : '';
  }

  async getById(id) {
    const { rows } = await this.pool.query(
      'SELECT id,name,phone,phone_verified,avatar,bio,created_at,updated_at FROM gp2_users WHERE id = $1 LIMIT 1',
      [id]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async getByPhone(phone) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return null;
    const { rows } = await this.pool.query(
      'SELECT id,name,phone,phone_verified,avatar,bio,created_at,updated_at FROM gp2_users WHERE phone = $1 LIMIT 1',
      [normalized]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async upsertVerified({ id, name, phone, avatar, bio }) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) throw new Error('Valid mobile number is required');
    const userId = id || `gp2_${normalized.slice(-10)}`;
    const displayName = String(name || `GitPit User ${normalized.slice(-4)}`).trim();
    const { rows } = await this.pool.query(
      `INSERT INTO gp2_users (id,name,phone,phone_verified,avatar,bio)
       VALUES ($1,$2,$3,TRUE,$4,$5)
       ON CONFLICT (phone) DO UPDATE SET
         name = EXCLUDED.name,
         phone_verified = TRUE,
         avatar = COALESCE(EXCLUDED.avatar,gp2_users.avatar),
         bio = COALESCE(EXCLUDED.bio,gp2_users.bio),
         updated_at = NOW()
       RETURNING id,name,phone,phone_verified,avatar,bio,created_at,updated_at`,
      [userId, displayName, normalized, avatar || null, bio || null]
    );
    return this.map(rows[0]);
  }

  map(row) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      phoneVerified: !!row.phone_verified,
      avatar: row.avatar || '',
      bio: row.bio || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = UserStore;
