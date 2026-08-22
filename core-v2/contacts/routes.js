'use strict';

const express = require('express');

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `+91${digits}` : '';
}

module.exports = function createContactRoutes({ pool, requireAuth }) {
  const router = express.Router();

  router.post('/match', requireAuth, async (req,res) => {
    try {
      const raw = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
      const contacts = [];
      raw.forEach((c,index) => {
        const name = String(c?.name || c?.displayName || '').trim();
        const numbers = [];
        if (c?.phone) numbers.push(c.phone);
        if (Array.isArray(c?.phones)) c.phones.forEach(p => numbers.push(typeof p === 'string' ? p : p?.number || p?.value));
        if (Array.isArray(c?.phoneNumbers)) c.phoneNumbers.forEach(p => numbers.push(typeof p === 'string' ? p : p?.number || p?.value));
        [...new Set(numbers.map(normalizePhone).filter(Boolean))].forEach(phone => contacts.push({ order:index, name:name || phone, phone }));
      });

      if (!contacts.length) return res.json({ ok:true, registered:[], phonebook:[] });

      const phones = [...new Set(contacts.map(c => c.phone))];
      const { rows } = await pool.query(
        `SELECT id,name,phone,avatar,bio FROM gp2_users
         WHERE phone_verified=TRUE AND phone = ANY($1::text[])`,
        [phones]
      );
      const byPhone = new Map(rows.map(u => [u.phone,u]));
      const me = req.auth.user.id;

      const phonebook = contacts.map(c => {
        const u = byPhone.get(c.phone);
        return u && u.id !== me
          ? { ...c, registered:true, userId:u.id, gitpitName:u.name, avatar:u.avatar || '', bio:u.bio || '' }
          : { ...c, registered:false };
      });
      const registered = phonebook.filter(c => c.registered);
      res.json({ ok:true, registered, phonebook });
    } catch (e) {
      console.error('[CORE V2 CONTACTS] match failed', e);
      res.status(500).json({ error:'Unable to match contacts' });
    }
  });

  router.get('/registered', requireAuth, async (req,res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id,name,phone,avatar,bio FROM gp2_users
         WHERE phone_verified=TRUE AND id<>$1 ORDER BY name ASC`,
        [req.auth.user.id]
      );
      res.json({ ok:true, users:rows });
    } catch (e) {
      console.error('[CORE V2 CONTACTS] registered list failed', e);
      res.status(500).json({ error:'Unable to load registered users' });
    }
  });

  return router;
};
