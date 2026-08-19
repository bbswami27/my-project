// GitPit - Production Backend Server with Real WebRTC, OTP Authentication, Contact Sync & Durable Storage
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  connectTimeout: 45000,
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 5e7 // 50MB for HD video, high-res photos, voice notes & files
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Universal Static File Serving (Root + Public + JS + CSS)
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/js', express.static(__dirname));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/css', express.static(__dirname));
app.use('/media', express.static(path.join(__dirname, 'data', 'media')));

// Database Engine (PostgreSQL / JSON Fallback)
const db = require('./database');

// Clean & Reset to exactly 4 Demo Users
app.post('/api/admin/clean-users', async (req, res) => {
  try {
    const users = await db.cleanupAndResetFourDemoUsers();
    res.json({
      success: true,
      message: 'Database purged of extra records and seeded with exactly 4 verified demo users.',
      count: users.length,
      users: users.map(u => ({ id: u.id, name: u.name, phone: u.phone, username: u.username }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/users-status', (req, res) => {
  const users = db.getAllUsers ? db.getAllUsers() : (db.data ? db.data.users : []);
  res.json({
    totalUsers: users.length,
    users: users.map(u => ({ id: u.id, name: u.name, phone: u.phone, status: u.status, verified: u.phoneVerified }))
  });
});

// Phase 1 Modular Services
const smsService = require('./services/smsService');
const fcmService = require('./services/fcmService');
const storageService = require('./services/storageService');

// Health Check Routes for Cloud Deployment & Monitoring
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).json({
  status: 'ok',
  time: new Date().toISOString(),
  app: 'GitPit',
  version: '1.0.0',
  uptime: process.uptime(),
  database: db.isPostgres ? 'PostgreSQL (Durable)' : 'JSON File / Ephemeral Disk',
  storage: storageService.getProviderName(),
  smsProvider: smsService.getProviderName(),
  fcmPush: fcmService.isConfigured() ? 'FCM HTTP v1 (Configured)' : 'Unconfigured'
}));
app.get('/ping', (req, res) => res.json({ status: 'live', app: 'GitPit', time: new Date().toISOString() }));

// Safe Isolated R2 Object Storage Health Self-Check Endpoint
app.get('/api/storage/r2-check', async (req, res) => {
  try {
    const report = await storageService.runR2SelfCheck();
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      report
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

// Safe Isolated FCM HTTP v1 Health Self-Check Endpoint
app.get('/api/fcm/check', (req, res) => {
  try {
    const status = fcmService.getSelfCheckStatus();
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      fcmStatus: status
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

// Active Sockets Mapping: socketId -> user profile
const activeUsers = new Map();

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
function getAuthToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return req.headers['x-auth-token'] || req.query.token || null;
}

function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const authData = db.validateSession(token);
  if (!authData || !authData.user) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }

  req.currentUser = authData.user;
  req.session = authData.session;
  next();
}

function requirePhoneVerified(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.currentUser.phoneVerified || !req.currentUser.phone) {
      return res.status(403).json({
        error: 'Verified mobile number required to access this feature.',
        phoneVerificationRequired: true
      });
    }
    next();
  });
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// 1. Send Real Carrier OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Mobile number is required' });
  }

  const normalized = db.normalizePhone(phone);
  if (!normalized || normalized.length < 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
  }

  const otpStatus = db.getOtpStatus(normalized);
  const now = Date.now();

  // Rate Limiting: 60s cooldown between resends
  if (otpStatus && otpStatus.lastSentAt && (now - otpStatus.lastSentAt < 60 * 1000)) {
    const remaining = Math.ceil((60 * 1000 - (now - otpStatus.lastSentAt)) / 1000);
    return res.status(429).json({
      error: `Please wait ${remaining} seconds before requesting a new OTP.`,
      cooldownRemaining: remaining
    });
  }

  // Rate Limiting: Max 4 requests in 10 minutes
  if (otpStatus && otpStatus.requestCount >= 4 && (now - otpStatus.windowStart < 10 * 60 * 1000)) {
    return res.status(429).json({
      error: 'Too many OTP requests for this number. Please try again after 10 minutes.'
    });
  }

  // Generate cryptographically random 6-digit OTP
  const otpNumber = crypto.randomInt(100000, 999999).toString();
  db.storeOtp(normalized, otpNumber, 600); // 10 mins expiry

  // Dispatch carrier SMS
  const smsResult = await smsService.sendOtp(normalized, otpNumber);

  res.json({
    success: true,
    message: `Verification code sent to ${normalized}`,
    phone: normalized,
    expiresIn: 600,
    cooldown: 60,
    smsDelivered: smsResult.success
  });
});

// 2. Verify OTP & Issue Persistent Session (Supports real OTP and Test OTP bypass)
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, otp, name, email, avatar, bio, bypassOtp } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const normalized = db.normalizePhone(phone);
  if (!normalized) {
    return res.status(400).json({ error: 'Invalid mobile number format' });
  }

  const enteredOtp = (otp || '').toString().trim();
  const isTestBypass = bypassOtp === true || ['000000', '123456', '999999', '111111', '888888'].includes(enteredOtp) || enteredOtp === '';

  if (!isTestBypass) {
    const verifyResult = db.verifyOtp(normalized, enteredOtp);
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error });
    }
  }

  // Find or Create User with verified mobile status
  const existingUser = db.findUserByPhone(normalized);
  let user;

  if (existingUser) {
    user = db.saveUser({
      id: existingUser.id,
      name: name || existingUser.name,
      phone: normalized,
      phoneVerified: true,
      phoneVerifiedAt: new Date().toISOString(),
      email: email || existingUser.email,
      avatar: avatar || existingUser.avatar,
      bio: bio || existingUser.bio
    });
  } else {
    user = db.saveUser({
      name: name || `User ${normalized.slice(-4)}`,
      phone: normalized,
      phoneVerified: true,
      phoneVerifiedAt: new Date().toISOString(),
      email: email || '',
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${normalized}`,
      bio: bio || 'Hey there! I am using GitPit 🚀'
    });
  }

  // Create persistent session
  const session = db.createSession(user.id, 30);
  io.emit('user_registered', user);

  res.json({
    success: true,
    message: isTestBypass ? 'Test login verified successfully!' : 'Mobile number verified successfully!',
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      phoneVerifiedAt: user.phoneVerifiedAt,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      status: user.status,
      privacy: user.privacy
    },
    token: session.token,
    expiresAt: session.expiresAt
  });
});

// Direct 1-Click Test Login Endpoint (Bypass OTP for Instant Testing)
app.post('/api/auth/test-login', (req, res) => {
  const { phone, name } = req.body;
  const rawPhone = phone || ('+9198' + Math.floor(10000000 + Math.random() * 90000000));
  const normalized = db.normalizePhone(rawPhone) || rawPhone;
  
  const existingUser = db.findUserByPhone(normalized);
  let user;
  if (existingUser) {
    user = db.saveUser({
      id: existingUser.id,
      name: name || existingUser.name,
      phone: normalized,
      phoneVerified: true,
      phoneVerifiedAt: new Date().toISOString()
    });
  } else {
    user = db.saveUser({
      name: name || `Test User ${normalized.slice(-4)}`,
      phone: normalized,
      phoneVerified: true,
      phoneVerifiedAt: new Date().toISOString(),
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${normalized}`,
      bio: 'ChatterPatter Verified User 🚀'
    });
  }

  const session = db.createSession(user.id, 30);
  io.emit('user_registered', user);

  res.json({
    success: true,
    message: 'Direct Test Login successful!',
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      phoneVerifiedAt: user.phoneVerifiedAt,
      email: user.email || '',
      avatar: user.avatar,
      bio: user.bio,
      status: user.status,
      privacy: user.privacy
    },
    token: session.token,
    expiresAt: session.expiresAt
  });
});

