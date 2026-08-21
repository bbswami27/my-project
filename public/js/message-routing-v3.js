'use strict';

// GitPit Message Routing v3
// Calls continue to use Socket.IO. Chat messages use one authenticated REST write,
// avoiding the legacy Socket+REST double-send/suppression conflict.
(function installMessageRoutingV3() {
  function sendRestMessage(payload) {
    try {
      const token = (window.AuthManager && window.AuthManager.authToken) || localStorage.getItem('gitpit_auth_token') || '';
      const base = window.API_BASE || 'https://chitchat-chatterpatter.onrender.com';
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/api/messages`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onreadystatechange = function() {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          console.error('[MESSAGE V3] REST delivery failed', xhr.status, xhr.responseText);
          try {
            window.dispatchEvent(new CustomEvent('gitpit-message-delivery-error', { detail: { status: xhr.status } }));
          } catch (_) {}
        }
      };
      xhr.send(JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('[MESSAGE V3] REST transport error', e);
      return false;
    }
  }

  function bindSocket() {
    const socket = window.ChatterApp && window.ChatterApp.socket;
    if (!socket || socket.__gitpitMessageRoutingV3) return !!socket;
    socket.__gitpitMessageRoutingV3 = true;
    const nativeEmit = socket.emit.bind(socket);

    socket.emit = function(eventName, ...args) {
      if (eventName === 'send_message') {
        const payload = args[0] || {};
        // The server's authenticated REST endpoint derives sender identity from
        // the session token and broadcasts receive_message to the recipient.
        sendRestMessage(payload);
        return socket;
      }
      return nativeEmit(eventName, ...args);
    };
    console.log('[MESSAGE V3] Reliable message transport installed.');
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (bindSocket() || tries > 60) clearInterval(timer);
  }, 250);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(bindSocket, 100);
  });
  window.addEventListener('online', () => setTimeout(bindSocket, 100));
})();
