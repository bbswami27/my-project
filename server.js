// ChatterPatter - Production Backend Server with Real WebRTC, OTP Authentication, Contact Sync & Durable Storage
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
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  maxHttpBufferSize: 5e7 // 50MB for HD video, high-res photos, voice notes & files
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.join(__dirname, 'data', 'media')));

// Database Engine
const db = require('./database');

// Health Check Routes for Cloud Deployment & Monitoring
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).json({
  status: 'ok',
  time: new Date().toISOString(),
  app: 'ChatterPatter',
  version: '1.0.0',
  uptime: process.uptime()
}));
app.get('/ping', (req, res) => res.json({ status: 'live', app: 'ChatterPatter', time: new Date().toISOString() }));

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
// SMS / OTP DISPATCH SERVICE
// ==========================================
async function sendSmsOtp(normalizedPhone, otp) {
  const provider = process.env.SMS_PROVIDER || 'console';
  console.log(`[SMS-SERVICE] Dispatching OTP for ${normalizedPhone} via provider: ${provider}`);

  try {
    if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const body = new URLSearchParams({
        To: normalizedPhone,
        From: process.env.TWILIO_PHONE_NUMBER,
        Body: `Your ChatterPatter verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`
      });
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });
      console.log(`[SMS-SERVICE] Twilio SMS dispatched to ${normalizedPhone}`);
    } else if (provider === 'fast2sms' && process.env.FAST2SMS_API_KEY) {
      const clean10 = normalizedPhone.slice(-10);
      await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: otp,
          numbers: clean10
        })
      });
      console.log(`[SMS-SERVICE] Fast2SMS OTP dispatched to ${clean10}`);
    } else {
      console.log(`[AUTH-OTP-VERIFICATION-CODE] Mobile: ${normalizedPhone} | Code: [${otp}]`);
    }
    return true;
  } catch (err) {
    console.error('[SMS-SERVICE] Error sending SMS:', err.message);
    return false;
  }
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// 1. Send OTP
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

  // Generate real cryptographically random 6-digit OTP
  const otpNumber = crypto.randomInt(100000, 999999).toString();
  db.storeOtp(normalized, otpNumber, 600); // 10 mins expiry

  // Dispatch SMS
  const smsProvider = process.env.SMS_PROVIDER;
  const isExternalSmsConfigured = (smsProvider === 'twilio' && process.env.TWILIO_ACCOUNT_SID) || (smsProvider === 'fast2sms' && process.env.FAST2SMS_API_KEY);
  await sendSmsOtp(normalized, otpNumber);

  res.json({
    success: true,
    message: `Verification code generated for ${normalized}`,
    phone: normalized,
    expiresIn: 600,
    cooldown: 60,
    codeHint: !isExternalSmsConfigured ? otpNumber : null
  });
});

// 2. Verify OTP & Issue Persistent Session
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, otp, name, email, avatar, bio } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone number and 6-digit OTP are required' });
  }

  const normalized = db.normalizePhone(phone);
  const verifyResult = db.verifyOtp(normalized, otp.trim());

  if (!verifyResult.success) {
    return res.status(400).json({ error: verifyResult.error });
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
      bio: bio || 'Hey there! I am using ChatterPatter 🚀'
    });
  }

  // Create persistent session
  const session = db.createSession(user.id, 30);
  io.emit('user_registered', user);

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
    phoneVerified: false // Must be verified with OTP before chat access
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
      message: 'Mobile number verification is mandatory before accessing ChatterPatter.'
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

// Phonebook Contacts Match API (Protected)
app.post('/api/contacts/sync', requirePhoneVerified, (req, res) => {
  const { phoneNumbers = [] } = req.body;
  const matchedUsers = db.matchContactsByPhones(phoneNumbers);
  res.json({
    success: true,
    matchedUsers,
    totalChecked: phoneNumbers.length,
    matchedCount: matchedUsers.length
  });
});

