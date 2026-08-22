'use strict';

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.headers['x-auth-token'] || null;
}

function createAuthMiddleware({ sessionStore, userStore }) {
  if (!sessionStore) throw new Error('sessionStore is required');
  if (!userStore || typeof userStore.getById !== 'function') throw new Error('userStore.getById is required');

  return async function requireAuth(req, res, next) {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ success: false, error: 'Authentication required.' });

      const session = await sessionStore.validate(token);
      if (!session) return res.status(401).json({ success: false, error: 'Session expired or invalid. Please log in again.' });

      const user = await userStore.getById(session.userId);
      if (!user) return res.status(401).json({ success: false, error: 'Account not found.' });

      req.auth = { token, session, user };
      req.authToken = token;
      req.session = session;
      req.currentUser = user;
      next();
    } catch (error) {
      console.error('[CORE V2 AUTH]', error);
      res.status(500).json({ success: false, error: 'Authentication service unavailable.' });
    }
  };
}

module.exports = { extractBearerToken, createAuthMiddleware };
