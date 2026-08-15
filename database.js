// GitPit - Persistent Storage Engine for 1000+ Users
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'gitpit_data.json');

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
  videoBlockedContacts: [],
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

  // USERS
  saveUser(user) {
    const idx = this.data.users.findIndex(u => u.id === user.id || (u.phone && u.phone === user.phone));
    if (idx >= 0) {
      this.data.users[idx] = { ...this.data.users[idx], ...user, updatedAt: new Date().toISOString() };
    } else {
      this.data.users.push({
        id: user.id || 'user_' + Date.now(),
        name: user.name || 'GitPit User',
        phone: user.phone || '',
        avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.phone || Date.now()}`,
        status: user.status || 'Available 🟢',
        presence: user.presence || 'online',
        createdAt: new Date().toISOString()
      });
    }
    this.save();
    return this.getUser(user.id);
  }

  getUser(userId) {
    return this.data.users.find(u => u.id === userId);
  }

  getAllUsers() {
    return this.data.users;
  }

  // MESSAGES
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
      timestamp: msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: msg.createdAt || Date.now(),
      status: msg.status || 'delivered'
    };

    this.data.messages.push(newMsg);
    // Keep last 10,000 messages in storage for performance
    if (this.data.messages.length > 10000) {
      this.data.messages = this.data.messages.slice(-10000);
    }
    this.save();
    return newMsg;
  }

  getChatMessages(chatId, limit = 100) {
    return this.data.messages
      .filter(m => m.chatId === chatId)
      .slice(-limit);
  }

  // GROUPS
  createGroup(groupData) {
    const group = {
      id: 'group_' + Date.now(),
      name: groupData.name,
      description: groupData.description || 'GitPit Community Group',
      avatar: groupData.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${groupData.name}`,
      members: groupData.members || [],
      createdBy: groupData.createdBy || 'Admin',
      createdAt: new Date().toISOString(),
      isGroup: true
    };
    this.data.groups.push(group);
    this.save();
    return group;
  }

  getAllGroups() {
    return this.data.groups;
  }

  // STATUS UPDATES
  saveStatusUpdate(status) {
    const newStatus = {
      id: 'status_' + Date.now(),
      userId: status.userId,
      userName: status.userName,
      userAvatar: status.userAvatar,
      text: status.text || '',
      mediaUrl: status.mediaUrl || null,
      bgColor: status.bgColor || '#0284c7',
      privacyType: status.privacyType || 'contacts',
      selectedContacts: status.selectedContacts || [],
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    };
    this.data.statusUpdates.push(newStatus);
    this.save();
    return newStatus;
  }

  getActiveStatusUpdates() {
    const now = Date.now();
    this.data.statusUpdates = this.data.statusUpdates.filter(s => s.expiresAt > now);
    this.save();
    return this.data.statusUpdates;
  }
}

module.exports = new Database();
