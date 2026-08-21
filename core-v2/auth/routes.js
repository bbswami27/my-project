'use strict';

const express = require('express');
const crypto = require('crypto');

function normalizePhone(phone) {
  const d = String(phone || '').replace(/\D/g,'').slice(-10);
  return d.length === 10 ? `+91${d}` : '';
}

module.exports = function createAuthRoutes({ userStore, sessionStore, otpStore, sendOtp, requireAuth }) {
  const router = express.Router();

  router.post('/otp/request', async (req,res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      if (!phone) return res.status(400).json({ error:'Valid 10-digit mobile number is required' });
      const otp = String(crypto.randomInt(100000,1000000));
      const challenge = await otpStore.create(phone, otp, 5);
      await sendOtp(phone, otp);
      res.json({ ok:true, challengeId:challenge.challengeId, expiresAt:challenge.expiresAt });
    } catch (e) {
      console.error('[CORE V2 AUTH] OTP request failed', e);
      res.status(500).json({ error:'Unable to send OTP' });
    }
  });

  router.post('/otp/verify', async (req,res) => {
    try {
      const phone = normalizePhone(req.body?.phone);
      const challengeId = String(req.body?.challengeId || '');
      const otp = String(req.body?.otp || '').trim();
      if (!phone || !challengeId || !/^\d{6}$/.test(otp)) return res.status(400).json({ error:'Phone, challengeId and 6-digit OTP are required' });
      const verified = await otpStore.verify(challengeId, phone, otp);
      if (!verified.ok) return res.status(401).json({ error:'OTP verification failed', reason:verified.reason });
      const user = await userStore.upsertVerified({ phone, name:req.body?.name });
      const session = await sessionStore.create(user.id, { days:30, deviceId:req.body?.deviceId, userAgent:req.get('user-agent') });
      res.json({ ok:true, token:session.token, expiresAt:session.expiresAt, user });
    } catch (e) {
      console.error('[CORE V2 AUTH] OTP verify failed', e);
      res.status(500).json({ error:'Unable to complete login' });
    }
  });

  router.get('/session', requireAuth, async (req,res) => res.json({ ok:true, user:req.auth.user, expiresAt:req.auth.session.expiresAt }));

  router.post('/logout', requireAuth, async (req,res) => {
    await sessionStore.revoke(req.auth.token);
    res.json({ ok:true });
  });

  return router;
};
