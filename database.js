// GitPit - Production Database Engine (PostgreSQL Durable Engine with JSON Fallback & Safe Migration)
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

const DEFAULT_DUMMY_USERS = [
  {
    id: 'user_9811122334',
    name: 'Aarav Sharma',
    username: '@aarav',
    phone: '+919811122334',
    email: 'aarav@gitpit.io',
    avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aarav',
    bio: 'Product Architect & Lead 💻 • GitPit Team',
    status: 'Available',
    online: true,
    phoneVerified: true
  },
  {
    id: 'user_9822233445',
    name: 'Priya Patel',
    username: '@priya',
    phone: '+919822233445',
    email: 'priya@gitpit.io',
    avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Priya',
    bio: 'UI/UX Designer ✨ • Coffee & Code',
    status: 'Available',
    online: true,
    phoneVerified: true
  },
  {
    id: 'user_9833344556',
    name: 'Rohan Verma',
    username: '@rohan',
    phone: '+919833344556',
    email: 'rohan@gitpit.io',
    avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Rohan',
    bio: 'Mobile & Realtime Engineer 📱 • Ready for calls',
    status: 'Available',
    online: true,
    phoneVerified: true
  },
  {
    id: 'user_9844455667',
    name: 'Ananya Gupta',
    username: '@ananya',
    phone: '+919844455667',
    email: 'ananya@gitpit.io',
    avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Ananya',
    bio: 'Cloud Architect & WebRTC ☁️ • Active on GitPit',
    status: 'Available',
    online: true,
    phoneVerified: true
  }
];

class Database {
  constructor() {
    this.data = this.loadJson();
    this.seedDummyUsers();
    this.pgPool = null;
    this.isPostgres = false;
    this.initPostgres();
  }

