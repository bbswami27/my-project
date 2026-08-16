// ChatterPatter - Production Database Engine (PostgreSQL Durable Engine with JSON Fallback & Safe Migration)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'chatterpatter_data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial in-memory/JSON schema
const initialSchema = {
  users: [],
  sessions: [],
  otps: {},
  messages: [],
  groups: [],
  statusUpdates: [],
  blockedContacts: {},
  callLogs: [],
  pushTokens: [],
  linkedDevices: {},
  settings: {}
};

class Database {
  constructor() {
    this.data = this.loadJson();
    this.pgPool = null;
    this.isPostgres = false;
    this.initPostgres();
  }

  // ================= POSTGRESQL DURABLE STORAGE =================
  async initPostgres() {
    const dbUrl = process.env.DATABASE_URL || process.env.PGURI || process.env.POSTGRESQL_URL;
    if (!dbUrl) {
      console.warn('⚠️ [DATABASE WARNING] Running in local JSON file-based mode. Render disk is ephemeral.');
      console.warn('💡 [DATABASE SETUP] For true production persistence, add a PostgreSQL database in Render and set DATABASE_URL.');
      return;
    }

    try {
      this.pgPool = new Pool({
        connectionString: dbUrl,
        ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
      });

      // Test connection
      const client = await this.pgPool.connect();
      console.log('✅ [DATABASE] Connected to Durable External PostgreSQL Database!');
      this.isPostgres = true;

      // Run DDL Schema Migration
      await this.runPgMigrations(client);
      await this.seedPgFromLocalJson(client);
      client.release();
    } catch (err) {
      console.error('❌ [DATABASE ERROR] PostgreSQL connection failed, falling back to local file storage:', err.message);
      this.isPostgres = false;
    }
  }

