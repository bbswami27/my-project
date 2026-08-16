// ChatterPatter - Modern Firebase Cloud Messaging (FCM HTTP v1) Service
// Uses Firebase Admin SDK initialized with Service Account (No obsolete server keys)

let admin = null;
let isFcmInitialized = false;

function initFirebase() {
  if (isFcmInitialized) return;

  try {
    const firebaseAdmin = require('firebase-admin');
    
    // 1. Try FIREBASE_SERVICE_ACCOUNT JSON string
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : process.env.FIREBASE_SERVICE_ACCOUNT;
      
      admin = firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount)
      });
      isFcmInitialized = true;
      console.log('[FCM] Firebase Admin SDK (HTTP v1) initialized via FIREBASE_SERVICE_ACCOUNT');
      return;
    }

    // 2. Try individual environment variables
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
      console.log('[FCM] Firebase Admin SDK (HTTP v1) initialized via individual env vars');
      return;
    }
  } catch (err) {
    console.warn('[FCM] Firebase Admin initialization skipped:', err.message);
  }
}

initFirebase();

class FcmService {
  isConfigured() {
    return isFcmInitialized && !!admin;
  }

  async sendPushNotification(deviceToken, { title, body, data = {} }) {
    if (!this.isConfigured()) {
      console.log(`[FCM-SIMULATION] FCM not configured in Render env. Target: ${deviceToken.slice(0, 12)}... | Title: "${title}" | Body: "${body}"`);
      return { success: false, reason: 'FCM_NOT_CONFIGURED' };
    }

    try {
      const message = {
        token: deviceToken,
        notification: {
          title: title || 'ChatterPatter',
          body: body || ''
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
            channelId: 'chatterpatter_messages'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      const response = await admin.messaging().send(message);
      console.log(`[FCM] Notification successfully sent via HTTP v1. Message ID: ${response}`);
      return { success: true, messageId: response };
    } catch (err) {
      console.error('[FCM ERROR] Failed to send push notification:', err.message);
      return { success: false, error: err.message };
    }
  }

  async sendCallNotification(deviceToken, { callerName, callType, callId }) {
    return this.sendPushNotification(deviceToken, {
      title: `Incoming ${callType === 'video' ? 'Video' : 'Audio'} Call 📞`,
      body: `${callerName} is calling you on ChatterPatter...`,
      data: {
        type: 'incoming_call',
        callType: callType || 'video',
        callId: callId || '',
        callerName: callerName || 'Friend'
      }
    });
  }
}

module.exports = new FcmService();
