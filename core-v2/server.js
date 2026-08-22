'use strict';

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const SessionStore = require('./auth/session-store');
const UserStore = require('./auth/user-store');
const OtpStore = require('./auth/otp-store');
const createAuthMiddleware = require('./auth/middleware');
const createAuthRoutes = require('./auth/routes');
const createContactRoutes = require('./contacts/routes');
const MessageStore = require('./messages/store');
const createMessageRoutes = require('./messages/routes');
const installRealtime = require('./messages/realtime');
const installCallRealtime = require('./calls/realtime');
const CoreMediaStorage = require('./media/storage');
const createMediaRoutes = require('./media/routes');
const StatusStore = require('./status/store');
const createStatusRoutes = require('./status/routes');
const smsService = require('../services/smsService');

async function createCoreV2Server() {
  const databaseUrl = process.env.DATABASE_URL || process.env.PGURI || process.env.POSTGRESQL_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for GitPit Core v2');

  const pool = new Pool({ connectionString: databaseUrl, ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false } });

  const userStore = new UserStore(pool);
  const sessionStore = new SessionStore(pool);
  const otpStore = new OtpStore(pool);
  const messageStore = new MessageStore(pool);
  const mediaStorage = new CoreMediaStorage();
  const statusStore = new StatusStore(pool);
  await userStore.ensureSchema();
  await sessionStore.ensureSchema();
  await otpStore.ensureSchema();
  await messageStore.ensureSchema();
  await statusStore.ensureSchema();

  const requireAuth = createAuthMiddleware({ sessionStore, userStore });
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors:{ origin:'*', methods:['GET','POST'] }, transports:['websocket','polling'] });
  const realtime = installRealtime(io,{sessionStore,userStore,messageStore});
  const calls = installCallRealtime(io,{userStore});

  app.get('/health', (req,res) => res.json({ ok:true, app:'GitPit Core v2', auth:'mobile-otp-only', database:'PostgreSQL', realtime:'Socket.IO', media:'R2/S3 signed URLs', calls:'WebRTC authenticated signalling', status:'24-hour durable status' }));

  const sendOtp = async (phone, otp) => {
    const result = await smsService.sendOtp(phone, otp);
    if (!result?.success) throw new Error(result?.error || result?.reason || 'SMS delivery failed');
    return result;
  };

  app.use('/api/v2/auth', createAuthRoutes({ userStore, sessionStore, otpStore, sendOtp, requireAuth }));
  app.use('/api/v2/contacts', createContactRoutes({ pool, requireAuth }));
  app.use('/api/v2/media', createMediaRoutes({ requireAuth, storage:mediaStorage }));
  app.use('/api/v2/messages', createMessageRoutes({ messageStore, userStore, requireAuth, emitToUser:realtime.emitToUser }));
  app.use('/api/v2/status', createStatusRoutes({ pool, statusStore, requireAuth, emitToUser:realtime.emitToUser }));

  app.use((req,res,next) => {
    if (/^\/api\/v2\/auth\/(email|google|guest|invite|password)/i.test(req.path)) return res.status(404).json({ error:'GitPit Core v2 supports Mobile Number + OTP login only.' });
    next();
  });

  return { app, httpServer, io, pool, userStore, sessionStore, otpStore, messageStore, mediaStorage, statusStore, calls };
}

if (require.main === module) {
  createCoreV2Server().then(({ httpServer }) => {
    const port = Number(process.env.PORT || 3002);
    httpServer.listen(port, () => console.log(`[CORE V2] GitPit listening on ${port}`));
  }).catch(err => { console.error('[CORE V2] Startup failed', err); process.exit(1); });
}

module.exports = createCoreV2Server;