  async runPgMigrations(client) {
    const ddl = `
      CREATE TABLE IF NOT EXISTS cp_users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(255),
        phone VARCHAR(50) UNIQUE,
        phone_verified BOOLEAN DEFAULT FALSE,
        phone_verified_at TIMESTAMPTZ,
        email VARCHAR(255),
        password_hash VARCHAR(255),
        dob VARCHAR(50),
        anniversary VARCHAR(50),
        bio TEXT,
        avatar TEXT,
        status VARCHAR(100),
        presence VARCHAR(50) DEFAULT 'online',
        privacy JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cp_sessions (
        token VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(100) REFERENCES cp_users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        expires_at_ms BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cp_otps (
        phone VARCHAR(50) PRIMARY KEY,
        otp_hash VARCHAR(255) NOT NULL,
        expires_at BIGINT NOT NULL,
        attempts INT DEFAULT 0,
        last_sent_at BIGINT NOT NULL,
        request_count INT DEFAULT 1,
        window_start BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cp_messages (
        id VARCHAR(100) PRIMARY KEY,
        chat_id VARCHAR(150) NOT NULL,
        sender_id VARCHAR(100) NOT NULL,
        sender_name VARCHAR(255),
        sender_avatar TEXT,
        sender_phone VARCHAR(50),
        recipient_id VARCHAR(100),
        recipient_phone VARCHAR(50),
        text TEXT,
        type VARCHAR(50) DEFAULT 'text',
        media_url TEXT,
        file_size BIGINT,
        file_name VARCHAR(255),
        reactions JSONB DEFAULT '[]'::jsonb,
        quote JSONB,
        edited BOOLEAN DEFAULT FALSE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cp_groups (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        avatar TEXT,
        created_by_id VARCHAR(100),
        members JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cp_call_logs (
        id VARCHAR(100) PRIMARY KEY,
        caller_id VARCHAR(100) NOT NULL,
        caller_name VARCHAR(255),
        caller_phone VARCHAR(50),
        receiver_id VARCHAR(100) NOT NULL,
        receiver_name VARCHAR(255),
        receiver_phone VARCHAR(50),
        type VARCHAR(50) DEFAULT 'video',
        duration VARCHAR(50) DEFAULT '00:00',
        duration_seconds INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'completed',
        timestamp VARCHAR(100),
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cp_blocked_contacts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        target_user_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, target_user_id)
      );

      CREATE TABLE IF NOT EXISTS cp_push_tokens (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        token TEXT UNIQUE NOT NULL,
        platform VARCHAR(50) DEFAULT 'android',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await client.query(ddl);
    console.log('✅ [DATABASE] PostgreSQL Tables & DDL Schema Migrations verified.');
  }

  async seedPgFromLocalJson(client) {
    try {
      const res = await client.query('SELECT COUNT(*) FROM cp_users');
      if (parseInt(res.rows[0].count, 10) === 0 && this.data.users.length > 0) {
        console.log(`[DATABASE] Seeding ${this.data.users.length} existing valid users into PostgreSQL...`);
        for (const u of this.data.users) {
          if (u.phoneVerified) {
            await client.query(
              `INSERT INTO cp_users (id, name, username, phone, phone_verified, phone_verified_at, email, avatar, bio, status, privacy)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (id) DO NOTHING`,
              [u.id, u.name, u.username, u.phone, u.phoneVerified, u.phoneVerifiedAt || new Date().toISOString(), u.email || '', u.avatar || '', u.bio || '', u.status || '', JSON.stringify(u.privacy || {})]
            );
          }
        }
      }
    } catch (e) {
      console.warn('[DATABASE SEED WARNING]', e.message);
    }
  }

  // ================= LOCAL JSON ENGINE (DEV / FALLBACK) =================
  loadJson() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...initialSchema, ...parsed };
      }
    } catch (e) {
      console.error('[DB] Error reading JSON DB file:', e.message);
    }
    return JSON.parse(JSON.stringify(initialSchema));
  }

  saveJson(data = this.data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Error writing to JSON DB file:', e.message);
    }
  }

  // ================= UTILS & CRYPTO =================
  normalizePhone(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (phone.startsWith('+')) return `+${digits}`;
    return digits ? `+${digits}` : '';
  }

  hashString(str, salt = 'gitpit_secure_salt_2026') {
    return crypto.createHmac('sha256', salt).update(String(str)).digest('hex');
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // ================= SESSIONS =================
  createSession(userId, durationDays = 30) {
    const token = this.generateToken();
    const now = Date.now();
    const expiresAtMs = now + (durationDays * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(expiresAtMs).toISOString();

    // Local JSON
    this.data.sessions = this.data.sessions.filter(s => s.expiresAtMs > now);
    const session = {
      token,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt,
      expiresAtMs
    };
    this.data.sessions.push(session);
    this.saveJson();

    // PostgreSQL
    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `INSERT INTO cp_sessions (token, user_id, expires_at, expires_at_ms)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (token) DO UPDATE SET expires_at = $3, expires_at_ms = $4`,
        [token, userId, expiresAt, expiresAtMs]
      ).catch(e => console.error('[PG SESSION INSERT ERROR]', e.message));
    }

    return session;
  }

  validateSession(token) {
    if (!token) return null;
    const now = Date.now();
    const session = this.data.sessions.find(s => s.token === token && (s.expiresAtMs ? s.expiresAtMs > now : new Date(s.expiresAt).getTime() > now));
    if (!session) return null;

    const user = this.getUser(session.userId);
    if (!user) return null;

    return { session, user };
  }

  deleteSession(token) {
    if (!token) return false;
    this.data.sessions = this.data.sessions.filter(s => s.token !== token);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query('DELETE FROM cp_sessions WHERE token = $1', [token])
        .catch(e => console.error('[PG SESSION DELETE ERROR]', e.message));
    }
    return true;
  }

  // ================= OTPS =================
  storeOtp(phone, otp, expiresInSec = 600) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return false;

    const now = Date.now();
    const existing = this.data.otps[normalized] || {};
    
    const windowStart = (existing.windowStart && (now - existing.windowStart < 10 * 60 * 1000)) ? existing.windowStart : now;
    const requestCount = (windowStart === existing.windowStart) ? (existing.requestCount || 0) + 1 : 1;
    const expiresAt = now + (expiresInSec * 1000);
    const otpHash = this.hashString(otp, normalized);

    this.data.otps[normalized] = {
      otpHash,
      expiresAt,
      attempts: 0,
      lastSentAt: now,
      requestCount,
      windowStart
    };
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `INSERT INTO cp_otps (phone, otp_hash, expires_at, attempts, last_sent_at, request_count, window_start)
         VALUES ($1, $2, $3, 0, $4, $5, $6)
         ON CONFLICT (phone) DO UPDATE 
         SET otp_hash = $2, expires_at = $3, attempts = 0, last_sent_at = $4, request_count = $5, window_start = $6`,
        [normalized, otpHash, expiresAt, now, requestCount, windowStart]
      ).catch(e => console.error('[PG OTP INSERT ERROR]', e.message));
    }

    return true;
  }

  getOtpStatus(phone) {
    const normalized = this.normalizePhone(phone);
    if (!normalized || !this.data.otps[normalized]) return null;
    return this.data.otps[normalized];
  }

  verifyOtp(phone, otp) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return { success: false, error: 'Invalid phone number format' };

    const record = this.data.otps[normalized];
    if (!record) {
      return { success: false, error: 'No OTP requested for this phone number. Please request a new OTP.' };
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      delete this.data.otps[normalized];
      this.saveJson();
      return { success: false, error: 'OTP has expired. Please request a fresh code.' };
    }

    if (record.attempts >= 5) {
      delete this.data.otps[normalized];
      this.saveJson();
      return { success: false, error: 'Too many incorrect attempts. Please request a new OTP.' };
    }

    const inputHash = this.hashString(otp, normalized);
    if (inputHash !== record.otpHash) {
      record.attempts += 1;
      this.saveJson();
      return { success: false, error: `Invalid OTP code. (${5 - record.attempts} attempts remaining)` };
    }

    delete this.data.otps[normalized];
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query('DELETE FROM cp_otps WHERE phone = $1', [normalized])
        .catch(e => console.error('[PG OTP DELETE ERROR]', e.message));
    }

    return { success: true };
  }

  // ================= USERS =================
  findUserByPhone(phone) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return null;
    const cleanDigits = normalized.slice(-10);
    return this.data.users.find(u => {
      const uNorm = this.normalizePhone(u.phone);
      return uNorm === normalized || (u.phone && u.phone.replace(/\D/g, '').slice(-10) === cleanDigits);
    });
  }

  findUserByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    return this.data.users.find(u => u.email && u.email.trim().toLowerCase() === cleanEmail);
  }

  getUser(userId) {
    return this.data.users.find(u => u.id === userId);
  }

  saveUser(userData) {
    if (!userData) return null;
    const normalizedPhone = this.normalizePhone(userData.phone);
    
    let existing = null;
    if (userData.id) existing = this.data.users.find(u => u.id === userData.id);
    if (!existing && normalizedPhone) existing = this.findUserByPhone(normalizedPhone);
    if (!existing && userData.email) existing = this.findUserByEmail(userData.email);

    if (existing) {
      if (userData.name) existing.name = userData.name;
      if (userData.username) existing.username = userData.username;
      if (normalizedPhone) {
        existing.phone = normalizedPhone;
        if (userData.phoneVerified !== undefined) {
          existing.phoneVerified = userData.phoneVerified;
          existing.phoneVerifiedAt = userData.phoneVerifiedAt || new Date().toISOString();
        }
      }
      if (userData.email) existing.email = userData.email.trim().toLowerCase();
      if (userData.passwordHash) existing.passwordHash = userData.passwordHash;
      if (userData.avatar) existing.avatar = userData.avatar;
      if (userData.bio) existing.bio = userData.bio;
      if (userData.dob) existing.dob = userData.dob;
      if (userData.privacy) {
        existing.privacy = { ...(existing.privacy || {}), ...userData.privacy };
      }
      existing.updatedAt = new Date().toISOString();
      this.saveJson();

      if (this.isPostgres && this.pgPool) {
        this.pgPool.query(
          `UPDATE cp_users 
           SET name = $2, phone = $3, phone_verified = $4, phone_verified_at = $5, email = $6, avatar = $7, bio = $8, privacy = $9, updated_at = NOW()
           WHERE id = $1`,
          [existing.id, existing.name, existing.phone, existing.phoneVerified, existing.phoneVerifiedAt, existing.email || '', existing.avatar || '', existing.bio || '', JSON.stringify(existing.privacy || {})]
        ).catch(e => console.error('[PG USER UPDATE ERROR]', e.message));
      }

      return existing;
    } else {
      const newUserId = userData.id || ('usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
      const cleanPhoneDigits = normalizedPhone ? normalizedPhone.slice(-4) : Math.floor(1000 + Math.random() * 9000);
      
      const newUser = {
        id: newUserId,
        name: userData.name || `User ${cleanPhoneDigits}`,
        username: userData.username || ('@' + (userData.name ? userData.name.toLowerCase().replace(/\s+/g, '_') : `user_${cleanPhoneDigits}`)),
        phone: normalizedPhone || '',
        phoneVerified: !!userData.phoneVerified,
        phoneVerifiedAt: userData.phoneVerified ? (userData.phoneVerifiedAt || new Date().toISOString()) : null,
        email: userData.email ? userData.email.trim().toLowerCase() : '',
        passwordHash: userData.passwordHash || null,
        dob: userData.dob || '',
        anniversary: userData.anniversary || '',
        bio: userData.bio || 'Hey there! I am using ChatterPatter 🚀',
        avatar: userData.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${newUserId}`,
        status: userData.status || 'Available 🟢',
        presence: 'online',
        privacy: userData.privacy || { hidePhone: false, hideEmail: false, hideDob: false, hideLastSeen: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.data.users.push(newUser);
      this.saveJson();

      if (this.isPostgres && this.pgPool) {
        this.pgPool.query(
          `INSERT INTO cp_users (id, name, username, phone, phone_verified, phone_verified_at, email, avatar, bio, status, privacy)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [newUser.id, newUser.name, newUser.username, newUser.phone, newUser.phoneVerified, newUser.phoneVerifiedAt, newUser.email || '', newUser.avatar || '', newUser.bio || '', newUser.status || '', JSON.stringify(newUser.privacy || {})]
        ).catch(e => console.error('[PG USER INSERT ERROR]', e.message));
      }

      return newUser;
    }
  }

  matchContactsByPhones(normalizedPhones = []) {
    if (!Array.isArray(normalizedPhones) || normalizedPhones.length === 0) return [];
    const phoneSet = new Set(normalizedPhones.map(p => this.normalizePhone(p)).filter(Boolean));
    const cleanLast10Set = new Set(Array.from(phoneSet).map(p => p.slice(-10)));

    return this.data.users.filter(u => {
      if (!u.phoneVerified || !u.phone) return false;
      const uNorm = this.normalizePhone(u.phone);
      const uLast10 = uNorm.slice(-10);
      return phoneSet.has(uNorm) || cleanLast10Set.has(uLast10);
    }).map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      avatar: u.avatar,
      phone: u.phone,
      bio: u.bio || u.status || 'Hey there! I am using ChatterPatter 🚀',
      online: u.online || false
    }));
  }

  getAllUsers(requestingUserId = null) {
    return this.data.users
      .filter(u => u.phoneVerified)
      .map(u => {
        const isSelf = requestingUserId && u.id === requestingUserId;
        const priv = u.privacy || {};
        return {
          id: u.id,
          name: u.name,
          username: u.username,
          avatar: u.avatar,
          bio: u.bio || u.status,
          status: u.status,
          presence: u.presence,
          online: u.online || false,
          phone: u.phone || '',
          email: (isSelf || !priv.hideEmail) ? u.email : '',
          dob: (isSelf || !priv.hideDob) ? u.dob : '',
          privacy: isSelf ? priv : undefined
        };
      });
  }

  // ================= BLOCKING =================
  blockUser(userId, targetUserId) {
    if (!this.data.blockedContacts) this.data.blockedContacts = {};
    if (!this.data.blockedContacts[userId]) this.data.blockedContacts[userId] = [];
    if (!this.data.blockedContacts[userId].includes(targetUserId)) {
      this.data.blockedContacts[userId].push(targetUserId);
      this.saveJson();

      if (this.isPostgres && this.pgPool) {
        this.pgPool.query(
          `INSERT INTO cp_blocked_contacts (user_id, target_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, targetUserId]
        ).catch(e => console.error('[PG BLOCK ERROR]', e.message));
      }
    }
    return this.data.blockedContacts[userId];
  }

