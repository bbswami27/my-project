// GitPit - Location Sharing Service

class LocationService {
  constructor() {
    this.landmarks = [
      { name: 'India Gate, New Delhi', lat: 28.6129, lng: 77.2295, address: 'Rajpath, India Gate, New Delhi, Delhi 110001' },
      { name: 'Marine Drive, Mumbai', lat: 18.9432, lng: 72.8230, address: 'Netaji Subhash Chandra Bose Road, Mumbai, MH' },
      { name: 'MG Road, Bengaluru', lat: 12.9756, lng: 77.6066, address: 'Mahatma Gandhi Road, Bengaluru, Karnataka' },
      { name: 'Cyber City, Gurugram', lat: 28.4950, lng: 77.0895, address: 'DLF Phase 2, Gurugram, Haryana 122002' },
      { name: 'Hitech City, Hyderabad', lat: 17.4435, lng: 78.3772, address: 'HITEC City, Madhapur, Hyderabad, Telangana' }
    ];
  }

  async shareCurrentLocation() {
    const activeChat = window.ChatEngine ? window.ChatEngine.getActiveChat() : null;
    if (!activeChat) {
      alert('Please open a chat to share your location!');
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          this.sendLocationMessage(activeChat.id, {
            title: 'Live Location 📍',
            address: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`,
            lat,
            lng,
            mapUrl: `https://www.google.com/maps?q=${lat},${lng}`
          });
        },
        (err) => {
          console.warn('Geolocation denied or timed out, using landmark simulation:', err);
          this.shareLandmarkLocation(activeChat.id);
        },
        { timeout: 5000 }
      );
    } else {
      this.shareLandmarkLocation(activeChat.id);
    }
  }

  shareLandmarkLocation(chatId) {
    const randomLandmark = this.landmarks[Math.floor(Math.random() * this.landmarks.length)];
    this.sendLocationMessage(chatId, {
      title: randomLandmark.name,
      address: randomLandmark.address,
      lat: randomLandmark.lat,
      lng: randomLandmark.lng,
      mapUrl: `https://www.google.com/maps?q=${randomLandmark.lat},${randomLandmark.lng}`
    });
  }

  sendLocationMessage(chatId, locData) {
    if (window.ChatEngine) {
      window.ChatEngine.sendMessage({
        type: 'location',
        locationTitle: locData.title,
        locationAddress: locData.address,
        mapUrl: locData.mapUrl,
        lat: locData.lat,
        lng: locData.lng,
        text: `📍 Shared Location: ${locData.title}`
      });
    }
  }
}

window.LocationService = new LocationService();

