'use strict';
const { Pool } = require('pg');
const tables = { accounts: 'gp_auth_accounts', sessions: 'gp_auth_sessions', challenges: 'gp_auth_challenges', nonces: 'gp_auth_nonces' };
const migration = `
CREATE TABLE IF NOT EXISTS gp_auth_accounts (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, phone TEXT UNIQUE, google_sub TEXT UNIQUE, body JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS gp_auth_sessions (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES gp_auth_accounts(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL, body JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS gp_auth_sessions_account ON gp_auth_sessions(account_id);
CREATE TABLE IF NOT EXISTS gp_auth_challenges (id TEXT PRIMARY KEY, expires_at BIGINT NOT NULL, body JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS gp_auth_nonces (id TEXT PRIMARY KEY, expires_at BIGINT NOT NULL, body JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS gp_auth_nonce_expiry ON gp_auth_nonces(expires_at);
CREATE INDEX IF NOT EXISTS gp_auth_challenge_expiry ON gp_auth_challenges(expires_at);
`;
class PgStore {
 constructor(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is mandatory; authentication has no JSON fallback.');
  this.pool = new Pool({connectionString: env.DATABASE_URL, max: 10,
   ssl: env.PGSSL === 'disable' ? false : {rejectUnauthorized: true, ...(env.PGSSL_CA ? {ca: env.PGSSL_CA.replace(/\\n/g,'\n')} : {})}});
 }
 async init() { await this.pool.query(migration); }
 async close() { await this.pool.end(); }
 async transaction(fn) {
  const c = await this.pool.connect();
  try {
   await c.query('BEGIN');
   // Serialize identity mutations and nonce consumption across application instances.
   // Short transactions only: provider/network/password work happens outside this lock.
   await c.query("SELECT pg_advisory_xact_lock(741922104)");
   const api = {
    get: async (kind,id) => (await c.query(`SELECT body FROM ${tables[kind]} WHERE id=$1 FOR UPDATE`,[id])).rows[0]?.body || null,
    findAccount: async (field,value) => {
     const col = {email:'email',phone:'phone',googleSub:'google_sub'}[field];
     if (!col) throw new Error('Invalid lookup');
     return (await c.query(`SELECT body FROM gp_auth_accounts WHERE ${col}=$1 FOR UPDATE`,[value])).rows[0]?.body || null;
    },
    save: async (kind,row) => {
     if (kind === 'accounts') await c.query(`INSERT INTO gp_auth_accounts(id,email,phone,google_sub,body) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(id) DO UPDATE SET email=$2,phone=$3,google_sub=$4,body=$5`,[row.id,row.email,row.phone||null,row.googleSub||null,row]);
     else if (kind === 'sessions') await c.query(`INSERT INTO gp_auth_sessions(id,account_id,expires_at,body) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET expires_at=$3,body=$4`,[row.id,row.accountId,row.expiresAt,row]);
     else await c.query(`INSERT INTO ${tables[kind]}(id,expires_at,body) VALUES($1,$2,$3)
      ON CONFLICT(id) DO UPDATE SET expires_at=$2,body=$3`,[row.id,row.expiresAt,row]);
    },
    remove: async (kind,id) => {await c.query(`DELETE FROM ${tables[kind]} WHERE id=$1`,[id]);},
    revokeSessions: async (id) => {await c.query('DELETE FROM gp_auth_sessions WHERE account_id=$1',[id]);}
   };
   const result = await fn(api); await c.query('COMMIT'); return result;
  } catch(e) { await c.query('ROLLBACK'); throw e; } finally {c.release();}
 }
 async prune() {
  const now=Date.now();
  await this.pool.query('DELETE FROM gp_auth_nonces WHERE expires_at<$1',[now]);
  await this.pool.query('DELETE FROM gp_auth_challenges WHERE expires_at<$1',[now]);
  await this.pool.query('DELETE FROM gp_auth_sessions WHERE expires_at<$1',[now]);
 }
}
module.exports={PgStore,migration};