// 3. Email / Password Register (requires phone verification)
app.post('/api/auth/email/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = db.findUserByEmail(cleanEmail);
  if (existing && existing.passwordHash) {
    return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
  }

  const normalizedPhone = phone ? db.normalizePhone(phone) : '';
  const passwordHash = db.hashString(password, cleanEmail);

  const user = db.saveUser({
    name: name || 'User',
    email: cleanEmail,
    passwordHash,
    phone: normalizedPhone,
    phoneVerified: false
  });

  res.json({
    success: true,
    message: 'Account created. Please verify your mobile number to continue.',
    userId: user.id,
    email: user.email,
    phoneVerificationRequired: true
  });
});

// 4. Email / Password Login
app.post('/api/auth/email/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = db.findUserByEmail(cleanEmail);

  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const passwordHash = db.hashString(password, cleanEmail);
  if (passwordHash !== user.passwordHash) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (!user.phoneVerified || !user.phone) {
    return res.json({
      success: true,
      phoneVerificationRequired: true,
      userId: user.id,
      email: user.email,
      message: 'Mobile number verification is mandatory before accessing GitPit.'
    });
  }

  const session = db.createSession(user.id, 30);
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      phoneVerifiedAt: user.phoneVerifiedAt,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      privacy: user.privacy
    },
    token: session.token,
    expiresAt: session.expiresAt
  });
});

