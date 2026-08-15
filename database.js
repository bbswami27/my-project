// ChatterPatter - Production Database Engine
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'chatterpatter_data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB schema
const initialSchema = {
  users: [],
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
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(raw);
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

  // ================= USERS =================
  saveUser(user) {
    if (!user || !user.id) return null;
    const idx = this.data.users.findIndex(u => u.id === user.id || (user.phone && u.phone && u.phone === user.phone));
    if (idx >= 0) {
      this.data.users[idx] = {
        ...this.data.users[idx],
        ...user,
        privacy: { ...(this.data.users[idx].privacy || {}), ...(user.privacy || {}) },
        updatedAt: new Date().toISOString()
      };
      this.save();
      return this.data.users[idx];
    } else {
      const newUser = {
        id: user.id,
        name: user.name || 'ChatterPatter User',
        username: user.username || ('@' + (user.name ? user.name.toLowerCase().replace(/\s+/g, '_') : 'user')),
        phone: user.phone || '',
        email: user.email || '',
        dob: user.dob || '',
        anniversary: user.anniversary || '',
        bio: user.bio || user.status || 'Hey there! I am using ChatterPatter 🚀',
        avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`,
        status: user.status || 'Available 🟢',
        presence: user.presence || 'online',
        privacy: user.privacy || {
          hidePhone: false,
          hideEmail: false,
          hideDob: false,
          hideLastSeen: false
        },
        createdAt: new Date().toISOString()
      };
      this.data.users.push(newUser);
      this.save();
      return newUser;
    }
  }

  getUser(userId) {
    return this.data.users.find(u => u.id === userId);
  }

  getAllUsers(requestingUserId = null) {
    // Return all actual registered users with privacy filters applied
    return this.data.users.map(u => {
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
        phone: (isSelf || !priv.hidePhone) ? u.phone : '',
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
    if (this.data.messages.length > 15000) {
      this.data.messages = this.data.messages.slice(-15000);
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