  unblockUser(userId, targetUserId) {
    if (this.data.blockedContacts && this.data.blockedContacts[userId]) {
      this.data.blockedContacts[userId] = this.data.blockedContacts[userId].filter(id => id !== targetUserId);
      this.saveJson();

      if (this.isPostgres && this.pgPool) {
        this.pgPool.query(
          `DELETE FROM cp_blocked_contacts WHERE user_id = $1 AND target_user_id = $2`,
          [userId, targetUserId]
        ).catch(e => console.error('[PG UNBLOCK ERROR]', e.message));
      }
      return this.data.blockedContacts[userId];
    }
    return [];
  }

  getBlockedUsers(userId) {
    return (this.data.blockedContacts && this.data.blockedContacts[userId]) ? this.data.blockedContacts[userId] : [];
  }

  isBlocked(senderId, recipientId) {
    if (!this.data.blockedContacts) return false;
    const recipientBlocks = this.data.blockedContacts[recipientId] || [];
    const senderBlocks = this.data.blockedContacts[senderId] || [];
    return recipientBlocks.includes(senderId) || senderBlocks.includes(recipientId);
  }

  // ================= MESSAGES =================
  saveMessage(msg) {
    const newMsg = {
      id: msg.id || 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      chatId: msg.chatId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      senderAvatar: msg.senderAvatar,
      senderPhone: msg.senderPhone || '',
      recipientId: msg.recipientId || '',
      recipientPhone: msg.recipientPhone || '',
      text: msg.text || '',
      type: msg.type || 'text',
      mediaUrl: msg.mediaUrl || null,
      fileSize: msg.fileSize || null,
      fileName: msg.fileName || null,
      reactions: msg.reactions || [],
      quote: msg.quote || null,
      edited: msg.edited || false,
      isDeleted: msg.isDeleted || false,
      createdAt: msg.createdAt || Date.now()
    };

    this.data.messages.push(newMsg);
    if (this.data.messages.length > 25000) {
      this.data.messages = this.data.messages.slice(-25000);
    }
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `INSERT INTO cp_messages (id, chat_id, sender_id, sender_name, sender_avatar, sender_phone, recipient_id, recipient_phone, text, type, media_url, file_size, file_name, reactions, quote, edited, is_deleted, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (id) DO NOTHING`,
        [newMsg.id, newMsg.chatId, newMsg.senderId, newMsg.senderName, newMsg.senderAvatar, newMsg.senderPhone, newMsg.recipientId, newMsg.recipientPhone, newMsg.text, newMsg.type, newMsg.mediaUrl, newMsg.fileSize, newMsg.fileName, JSON.stringify(newMsg.reactions), newMsg.quote ? JSON.stringify(newMsg.quote) : null, newMsg.edited, newMsg.isDeleted, newMsg.createdAt]
      ).catch(e => console.error('[PG MESSAGE INSERT ERROR]', e.message));
    }

    return newMsg;
  }

  getChatMessages(chatId, limit = 200) {
    return this.data.messages
      .filter(m => m.chatId === chatId)
      .slice(-limit);
  }

  // ================= CALL LOGS =================
  saveCallLog(log) {
    const callEntry = {
      id: log.id || 'call_' + Date.now(),
      callerId: log.callerId,
      callerName: log.callerName || 'User',
      callerPhone: log.callerPhone || '',
      receiverId: log.receiverId,
      receiverName: log.receiverName || 'User',
      receiverPhone: log.receiverPhone || '',
      type: log.type || 'video',
      duration: log.duration || '00:00',
      durationSeconds: log.durationSeconds || 0,
      status: log.status || 'completed',
      timestamp: log.timestamp || new Date().toLocaleString(),
      createdAt: Date.now()
    };
    if (!this.data.callLogs) this.data.callLogs = [];
    this.data.callLogs.unshift(callEntry);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `INSERT INTO cp_call_logs (id, caller_id, caller_name, caller_phone, receiver_id, receiver_name, receiver_phone, type, duration, duration_seconds, status, timestamp, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [callEntry.id, callEntry.callerId, callEntry.callerName, callEntry.callerPhone, callEntry.receiverId, callEntry.receiverName, callEntry.receiverPhone, callEntry.type, callEntry.duration, callEntry.durationSeconds, callEntry.status, callEntry.timestamp, callEntry.createdAt]
      ).catch(e => console.error('[PG CALL LOG ERROR]', e.message));
    }

    return callEntry;
  }

  getCallLogs(userId) {
    return (this.data.callLogs || []).filter(c => c.callerId === userId || c.receiverId === userId);
  }

  // ================= PUSH TOKENS =================
  registerPushToken(userId, token, platform = 'android') {
    if (!this.data.pushTokens) this.data.pushTokens = [];
    this.data.pushTokens = this.data.pushTokens.filter(p => p.token !== token);
    const entry = { userId, token, platform, updatedAt: new Date().toISOString() };
    this.data.pushTokens.push(entry);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `INSERT INTO cp_push_tokens (user_id, token, platform, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3, updated_at = NOW()`,
        [userId, token, platform]
      ).catch(e => console.error('[PG PUSH TOKEN ERROR]', e.message));
    }

    return entry;
  }

  getPushTokens(userId) {
    return (this.data.pushTokens || []).filter(p => p.userId === userId);
  }
}

module.exports = new Database();