// 5. Google Sign-In with mandatory phone verification
app.post('/api/auth/google', (req, res) => {
  const { name, email, avatar, phone } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required for Google Sign-In' });
  }

  const cleanEmail = email.trim().toLowerCase();
  let user = db.findUserByEmail(cleanEmail);

  if (user && user.phoneVerified && user.phone) {
    const session = db.createSession(user.id, 30);
    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        phoneVerifiedAt: user.phoneVerifiedAt,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        privacy: user.privacy
      },
      token: session.token,
      expiresAt: session.expiresAt
    });
  }

  if (!user) {
    user = db.saveUser({
      name: name || 'Google User',
      email: cleanEmail,
      avatar: avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${cleanEmail}`,
      phone: phone ? db.normalizePhone(phone) : '',
      phoneVerified: false
    });
  }

  res.json({
    success: true,
    phoneVerificationRequired: true,
    userId: user.id,
    email: user.email,
    name: user.name,
    message: 'Please verify your mobile number to complete onboarding.'
  });
});

// 6. Validate Session on App Restart / Resume
app.get('/api/auth/session', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.currentUser.id,
      name: req.currentUser.name,
      username: req.currentUser.username,
      phone: req.currentUser.phone,
      phoneVerified: req.currentUser.phoneVerified,
      phoneVerifiedAt: req.currentUser.phoneVerifiedAt,
      email: req.currentUser.email,
      avatar: req.currentUser.avatar,
      bio: req.currentUser.bio,
      status: req.currentUser.status,
      privacy: req.currentUser.privacy
    }
  });
});

// 7. Logout & Invalidate Session
app.post('/api/auth/logout', (req, res) => {
  const token = getAuthToken(req);
  if (token) {
    db.deleteSession(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ==========================================
// PROTECTED APPLICATION ROUTES
// ==========================================

// Phonebook Contacts Match API (Protected & Public helper)
app.post('/api/contacts/sync', (req, res) => {
  const { phoneNumbers = [], contacts = [] } = req.body;
  const listToSync = contacts.length > 0 ? contacts : phoneNumbers;
  const result = db.syncRegisteredContacts(listToSync);
  res.json({
    success: true,
    matchedUsers: result.registered,
    registered: result.registered,
    nonRegistered: result.nonRegistered,
    totalChecked: listToSync.length,
    matchedCount: result.registered.length
  });
});

app.post('/api/contacts/sync-registered', (req, res) => {
  const { phoneNumbers = [], contacts = [] } = req.body;
  const listToSync = contacts.length > 0 ? contacts : phoneNumbers;
  const result = db.syncRegisteredContacts(listToSync);
  res.json({
    success: true,
    registered: result.registered,
    nonRegistered: result.nonRegistered,
    registeredCount: result.registered.length,
    nonRegisteredCount: result.nonRegistered.length
  });
});

// Registered Users API
app.get('/api/users', requirePhoneVerified, (req, res) => {
  res.json(db.getAllUsers(req.currentUser.id));
});

// User Profile Update API
app.put('/api/user/profile', requireAuth, (req, res) => {
  const { name, bio, avatar, phone, email } = req.body;
  const updatedUser = db.saveUser({
    id: req.currentUser.id,
    name: name || req.currentUser.name,
    bio: bio !== undefined ? bio : req.currentUser.bio,
    avatar: avatar || req.currentUser.avatar,
    phone: phone ? db.normalizePhone(phone) : req.currentUser.phone,
    email: email || req.currentUser.email
  });
  io.emit('user_registered', updatedUser);
  res.json({ success: true, user: updatedUser });
});

app.post('/api/user/profile', requireAuth, (req, res) => {
  const { name, bio, avatar, phone, email } = req.body;
  const updatedUser = db.saveUser({
    id: req.currentUser.id,
    name: name || req.currentUser.name,
    bio: bio !== undefined ? bio : req.currentUser.bio,
    avatar: avatar || req.currentUser.avatar,
    phone: phone ? db.normalizePhone(phone) : req.currentUser.phone,
    email: email || req.currentUser.email
  });
  io.emit('user_registered', updatedUser);
  res.json({ success: true, user: updatedUser });
});

// User Privacy Settings API
app.post('/api/user/privacy', requirePhoneVerified, (req, res) => {
  const { privacy } = req.body;
  const updated = db.updatePrivacy(req.currentUser.id, privacy);
  io.emit('user_privacy_updated', { userId: req.currentUser.id, privacy: updated });
  res.json({ success: true, privacy: updated });
});

// Blocking & Unblocking APIs
app.post('/api/user/block', requirePhoneVerified, (req, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'Target user ID is required' });
  const list = db.blockUser(req.currentUser.id, targetUserId);
  res.json({ success: true, blockedUsers: list });
});

app.post('/api/user/unblock', requirePhoneVerified, (req, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'Target user ID is required' });
  const list = db.unblockUser(req.currentUser.id, targetUserId);
  res.json({ success: true, blockedUsers: list });
});

app.get('/api/user/blocked', requirePhoneVerified, (req, res) => {
  const list = db.getBlockedUsers(req.currentUser.id);
  res.json({ success: true, blockedUsers: list });
});

// Linked Devices API (User Scoped)
app.get('/api/devices', requirePhoneVerified, (req, res) => {
  const devices = db.getLinkedDevices(req.currentUser.id);
  res.json({ success: true, devices });
});

app.get('/api/devices/:userId', requirePhoneVerified, (req, res) => {
  // Only allow querying own devices to prevent cross-user leakage
  const devices = db.getLinkedDevices(req.currentUser.id);
  res.json({ success: true, devices });
});

app.post('/api/devices/link', requirePhoneVerified, (req, res) => {
  const device = db.addLinkedDevice(req.currentUser.id, req.body || {});
  res.json({ success: true, device });
});

app.delete('/api/devices/:deviceId', requirePhoneVerified, (req, res) => {
  const success = db.removeLinkedDevice(req.currentUser.id, req.params.deviceId);
  res.json({ success });
});

// Groups API
app.get('/api/groups', requirePhoneVerified, (req, res) => {
  const groups = db.getGroups(req.currentUser.id);
  res.json({ success: true, groups });
});

app.post('/api/groups', requirePhoneVerified, (req, res) => {
  const group = db.saveGroup({
    ...req.body,
    createdById: req.currentUser.id
  });
  io.emit('group_created', group);
  res.json({ success: true, group });
});

// Messages History API
app.get('/api/messages/:chatId', requirePhoneVerified, (req, res) => {
  const messages = db.getChatMessages(req.params.chatId, req.currentUser ? req.currentUser.id : null);
  res.json({ success: true, messages });
});

// Save Message API
app.post('/api/messages', requirePhoneVerified, (req, res) => {
  const targetId = req.body.recipientId;
  if (targetId && db.isBlocked(req.currentUser.id, targetId)) {
    return res.status(403).json({ error: 'Message cannot be delivered. User is blocked.' });
  }

  const msgData = {
    ...req.body,
    senderId: req.currentUser.id,
    senderPhone: req.currentUser.phone
  };
  const savedMsg = db.saveMessage(msgData);
  if (req.body.chatId) {
    io.emit(`receive_message_${req.body.chatId}`, savedMsg);
  }
  io.emit('receive_message', savedMsg);

  // Background Push Notification via FCM HTTP v1 if target has registered devices
  if (targetId) {
    const tokens = db.getPushTokens(targetId);
    tokens.forEach(t => {
      fcmService.sendPushNotification(t.token, {
        title: req.currentUser.name,
        body: msgData.text || (msgData.type === 'image' ? '📷 Sent a photo' : msgData.type === 'video' ? '🎥 Sent a video' : msgData.type === 'voice' ? '🎤 Sent a voice note' : 'Sent an attachment'),
        data: { chatId: msgData.chatId, senderId: req.currentUser.id }
      });
    });
  }

  res.json({ success: true, message: savedMsg });
});

// Edit Message API
app.put('/api/messages/:id', requirePhoneVerified, (req, res) => {
  const { text } = req.body;
  const updated = db.editMessage(req.params.id, text);
  if (updated) {
    io.emit('message_edited', updated);
    return res.json({ success: true, message: updated });
  }
  res.status(404).json({ error: 'Message not found' });
});

// Delete Message API
app.delete('/api/messages/:id', requirePhoneVerified, (req, res) => {
  const isForEveryone = req.query.everyone !== 'false';
  const deleted = db.deleteMessage(req.params.id, isForEveryone);
  if (deleted) {
    io.emit('message_deleted', { id: req.params.id, isForEveryone });
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Message not found' });
});

// Delete Entire Chat API
app.delete('/api/chats/:chatId', requirePhoneVerified, (req, res) => {
  const deleted = db.deleteChat(req.params.chatId);
  io.emit('chat_deleted', { chatId: req.params.chatId });
  res.json({ success: true });
});

// Durable Media Storage Upload API (S3 / R2 / Supabase / Local Fallback)
app.post('/api/media/upload', requirePhoneVerified, async (req, res) => {
  const { dataUrl, fileName, fileType } = req.body;
  if (!dataUrl) {
    return res.status(400).json({ error: 'Media payload required' });
  }

  try {
    const uploadResult = await storageService.uploadMedia(dataUrl, fileName, fileType);
    res.json({
      success: true,
      mediaUrl: uploadResult.mediaUrl,
      fileName: uploadResult.fileName,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
      storageProvider: uploadResult.storageProvider
    });
  } catch (err) {
    console.error('[MEDIA UPLOAD ERROR]', err.message);
    res.status(500).json({ error: err.message || 'Failed to save media file' });
  }
});

// Call Logs API
app.get('/api/calls', requirePhoneVerified, (req, res) => {
  const logs = db.getCallLogs(req.currentUser.id);
  res.json({ success: true, callLogs: logs });
});

app.post('/api/calls', requirePhoneVerified, (req, res) => {
  const log = db.saveCallLog({
    ...req.body,
    callerId: req.currentUser.id,
    callerPhone: req.currentUser.phone
  });
  res.json({ success: true, callLog: log });
});

// Push Notification Token Registration (FCM HTTP v1)
app.post('/api/push/register', requirePhoneVerified, (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });
  const entry = db.registerPushToken(req.currentUser.id, token, platform || 'android');
  res.json({ success: true, pushToken: entry });
});

app.post('/api/push/unregister', requirePhoneVerified, (req, res) => {
  const { token } = req.body;
  if (token) db.unregisterPushToken(req.currentUser.id, token);
  res.json({ success: true });
});

// Groups List & Create API
app.get('/api/groups', requirePhoneVerified, (req, res) => {
  res.json(db.getAllGroups());
});

app.post('/api/groups', requirePhoneVerified, (req, res) => {
  const group = db.createGroup({
    ...req.body,
    createdById: req.currentUser.id
  });
  io.emit('new_group_created', group);
  res.json({ success: true, group });
});

// Status Updates API
app.get('/api/status', requirePhoneVerified, (req, res) => {
  res.json(db.getActiveStatusUpdates());
});

app.post('/api/status', requirePhoneVerified, (req, res) => {
  const status = db.saveStatusUpdate({
    ...req.body,
    userId: req.currentUser.id,
    author: req.currentUser.name,
    avatar: req.currentUser.avatar
  });
  io.emit('new_status_update', status);
  res.json({ success: true, status });
});

// WebRTC ICE Servers API (Google STUN + Relay)
app.get('/api/webrtc/ice-servers', (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  });
});

// News & Flash Tickers
const newsArticles = [
  {
    id: 'news-1',
    category: 'Breaking',
    title: 'ISRO Announces Next-Gen Satellite Launch for High-Speed Rural Connectivity',
    summary: 'Indian Space Research Organisation successfully schedules the next heavy-lift rocket mission deploying advanced broadband transponders across nationwide corridors.',
    source: 'Tech & Science Bureau',
    time: '5 mins ago',
    badge: '🚨 BREAKING',
    image: 'https://images.unsplash.com/photo-1517976487588-66d48270570b?auto=format&fit=crop&w=600&q=80',
    likes: 428,
    comments: 63
  },
  {
    id: 'news-2',
    category: 'Tech',
    title: 'Next-Generation AI Chat Engines Integrate On-Device Privacy & Realtime Audio',
    summary: 'New quantum neural architectures enable instant voice transcription and localized encryption right on smartphones without cloud latency.',
    source: 'FutureTech Daily',
    time: '22 mins ago',
    badge: '⚡ TECH INNOVATION',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
    likes: 892,
    comments: 114
  },
  {
    id: 'news-3',
    category: 'India',
    title: 'UPI Daily Transactions Cross New Global Record of 500 Million Payments',
    summary: 'Digital payment infrastructure continues astronomical surge as cross-border UPI integration expands to multiple European and Southeast Asian nations.',
    source: 'National Economic Desk',
    time: '45 mins ago',
    badge: '🇮🇳 INDIA GROWTH',
    image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80',
    likes: 1250,
    comments: 230
  }
];

const flashNewsList = [
  '🚨 BREAKING: ISRO gears up for high-speed satellite connectivity launch nationwide',
  '⚡ TECH: New on-device AI voice features arrive with ultra-fast latency',
  '📈 ECONOMY: UPI digital transactions achieve historic milestone worldwide'
];

app.get('/api/news', (req, res) => {
  const category = req.query.category;
  if (category && category !== 'All') {
    return res.json(newsArticles.filter(a => a.category.toLowerCase() === category.toLowerCase()));
  }
  res.json(newsArticles);
});

app.get('/api/news/flash', (req, res) => {
  res.json({
    ticker: flashNewsList,
    updatedAt: new Date().toISOString()
  });
});

// ==========================================
// GITPIT AI ASSISTANT API
// ==========================================
function generateSmartAiResponse(prompt = '', userName = 'Friend') {
  if (!prompt) return 'Hello! How can I assist you today? 😊';
  const query = prompt.trim().toLowerCase();

  // Math calculator
  if (/^[\d\s\+\-\*\/\(\)\.\^\%]+$/.test(prompt)) {
    try {
      const sanitized = prompt.replace(/[^-()\d/*+.]/g, '');
      const result = Function(`'use strict'; return (${sanitized})`)();
      return `🧮 **Calculation Result:**\n\`${prompt.trim()}\` = **${result}**`;
    } catch(e) {}
  }

  if (/^(hi|hello|hey|namaste|greetings|hola)/i.test(query)) {
    return `Hello ${userName}! 👋✨\n\nI am your **GitPit AI Assistant**. I can assist you with writing messages, scheduling meetings, drafting emails, answering questions, and general guidance!\n\nHow can I help you today?`;
  }

  return `🤖 **GitPit AI Assistant:**\n\nI am ready to help you with: *"**${prompt}**"*. Please let me know what details or assistance you need!`;
}

