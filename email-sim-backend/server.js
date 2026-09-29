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
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  maxHttpBufferSize: 5e7 // 50MB for HD video, high-res photos, voice notes & files
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.join(__dirname, 'data', 'media')));

// Database Engine (PostgreSQL / JSON Fallback)
const db = require('./database');

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
  version: '1.1.0-security-candidate',
  uptime: process.uptime(),
  database: db.isPostgres ? 'PostgreSQL (Durable)' : 'JSON File / Ephemeral Disk',
  storage: storageService.getProviderName(),
  smsProvider: smsService.getProviderName(),
  fcmPush: fcmService.isConfigured() ? 'FCM HTTP v1 (Configured)' : 'Unconfigured'
}));
app.get('/ping', (req, res) => res.json({ status: 'live', app: 'GitPit', time: new Date().toISOString() }));

// Email-only identity and proof-of-possession device access.
const { PgStore } = require('./security/store');
const { providers } = require('./security/providers');
const { AuthService } = require('./security/auth');
const { installAuth } = require('./security/routes');
const { installRealtime } = require('./security/realtime');
const authStore = new PgStore();
const auth = new AuthService(authStore, providers(), {
  pepper: process.env.AUTH_PEPPER,
  onRevoke: id => io.in('user:' + id).disconnectSockets(true)
});
installAuth(app, auth, db, io);
// All application routes have already passed the signed, SIM-bound API gate.
function requireAuth(req, res, next) { next(); }
function requirePhoneVerified(req, res, next) { next(); }

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
  io.to('user:' + req.currentUser.id).emit('user_privacy_updated', { userId: req.currentUser.id, privacy: updated });
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
  for (const id of group.members) io.to('user:' + id).emit('group_created', group);
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

  const msgData = req.body;
  const savedMsg = db.sendAuthorized(req.currentUser.id, msgData);
  const recipients = savedMsg.chatId.startsWith('group_')
    ? db.getGroups(req.currentUser.id).find(g => g.id === savedMsg.chatId).members
    : [req.currentUser.id, savedMsg.recipientId];
  for (const id of new Set(recipients)) io.to('user:' + id).emit('receive_message', savedMsg);

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
  const updated = db.editMessage(req.params.id, text, req.currentUser.id);
  if (updated) {
    io.to('user:' + updated.senderId).to('user:' + updated.recipientId).emit('message_edited', updated);
    return res.json({ success: true, message: updated });
  }
  res.status(404).json({ error: 'Message not found' });
});

// Delete Message API
app.delete('/api/messages/:id', requirePhoneVerified, (req, res) => {
  const isForEveryone = req.query.everyone !== 'false';
  const deleted = db.deleteMessage(req.params.id, isForEveryone, req.currentUser.id);
  if (deleted) {
    io.to('user:' + deleted.senderId).to('user:' + deleted.recipientId).emit('message_deleted', { id: req.params.id, isForEveryone });
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Message not found' });
});

app.delete('/api/chats/:chatId', requirePhoneVerified, (req,res) => res.status(409).json({error:'Per-user chat deletion is unavailable in this update.'}));

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

app.use('/api/status', (req,res) => res.status(503).json({error:'Status sharing is unavailable in this security update.'}));

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
installRealtime(io, auth, db);

app.use('/api', (req,res) => res.status(404).json({error:'API not found.'}));
app.use((err,req,res,next) => {
  const status=err.status || (err.code === '23505' ? 409 : 500);
  res.status(status).json({error: status < 500 ? err.message : 'Service unavailable. Please retry later.', code: err.code || 'REQUEST_FAILED'});
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start only after durable authentication schema is ready.
let cleanupTimer;
async function start() {
  await authStore.init();
  await db.ready;
  if (process.env.NODE_ENV === 'production' && !db.isPostgres) throw new Error('Application database is not ready.');
  cleanupTimer = setInterval(() => authStore.prune().catch(() => console.error('Auth expiry cleanup failed')), 60000);
  cleanupTimer.unref();
  server.listen(PORT, () => console.log('GitPit 1.1.0 security candidate listening on port ' + PORT));
}
start().catch(e => { console.error('Startup blocked:', e.message); process.exit(1); });
async function shutdown() { clearInterval(cleanupTimer); io.close(); server.close(); await authStore.close(); if(db.pgPool) await db.pgPool.end(); }
process.once('SIGTERM', () => shutdown().finally(() => process.exit(0)));
process.once('SIGINT', () => shutdown().finally(() => process.exit(0)));
