// ChatterPatter - Production Database Engine with Secure Sessions & Verification
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'chatterpatter_data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB schema
const initialSchema = {
  users: [],
  sessions: [], // token -> { userId, createdAt, expiresAt }
  otps: {},     // phone -> { otpHash, expiresAt, attempts, lastSentAt, requestCount, windowStart }
  messages: [],
  groups: [],
  statusUpdates: [],
  blockedContacts: [],
  linkedDevices: {}, // userId -> [devices]
  settings: {}
};

class Database {
  constructor() {
    this.data = this.load();
    this.migrate();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...initialSchema, ...parsed };
      }
    } catch (e) {
      console.error('[DB] Error reading DB file, initializing fresh store:', e.message);
    }
    this.save(initialSchema);
    return JSON.parse(JSON.stringify(initialSchema));
  }

  save(data = this.data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Error writing to DB file:', e.message);
    }
  }

  // Safe migration for existing valid records
  migrate() {
    let changed = false;
    if (!Array.isArray(this.data.sessions)) {
      this.data.sessions = [];
      changed = true;
    }
    if (!this.data.otps || Array.isArray(this.data.otps)) {
      this.data.otps = {};
      changed = true;
    }
    if (!this.data.users) {
      this.data.users = [];
      changed = true;
    }

    // Filter out any legacy guest/demo accounts and ensure users have verified flags
    this.data.users = this.data.users.filter(u => {
      const isDemo = u.id === 'user_guest' || u.id === 'user_demo' || u.name === 'Guest User' || u.isDemo;
      return !isDemo;
    }).map(u => {
      if (u.phoneVerified === undefined) {
        // If user already had a phone number, mark as verified
        u.phoneVerified = !!(u.phone && u.phone.length >= 10);
        u.phoneVerifiedAt = u.phoneVerified ? (u.createdAt || new Date().toISOString()) : null;
        changed = true;
      }
      return u;
    });

    if (changed) {
      this.save();
    }
  }

  // ================= UTILS & CRYPTO =================
  normalizePhone(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+${digits}`;
    }
    if (phone.startsWith('+')) {
      return `+${digits}`;
    }
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
    const expiresAt = now + (durationDays * 24 * 60 * 60 * 1000);

    // Remove expired sessions
    this.data.sessions = this.data.sessions.filter(s => s.expiresAt > now);

    const session = {
      token,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      expiresAtMs: expiresAt
    };

    this.data.sessions.push(session);
    this.save();
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
    const initialLen = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter(s => s.token !== token);
    if (this.data.sessions.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // ================= OTPS =================
  storeOtp(phone, otp, expiresInSec = 600) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return false;

    const now = Date.now();
    const existing = this.data.otps[normalized] || {};
    
    // Rate limit window: max 4 requests per 10 minutes
    const windowStart = (existing.windowStart && (now - existing.windowStart < 10 * 60 * 1000)) ? existing.windowStart : now;
    const requestCount = (windowStart === existing.windowStart) ? (existing.requestCount || 0) + 1 : 1;

    this.data.otps[normalized] = {
      otpHash: this.hashString(otp, normalized),
      expiresAt: now + (expiresInSec * 1000),
      attempts: 0,
      lastSentAt: now,
      requestCount,
      windowStart
    };

    this.save();
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
      this.save();
      return { success: false, error: 'OTP has expired. Please request a fresh code.' };
    }

    if (record.attempts >= 5) {
      delete this.data.otps[normalized];
      this.save();
      return { success: false, error: 'Too many incorrect attempts. Please request a new OTP.' };
    }

    const inputHash = this.hashString(otp, normalized);
    if (inputHash !== record.otpHash) {
      record.attempts += 1;
      this.save();
      return { success: false, error: `Invalid OTP code. (${5 - record.attempts} attempts remaining)` };
    }

    // OTP Verified! Delete used OTP
    delete this.data.otps[normalized];
    this.save();
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
    
    // Find existing by ID, Phone, or Email
    let existing = null;
    if (userData.id) {
      existing = this.data.users.find(u => u.id === userData.id);
    }
    if (!existing && normalizedPhone) {
      existing = this.findUserByPhone(normalizedPhone);
    }
    if (!existing && userData.email) {
      existing = this.findUserByEmail(userData.email);
    }

    if (existing) {
      // Update existing user record (link details)
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
      this.save();
      return existing;
    } else {
      // Create new user record
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
        privacy: userData.privacy || {
          hidePhone: false,
          hideEmail: false,
          hideDob: false,
          hideLastSeen: false
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.data.users.push(newUser);
      this.save();
      return newUser;
    }
  }

  // Find verified users matching phone numbers list
  matchContactsByPhones(normalizedPhones = []) {
    if (!Array.isArray(normalizedPhones) || normalizedPhones.length === 0) {
      return [];
    }

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
          anniversary: (isSelf || !priv.hideDob) ? u.anniversary : '',
          privacy: isSelf ? priv : undefined
        };
      });
  }

  updatePrivacy(userId, privacySettings) {
    const user = this.getUser(userId);
    if (user) {
      user.privacy = { ...(user.privacy || {}), ...privacySettings };
      user.updatedAt = new Date().toISOString();
      this.save();
      return user.privacy;
    }
    return null;
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
      location: msg.location || null,
      reactions: msg.reactions || [],
      quote: msg.quote || null,
      edited: msg.edited || false,
      isDeleted: msg.isDeleted || false,
      timestamp: msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: msg.createdAt || Date.now(),
      status: msg.status || 'delivered'
    };

    this.data.messages.push(newMsg);
    if (this.data.messages.length > 25000) {
      this.data.messages = this.data.messages.slice(-25000);
    }
    this.save();
    return newMsg;
  }

  editMessage(msgId, newText) {
    const msg = this.data.messages.find(m => m.id === msgId);
    if (msg) {
      msg.text = newText;
      msg.edited = true;
      msg.editedAt = Date.now();
      this.save();
      return msg;
    }
    return null;
  }

  deleteMessage(msgId, isForEveryone = true) {
    const msg = this.data.messages.find(m => m.id === msgId);
    if (msg) {
      if (isForEveryone) {
        msg.isDeleted = true;
        msg.text = '🚫 This message was deleted';
        msg.mediaUrl = null;
      } else {
        this.data.messages = this.data.messages.filter(m => m.id !== msgId);
      }
      this.save();
      return msg;
    }
    return null;
  }

  deleteChat(chatId) {
    this.data.messages = this.data.messages.filter(m => m.chatId !== chatId);
    this.save();
    return true;
  }

  getChatMessages(chatId, limit = 200) {
    return this.data.messages
      .filter(m => m.chatId === chatId)
      .slice(-limit);
  }

  // ================= GROUPS =================
  getAllGroups() {
    return this.data.groups || [];
  }

  createGroup(groupData) {
    if (!this.data.groups) this.data.groups = [];
    const newGroup = {
      id: 'group_' + Date.now(),
      name: groupData.name || 'New Group',
      avatar: groupData.avatar || 'assets/logo-icon.svg',
      createdById: groupData.createdById,
      members: groupData.members || [],
      createdAt: new Date().toISOString()
    };
    this.data.groups.push(newGroup);
    this.save();
    return newGroup;
  }

  // ================= STATUS UPDATES =================
  getActiveStatusUpdates() {
    const now = Date.now();
    const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours
    return (this.data.statusUpdates || []).filter(s => {
      const t = s.createdAtTime || new Date(s.createdAt).getTime();
      return t > cutoff;
    });
  }

  saveStatusUpdate(statusData) {
    if (!this.data.statusUpdates) this.data.statusUpdates = [];
    const newStatus = {
      id: 'status_' + Date.now(),
      userId: statusData.userId,
      author: statusData.author,
      avatar: statusData.avatar,
      text: statusData.text || '',
      bgColor: statusData.bgColor || '#0284c7',
      mediaUrl: statusData.mediaUrl || null,
      mediaType: statusData.mediaType || 'text',
      createdAt: new Date().toISOString(),
      createdAtTime: Date.now()
    };
    this.data.statusUpdates.unshift(newStatus);
    this.save();
    return newStatus;
  }

  // ================= LINKED DEVICES =================
  addLinkedDevice(userId, device) {
    if (!this.data.linkedDevices) this.data.linkedDevices = {};
    if (!this.data.linkedDevices[userId]) this.data.linkedDevices[userId] = [];
    
    const newDevice = {
      id: 'dev_' + Date.now(),
      name: device.name || 'Web Browser',
      platform: device.platform || 'Web',
      ip: device.ip || '127.0.0.1',
      linkedAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    this.data.linkedDevices[userId].push(newDevice);
    this.save();
    return newDevice;
  }

  getLinkedDevices(userId) {
    if (!this.data.linkedDevices) this.data.linkedDevices = {};
    return this.data.linkedDevices[userId] || [];
  }

  removeLinkedDevice(userId, deviceId) {
    if (this.data.linkedDevices && this.data.linkedDevices[userId]) {
      this.data.linkedDevices[userId] = this.data.linkedDevices[userId].filter(d => d.id !== deviceId);
      this.save();
      return true;
    }
    return false;
  }
}

module.exports = new Database();
