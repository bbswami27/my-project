'use strict';

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const SessionStore = require('./auth/session-store');
const UserStore = require('./auth/user-store');
const OtpStore = require('./auth/otp-store');
const createAuthMiddleware = require('./auth/middleware');
const createAuthRoutes = require('./auth/routes');
const smsService = require('../services/smsService');

async function createCoreV2Server() {
  const databaseUrl = process.env.DATABASE_URL || process.env.PGURI || process.env.POSTGRESQL_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for GitPit Core v2');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const userStore = new UserStore(pool);
  const sessionStore = new SessionStore(pool);
  const otpStore = new OtpStore(pool);
  await userStore.ensureSchema();
  await sessionStore.ensureSchema();
  await otpStore.ensureSchema();

  const requireAuth = createAuthMiddleware({ sessionStore, userStore });
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req,res) => res.json({ ok:true, app:'GitPit Core v2', auth:'mobile-otp-only', database:'PostgreSQL' }));

  const sendOtp = async (phone, otp) => {
    const result = await smsService.sendOtp(phone, otp);
    if (!result?.success) {
      throw new Error(result?.error || result?.reason || 'SMS delivery failed');
    }
    return result;
  };

  app.use('/api/v2/auth', createAuthRoutes({ userStore, sessionStore, otpStore, sendOtp, requireAuth }));

  // Explicitly do not expose email/password, guest, social or invite-code login in Core v2.
  app.use((req,res,next) => {
    if (/^\/api\/v2\/auth\/(email|google|guest|invite|password)/i.test(req.path)) {
      return res.status(404).json({ error:'GitPit Core v2 supports Mobile Number + OTP login only.' });
    }
    next();
  });

  return { app, pool, userStore, sessionStore, otpStore };
}

if (require.main === module) {
  createCoreV2Server().then(({ app }) => {
    const port = Number(process.env.PORT || 3002);
    app.listen(port, () => console.log(`[CORE V2] GitPit listening on ${port}`));
  }).catch(err => {
    console.error('[CORE V2] Startup failed', err);
    process.exit(1);
  });
}

module.exports = createCoreV2Server;