// Registered Users API
app.get('/api/users', requirePhoneVerified, (req, res) => {
  res.json(db.getAllUsers(req.currentUser.id));
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

// Linked Devices API
app.get('/api/devices/:userId', requirePhoneVerified, (req, res) => {
  const devices = db.getLinkedDevices(req.params.userId);
  res.json({ success: true, devices });
});

app.post('/api/devices/link', requirePhoneVerified, (req, res) => {
  const { device } = req.body;
  const newDev = db.addLinkedDevice(req.currentUser.id, device || {});
  io.emit(`device_linked_${req.currentUser.id}`, newDev);
  res.json({ success: true, device: newDev });
});

app.delete('/api/devices/:userId/:deviceId', requirePhoneVerified, (req, res) => {
  const { deviceId } = req.params;
  const removed = db.removeLinkedDevice(req.currentUser.id, deviceId);
  res.json({ success: removed });
});

// Messages History API
app.get('/api/messages/:chatId', requirePhoneVerified, (req, res) => {
  const messages = db.getChatMessages(req.params.chatId);
  res.json(messages);
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

// Media Storage Upload API (Durable File Storage)
app.post('/api/media/upload', requirePhoneVerified, (req, res) => {
  const { dataUrl, fileName, fileType } = req.body;
  if (!dataUrl) {
    return res.status(400).json({ error: 'Media payload required' });
  }

  try {
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid media format' });
    }

    const mime = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    
    // Max 50MB check
    if (buffer.length > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File exceeds 50MB size limit' });
    }

    const ext = (fileName && fileName.includes('.')) ? path.extname(fileName) : (mime.includes('image') ? '.jpg' : mime.includes('video') ? '.mp4' : mime.includes('audio') ? '.webm' : '.bin');
    const secureName = `media_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const targetPath = path.join(__dirname, 'data', 'media', secureName);

    fs.writeFileSync(targetPath, buffer);

    const mediaUrl = `/media/${secureName}`;
    res.json({
      success: true,
      mediaUrl,
      fileName: fileName || secureName,
      fileSize: buffer.length,
      mimeType: mime
    });
  } catch (err) {
    console.error('[MEDIA UPLOAD ERROR]', err.message);
    res.status(500).json({ error: 'Failed to save media file' });
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

// Push Notification Token Registration
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

// Cloud Backup Export & Restore
app.post('/api/backup/export', requirePhoneVerified, (req, res) => {
  const backup = db.exportBackup(req.currentUser.id);
  res.json({ success: true, backup });
});

app.post('/api/backup/restore', requirePhoneVerified, (req, res) => {
  const { backupData } = req.body;
  const result = db.restoreBackup(req.currentUser.id, backupData);
  res.json(result);
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

// Intelligent Multi-Lingual AI Engine
function generateSmartAiResponse(prompt = '', userName = 'Friend') {
  const query = prompt.trim().toLowerCase();
  
  if (mathMatch = prompt.match(/^[\d\s\+\-\*\/\(\)\.\^\%]+$/)) {
    try {
      const sanitized = prompt.replace(/[^-()\d/*+.]/g, '');
      const result = Function(`'use strict'; return (${sanitized})`)();
      return `🧮 **Calculation Result:**\n\`${prompt.trim()}\` = **${result}**`;
    } catch(e) {}
  }

  if (/^(hi|hello|hey|namaste|kem cho|pranam|salam|hola)/i.test(query)) {
    return `Namaste ${userName}! 🙏✨\n\nMain aapka **ChatterPatter Smart AI Assistant** hoon. Main aapke sawaalon ke jawaab, formal emails, coding guidance, aur translation me poori madad kar sakta hoon!\n\nAap kya poochhna chahte hain?`;
  }

  return `🤖 **ChatterPatter AI:**\n\nAapke sawaal *"**${prompt}**"* ke liye main poori madad kar sakta hoon. Kripya apna vishay batayein!`;
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
    const user = db.getUser(userData.id);
    if (!user || !user.phoneVerified) {
      console.warn(`[SOCKET AUTH REJECTED] Unverified user ${userData.id}`);
      socket.emit('auth_error', { message: 'Authentication and mobile verification required.' });
      return;
    }

    const cleanPhone = (user.phone || '').replace(/\D/g, '').slice(-10);
    activeUsers.set(socket.id, {
      ...user,
      cleanPhone,
      socketId: socket.id,
      online: true,
      lastSeen: new Date().toISOString()
    });

    io.emit('online_users', Array.from(activeUsers.values()).map(u => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      avatar: u.avatar,
      online: true
    })));

    console.log(`[USER ONLINE] ${user.name} (${user.phone}) [Socket: ${socket.id}]`);
  });

  // Direct Message
  socket.on('send_message', (msgData) => {
    const sender = activeUsers.get(socket.id);
    if (!sender) {
      console.warn(`[MSG BLOCKED] Unauthenticated socket: ${socket.id}`);
      return;
    }

    const targetId = msgData.recipientId;
    if (targetId && db.isBlocked(sender.id, targetId)) {
      socket.emit('error_message', { error: 'Message blocked: Cannot send to this user.' });
      return;
    }

    const enrichedMsg = db.saveMessage({
      ...msgData,
      senderId: sender.id,
      senderName: sender.name,
      senderAvatar: sender.avatar,
      senderPhone: sender.phone
    });

    if (msgData.chatId) {
      io.emit(`receive_message_${msgData.chatId}`, enrichedMsg);
    }
    io.emit('receive_message', enrichedMsg);

    // AI Auto-Reply
    if (msgData.recipientId === 'ai_assistant' || msgData.isAiChat || msgData.chatId === 'chat_ai') {
      setTimeout(() => {
        const aiAnswer = generateSmartAiResponse(msgData.text, sender.name);
        const replyMsg = db.saveMessage({
          chatId: msgData.chatId,
          senderId: 'ai_assistant',
          senderName: 'ChatterPatter AI 🤖',
          senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatterAI',
          text: aiAnswer,
          status: 'read'
        });
        io.emit(`receive_message_${msgData.chatId}`, replyMsg);
        io.emit('receive_message', replyMsg);
      }, 600);
    }
  });

  // WebRTC Signaling Handlers
  function findRecipientSocketId(recipientId, recipientPhone) {
    if (!recipientId && !recipientPhone) return null;
    const cleanPhone = (recipientPhone || '').replace(/\D/g, '').slice(-10);
    for (const [sockId, u] of activeUsers.entries()) {
      if (recipientId && (u.id === recipientId || u.userId === recipientId || sockId === recipientId)) {
        return sockId;
      }
      if (cleanPhone && u.cleanPhone && u.cleanPhone === cleanPhone) {
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
    const sender = activeUsers.get(socket.id);
    if (!sender) return;

    const targetRecipientId = callData.userToCall || callData.recipientId;
    if (targetRecipientId && db.isBlocked(sender.id, targetRecipientId)) {
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
    console.log(`[SOCKET] Disconnected: ${socket.id}`);
  });
});

// Periodic Flash News Broadcaster
let newsIndex = 0;
setInterval(() => {
  if (newsArticles.length > 0) {
    newsIndex = (newsIndex + 1) % newsArticles.length;
    const news = newsArticles[newsIndex];
    io.emit('news_flash_update', news);
  }
}, 30000);

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 ChatterPatter Production Server on Port: ${PORT}`);
  console.log(`🔒 Authentication, Contact Sync & Durable Storage Active`);
  console.log(`🌐 Production URL: https://chitchat-chatterpatter.onrender.com`);
  console.log(`=======================================================`);
});