  seedDummyUsers() {
    DEFAULT_DUMMY_USERS.forEach(dummy => {
      const idx = this.data.users.findIndex(u => u.id === dummy.id || (dummy.phone && u.phone === this.normalizePhone(dummy.phone)));
      if (idx === -1) {
        this.data.users.push({
          ...dummy,
          phone: this.normalizePhone(dummy.phone),
          phoneVerified: true,
          phoneVerifiedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      } else {
        this.data.users[idx] = { ...this.data.users[idx], ...dummy, phoneVerified: true };
      }
    });
    this.saveJson();
  }

  async cleanupAndResetFourDemoUsers() {
    console.log('🧹 [DATABASE CLEANUP] Purging all non-demo users and seeding 4 official demo accounts...');
    
    // 1. Reset JSON in-memory data
    const fourUserIds = DEFAULT_DUMMY_USERS.map(u => u.id);
    const fourUserPhones = DEFAULT_DUMMY_USERS.map(u => this.normalizePhone(u.phone));
    
    this.data.users = DEFAULT_DUMMY_USERS.map(dummy => ({
      ...dummy,
      phone: this.normalizePhone(dummy.phone),
      phoneVerified: true,
      phoneVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }));
    
    this.data.sessions = [];
    this.data.otps = {};
    this.saveJson();

    // 2. Clean PostgreSQL durable database if active
    if (this.isPostgres && this.pgPool) {
      try {
        const client = await this.pgPool.connect();
        try {
          await client.query(`DELETE FROM cp_users WHERE id NOT IN ('user_9811122334', 'user_9822233445', 'user_9833344556', 'user_9844455667')`);
          
          for (const u of DEFAULT_DUMMY_USERS) {
            await client.query(`
              INSERT INTO cp_users (id, name, username, phone, phone_verified, phone_verified_at, email, bio, avatar, status, presence)
              VALUES ($1, $2, $3, $4, true, NOW(), $5, $6, $7, $8, 'online')
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                username = EXCLUDED.username,
                phone = EXCLUDED.phone,
                phone_verified = true,
                email = EXCLUDED.email,
                bio = EXCLUDED.bio,
                avatar = EXCLUDED.avatar,
                status = EXCLUDED.status,
                presence = 'online',
                updated_at = NOW()
            `, [u.id, u.name, u.username, u.phone, u.email, u.bio, u.avatar, u.status]);
          }
          console.log('✅ [DATABASE CLEANUP] PostgreSQL database cleaned and 4 demo users seeded successfully!');
        } finally {
          client.release();
        }
      } catch (err) {
        console.error('❌ [DATABASE CLEANUP ERROR] Failed cleaning PostgreSQL:', err.message);
      }
    }

    return this.data.users;
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
      await this.loadDataFromPg(client);
      client.release();
    } catch (err) {
      console.error('❌ [DATABASE ERROR] PostgreSQL connection failed, falling back to local file storage:', err.message);
      this.isPostgres = false;
    }
  }

  async loadDataFromPg(client) {
    try {
      // 1. Sync Users from PostgreSQL
      const res = await client.query('SELECT * FROM cp_users');
      if (res && res.rows) {
        res.rows.forEach(row => {
          const u = {
            id: row.id,
            name: row.name,
            username: row.username,
            phone: row.phone,
            phoneVerified: !!row.phone_verified,
            phoneVerifiedAt: row.phone_verified_at,
            email: row.email,
            passwordHash: row.password_hash,
            dob: row.dob,
            anniversary: row.anniversary,
            bio: row.bio,
            avatar: row.avatar,
            status: row.status,
            presence: row.presence || 'online',
            privacy: typeof row.privacy === 'string' ? JSON.parse(row.privacy) : (row.privacy || {}),
            createdAt: row.created_at,
            updatedAt: row.updated_at
          };
          const idx = this.data.users.findIndex(x => x.id === u.id || (u.phone && x.phone === u.phone));
          if (idx >= 0) {
            this.data.users[idx] = { ...this.data.users[idx], ...u };
          } else {
            this.data.users.push(u);
          }
        });
        console.log(`✅ [DATABASE] Synced ${res.rows.length} verified users from PostgreSQL into active memory.`);
      }

      // 2. Sync Messages from PostgreSQL
      const msgRes = await client.query('SELECT * FROM cp_messages ORDER BY created_at ASC LIMIT 1000');
      if (msgRes && msgRes.rows) {
        msgRes.rows.forEach(row => {
          const m = {
            id: row.id,
            chatId: row.chat_id,
            senderId: row.sender_id,
            senderPhone: row.sender_phone,
            recipientId: row.recipient_id,
            recipientPhone: row.recipient_phone,
            text: row.text,
            type: row.type || 'text',
            mediaUrl: row.media_url,
            mediaName: row.media_name,
            mediaSize: row.media_size,
            objectKey: row.object_key,
            isAi: row.is_ai,
            timestamp: row.timestamp,
            time: row.time,
            status: row.status || 'sent',
            reactions: typeof row.reactions === 'string' ? JSON.parse(row.reactions) : (row.reactions || {}),
            isDeleted: row.is_deleted,
            createdAt: Number(row.created_at)
          };
          const existingMsg = this.data.messages.find(x => x.id === m.id);
          if (!existingMsg) {
            this.data.messages.push(m);
          }
        });
      }

      // 3. Sync Groups from PostgreSQL
      const grpRes = await client.query('SELECT * FROM cp_groups');
      if (grpRes && grpRes.rows) {
        if (!this.data.groups) this.data.groups = [];
        grpRes.rows.forEach(row => {
          const g = {
            id: row.id,
            name: row.name,
            avatar: row.avatar,
            createdById: row.created_by_id,
            members: typeof row.members === 'string' ? JSON.parse(row.members) : (row.members || []),
            isGroup: true,
            createdAt: row.created_at
          };
          const idx = this.data.groups.findIndex(x => x.id === g.id);
          if (idx >= 0) this.data.groups[idx] = g;
          else this.data.groups.push(g);
        });
      }

      // 4. Sync Meetings from PostgreSQL
      const meetRes = await client.query('SELECT * FROM cp_meetings');
      if (meetRes && meetRes.rows) {
        if (!this.data.meetings) this.data.meetings = [];
        meetRes.rows.forEach(row => {
          const mt = {
            id: row.id,
            title: row.title,
            date: row.date,
            time: row.time,
            duration: row.duration,
            hostId: row.host_id,
            host: row.host_name,
            avatar: row.avatar,
            createdAt: row.created_at
          };
          const idx = this.data.meetings.findIndex(x => x.id === mt.id);
          if (idx >= 0) this.data.meetings[idx] = mt;
          else this.data.meetings.push(mt);
        });
      }

      // 5. Sync Memos from PostgreSQL
      const memoRes = await client.query('SELECT * FROM cp_memos');
      if (memoRes && memoRes.rows) {
        if (!this.data.memos) this.data.memos = [];
        memoRes.rows.forEach(row => {
          const mem = {
            id: row.id,
            subject: row.subject,
            sender: row.sender,
            senderId: row.sender_id,
            senderAvatar: row.sender_avatar,
            time: row.time,
            priority: row.priority,
            body: row.body,
            createdAt: row.created_at
          };
          const idx = this.data.memos.findIndex(x => x.id === mem.id);
          if (idx >= 0) this.data.memos[idx] = mem;
          else this.data.memos.push(mem);
        });
      }
    } catch (e) {
      console.warn('[DATABASE LOAD PG WARNING]', e.message);
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

      CREATE TABLE IF NOT EXISTS cp_meetings (
        id VARCHAR(100) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        date VARCHAR(50),
        time VARCHAR(50),
        duration VARCHAR(50),
        host_id VARCHAR(100),
        host_name VARCHAR(255),
        avatar TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cp_memos (
        id VARCHAR(100) PRIMARY KEY,
        subject VARCHAR(255) NOT NULL,
        sender VARCHAR(255),
        sender_id VARCHAR(100),
        sender_avatar TEXT,
        time VARCHAR(100),
        priority VARCHAR(50) DEFAULT 'normal',
        body TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cp_linked_devices (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        device_name VARCHAR(255) NOT NULL,
        browser VARCHAR(100),
        os VARCHAR(100),
        ip_address VARCHAR(100),
        location VARCHAR(255),
        last_active VARCHAR(100),
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
      for (const u of DEFAULT_DUMMY_USERS) {
        const normalizedPhone = this.normalizePhone(u.phone);
        await client.query(
          `INSERT INTO cp_users (id, name, username, phone, phone_verified, phone_verified_at, email, avatar, bio, status, privacy)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [u.id, u.name, u.username, normalizedPhone, true, new Date().toISOString(), u.email || '', u.avatar || '', u.bio || '', u.status || '', JSON.stringify({})]
        ).catch(() => {});
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
    let cleaned = String(phone).trim().replace(/[^\d+]/g, '');
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
    if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.slice(1);
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length === 10) return `+91${digitsOnly}`;
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) return `+${digitsOnly}`;
    if (cleaned.startsWith('+')) return cleaned;
    return digitsOnly ? `+${digitsOnly}` : '';
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
        bio: userData.bio || 'Hey there! I am using GitPit 🚀',
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

  syncRegisteredContacts(contacts = []) {
    const registered = [];
    const nonRegistered = [];
    const users = this.data.users || [];

    contacts.forEach(c => {
      const rawPhone = typeof c === 'string' ? c : (c.phone || '');
      const rawName = typeof c === 'string' ? '' : (c.name || '');
      const cleanDigits = rawPhone.replace(/\D/g, '').slice(-10);

      if (!cleanDigits || cleanDigits.length < 10) return;

      const matchedUser = users.find(u => {
        if (!u.phone) return false;
        const uDigits = u.phone.replace(/\D/g, '').slice(-10);
        return uDigits === cleanDigits;
      });

      if (matchedUser) {
        registered.push({
          id: matchedUser.id,
          name: matchedUser.name || rawName || `+91 ${cleanDigits}`,
          savedName: rawName || matchedUser.name || `+91 ${cleanDigits}`,
          phone: matchedUser.phone || `+91${cleanDigits}`,
          avatar: matchedUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits}`,
          bio: matchedUser.bio || matchedUser.status || 'Active on GitPit 🚀',
          online: matchedUser.online || false,
          is_registered: true
        });
      } else {
        nonRegistered.push({
          name: rawName || `Contact (+91 ${cleanDigits})`,
          phone: `+91${cleanDigits}`,
          cleanDigits: cleanDigits,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits}`,
          is_registered: false
        });
      }
    });

    return { registered, nonRegistered };
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
      bio: u.bio || u.status || 'Hey there! I am using GitPit 🚀',
      online: u.online || false
    }));
  }

  getAllUsers(requestingUserId = null) {
    return (this.data.users || [])
      .filter(u => u && (u.phone || u.id))
      .map(u => {
        const isSelf = requestingUserId && u.id === requestingUserId;
        const priv = u.privacy || {};
        const cleanPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
        return {
          id: u.id || (cleanPhone ? `user_${cleanPhone}` : `u_${Date.now()}`),
          name: u.name || (cleanPhone ? `+91 ${cleanPhone}` : 'GitPit Member'),
          username: u.username || '',
          avatar: u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanPhone || u.id}`,
          bio: u.bio || u.status || 'Active on GitPit 🟢',
          status: u.status || 'Available',
          presence: u.presence || 'online',
          online: u.online !== undefined ? u.online : true,
          phone: u.phone || (cleanPhone ? `+91 ${cleanPhone}` : ''),
          email: (isSelf || !priv.hideEmail) ? u.email : '',
          dob: (isSelf || !priv.hideDob) ? u.dob : '',
          privacy: isSelf ? priv : undefined
        };
      });
  }

  updatePrivacy(userId, privacy) {
    const user = this.getUser(userId);
    if (!user) return null;
    user.privacy = { ...(user.privacy || {}), ...privacy };
    user.updatedAt = new Date().toISOString();
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `UPDATE cp_users SET privacy = $2, updated_at = NOW() WHERE id = $1`,
        [userId, JSON.stringify(user.privacy)]
      ).catch(e => console.error('[PG PRIVACY UPDATE ERROR]', e.message));
    }
    return user.privacy;
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

  getChatMessages(chatId, currentUserId = null, limit = 200) {
    const isGroupOrAi = chatId === 'chat_ai' || (chatId && chatId.startsWith('group_'));
    if (isGroupOrAi) {
      return this.data.messages
        .filter(m => m.chatId === chatId)
        .slice(-limit);
    }

    const cleanChatPhone = (chatId || '').replace(/\D/g, '').slice(-10);
    const currentUser = currentUserId ? this.getUser(currentUserId) : null;
    const cleanMyPhone = currentUser && currentUser.phone ? currentUser.phone.replace(/\D/g, '').slice(-10) : '';

    return this.data.messages
      .filter(m => {
        if (m.chatId === chatId) return true;

        const mSenderPhone = (m.senderPhone || m.senderId || '').replace(/\D/g, '').slice(-10);
        const mRecipPhone = (m.recipientPhone || m.recipientId || '').replace(/\D/g, '').slice(-10);

        // 10-digit Phone Match between User A and User B
        if (cleanChatPhone && cleanMyPhone) {
          if ((mSenderPhone === cleanMyPhone && mRecipPhone === cleanChatPhone) ||
              (mSenderPhone === cleanChatPhone && mRecipPhone === cleanMyPhone)) {
            return true;
          }
        }

        if (cleanChatPhone && (mSenderPhone === cleanChatPhone || mRecipPhone === cleanChatPhone)) {
          return true;
        }

        if (currentUserId) {
          if ((m.senderId === currentUserId && m.recipientId === chatId) ||
              (m.senderId === chatId && m.recipientId === currentUserId)) {
            return true;
          }
        }

        if (m.senderId === chatId || m.recipientId === chatId) {
          return true;
        }
        return false;
      })
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

  // ================= GROUPS =================
  getGroups(userId) {
    if (!this.data.groups) this.data.groups = [];
    return this.data.groups.filter(g => {
      if (g.createdById === userId) return true;
      if (Array.isArray(g.members)) {
        return g.members.some(m => m === userId || (typeof m === 'object' && m.id === userId) || m === 'You');
      }
      return true;
    });
  }

  saveGroup(groupData) {
    if (!this.data.groups) this.data.groups = [];
    const group = {
      id: groupData.id || ('group_' + Date.now()),
      name: groupData.name || 'Group',
      avatar: groupData.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(groupData.name || 'Group')}`,
      createdById: groupData.createdById || 'user',
      members: groupData.members || ['You'],
      isGroup: true,
      createdAt: groupData.createdAt || new Date().toISOString()
    };

    const idx = this.data.groups.findIndex(g => g.id === group.id);
    if (idx >= 0) this.data.groups[idx] = group;
    else this.data.groups.unshift(group);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `INSERT INTO cp_groups (id, name, avatar, created_by_id, members, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET name = $2, avatar = $3, members = $5`,
        [group.id, group.name, group.avatar, group.createdById, JSON.stringify(group.members)]
      ).catch(e => console.error('[PG GROUP SAVE ERROR]', e.message));
    }

    return group;
  }

  // ================= MEETINGS =================
  getMeetings(userId) {
    if (!this.data.meetings) this.data.meetings = [];
    return this.data.meetings;
  }

  saveMeeting(meetingData) {
    if (!this.data.meetings) this.data.meetings = [];
    const meeting = {
      id: meetingData.id || ('meet_' + Date.now()),
      title: meetingData.title || 'GitPit Video Meeting',
      date: meetingData.date || new Date().toISOString().split('T')[0],
      time: meetingData.time || '11:00 AM',
      duration: meetingData.duration || '45 mins',
      hostId: meetingData.hostId || 'user',
      host: meetingData.host || meetingData.hostName || 'Host',
      avatar: meetingData.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=MeetingHost',
      createdAt: new Date().toISOString()
    };

    const idx = this.data.meetings.findIndex(m => m.id === meeting.id);
    if (idx >= 0) this.data.meetings[idx] = meeting;
    else this.data.meetings.unshift(meeting);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `INSERT INTO cp_meetings (id, title, date, time, duration, host_id, host_name, avatar, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [meeting.id, meeting.title, meeting.date, meeting.time, meeting.duration, meeting.hostId, meeting.host, meeting.avatar]
      ).catch(e => console.error('[PG MEETING SAVE ERROR]', e.message));
    }

    return meeting;
  }

  deleteMeeting(meetingId) {
    if (!this.data.meetings) this.data.meetings = [];
    this.data.meetings = this.data.meetings.filter(m => m.id !== meetingId);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query('DELETE FROM cp_meetings WHERE id = $1', [meetingId])
        .catch(e => console.error('[PG MEETING DELETE ERROR]', e.message));
    }
    return true;
  }

  // ================= MEMOS =================
  getMemos(userId) {
    if (!this.data.memos) this.data.memos = [];
    return this.data.memos;
  }

  saveMemo(memoData) {
    if (!this.data.memos) this.data.memos = [];
    const memo = {
      id: memoData.id || ('memo_' + Date.now()),
      subject: memoData.subject || 'GitPit Memo',
      sender: memoData.sender || 'GitPit Team',
      senderId: memoData.senderId || 'system',
      senderAvatar: memoData.senderAvatar || 'assets/logo-icon.svg',
      time: memoData.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      priority: memoData.priority || 'normal',
      body: memoData.body || '',
      createdAt: new Date().toISOString()
    };

    const idx = this.data.memos.findIndex(m => m.id === memo.id);
    if (idx >= 0) this.data.memos[idx] = memo;
    else this.data.memos.unshift(memo);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `INSERT INTO cp_memos (id, subject, sender, sender_id, sender_avatar, time, priority, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [memo.id, memo.subject, memo.sender, memo.senderId, memo.senderAvatar, memo.time, memo.priority, memo.body]
      ).catch(e => console.error('[PG MEMO SAVE ERROR]', e.message));
    }

    return memo;
  }

  deleteMemo(memoId) {
    if (!this.data.memos) this.data.memos = [];
    this.data.memos = this.data.memos.filter(m => m.id !== memoId);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query('DELETE FROM cp_memos WHERE id = $1', [memoId])
        .catch(e => console.error('[PG MEMO DELETE ERROR]', e.message));
    }
    return true;
  }

  // ================= LINKED DEVICES =================
  getLinkedDevices(userId) {
    if (!this.data.linkedDevices) this.data.linkedDevices = {};
    return this.data.linkedDevices[userId] || [];
  }

  addLinkedDevice(userId, deviceData) {
    if (!this.data.linkedDevices) this.data.linkedDevices = {};
    if (!this.data.linkedDevices[userId]) this.data.linkedDevices[userId] = [];

    const device = {
      id: deviceData.id || ('dev_' + Date.now()),
      userId: userId,
      deviceName: deviceData.deviceName || 'Web Browser',
      browser: deviceData.browser || 'Chrome',
      os: deviceData.os || 'Windows',
      ipAddress: deviceData.ipAddress || '127.0.0.1',
      location: deviceData.location || 'India',
      lastActive: 'Active Now 🟢',
      createdAt: new Date().toISOString()
    };

    this.data.linkedDevices[userId].unshift(device);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query(
        `INSERT INTO cp_linked_devices (id, user_id, device_name, browser, os, ip_address, location, last_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [device.id, device.userId, device.deviceName, device.browser, device.os, device.ipAddress, device.location, device.lastActive]
      ).catch(e => console.error('[PG LINKED DEVICE SAVE ERROR]', e.message));
    }

    return device;
  }

  removeLinkedDevice(userId, deviceId) {
    if (!this.data.linkedDevices || !this.data.linkedDevices[userId]) return false;
    this.data.linkedDevices[userId] = this.data.linkedDevices[userId].filter(d => d.id !== deviceId);
    this.saveJson();

    if (this.isPostgres && this.pgPool) {
      this.pgPool.query('DELETE FROM cp_linked_devices WHERE id = $1 AND user_id = $2', [deviceId, userId])
        .catch(e => console.error('[PG LINKED DEVICE DELETE ERROR]', e.message));
    }

    return true;
  }
}

module.exports = new Database();
