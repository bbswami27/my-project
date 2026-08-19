// GitPit - Firebase Admin SDK & FCM HTTP v1 Production Push Notification Service
const fs = require('fs');

let admin = null;
let isFcmInitialized = false;
let authMethodUsed = 'None';

function initFirebase() {
  if (isFcmInitialized && admin) return;

  try {
    const firebaseAdmin = require('firebase-admin');

    // 1. Primary: Google Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS / Render Secret File)
    const renderSecretPath = '/etc/secrets/firebase-service-account.json';
    const hasDefaultCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS || fs.existsSync(renderSecretPath);

    if (hasDefaultCreds) {
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(renderSecretPath)) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = renderSecretPath;
      }
      admin = firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.applicationDefault()
      });
      isFcmInitialized = true;
      authMethodUsed = 'applicationDefault (Render Secret File / GOOGLE_APPLICATION_CREDENTIALS)';
      console.log('[FCM] Firebase Admin SDK initialized using applicationDefault() (FCM HTTP v1 Active)');
      return;
    }

    // 2. Secondary: FIREBASE_SERVICE_ACCOUNT JSON String in Environment Variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : process.env.FIREBASE_SERVICE_ACCOUNT;

      admin = firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount)
      });
      isFcmInitialized = true;
      authMethodUsed = 'FIREBASE_SERVICE_ACCOUNT (Direct Certificate)';
      console.log('[FCM] Firebase Admin SDK initialized using Service Account JSON (FCM HTTP v1 Active)');
      return;
    }

    // 3. Fallback: Individual environment variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      admin = firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey
        })
      });
      isFcmInitialized = true;
      authMethodUsed = 'Individual Env Vars';
      console.log('[FCM] Firebase Admin SDK initialized using individual env vars (FCM HTTP v1 Active)');
      return;
    }

    console.log('[FCM NOTICE] Firebase Admin credentials not detected. Push service will run in standby mode.');
  } catch (err) {
    console.error('[FCM INIT ERROR] Failed to initialize Firebase Admin SDK:', err.message);
    isFcmInitialized = false;
    admin = null;
  }
}

// Initialize on module load
initFirebase();

class FcmService {
  isConfigured() {
    // Re-check in case credentials became available at runtime
    if (!isFcmInitialized || !admin) {
      initFirebase();
    }
    return isFcmInitialized && !!admin;
  }

  getAuthMethod() {
    return authMethodUsed;
  }

  // Safe Self-Check Status (Does not leak secrets)
  getSelfCheckStatus() {
    const configured = this.isConfigured();
    let messagingReady = false;

    if (configured && admin) {
      try {
        const messaging = admin.messaging();
        messagingReady = !!messaging;
      } catch (e) {
        messagingReady = false;
      }
    }

    return {
      fcmInitialized: configured ? 'YES' : 'NO',
      authMethod: authMethodUsed,
      messagingClientReady: messagingReady ? 'YES' : 'NO',
      httpV1Active: configured && messagingReady ? 'YES' : 'NO'
    };
  }

  // Send High-Priority Background Message Notification
  async sendPushNotification(deviceToken, { title, body, data = {} }) {
    if (!this.isConfigured()) {
      return { success: false, reason: 'FCM_NOT_CONFIGURED' };
    }

    try {
      const message = {
        token: deviceToken,
        notification: {
          title: title || 'GitPit',
          body: body || 'New message'
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          timestamp: Date.now().toString()
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'chatterpatter_messages',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              contentAvailable: true
            }
          }
        }
      };

      const response = await admin.messaging().send(message);
      return { success: true, messageId: response };
    } catch (err) {
      console.error('[FCM ERROR] Failed to send push notification:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Send High-Priority Incoming Audio / Video Call Notification
  async sendCallNotification(deviceToken, { callerName, callType, callId, callerId }) {
    if (!this.isConfigured()) {
      return { success: false, reason: 'FCM_NOT_CONFIGURED' };
    }

    try {
      const isVideo = callType === 'video';
      const message = {
        token: deviceToken,
        notification: {
          title: `Incoming ${isVideo ? 'Video' : 'Audio'} Call 📞`,
          body: `${callerName || 'Someone'} is calling you on GitPit...`
        },
        data: {
          type: 'incoming_call',
          callType: callType || 'video',
          callId: callId || ('call_' + Date.now()),
          callerId: callerId || '',
          callerName: callerName || 'Friend',
          timestamp: Date.now().toString()
        },
        android: {
          priority: 'high',
          ttl: 60 * 1000, // 60s TTL for real-time calls
          notification: {
            sound: 'call_ringtone',
            channelId: 'chatterpatter_calls',
            priority: 'max',
            visibility: 'public'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'call_ringtone.caf',
              category: 'INCOMING_CALL'
            }
          }
        }
      };

      const response = await admin.messaging().send(message);
      return { success: true, messageId: response };
    } catch (err) {
      console.error('[FCM CALL NOTIF ERROR]', err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new FcmService();
