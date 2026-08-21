'use strict';

// GitPit v1.0.4 Point 3: one reliable authenticated delivery path.
(function installMessageDeliveryV4() {
  const seenIncoming = new Set();

  function token() {
    return (window.AuthManager && window.AuthManager.authToken) || localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token') || '';
  }
  function base() { return window.API_BASE || 'https://chitchat-chatterpatter.onrender.com'; }

  async function postMessage(payload) {
    const r = await fetch(`${base()}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token() ? `Bearer ${token()}` : '' },
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
    return data && data.message ? data.message : payload;
  }

  function resolveRecipient(chat) {
    if (!chat) return null;
    if (chat.isGroup || String(chat.id || '').startsWith('group_')) return chat.id;
    const phone10 = String(chat.phone || '').replace(/\D/g, '').slice(-10);
    const registered = (window.ChatEngine && window.ChatEngine.registeredUsers) || [];
    const match = registered.find(u => u.id === chat.id || (phone10 && String(u.phone || '').replace(/\D/g, '').slice(-10) === phone10));
    return (match && match.id) || chat.id;
  }

  function installChatPatch() {
    const chat = window.ChatEngine;
    if (!chat || chat.__messageDeliveryV4) return !!chat;
    chat.__messageDeliveryV4 = true;

    chat.sendMessage = async function(customPayload = null) {
      if (window.VoiceRecorder && window.VoiceRecorder.isRecording) {
        window.VoiceRecorder.stopRecording(data => data && data.audioUrl && this.sendVoiceNote(data));
        if (typeof this.resetRecordingUI === 'function') this.resetRecordingUI();
        return;
      }
      document.getElementById('emoji-picker-container')?.classList.remove('active');
      document.getElementById('chat-attach-popup')?.classList.remove('active');

      const activeChat = this.getActiveChat();
      if (!activeChat) return;
      const textarea = document.getElementById('chat-input-textarea');
      const text = textarea ? textarea.value.trim() : '';
      if (!customPayload && !text) return;

      const me = window.AuthManager && window.AuthManager.currentUser;
      if (!me || !token()) { alert('Please log in again before sending a message.'); return; }
      const recipientId = resolveRecipient(activeChat);
      if (!recipientId) { alert('This contact is not resolved on GitPit yet. Refresh contacts and try again.'); return; }

      const now = Date.now();
      const msg = {
        id: `msg_${now}_${Math.random().toString(36).slice(2,8)}`,
        chatId: activeChat.isGroup ? activeChat.id : recipientId,
        senderId: me.id,
        senderName: me.name || 'You',
        senderAvatar: me.avatar || '',
        senderPhone: me.phone || '',
        recipientId,
        recipientPhone: activeChat.phone || '',
        text,
        time: new Date(now).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
        timestamp: now,
        createdAt: now,
        status: 'sending',
        quote: this.replyingToMessage ? {...this.replyingToMessage} : null,
        ...(customPayload || {})
      };

      activeChat.messages = activeChat.messages || [];
      activeChat.messages.push(msg);
      if (textarea) { textarea.value = ''; textarea.style.height = '22px'; }
      if (typeof this.clearReplyQuote === 'function') this.clearReplyQuote();
      this.saveChats(); this.renderMessages(); this.renderChatList(); this.scrollToBottom();

      if (activeChat.isAi || activeChat.id === 'chat_ai') {
        msg.status = 'sent'; this.saveChats(); this.renderMessages();
        setTimeout(() => this.handleClientAiReply(msg.text, me.name), 250);
        return;
      }

      try {
        const saved = await postMessage(msg);
        Object.assign(msg, saved || {}, {status: 'sent'});
        this.saveChats(); this.renderMessages(); this.renderChatList();
      } catch (err) {
        msg.status = 'failed';
        msg.deliveryError = err.message;
        this.saveChats(); this.renderMessages();
        console.error('[MESSAGE V4] delivery failed', err);
        alert(`Message not delivered: ${err.message}`);
      }
    };

    console.log('[MESSAGE V4] Point 3 reliable delivery installed');
    return true;
  }

  function installIncomingPatch() {
    const app = window.ChatterApp;
    const socket = app && app.socket;
    const chat = window.ChatEngine;
    if (!socket || !chat || socket.__messageIncomingV4) return !!socket;
    socket.__messageIncomingV4 = true;
    socket.on('receive_message', msg => {
      if (!msg || !msg.id || seenIncoming.has(msg.id)) return;
      seenIncoming.add(msg.id);
      if (seenIncoming.size > 1000) seenIncoming.clear();
      chat.onReceiveMessage(msg);
    });
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const a = installChatPatch();
    const b = installIncomingPatch();
    if ((a && b) || tries > 80) clearInterval(timer);
  }, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { installChatPatch(); installIncomingPatch(); } });
  window.addEventListener('online', () => { installChatPatch(); installIncomingPatch(); });
})();
