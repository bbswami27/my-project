'use strict';

const db = require('./database');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function hydrateDurableSessions() {
  const hasDurableDbConfig = !!(process.env.DATABASE_URL || process.env.PGURI || process.env.POSTGRESQL_URL);
  if (!hasDurableDbConfig) {
    console.log('[SESSION] No PostgreSQL URL configured; using local session cache.');
    return;
  }
  const maxWaitMs = 10000;
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
        for (const s of (db.data.sessions || [])) if (s?.token && Number(s.expiresAtMs || 0) > Date.now()) byToken.set(s.token, s);
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

async function installDurableStatusStore() {
  if (!Array.isArray(db.data.statusUpdates)) db.data.statusUpdates = [];

  // Replace fragile legacy status methods with a simple synchronous in-memory path
  // plus async PostgreSQL persistence. server.js expects saveStatusUpdate() to be synchronous.
  db.saveStatusUpdate = function(statusData = {}) {
    const now = Date.now();
    const status = {
      id: statusData.id || `status_${now}_${Math.random().toString(36).slice(2,8)}`,
      userId: statusData.userId || statusData.authorId || statusData.senderId || '',
      author: statusData.author || statusData.authorName || 'GitPit User',
      avatar: statusData.avatar || statusData.authorAvatar || 'assets/logo-icon.svg',
      type: statusData.type || (statusData.mediaUrl ? 'image' : 'text'),
      text: statusData.text || statusData.caption || '',
      caption: statusData.caption || statusData.text || '',
      mediaUrl: statusData.mediaUrl || statusData.url || '',
      bgColor: statusData.bgColor || '#0284c7',
      time: statusData.time || new Date(now).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
      timestamp: Number(statusData.timestamp || now),
      createdAt: Number(statusData.createdAt || now),
      expiresAt: Number(statusData.expiresAt || (now + 24 * 60 * 60 * 1000))
    };
    db.data.statusUpdates = (db.data.statusUpdates || []).filter(s => s && s.id !== status.id);
    db.data.statusUpdates.unshift(status);
    if (db.data.statusUpdates.length > 5000) db.data.statusUpdates = db.data.statusUpdates.slice(0,5000);
    try { db.saveJson?.(); } catch (e) { console.warn('[STATUS] local save warning:', e.message); }
    if (db.isPostgres && db.pgPool) {
      db.pgPool.query(
        `INSERT INTO cp_status_updates
          (id,user_id,author,avatar,type,text,caption,media_url,bg_color,time_label,timestamp_ms,created_at_ms,expires_at_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
          text=EXCLUDED.text, caption=EXCLUDED.caption, media_url=EXCLUDED.media_url,
          bg_color=EXCLUDED.bg_color, time_label=EXCLUDED.time_label,
          timestamp_ms=EXCLUDED.timestamp_ms, expires_at_ms=EXCLUDED.expires_at_ms`,
        [status.id,status.userId,status.author,status.avatar,status.type,status.text,status.caption,status.mediaUrl,status.bgColor,status.time,status.timestamp,status.createdAt,status.expiresAt]
      ).catch(e => console.error('[STATUS PG SAVE ERROR]', e.message));
    }
    return status;
  };

  db.getActiveStatusUpdates = function() {
    const now = Date.now();
    db.data.statusUpdates = (db.data.statusUpdates || []).filter(s => Number(s.expiresAt || (Number(s.createdAt||0)+86400000)) > now);
    return db.data.statusUpdates.slice().sort((a,b)=>Number(b.timestamp||b.createdAt||0)-Number(a.timestamp||a.createdAt||0));
  };

  if (!(db.isPostgres && db.pgPool)) return;
  try {
    await db.pgPool.query(`CREATE TABLE IF NOT EXISTS cp_status_updates (
      id VARCHAR(120) PRIMARY KEY,
      user_id VARCHAR(120), author VARCHAR(255), avatar TEXT, type VARCHAR(50),
      text TEXT, caption TEXT, media_url TEXT, bg_color VARCHAR(50), time_label VARCHAR(100),
      timestamp_ms BIGINT, created_at_ms BIGINT, expires_at_ms BIGINT
    )`);
    const result = await db.pgPool.query(
      `SELECT id,user_id,author,avatar,type,text,caption,media_url,bg_color,time_label,timestamp_ms,created_at_ms,expires_at_ms
       FROM cp_status_updates WHERE expires_at_ms > $1 ORDER BY timestamp_ms DESC LIMIT 1000`,
      [Date.now()]
    );
    db.data.statusUpdates = (result.rows || []).map(r => ({
      id:r.id,userId:r.user_id,author:r.author,avatar:r.avatar,type:r.type,text:r.text||'',caption:r.caption||'',
      mediaUrl:r.media_url||'',bgColor:r.bg_color||'#0284c7',time:r.time_label||'Recent',
      timestamp:Number(r.timestamp_ms||Date.now()),createdAt:Number(r.created_at_ms||Date.now()),expiresAt:Number(r.expires_at_ms||Date.now()+86400000)
    }));
    console.log(`[STATUS] Rehydrated ${db.data.statusUpdates.length} active status updates.`);
  } catch (e) {
    console.warn('[STATUS] Durable store setup warning:', e.message);
  }
}

(async () => {
  await hydrateDurableSessions();
  await installDurableStatusStore();
  require('./server');
})();
