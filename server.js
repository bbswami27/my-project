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

// Serve only the prepared client. Never expose backend source/configuration.
app.use(express.static(path.join(__dirname, 'public')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/media', express.static(path.join(__dirname, 'data', 'media')));

// Database Engine (PostgreSQL / JSON Fallback)
const db = require('./database');

// Destructive demo reset is intentionally disabled in production.
app.post('/api/admin/clean-users', (_req, res) => {
  res.status(410).json({ success: false, error: 'Demo-user reset is disabled.' });
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
app.get('/api/storage/r2-check', requirePhoneVerified, async (req, res) => {
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
function safeUser(u) { const {passwordHash, ...safe} = u; return safe; }
function getAuthToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return req.headers['x-auth-token'] || null;
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
    if (!req.currentUser.phoneVerified && !req.currentUser.emailVerified) {
      return res.status(403).json({
        error: 'Verified email or mobile number required to access this feature.',
        identityVerificationRequired: true
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
  if (!/^\+91[6-9]\d{9}$/.test(normalized)) {
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

  if (!smsResult.success) {
    db.invalidateOtp(normalized);
    console.warn('[OTP] SMS gateway rejected request:', smsResult.httpStatus || 'Unavailable');

    return res.status(503).json({
      success: false,
      error: 'Unable to send verification code. Please try again later.',
      smsDelivered: false
    });
  }

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
  const { phone, otp, name, email, avatar, bio } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const normalized = db.normalizePhone(phone);
  if (!/^\+91[6-9]\d{9}$/.test(normalized)) {
    return res.status(400).json({ error: 'Invalid mobile number format' });
  }

  const enteredOtp = (otp || '').toString().trim();
  if (!/^\d{6}$/.test(enteredOtp)) {
    return res.status(400).json({
      success: false,
      error: 'Valid 6-digit OTP required.'
    });
  }

  const verifyResult = db.verifyOtp(normalized, enteredOtp);

  if (!verifyResult.success) {
    return res.status(400).json({
      success: false,
      error: verifyResult.error
    });
  }


  // Find or Create User with verified mobile status
  const existingUser = db.findUserByPhone(normalized);
  let user;

  if (existingUser) {
    user = db.saveUser({
      id: existingUser.id,
      name: existingUser.name,
      phone: normalized,
      phoneVerified: true,
      phoneVerifiedAt: new Date().toISOString(),
      email: existingUser.email,
      avatar: existingUser.avatar,
      bio: existingUser.bio
    });
  } else {
    user = db.saveUser({
      name: name || `User ${normalized.slice(-4)}`,
      phone: normalized,
      phoneVerified: true,
      phoneVerifiedAt: new Date().toISOString(),
      email: '',
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${normalized}`,
      bio: bio || 'Hey there! I am using GitPit 🚀'
    });
  }

  // Create persistent session
  const session = db.createSession(user.id, 30);
  io.to(`user_${user.id}`).emit('user_registered', safeUser(user));

  res.json({
    success: true,
    message: 'Mobile number verified successfully!',
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
app.post('/api/auth/test-login', (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'Test login is disabled.'
  });
});


// 3. Email / Password Register (requires phone verification)
// Legacy email credentials cannot be trusted until ownership is reverified.
for (const route of ['/api/auth/email/register','/api/auth/email/login']) {
  app.post(route, (_req,res)=>res.status(503).json({error:'Use mobile OTP while email authentication is being secured.'}));
}

// 5. Google Sign-In with mandatory phone verification
app.post('/api/auth/google', (_req, res) => {
  return res.status(503).json({
    success: false,
    error: 'Google Sign-In is temporarily unavailable. Please use mobile OTP.'
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
      emailVerified: !!req.currentUser.emailVerified,
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
app.post('/api/contacts/sync', requirePhoneVerified, (req, res) => {
  const { phoneNumbers = [], contacts = [] } = req.body;
  const listToSync = Array.isArray(contacts) && contacts.length > 0 ? contacts : phoneNumbers;
  if (!Array.isArray(listToSync) || listToSync.length > 500) return res.status(400).json({error:'Invalid contact batch'});
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

app.post('/api/contacts/sync-registered', requirePhoneVerified, (req, res) => {
  const { phoneNumbers = [], contacts = [] } = req.body;
  const listToSync = Array.isArray(contacts) && contacts.length > 0 ? contacts : phoneNumbers;
  if (!Array.isArray(listToSync) || listToSync.length > 500) return res.status(400).json({error:'Invalid contact batch'});
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
    phone: req.currentUser.phone,
    email: req.currentUser.email
  });
  io.to(`user_${updatedUser.id}`).emit('user_registered', safeUser(updatedUser));
  res.json({ success: true, user: safeUser(updatedUser) });
});

app.post('/api/user/profile', requireAuth, (req, res) => {
  const { name, bio, avatar, phone, email } = req.body;
  const updatedUser = db.saveUser({
    id: req.currentUser.id,
    name: name || req.currentUser.name,
    bio: bio !== undefined ? bio : req.currentUser.bio,
    avatar: avatar || req.currentUser.avatar,
    phone: req.currentUser.phone,
    email: req.currentUser.email
  });
  io.to(`user_${updatedUser.id}`).emit('user_registered', safeUser(updatedUser));
  res.json({ success: true, user: safeUser(updatedUser) });
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
    name: req.body.name, members: req.body.members, avatar: req.body.avatar,
    createdById: req.currentUser.id
  });
  io.to(`user_${req.currentUser.id}`).emit('group_created', group);
  res.json({ success: true, group });
});

// Messages History API
app.get('/api/messages/:chatId', requirePhoneVerified, (req, res) => {
  const messages = db.getChatMessages(req.params.chatId, req.currentUser ? req.currentUser.id : null);
  res.json({ success: true, messages });
});

// Save Message API
function deliverMessage(user, body) {
  if (!user || !body || typeof body !== 'object') return null;
  const target = db.getUser(body.recipientId) || db.findUserByPhone(body.recipientPhone);
  if (!target || !(target.phoneVerified || target.emailVerified) || db.isBlocked(user.id,target.id)) return null;
  const prior = body.id && db.data.messages.find(m=>m.id===body.id);
  if (prior) return prior.senderId===user.id && prior.recipientId===target.id ? prior : null;
  const msg = db.saveMessage({...body, senderId:user.id,senderName:user.name,senderAvatar:user.avatar,senderPhone:user.phone,recipientId:target.id,recipientPhone:target.phone,createdAt:Date.now()});
  io.to(`user_${user.id}`).to(`user_${target.id}`).emit('receive_message',msg);
  for (const t of db.getPushTokens(target.id)) fcmService.sendPushNotification(t.token,{title:'GitPit',body:'New message',data:{chatId:String(msg.chatId||''),senderId:String(user.id)}});
  return msg;
}
app.post('/api/messages', requirePhoneVerified, (req,res)=>{
  const msg=deliverMessage(req.currentUser,req.body);
  if (!msg) return res.status(403).json({error:'Recipient unavailable or message conflict'});
  res.json({success:true,message:msg});
});
// Destructive operations withheld until ownership-aware persistence is implemented.
app.put('/api/messages/:id',requirePhoneVerified,(_req,res)=>res.status(501).json({error:'Editing temporarily unavailable'}));
app.delete('/api/messages/:id',requirePhoneVerified,(_req,res)=>res.status(501).json({error:'Deletion temporarily unavailable'}));
app.delete('/api/chats/:chatId',requirePhoneVerified,(_req,res)=>res.status(501).json({error:'Deletion temporarily unavailable'}));

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
  const body = req.body || {};
  const peer = db.getUser(body.receiverId || body.recipientId || body.userToCall || body.contactId) ||
    (body.receiverPhone ? db.findUserByPhone(body.receiverPhone) : null);
  if (!peer || peer.id === req.currentUser.id || !(peer.phoneVerified || peer.emailVerified)) {
    return res.status(400).json({ success: false, error: 'A valid registered call recipient is required.' });
  }
  const log = db.saveCallLog({
    ...body,
    receiverId: peer.id,
    receiverName: peer.name,
    receiverPhone: peer.phone || '',
    callerId: req.currentUser.id,
    callerName: req.currentUser.name,
    callerPhone: req.currentUser.phone || ''
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
  io.to(`user_${req.currentUser.id}`).emit('new_status_update', status);
  res.json({ success: true, status });
});

// WebRTC ICE Servers API (Google STUN + Relay)
app.get('/api/webrtc/ice-servers', requirePhoneVerified, (req, res) => {
  res.json({
    iceServers: [
      ...((process.env.TURN_URL || process.env.TURN_SERVER_URL) && process.env.TURN_USERNAME && (process.env.TURN_PASSWORD || process.env.TURN_CREDENTIAL) ? [{urls:(process.env.TURN_URL || process.env.TURN_SERVER_URL),username:process.env.TURN_USERNAME,credential:(process.env.TURN_PASSWORD || process.env.TURN_CREDENTIAL)}] : []),
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
  socket.on('user_join', (data) => {
    const auth = db.validateSession(data?.token);
    if (!(auth?.user?.phoneVerified || auth?.user?.emailVerified)) return socket.emit('error_message',{error:'Authentication required'});
    for (const room of socket.rooms) if (room !== socket.id) socket.leave(room);
    activeUsers.set(socket.id,auth.user);
    socket.data.token=data.token;
    socket.join(`user_${auth.user.id}`);
  });
  socket.on('error',()=>{});
  socket.use((_packet,next)=>{
    const auth=db.validateSession(socket.data.token);
    if (_packet[0]==='user_join' || auth?.user?.phoneVerified || auth?.user?.emailVerified) return next();
    next(new Error('Authentication required'));
  });
  socket.on('send_message', (body,ack)=>{
    const msg=deliverMessage(activeUsers.get(socket.id),body||{});
    if(typeof ack==='function') ack({success:!!msg,message:msg});
  });

  // Calls are routed only between authenticated participants.
  const callPeers = socket.data.callPeers = new Set();
  function startCall(data={}) {
    const sender=activeUsers.get(socket.id);
    const target=db.getUser(data.userToCall||data.recipientId)||db.findUserByPhone(data.recipientPhone);
    if (!sender || !(target?.phoneVerified || target?.emailVerified) || db.isBlocked(sender.id,target.id)) return;
    const peer=[...activeUsers].find(([id,u])=>u.id===target.id && id!==socket.id);
    if (!peer) { for(const t of db.getPushTokens(target.id)) fcmService.sendCallNotification(t.token,{callerName:sender.name,callerId:sender.id,callType:data.type,callId:data.callId}); return socket.emit('call-rejected',{reason:'Recipient offline'}); }
    const remote=io.sockets.sockets.get(peer[0]); if(!remote) return;
    callPeers.add(remote.id); remote.data.callPeers.add(socket.id);
    const payload={...data,callerId:sender.id,callerName:sender.name,callerPhone:sender.phone,fromSocketId:socket.id,callerSocketId:socket.id};
    remote.emit('incoming-call',payload); remote.emit('incoming_call',payload);
  }
  for(const event of ['call-user','call_user']) socket.on(event,startCall);
  const aliases={'call-accepted':['call-accepted','call_accepted'],accept_call:['call-accepted','call_accepted'],'ice-candidate':['ice-candidate','ice_candidate'],ice_candidate:['ice-candidate','ice_candidate'],'call-rejected':['call-rejected','call_rejected'],reject_call:['call-rejected','call_rejected'],'end-call':['end-call','call_ended'],end_call:['end-call','call_ended']};
  for(const [event,outputs] of Object.entries(aliases)) socket.on(event,(data={})=>{
    const target=data.to||data.targetSocketId||data.callerSocketId||([...callPeers].length===1?[...callPeers][0]:null);
    if(!callPeers.has(target)) return;
    for(const output of outputs) io.to(target).emit(output,{...data,fromSocketId:socket.id,responderSocketId:socket.id});
    if(event.includes('end')||event.includes('reject')) {callPeers.delete(target);io.sockets.sockets.get(target)?.data.callPeers.delete(socket.id);}
  });
  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    for(const peer of callPeers) io.sockets.sockets.get(peer)?.data.callPeers.delete(socket.id);
  });
});

async function start() {
 await db.ready;
 if (process.env.NODE_ENV === 'production' && !db.isPostgres) throw new Error('Production requires a working PostgreSQL database');
 await require('./services/emailOtp')(app,db,io);
 app.get('*', (req, res) => {
   if(req.path.startsWith('/api/')) return res.status(404).json({error:'Not found'});
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

}
start().catch(e=>{console.error(e.message);process.exit(1);});