// =====================================================
// GitPit Reliability Layer v1.1
// Fixes: persistent login, socket re-registration, repeated calls,
// saved-contact Stranger Shield detection, direct-message guard,
// duplicate REST sends, and clickable web links.
// =====================================================
(function installGitPitReliabilityLayer() {
  const digits10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);

  // Do not destroy a valid cached login because one session-check request fails.
  // Explicit user logout still behaves normally.
  try {
    if (typeof AuthManager !== 'undefined' && !AuthManager.prototype.__gitpitPersistentLoginPatched) {
      const originalLogout = AuthManager.prototype.logout;
      AuthManager.prototype.logout = function(explicit = true) {
        if (explicit === false && this.currentUser && this.authToken) {
          console.warn('[RELIABILITY] Session check failed; keeping cached authenticated session.');
          try { this.renderAuthenticatedUI(); } catch (e) {}
          return;
        }
        return originalLogout.call(this, explicit);
      };
      AuthManager.prototype.__gitpitPersistentLoginPatched = true;
    }
  } catch (e) {
    console.warn('[RELIABILITY] Persistent-login patch warning:', e);
  }

  // When realtime Socket.IO is healthy, socket send already saves the message
  // on the server. Suppress the duplicate REST POST performed by legacy chat.js.
  if (!window.__gitpitFetchReliabilityPatched && typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = String((init && init.method) || 'GET').toUpperCase();
        const socket = window.ChatterApp && window.ChatterApp.socket;
        if (method === 'POST' && /\/api\/messages\/?(?:\?|$)/.test(url) && socket && socket.connected) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true, realtime: true }),
            text: async () => JSON.stringify({ success: true, realtime: true })
          });
        }
      } catch (e) {}
      return nativeFetch(input, init);
    };
    window.__gitpitFetchReliabilityPatched = true;
  }

  function reRegisterSocket() {
    const app = window.ChatterApp;
    const auth = window.AuthManager;
    if (!app || !app.socket || !auth || !auth.currentUser) return;
    const socket = app.socket;
    if (!socket.connected) {
      try { socket.connect(); } catch (e) {}
      return;
    }
    socket.emit('user_join', auth.currentUser);
  }

  function applyInstanceFixes() {
    const app = window.ChatterApp;
    const auth = window.AuthManager;
    const chat = window.ChatEngine;
    const calls = window.CallManager;

    // Always re-register the authenticated user after reconnect / resume / network return.
    if (app && app.socket && !app.socket.__gitpitReliabilityBound) {
      const socket = app.socket;
      socket.__gitpitReliabilityBound = true;
      socket.on('connect', () => {
        setTimeout(reRegisterSocket, 100);
        setTimeout(reRegisterSocket, 1200);
      });
      socket.on('disconnect', () => {
        setTimeout(() => {
          try { if (!socket.connected) socket.connect(); } catch (e) {}
        }, 1200);
      });
      socket.on('connect_error', () => {
        setTimeout(() => {
          try { if (!socket.connected) socket.connect(); } catch (e) {}
        }, 1800);
      });
      socket.on('end-call', () => setTimeout(reRegisterSocket, 500));
      socket.on('call_ended', () => setTimeout(reRegisterSocket, 500));
      if (socket.io && typeof socket.io.on === 'function') {
        socket.io.on('reconnect', () => setTimeout(reRegisterSocket, 100));
      }
    }

    // Saved phonebook contacts must never be classified as strangers.
    if (chat && !chat.__gitpitStrangerShieldPatched) {
      chat.__gitpitStrangerShieldPatched = true;
      const originalTrusted = typeof chat.isContactTrusted === 'function' ? chat.isContactTrusted.bind(chat) : () => false;
      chat.isUnknownContact = function(targetChat) {
        if (!targetChat || targetChat.isGroup || targetChat.isAi || targetChat.id === 'chat_ai') return false;
        if (originalTrusted(targetChat.id)) return false;

        const phonebook = window.AuthManager && typeof window.AuthManager.getPhonebook === 'function'
          ? (window.AuthManager.getPhonebook() || {}) : {};
        const targetPhone = digits10(targetChat.phone || targetChat.id);
        if (phonebook[targetChat.id] || (targetPhone && phonebook[targetPhone])) return false;

        for (const [key, entry] of Object.entries(phonebook)) {
          if (!entry) continue;
          const entryPhone = digits10(entry.phone || key);
          const contactId = String(entry.contactId || '');
          const isActuallySaved = !!(entry.savedName || entry.name || entry.contactId);
          if (isActuallySaved && (
            (targetPhone && entryPhone && targetPhone === entryPhone) ||
            contactId === String(targetChat.id || '')
          )) return false;
        }
        return true;
      };

      // Ignore legacy global broadcasts that are addressed to another user.
      if (typeof chat.onReceiveMessage === 'function') {
        const originalReceive = chat.onReceiveMessage.bind(chat);
        chat.onReceiveMessage = function(msg) {
          if (!msg) return;
          const me = window.AuthManager && window.AuthManager.currentUser;
          const myId = me && me.id ? String(me.id) : '';
          const myPhone = digits10(me && me.phone);
          const recipientId = String(msg.recipientId || '');
          const recipientPhone = digits10(msg.recipientPhone);
          const groupOrAi = msg.chatId === 'chat_ai' || String(msg.chatId || '').startsWith('group_') || msg.senderId === 'ai_assistant';
          const hasRecipient = !!recipientId || !!recipientPhone;
          const addressedToMe = !hasRecipient || groupOrAi ||
            (myId && recipientId === myId) ||
            (myPhone && recipientId === `user_${myPhone}`) ||
            (myPhone && recipientPhone === myPhone);
          if (!addressedToMe) return;
          return originalReceive(msg);
        };
      }

      // Robust linkification for http(s) and www links.
      chat.formatText = function(str) {
        if (!str) return '';
        let formatted = String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>');
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, (raw) => {
          const m = raw.match(/^(.*?)([.,!?;:)]*)$/);
          const clean = m ? m[1] : raw;
          const tail = m ? m[2] : '';
          const href = /^www\./i.test(clean) ? `https://${clean}` : clean;
          return `<a href="${href}" target="_blank" rel="noopener noreferrer">${clean}</a>${tail}`;
        });
        return formatted.replace(/\n/g, '<br>');
      };
    }

    // After every ended/failed call, ensure WebRTC state is reusable and socket is registered.
    if (calls && !calls.__gitpitRepeatCallPatched && typeof calls.endCall === 'function') {
      calls.__gitpitRepeatCallPatched = true;
      const originalEndCall = calls.endCall.bind(calls);
      calls.endCall = function(...args) {
        let result;
        try {
          result = originalEndCall(...args);
        } finally {
          setTimeout(() => {
            try {
              this.activeCall = null;
              this.pendingIncomingCall = null;
              this.iceCandidatesQueue = [];
              if (this.callDurationTimer) {
                clearInterval(this.callDurationTimer);
                this.callDurationTimer = null;
              }
              if (this.peerConnection && ['closed', 'failed', 'disconnected'].includes(this.peerConnection.connectionState)) {
                try { this.peerConnection.close(); } catch (e) {}
                this.peerConnection = null;
              }
            } catch (e) {}
            reRegisterSocket();
          }, 350);
        }
        return result;
      };
    }

    if (auth && auth.currentUser) reRegisterSocket();
  }

  window.addEventListener('online', () => setTimeout(reRegisterSocket, 100));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(reRegisterSocket, 150);
  });
  window.addEventListener('pageshow', () => setTimeout(reRegisterSocket, 150));

  window.addEventListener('DOMContentLoaded', () => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      applyInstanceFixes();
      if (attempts > 20 || (window.AuthManager && window.ChatterApp && window.ChatEngine && window.CallManager)) {
        clearInterval(timer);
        applyInstanceFixes();
      }
    }, 250);

    // Long-lived safety heartbeat: reconnect/re-register without creating a new socket.
    setInterval(() => {
      const socket = window.ChatterApp && window.ChatterApp.socket;
      if (socket && !socket.connected) {
        try { socket.connect(); } catch (e) {}
      } else {
        reRegisterSocket();
      }
    }, 20000);
  });
})();