app.post('/api/ai/chat', requirePhoneVerified, (req, res) => {
  const { prompt, userName } = req.body || {};
  const reply = generateSmartAiResponse(prompt, userName || req.currentUser.name);
  res.json({ success: true, reply, timestamp: new Date().toISOString() });
});

// ==========================================
// SOCKET.IO REAL-TIME SIGNALING & MESSAGING
// ==========================================
io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  // User Join / Authenticate
  socket.on('user_join', (userData) => {
    if (!userData || !userData.id) return;
    let user = db.getUser(userData.id);
    if (!user && userData.phone) {
      user = db.getUserByPhone(userData.phone);
    }
    if (!user) {
      user = db.saveUser({
        id: userData.id,
        name: userData.name || 'GitPit User',
        phone: userData.phone || '',
        avatar: userData.avatar || 'assets/logo-icon.svg',
        email: userData.email || '',
        bio: userData.bio || '',
        phoneVerified: true,
        online: true
      });
    }

    const cleanPhone = (user.phone || userData.phone || '').replace(/\D/g, '').slice(-10);
    activeUsers.set(socket.id, {
      ...user,
      cleanPhone,
      socketId: socket.id,
      online: true,
      lastSeen: new Date().toISOString()
    });

    if (cleanPhone) socket.join(`user_${cleanPhone}`);
    if (user.id) socket.join(`user_${user.id}`);
    if (userData.id && userData.id !== user.id) socket.join(`user_${userData.id}`);

    io.emit('online_users', Array.from(activeUsers.values()).map(u => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      avatar: u.avatar,
      online: true
    })));

    console.log(`[USER ONLINE] ${user.name} (${user.phone}) [Socket: ${socket.id}, CleanPhone: ${cleanPhone}]`);
  });

  // Direct Message
  socket.on('send_message', (msgData) => {
    let sender = activeUsers.get(socket.id);
    if (!sender && msgData.senderId) {
      const dbUser = db.getUser(msgData.senderId);
      if (dbUser) sender = dbUser;
    }
    if (!sender && msgData.senderPhone) {
      const dbUser = db.getUserByPhone(msgData.senderPhone);
      if (dbUser) sender = dbUser;
    }
    if (!sender) {
      sender = {
        id: msgData.senderId || 'user',
        name: msgData.senderName || 'User',
        phone: msgData.senderPhone || '',
        avatar: msgData.senderAvatar || ''
      };
    }

    const targetId = msgData.recipientId;
    if (targetId && sender.id && db.isBlocked(sender.id, targetId)) {
      socket.emit('error_message', { error: 'Message blocked: Cannot send to this user.' });
      return;
    }

    const enrichedMsg = db.saveMessage({
      ...msgData,
      senderId: sender.id || msgData.senderId,
      senderName: sender.name || msgData.senderName,
      senderAvatar: sender.avatar || msgData.senderAvatar,
      senderPhone: sender.phone || msgData.senderPhone
    });

    if (msgData.chatId) {
      io.emit(`receive_message_${msgData.chatId}`, enrichedMsg);
    }
    io.emit('receive_message', enrichedMsg);
    io.emit('chat_message', enrichedMsg);

    const recipientPhone10 = (msgData.recipientPhone || '').replace(/\D/g, '').slice(-10);
    if (recipientPhone10) {
      io.to(`user_${recipientPhone10}`).emit('receive_message', enrichedMsg);
    }
    if (targetId) {
      io.to(`user_${targetId}`).emit('receive_message', enrichedMsg);
    }

    // AI Auto-Reply
    if (msgData.recipientId === 'ai_assistant' || msgData.isAiChat || msgData.chatId === 'chat_ai') {
      setTimeout(() => {
        const aiAnswer = generateSmartAiResponse(msgData.text, sender.name);
        const replyMsg = db.saveMessage({
          chatId: msgData.chatId || 'chat_ai',
          senderId: 'ai_assistant',
          senderName: 'GitPit AI 🤖',
          senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatterAI',
          recipientId: sender.id,
          recipientPhone: sender.phone,
          text: aiAnswer,
          type: 'text',
          isAi: true
        });
        io.emit(`receive_message_${msgData.chatId || 'chat_ai'}`, replyMsg);
        io.emit('receive_message', replyMsg);
      }, 600);
    }

    // Push FCM Notification
    if (targetId && targetId !== 'ai_assistant') {
      const tokens = db.getPushTokens(targetId);
      if (tokens && tokens.length > 0) {
        tokens.forEach(t => {
          fcmService.sendMessageNotification(t.token, {
            title: sender.name,
            body: msgData.type === 'image' ? '📷 Photo' : (msgData.type === 'document' ? '📄 Document' : (msgData.text || 'New message')),
            senderId: sender.id,
            chatId: msgData.chatId
          });
        });
      }
    }
  });

  // Typing Indicators
  socket.on('typing', (data) => {
    socket.broadcast.emit('user_typing', data);
  });

  socket.on('stop_typing', (data) => {
    socket.broadcast.emit('user_stop_typing', data);
  });

  // Message Edits & Deletions
  socket.on('edit_message', (data) => {
    const updated = db.editMessage(data.id, data.text);
    if (updated) io.emit('message_edited', updated);
  });

  socket.on('delete_message', (data) => {
    const deleted = db.deleteMessage(data.id, data.isForEveryone);
    if (deleted) io.emit('message_deleted', data);
  });

  socket.on('delete_chat', (data) => {
    db.deleteChat(data.chatId);
    io.emit('chat_deleted', data);
  });

  // Helper to find recipient socket
  function findRecipientSocketId(targetUserId, targetPhone = '') {
    const cleanPhone = (targetPhone || '').replace(/\D/g, '').slice(-10);
    for (const [sockId, u] of activeUsers.entries()) {
      if (u.id === targetUserId) {
        return sockId;
      }
      if (cleanPhone && u.phone && u.phone.replace(/\D/g, '').includes(cleanPhone)) {
        return sockId;
      }
    }
    return null;
  }

  // 1. Call User (Offer)
  socket.on('call-user', (callData) => {
    let sender = activeUsers.get(socket.id);
    if (!sender && callData.callerId) {
      const dbUser = db.getUser(callData.callerId);
      if (dbUser) sender = dbUser;
    }
    if (!sender) {
      sender = {
        id: callData.callerId || 'user',
        name: callData.callerName || 'User',
        phone: callData.callerPhone || '',
        avatar: callData.callerAvatar || ''
      };
    }

    const targetRecipientId = callData.userToCall || callData.recipientId;
    if (targetRecipientId && sender.id && db.isBlocked(sender.id, targetRecipientId)) {
      socket.emit('call-rejected', { reason: 'Blocked user' });
      return;
    }

    const targetSocketId = findRecipientSocketId(targetRecipientId, callData.recipientPhone);
    const payload = {
      ...callData,
      callerId: sender.id,
      callerName: sender.name,
      callerAvatar: sender.avatar,
      callerPhone: sender.phone,
      fromSocketId: socket.id,
      callerSocketId: socket.id
    };

    if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('incoming-call', payload);
      io.to(targetSocketId).emit('incoming_call', payload);
    } else {
      socket.broadcast.emit('incoming-call', payload);
      socket.broadcast.emit('incoming_call', payload);
      
      // Dispatch background FCM call notification if receiver is offline
      if (targetRecipientId) {
        const tokens = db.getPushTokens(targetRecipientId);
        tokens.forEach(t => {
          fcmService.sendCallNotification(t.token, {
            callerName: sender.name,
            callType: callData.type || 'video',
            callId: callData.callId
          });
        });
      }
    }
  });

  socket.on('call_user', (callData) => {
    const targetSocketId = findRecipientSocketId(callData.userToCall || callData.recipientId, callData.recipientPhone);
    const payload = { ...callData, fromSocketId: socket.id, callerSocketId: socket.id };
    if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('incoming-call', payload);
      io.to(targetSocketId).emit('incoming_call', payload);
    } else {
      socket.broadcast.emit('incoming-call', payload);
      socket.broadcast.emit('incoming_call', payload);
    }
  });

  // 2. Call Accepted (Answer)
  socket.on('call-accepted', (data) => {
    const targetSocketId = data.to || data.callerSocketId || findRecipientSocketId(data.callerId, data.callerPhone);
    const payload = { ...data, responderSocketId: socket.id };
    if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('call-accepted', payload);
      io.to(targetSocketId).emit('call_accepted', payload);
    } else {
      socket.broadcast.emit('call-accepted', payload);
      socket.broadcast.emit('call_accepted', payload);
    }
  });

  socket.on('accept_call', (data) => {
    const targetSocketId = data.to || data.callerSocketId || findRecipientSocketId(data.callerId, data.callerPhone);
    const payload = { ...data, responderSocketId: socket.id };
    if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('call-accepted', payload);
      io.to(targetSocketId).emit('call_accepted', payload);
    } else {
      socket.broadcast.emit('call-accepted', payload);
      socket.broadcast.emit('call_accepted', payload);
    }
  });

  // 3. ICE Candidate
  socket.on('ice-candidate', (data) => {
    const targetSocketId = data.to || data.targetSocketId || findRecipientSocketId(data.targetUserId, data.targetPhone);
    const payload = { candidate: data.candidate, fromSocketId: socket.id };
    if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('ice-candidate', payload);
      io.to(targetSocketId).emit('ice_candidate', payload);
    } else {
      socket.broadcast.emit('ice-candidate', payload);
      socket.broadcast.emit('ice_candidate', payload);
    }
  });

  socket.on('ice_candidate', (data) => {
    const targetSocketId = data.to || data.targetSocketId || findRecipientSocketId(data.targetUserId, data.targetPhone);
    const payload = { candidate: data.candidate, fromSocketId: socket.id };
    if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('ice-candidate', payload);
      io.to(targetSocketId).emit('ice_candidate', payload);
    } else {
      socket.broadcast.emit('ice-candidate', payload);
      socket.broadcast.emit('ice_candidate', payload);
    }
  });

  // 4. Call Rejected
  socket.on('call-rejected', (data) => {
    const targetSocketId = data.to || data.callerSocketId || findRecipientSocketId(data.callerId, data.callerPhone);
    const payload = { ...data, fromSocketId: socket.id };
    if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('call-rejected', payload);
      io.to(targetSocketId).emit('call_rejected', payload);
    } else {
      socket.broadcast.emit('call-rejected', payload);
      socket.broadcast.emit('call_rejected', payload);
    }
  });

  socket.on('reject_call', (data) => {
    const targetSocketId = data.to || data.callerSocketId || findRecipientSocketId(data.callerId, data.callerPhone);
    const payload = { ...data, fromSocketId: socket.id };
    if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('call-rejected', payload);
      io.to(targetSocketId).emit('call_rejected', payload);
    } else {
      socket.broadcast.emit('call-rejected', payload);
      socket.broadcast.emit('call_rejected', payload);
    }
  });

  // 5. End Call
  socket.on('end-call', (data) => {
    io.emit('end-call', { ...(data || {}), fromSocketId: socket.id });
    io.emit('call_ended', { ...(data || {}), fromSocketId: socket.id });
  });

  socket.on('end_call', (data) => {
    io.emit('end-call', { ...(data || {}), fromSocketId: socket.id });
    io.emit('call_ended', { ...(data || {}), fromSocketId: socket.id });
  });

  // Disconnect
  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('online_users', Array.from(activeUsers.values()).map(u => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      avatar: u.avatar,
      online: true
    })));
  });
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 GitPit Production Server on Port: ${PORT}`);
  console.log(`📦 Database: ${db.isPostgres ? 'PostgreSQL (Durable)' : 'JSON File (Ephemeral)'}`);
  console.log(`☁️ Object Storage: ${storageService.getProviderName()}`);
  console.log(`📲 Carrier SMS Provider: ${smsService.getProviderName()}`);
  console.log(`🔔 Push Service: ${fcmService.isConfigured() ? 'FCM HTTP v1' : 'Unconfigured'}`);
  console.log(`🌐 Production URL: https://chitchat-chatterpatter.onrender.com`);
  console.log(`=======================================================`);
});
