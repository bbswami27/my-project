// ChatterPatter - Production Chat Engine with Real Users, Media Lightbox, Calendar Date Jump, Profile Media Gallery & Editing

class ChatEngine {
  constructor() {
    this.chats = [];
    this.activeChatId = null;
    this.replyingToMessage = null;
    this.selectedMessageForAction = null;
    this.blockedContacts = [];
    this.registeredUsers = [];
    this.init();
  }

  init() {
    const savedChats = localStorage.getItem('chatterpatter_chats') || localStorage.getItem('gitpit_chats');
    if (savedChats) {
      try {
        this.chats = JSON.parse(savedChats);
      } catch (e) {
        this.chats = [...window.MOCK_DATA.initialChats];
      }
    } else {
      this.chats = [...window.MOCK_DATA.initialChats];
    }

    // Clean any old dummy test users (Alex, Priya, Rahul, Sarah) from saved chats
    this.chats = this.chats.filter(c => {
      if (c.id === 'chat_ai' || c.isAi) return true;
      if (['chat_priya', 'chat_rahul', 'chat_group_tech', 'user_alex', 'user_priya', 'user_rahul', 'user_sarah'].includes(c.id)) {
        return false;
      }
      return true;
    });

    // Ensure AI Assistant is always present at the top
    const aiChatIndex = this.chats.findIndex(c => c.id === 'chat_ai' || c.isAi);
    const defaultAiChat = {
      id: 'chat_ai',
      name: 'ChatterPatter AI 🤖',
      username: '@ai_assistant',
      phone: '+91 80000 00000',
      email: 'ai@chatterpatter.app',
      isGroup: false,
      isAi: true,
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatterAI',
      unreadCount: 1,
      pinned: true,
      online: true,
      bio: 'Smart AI Bot • Powered by ChatterPatter Neural Intelligence',
      messages: [
        {
          id: 'm_welcome',
          senderId: 'ai_assistant',
          senderName: 'ChatterPatter AI 🤖',
          senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatterAI',
          text: 'Namaste! 🙏 Main aapka Smart AI Assistant hoon.\n\nMujhse koi bhi sawaal poochein, emails ya leave application likhwayein, coding help lein, video calling tips lein ya chutkula sunein! ✨',
          timestamp: '10:00 AM',
          createdAt: Date.now(),
          status: 'read'
        }
      ]
    };

    if (aiChatIndex === -1) {
      this.chats.unshift(defaultAiChat);
    } else {
      this.chats[aiChatIndex].isAi = true;
      this.chats[aiChatIndex].name = 'ChatterPatter AI 🤖';
      if (!this.chats[aiChatIndex].messages || this.chats[aiChatIndex].messages.length === 0) {
        this.chats[aiChatIndex].messages = defaultAiChat.messages;
      }
    }

    const savedBlocked = localStorage.getItem('chatterpatter_blocked_contacts') || localStorage.getItem('gitpit_blocked_contacts');
    if (savedBlocked) {
      try {
        this.blockedContacts = JSON.parse(savedBlocked);
      } catch (e) {
        this.blockedContacts = [];
      }
    }

    this.bindEvents();
    this.renderChatList();
    this.syncRegisteredUsers();
  }

  async syncRegisteredUsers() {
    try {
      const currentUserId = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.id : null;
      const resp = await fetch(`/api/users${currentUserId ? '?userId=' + currentUserId : ''}`);
      const users = await resp.json();
      if (Array.isArray(users)) {
        this.registeredUsers = users;
        users.forEach(u => {
          if (currentUserId && u.id === currentUserId) return;
          const existing = this.chats.find(c => c.id === u.id || (u.phone && c.phone === u.phone));
          if (!existing) {
            this.chats.push({
              id: u.id,
              name: u.name,
              username: u.username,
              phone: u.phone || '',
              email: u.email || '',
              avatar: u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.id}`,
              bio: u.bio || 'Hey there! I am using ChatterPatter 🚀',
              online: u.online || false,
              isGroup: false,
              unreadCount: 0,
              messages: []
            });
          } else {
            existing.name = u.name;
            existing.avatar = u.avatar || existing.avatar;
            existing.online = u.online || existing.online;
            existing.bio = u.bio || existing.bio;
            if (u.phone) existing.phone = u.phone;
            if (u.email) existing.email = u.email;
          }
        });
        this.saveChats();
        this.renderChatList();
      }
    } catch (e) {
      console.warn('Could not sync registered users:', e);
    }
  }

  saveChats() {
    localStorage.setItem('chatterpatter_chats', JSON.stringify(this.chats));
    localStorage.setItem('gitpit_chats', JSON.stringify(this.chats));
  }

  getActiveChat() {
    return this.chats.find(c => c.id === this.activeChatId);
  }

  bindEvents() {
    // Search Filter
    const searchInput = document.getElementById('chat-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        this.filterChatList(query);
      });
    }

    // Message Textarea auto-resize & keypress (Enter to send)
    const textarea = document.getElementById('chat-input-textarea');
    if (textarea) {
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
        this.handleTyping();
      });

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    // Dedicated Send Arrow Button (➤)
    const sendBtn = document.getElementById('btn-send-message');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    // Separate Mic / Voice Note Button
    const voiceBtn = document.getElementById('btn-voice-record-trigger');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => this.toggleVoiceRecording());
    }

    // Cancel Voice Recording
    const cancelRecBtn = document.getElementById('btn-cancel-recording');
    if (cancelRecBtn) {
      cancelRecBtn.addEventListener('click', () => {
        if (window.VoiceRecorder) window.VoiceRecorder.cancelRecording();
        this.resetRecordingUI();
      });
    }

    // Attachment Menu Toggle
    const attachBtn = document.getElementById('btn-chat-attach');
    const attachPopup = document.getElementById('chat-attach-popup');
    if (attachBtn && attachPopup) {
      attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        attachPopup.classList.toggle('active');
      });

      document.addEventListener('click', (e) => {
        if (!attachPopup.contains(e.target) && e.target !== attachBtn) {
          attachPopup.classList.remove('active');
        }
      });
    }

    // Attachment Options Handlers
    const optPhoto = document.getElementById('opt-attach-photo');
    const optDoc = document.getElementById('opt-attach-doc');
    const optScreenshare = document.getElementById('opt-attach-screenshare');
    const optAi = document.getElementById('opt-attach-ai');
    const optLocation = document.getElementById('opt-attach-location');

    if (optPhoto) {
      optPhoto.addEventListener('click', () => {
        if (attachPopup) attachPopup.classList.remove('active');
        const fileInput = document.getElementById('hidden-file-photo');
        if (fileInput) fileInput.click();
      });
    }

    if (optDoc) {
      optDoc.addEventListener('click', () => {
        if (attachPopup) attachPopup.classList.remove('active');
        const fileInput = document.getElementById('hidden-file-doc');
        if (fileInput) fileInput.click();
      });
    }

    if (optScreenshare) {
      optScreenshare.addEventListener('click', () => {
        if (attachPopup) attachPopup.classList.remove('active');
        const activeChat = this.getActiveChat();
        if (window.CallManager) {
          window.CallManager.startCallWithScreenShare(activeChat ? activeChat.name : 'User', activeChat ? activeChat.avatar : '', activeChat ? activeChat.id : '');
        }
      });
    }

    if (optAi) {
      optAi.addEventListener('click', () => {
        if (attachPopup) attachPopup.classList.remove('active');
        this.openChat('chat_ai');
      });
    }

    if (optLocation) {
      optLocation.addEventListener('click', () => {
        if (attachPopup) attachPopup.classList.remove('active');
        if (window.LocationService) window.LocationService.openLocationModal();
      });
    }

    // Hidden File Upload Change Handlers
    const photoInput = document.getElementById('hidden-file-photo');
    if (photoInput) {
      photoInput.addEventListener('change', (e) => this.handleImageUpload(e));
    }

    const docInput = document.getElementById('hidden-file-doc');
    if (docInput) {
      docInput.addEventListener('change', (e) => this.handleDocUpload(e));
    }

    // Back to Chats on Mobile
    const backBtn = document.getElementById('btn-back-to-chats');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        document.getElementById('sidebar-container').classList.remove('mobile-hidden');
        document.getElementById('chat-main-area').classList.remove('mobile-active');
      });
    }

    // Header Video & Audio Call Buttons
    const callVideoBtn = document.getElementById('btn-header-call-video');
    const callAudioBtn = document.getElementById('btn-header-call-audio');
    if (callVideoBtn) {
      callVideoBtn.addEventListener('click', () => {
        const activeChat = this.getActiveChat();
        if (activeChat && window.CallManager) {
          window.CallManager.startCall(activeChat.name, activeChat.avatar, 'video', activeChat.id);
        }
      });
    }
    if (callAudioBtn) {
      callAudioBtn.addEventListener('click', () => {
        const activeChat = this.getActiveChat();
        if (activeChat && window.CallManager) {
          window.CallManager.startCall(activeChat.name, activeChat.avatar, 'audio', activeChat.id);
        }
      });
    }

    // Chat Header Info Click -> Open Contact Profile Modal
    const headerInfo = document.querySelector('.chat-header-info');
    const headerAvatar = document.getElementById('active-chat-avatar');
    if (headerInfo) {
      headerInfo.addEventListener('click', () => this.openContactProfile(this.activeChatId));
    }
    if (headerAvatar) {
      headerAvatar.addEventListener('click', () => this.openContactProfile(this.activeChatId));
    }

    // Calendar Jump to Date button in Header
    const jumpDateBtn = document.getElementById('btn-jump-to-date');
    if (jumpDateBtn) {
      jumpDateBtn.addEventListener('click', () => this.openJumpToDateModal());
    }

    // Confirm Edit Modal Handler
    const saveEditBtn = document.getElementById('btn-confirm-edit-message');
    if (saveEditBtn) {
      saveEditBtn.addEventListener('click', () => this.confirmEditMessage());
    }

    // Cancel Edit Handler
    const cancelEditBtn = document.getElementById('btn-cancel-edit-message');
    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', () => {
        const modal = document.getElementById('edit-message-modal');
        if (modal) modal.classList.remove('active');
      });
    }
  }

  renderChatList() {
    const listElem = document.getElementById('chat-list-items');
    if (!listElem) return;

    if (this.chats.length === 0) {
      listElem.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
          <div style="font-size: 32px; margin-bottom: 8px;">💬</div>
          <p>No active conversations yet.</p>
          <button class="btn-action-primary" style="margin-top: 12px; font-size: 13px;" onclick="window.ChatEngine.syncRegisteredUsers()">
            🔄 Refresh Contacts
          </button>
        </div>
      `;
      return;
    }

    listElem.innerHTML = this.chats.map(chat => {
      const lastMsg = chat.messages && chat.messages.length > 0
        ? chat.messages[chat.messages.length - 1]
        : { text: 'Tap to chat', timestamp: '' };

      const unreadBadge = chat.unreadCount > 0
        ? `<div class="chat-item-badge">${chat.unreadCount}</div>`
        : '';

      const onlineDot = chat.online
        ? `<div class="online-dot"></div>`
        : '';

      const isActive = chat.id === this.activeChatId ? 'active' : '';
      const isPinned = chat.pinned ? '📌 ' : '';

      return `
        <li class="chat-item ${isActive}" onclick="window.ChatEngine.openChat('${chat.id}')">
          <div class="avatar-wrapper" onclick="event.stopPropagation(); window.ChatEngine.openContactProfile('${chat.id}')">
            <img class="avatar-img" src="${chat.avatar}" alt="${chat.name}">
            ${onlineDot}
          </div>
          <div class="chat-item-info">
            <div class="chat-item-top">
              <span class="chat-item-name">${isPinned}${chat.name}</span>
              <span class="chat-item-time">${lastMsg.timestamp || ''}</span>
            </div>
            <div class="chat-item-bottom">
              <span class="chat-item-lastmsg">
                ${lastMsg.isDeleted ? '🚫 This message was deleted' : (lastMsg.type === 'voice' ? '🎙️ Voice note' : (lastMsg.type === 'image' ? '📷 Photo' : (lastMsg.type === 'document' ? '📄 ' + (lastMsg.fileName || 'Document') : lastMsg.text || 'Tap to chat')))}
              </span>
              ${unreadBadge}
            </div>
          </div>
          <button class="chat-item-delete-btn" title="Delete Chat" onclick="event.stopPropagation(); window.ChatEngine.deleteChat('${chat.id}')">
            🗑️
          </button>
        </li>
      `;
    }).join('');
  }

  filterChatList(query) {
    if (!query) {
      this.renderChatList();
      return;
    }
    const cleanQuery = query.toLowerCase().trim();
    const filtered = this.chats.filter(c => {
      const matchName = (c.name || '').toLowerCase().includes(cleanQuery);
      const matchUsername = (c.username || '').toLowerCase().includes(cleanQuery);
      const matchPhone = (c.phone || '').includes(cleanQuery);
      const matchEmail = (c.email || '').toLowerCase().includes(cleanQuery);
      const matchMessages = (c.messages || []).some(m => (m.text || '').toLowerCase().includes(cleanQuery));
      return matchName || matchUsername || matchPhone || matchEmail || matchMessages;
    });

    const listElem = document.getElementById('chat-list-items');
    if (!listElem) return;

    if (filtered.length === 0) {
      listElem.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 13.5px;">
          🔍 No contacts found matching "<b>${query}</b>"<br>
          <button class="btn-action-primary" style="margin-top: 14px; font-size: 12px;" onclick="window.ChatEngine.startNewChatWithSearch('${query.replace(/'/g, "\\'")}')">
            💬 Start New Chat with "${query}"
          </button>
        </div>
      `;
      return;
    }

    listElem.innerHTML = filtered.map(chat => `
      <li class="chat-item ${chat.id === this.activeChatId ? 'active' : ''}" onclick="window.ChatEngine.openChat('${chat.id}')">
        <div class="avatar-wrapper">
          <img class="avatar-img" src="${chat.avatar}" alt="${chat.name}">
        </div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-name">${chat.name}</span>
          </div>
          <div class="chat-item-bottom">
            <span class="chat-item-lastmsg">${chat.phone ? '📱 ' + chat.phone : (chat.username || 'Tap to chat')}</span>
          </div>
        </div>
      </li>
    `).join('');
  }

  startNewChatWithSearch(target) {
    const newContact = {
      id: 'user_' + Date.now(),
      name: target,
      phone: target.includes('@') ? '' : target,
      email: target.includes('@') ? target : '',
      username: '@' + target.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(target)}`,
      bio: 'ChatterPatter Member 🚀',
      messages: [],
      unreadCount: 0,
      online: true
    };
    this.chats.unshift(newContact);
    this.saveChats();
    this.renderChatList();
    this.openChat(newContact.id);
  }

  openChat(chatId) {
    this.activeChatId = chatId;
    const chat = this.chats.find(c => c.id === chatId);
    if (!chat) return;

    chat.unreadCount = 0;
    this.saveChats();
    this.renderChatList();

    document.getElementById('sidebar-container').classList.add('mobile-hidden');
    document.getElementById('chat-main-area').classList.add('mobile-active');

    document.getElementById('chat-empty-state').style.display = 'none';
    document.getElementById('chat-active-view').style.display = 'flex';

    document.getElementById('active-chat-avatar').src = chat.avatar;
    document.getElementById('active-chat-name').textContent = chat.name;
    const statusElem = document.getElementById('active-chat-status');
    const isAi = chat.isAi || chat.id === 'chat_ai';

    statusElem.textContent = isAi
      ? '🤖 Smart AI Assistant • Always Active'
      : (chat.isGroup
        ? `${(chat.members || []).length} members`
        : (chat.online ? 'Online' : (chat.lastSeen ? `Last seen ${chat.lastSeen}` : 'ChatterPatter')));
    statusElem.className = 'status-text';

    // Toggle AI Prompt Chips
    const aiChipsBar = document.getElementById('ai-prompt-chips-bar');
    if (aiChipsBar) {
      aiChipsBar.style.display = isAi ? 'block' : 'none';
    }

    this.updateBlockedStateUI();
    this.renderMessages();
    this.scrollToBottom();
  }

  sendAiPrompt(promptText) {
    const textarea = document.getElementById('chat-input-textarea');
    if (textarea) {
      textarea.value = promptText;
    }
    this.sendMessage();
  }

  renderMessages() {
    const activeChat = this.getActiveChat();
    const container = document.getElementById('chat-messages-container');
    if (!container || !activeChat) return;

    const currentUserId = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.id : 'me';

    if (activeChat.messages.length === 0) {
      container.innerHTML = `
        <div class="empty-chat-placeholder">
          <div class="empty-icon">👋</div>
          <p>Start a conversation with <b>${activeChat.name}</b></p>
          <span style="font-size: 12px; color: var(--text-muted);">End-to-end encrypted messaging</span>
        </div>
      `;
      return;
    }

    let html = `
      <div class="date-divider">
        <span class="date-badge">CHATS & MEDIA</span>
      </div>
    `;

    activeChat.messages.forEach((msg) => {
      const isOutgoing = msg.senderId === currentUserId || msg.senderId === 'me';
      const wrapperClass = isOutgoing ? 'msg-outgoing' : 'msg-incoming';

      const ticks = isOutgoing
        ? `<span class="msg-ticks ${msg.status === 'read' ? 'ticks-read' : 'ticks-sent'}">✓✓</span>`
        : '';

      const editedBadge = msg.edited ? `<span class="msg-edited-tag">(edited)</span>` : '';

      let quotedHtml = '';
      if (msg.quote) {
        quotedHtml = `
          <div class="msg-quoted">
            <div class="msg-quoted-author">${msg.quote.senderName}</div>
            <div class="msg-quoted-text">${msg.quote.text}</div>
          </div>
        `;
      }

      let bodyHtml = '';
      if (msg.isDeleted) {
        bodyHtml = `<div class="msg-deleted-text">🚫 This message was deleted</div>`;
      } else if (msg.type === 'voice') {
        bodyHtml = `
          <div class="voice-note-card">
            <button class="voice-play-btn" onclick="window.VoiceRecorder && window.VoiceRecorder.playVoiceNote(this, '${msg.audioUrl || ''}', '${msg.duration || '0:05'}')">▶</button>
            <div class="voice-waveform-container">
              <div class="waveform-bars">
                <div class="wave-bar" style="height: 8px"></div>
                <div class="wave-bar" style="height: 18px"></div>
                <div class="wave-bar" style="height: 12px"></div>
                <div class="wave-bar" style="height: 22px"></div>
                <div class="wave-bar" style="height: 14px"></div>
              </div>
              <span class="voice-duration">${msg.duration || '0:05'}</span>
            </div>
          </div>
        `;
      } else if (msg.type === 'image') {
        bodyHtml = `
          <div class="msg-media-preview" onclick="window.ChatEngine.openLightbox('${msg.mediaUrl}', '${(msg.text || '').replace(/'/g, "\\'")}')">
            <img src="${msg.mediaUrl}" alt="Photo" class="chat-photo-thumbnail">
          </div>
          ${msg.text ? `<div class="msg-caption">${this.formatText(msg.text)}</div>` : ''}
        `;
      } else if (msg.type === 'document') {
        const ext = (msg.fileName || '').split('.').pop().toLowerCase();
        bodyHtml = `
          <div class="document-bubble-card" onclick="window.ChatEngine.downloadDocument('${(msg.fileName || 'file').replace(/'/g, "\\'")}', '${msg.mediaUrl || msg.fileUrl || ''}')">
            <div class="doc-icon-badge">📄</div>
            <div class="doc-meta">
              <div class="doc-filename">${msg.fileName || 'Document'}</div>
              <div class="doc-details">${msg.fileSize || 'File'} • Click to Download ⬇️</div>
            </div>
          </div>
          ${msg.text && msg.text !== msg.fileName ? `<div>${this.formatText(msg.text)}</div>` : ''}
        `;
      } else if (msg.type === 'location') {
        bodyHtml = `
          <div class="location-bubble-card">
            <div class="location-title">📍 ${msg.locationTitle || 'Live Location'}</div>
            <div class="location-address">${msg.locationAddress || 'Location Coordinates'}</div>
            <a href="${msg.mapUrl || '#'}" target="_blank" class="location-btn-open">Open Map ↗</a>
          </div>
        `;
      } else {
        bodyHtml = `<div>${this.formatText(msg.text)}</div>`;
      }

      // Message Action dropdown trigger
      const canEdit = isOutgoing && !msg.isDeleted && !msg.type;
      const actionsMenuHtml = `
        <div class="msg-action-dropdown-wrapper">
          <button class="btn-msg-more" onclick="event.stopPropagation(); window.ChatEngine.toggleMsgMenu('${msg.id}')">⋮</button>
          <div class="msg-action-menu" id="msg-menu-${msg.id}">
            <button class="msg-action-item" onclick="window.ChatEngine.setReplyQuote('${msg.id}')">↩️ Reply</button>
            <button class="msg-action-item" onclick="window.ChatEngine.copyMsgText('${msg.id}')">📋 Copy</button>
            ${canEdit ? `<button class="msg-action-item" onclick="window.ChatEngine.openEditModal('${msg.id}')">✏️ Edit</button>` : ''}
            <button class="msg-action-item text-danger" onclick="window.ChatEngine.deleteMessage('${msg.id}')">🗑️ Delete</button>
          </div>
        </div>
      `;

      html += `
        <div class="msg-wrapper ${wrapperClass}" id="msg-${msg.id}">
          <div class="msg-bubble">
            ${quotedHtml}
            ${bodyHtml}
            <div class="msg-meta">
              ${editedBadge}
              <span>${msg.timestamp}</span>
              ${ticks}
              ${actionsMenuHtml}
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  toggleMsgMenu(msgId) {
    document.querySelectorAll('.msg-action-menu.active').forEach(m => {
      if (m.id !== `msg-menu-${msgId}`) m.classList.remove('active');
    });
    const menu = document.getElementById(`msg-menu-${msgId}`);
    if (menu) menu.classList.toggle('active');
  }

  // ================= EDIT & DELETE MESSAGES =================
  openEditModal(msgId) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;
    const msg = activeChat.messages.find(m => m.id === msgId);
    if (!msg) return;

    this.selectedMessageForAction = msg;
    const input = document.getElementById('edit-message-input');
    if (input) input.value = msg.text || '';

    const modal = document.getElementById('edit-message-modal');
    if (modal) modal.classList.add('active');
  }

  async confirmEditMessage() {
    if (!this.selectedMessageForAction) return;
    const input = document.getElementById('edit-message-input');
    const newText = input ? input.value.trim() : '';
    if (!newText) return;

    const msgId = this.selectedMessageForAction.id;
    this.selectedMessageForAction.text = newText;
    this.selectedMessageForAction.edited = true;
    this.selectedMessageForAction.editedAt = Date.now();

    this.saveChats();
    this.renderMessages();
    this.renderChatList();

    const modal = document.getElementById('edit-message-modal');
    if (modal) modal.classList.remove('active');

    // Sync via socket and API
    if (window.ChatterApp && window.ChatterApp.socket) {
      window.ChatterApp.socket.emit('edit_message', { id: msgId, text: newText });
    }
    try {
      await fetch(`/api/messages/${msgId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText })
      });
    } catch (e) {}
  }

  async deleteMessage(msgId) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    const isEveryone = confirm('Delete this message for everyone? (Click Cancel to delete for yourself only)');
    const msgIndex = activeChat.messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    if (isEveryone) {
      activeChat.messages[msgIndex].isDeleted = true;
      activeChat.messages[msgIndex].text = '🚫 This message was deleted';
      activeChat.messages[msgIndex].mediaUrl = null;
    } else {
      activeChat.messages.splice(msgIndex, 1);
    }

    this.saveChats();
    this.renderMessages();
    this.renderChatList();

    if (window.ChatterApp && window.ChatterApp.socket) {
      window.ChatterApp.socket.emit('delete_message', { id: msgId, chatId: activeChat.id, isForEveryone: isEveryone });
    }
    try {
      await fetch(`/api/messages/${msgId}?everyone=${isEveryone}`, { method: 'DELETE' });
    } catch (e) {}
  }

  async deleteChat(chatId) {
    const targetChat = this.chats.find(c => c.id === chatId);
    if (!targetChat) return;

    if (!confirm(`Are you sure you want to delete conversation with ${targetChat.name}?`)) {
      return;
    }

    this.chats = this.chats.filter(c => c.id !== chatId);
    this.saveChats();
    this.renderChatList();

    if (this.activeChatId === chatId) {
      this.activeChatId = null;
      document.getElementById('chat-empty-state').style.display = 'flex';
      document.getElementById('chat-active-view').style.display = 'none';
    }

    if (window.ChatterApp && window.ChatterApp.socket) {
      window.ChatterApp.socket.emit('delete_chat', { chatId });
    }
    try {
      await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
    } catch (e) {}
  }

  copyMsgText(msgId) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;
    const msg = activeChat.messages.find(m => m.id === msgId);
    if (msg && msg.text) {
      navigator.clipboard.writeText(msg.text);
      alert('📋 Message text copied to clipboard!');
    }
  }

  // ================= TELEGRAM-STYLE JUMP TO DATE =================
  openJumpToDateModal() {
    const modal = document.getElementById('jump-to-date-modal');
    if (!modal) return;

    const datePicker = document.getElementById('jump-calendar-input');
    if (datePicker) {
      datePicker.value = new Date().toISOString().split('T')[0];
    }
    modal.classList.add('active');
  }

  jumpToSelectedDate() {
    const datePicker = document.getElementById('jump-calendar-input');
    if (!datePicker || !datePicker.value) return;

    const selectedDateStr = datePicker.value; // e.g. "2026-08-15"
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    const modal = document.getElementById('jump-to-date-modal');
    if (modal) modal.classList.remove('active');

    // Search messages for matching date
    const targetMsg = activeChat.messages.find(m => {
      if (m.date && m.date.startsWith(selectedDateStr)) return true;
      if (m.createdAt) {
        const msgDateStr = new Date(m.createdAt).toISOString().split('T')[0];
        return msgDateStr === selectedDateStr;
      }
      return false;
    });

    if (targetMsg) {
      const msgElem = document.getElementById(`msg-${targetMsg.id}`);
      if (msgElem) {
        msgElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        msgElem.classList.add('highlight-jump-msg');
        setTimeout(() => msgElem.classList.remove('highlight-jump-msg'), 3000);
      }
    } else {
      alert(`📅 No messages found on ${selectedDateStr}.`);
    }
  }

  // ================= MEDIA LIGHTBOX MODAL =================
  openLightbox(imageUrl, caption = '') {
    const modal = document.getElementById('media-lightbox-modal');
    const imgElem = document.getElementById('lightbox-preview-img');
    const captionElem = document.getElementById('lightbox-caption-text');
    const downloadBtn = document.getElementById('lightbox-download-btn');

    if (!modal || !imgElem) return;

    imgElem.src = imageUrl;
    if (captionElem) captionElem.textContent = caption || '';
    if (downloadBtn) {
      downloadBtn.onclick = () => this.downloadDocument('ChatterPatter_Image_' + Date.now() + '.jpg', imageUrl);
    }

    modal.classList.add('active');
  }

  closeLightbox() {
    const modal = document.getElementById('media-lightbox-modal');
    if (modal) modal.classList.remove('active');
  }

  downloadDocument(fileName, fileUrl) {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ================= CONTACT PROFILE MODAL & SHARED FILES =================
  openContactProfile(contactId) {
    const contact = this.chats.find(c => c.id === contactId) || this.registeredUsers.find(u => u.id === contactId);
    if (!contact) return;

    const modal = document.getElementById('contact-profile-modal');
    if (!modal) return;

    document.getElementById('contact-profile-avatar').src = contact.avatar;
    document.getElementById('contact-profile-name').textContent = contact.name;
    document.getElementById('contact-profile-username').textContent = contact.username || '@user';
    document.getElementById('contact-profile-status').textContent = contact.bio || contact.status || 'ChatterPatter Member';
    
    // Privacy respecting phone & email
    const phoneElem = document.getElementById('contact-profile-phone');
    const emailElem = document.getElementById('contact-profile-email');
    if (phoneElem) phoneElem.textContent = contact.phone || '🔒 Hidden by User';
    if (emailElem) emailElem.textContent = contact.email || '🔒 Hidden by User';

    // Shared Media Gallery (Photos, Docs, Audio)
    const activeChat = this.chats.find(c => c.id === contactId);
    const messages = activeChat ? activeChat.messages : [];

    const photos = messages.filter(m => m.type === 'image' && m.mediaUrl);
    const docs = messages.filter(m => m.type === 'document');
    const audios = messages.filter(m => m.type === 'voice');

    // Populate Shared Photos Grid
    const photosGrid = document.getElementById('shared-photos-grid');
    if (photosGrid) {
      if (photos.length === 0) {
        photosGrid.innerHTML = `<div class="empty-media-msg">No shared photos yet.</div>`;
      } else {
        photosGrid.innerHTML = photos.map(p => `
          <div class="shared-media-thumb" onclick="window.ChatEngine.openLightbox('${p.mediaUrl}')">
            <img src="${p.mediaUrl}" alt="Photo">
          </div>
        `).join('');
      }
    }

    // Populate Shared Documents List
    const docsList = document.getElementById('shared-docs-list');
    if (docsList) {
      if (docs.length === 0) {
        docsList.innerHTML = `<div class="empty-media-msg">No shared documents.</div>`;
      } else {
        docsList.innerHTML = docs.map(d => `
          <div class="shared-doc-item" onclick="window.ChatEngine.downloadDocument('${(d.fileName || 'file').replace(/'/g, "\\'")}', '${d.mediaUrl || d.fileUrl || ''}')">
            <span class="shared-doc-icon">📄</span>
            <div class="shared-doc-info">
              <div class="shared-doc-title">${d.fileName || 'Document'}</div>
              <div class="shared-doc-sub">${d.fileSize || 'File'} • ${d.timestamp || ''}</div>
            </div>
            <button class="btn-download-shared-doc">⬇️</button>
          </div>
        `).join('');
      }
    }

    modal.classList.add('active');
  }

  // ================= SENDING MESSAGES =================
  sendMessage(customPayload = null) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    const textarea = document.getElementById('chat-input-textarea');
    let text = textarea ? textarea.value.trim() : '';

    if (!customPayload && !text) return;

    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const senderId = currentUser ? currentUser.id : 'me';
    const senderName = currentUser ? currentUser.name : 'You';
    const senderAvatar = currentUser ? currentUser.avatar : '';

    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      chatId: activeChat.id,
      senderId: senderId,
      senderName: senderName,
      senderAvatar: senderAvatar,
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
      status: 'sent',
      quote: this.replyingToMessage ? { ...this.replyingToMessage } : null,
      ...(customPayload || {})
    };

    activeChat.messages.push(newMsg);
    this.clearReplyQuote();
    this.saveChats();
    this.renderMessages();
    this.renderChatList();
    this.scrollToBottom();

    if (textarea) {
      textarea.value = '';
      textarea.style.height = '22px';
    }

    this.playAudioPop();

    // Broadcast over Socket.io
    if (window.ChatterApp && window.ChatterApp.socket && window.ChatterApp.socket.connected) {
      window.ChatterApp.socket.emit('send_message', {
        ...newMsg,
        recipientId: activeChat.id,
        isAiChat: activeChat.isAi || activeChat.id === 'chat_ai'
      });
    } else if (activeChat.isAi || activeChat.id === 'chat_ai') {
      this.handleClientAiReply(newMsg.text, senderName);
    }
  }

  handleClientAiReply(userText, userName) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    const statusElem = document.getElementById('active-chat-status');
    if (statusElem) {
      statusElem.textContent = '🤖 ChatterPatter AI is typing...';
      statusElem.classList.add('typing');
    }

    setTimeout(() => {
      if (statusElem) {
        statusElem.textContent = '🤖 Smart AI Assistant • Always Active';
        statusElem.classList.remove('typing');
      }

      const query = (userText || '').trim().toLowerCase();
      let answer = '';

      // Math
      const mathMatch = (userText || '').match(/^[\d\s\+\-\*\/\(\)\.\^\%]+$/);
      if (mathMatch && (userText || '').match(/[\+\-\*\/]/)) {
        try {
          const sanitized = userText.replace(/[^-()\d/*+.]/g, '');
          const result = Function(`'use strict'; return (${sanitized})`)();
          answer = `🧮 **Calculation Result:**\n\`${userText.trim()}\` = **${result}**`;
        } catch(e) {}
      }

      if (!answer) {
        if (/leave application|chhutti|resignation|formal email|write an email|letter/i.test(query)) {
          answer = `📝 **Professional Draft:**\n\n**Subject:** Application for Leave / Urgent Work\n\nRespected Sir/Madam,\n\nI am writing to formally request leave of absence from [Start Date] to [End Date] due to [urgent personal work]. I will ensure all pending responsibilities are covered.\n\nThanking you,\nYours sincerely,\n**${userName || 'Friend'}**`;
        } else if (/joke|chutkula|hasao|shayari|funny/i.test(query)) {
          answer = `😂 **Chutkula:**\n\nTeacher: "Batao, sabse zyada bijli kahan banti hai?"\nStudent: "Sir, hamare padosi ke ghar me!"\nTeacher: "Kaise?"\nStudent: "Kyunki wahan din-raat 'shanti' chalti hai aur sab kehte hain 'Shanti me bahut power hai!' 🤣⚡`;
        } else if (/hi|hello|hey|namaste/i.test(query)) {
          answer = `Namaste ${userName || 'Friend'}! 🙏✨\n\nMain aapka **Smart AI Assistant** hoon. Main aapke kisi bhi sawaal ka jawaab de sakta hoon:\n\n• 💡 **Sawaal-Jawaab & General Knowledge**\n• ✍️ **Emails, Applications & Letters likhna**\n• 💻 **Programming & Coding Help**\n• 🌐 **Language Translation (Hindi/English)**\n• 📞 **Audio/Video Calling & Screen Sharing Help**\n\nAap mujhse abhi kya poochna chahte hain?`;
        } else {
          answer = `🤖 **Smart AI Answer:**\n\nAapke sawaal *"**${userText}**"* ke sandarbh me:\n\n• Yeh ek mahatvapoorna topic hai. Main ispar poori madad kar sakta hoon.\n• Aap mujhse coding, email writing, math calculations ya translation bhi karwa sakte hain! 💡`;
        }
      }

      const aiReplyMsg = {
        id: 'msg_ai_' + Date.now(),
        chatId: activeChat.id,
        senderId: 'ai_assistant',
        senderName: 'ChatterPatter AI 🤖',
        senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ChatterAI',
        text: answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: Date.now(),
        status: 'read'
      };

      activeChat.messages.push(aiReplyMsg);
      this.saveChats();
      this.renderMessages();
      this.renderChatList();
      this.scrollToBottom();
      this.playAudioPop();
    }, 700);
  }

  handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      this.sendMessage({
        type: 'image',
        mediaUrl: event.target.result,
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(1) + ' KB'
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  handleDocUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      this.sendMessage({
        type: 'document',
        mediaUrl: event.target.result,
        fileUrl: event.target.result,
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(1) + ' KB'
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  setReplyQuote(msgId) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;
    const msg = activeChat.messages.find(m => m.id === msgId);
    if (!msg) return;

    this.replyingToMessage = msg;
    const preview = document.getElementById('chat-reply-preview');
    if (preview) {
      preview.innerHTML = `
        <div class="reply-preview-content">
          <span class="reply-preview-author">${msg.senderName}</span>
          <span class="reply-preview-text">${msg.text || (msg.type ? `[${msg.type}]` : '')}</span>
        </div>
        <button class="reply-preview-close" onclick="window.ChatEngine.clearReplyQuote()">✕</button>
      `;
      preview.style.display = 'flex';
    }
    document.getElementById('chat-input-textarea')?.focus();
  }

  clearReplyQuote() {
    this.replyingToMessage = null;
    const preview = document.getElementById('chat-reply-preview');
    if (preview) preview.style.display = 'none';
  }

  onReceiveMessage(msg) {
    let chat = this.chats.find(c => c.id === msg.chatId);
    if (!chat) {
      chat = {
        id: msg.chatId,
        name: msg.senderName || 'Chatter User',
        avatar: msg.senderAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.chatId}`,
        messages: [],
        unreadCount: 0,
        online: true
      };
      this.chats.unshift(chat);
    }

    // Check duplicate
    if (!chat.messages.some(m => m.id === msg.id)) {
      chat.messages.push(msg);
      if (this.activeChatId !== msg.chatId) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
      }
    }

    this.saveChats();
    this.renderChatList();
    if (this.activeChatId === msg.chatId) {
      this.renderMessages();
      this.scrollToBottom();
    }
    this.playAudioPop();
  }

  scrollToBottom() {
    const container = document.getElementById('chat-messages-container');
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  }

  formatText(str) {
    if (!str) return '';
    let formatted = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks ```code```
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>');
    // Inline code `code`
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Bold **text**
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // URLs to links
    formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  playAudioPop() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch(e) {}
  }

  closeActiveChat() {
    this.activeChatId = null;
    const sidebar = document.getElementById('sidebar-container');
    const chatArea = document.getElementById('chat-main-area');
    const emptyState = document.getElementById('chat-empty-state');
    const activeView = document.getElementById('chat-active-view');
    
    if (sidebar) sidebar.classList.remove('mobile-hidden');
    if (chatArea) chatArea.classList.remove('mobile-active');
    if (emptyState) emptyState.style.display = 'flex';
    if (activeView) activeView.style.display = 'none';
    this.renderChatList();
  }

  // ================= MEETINGS & MEMOS =================
  openMeetingModal() {
    const modal = document.getElementById('schedule-meeting-modal');
    if (!modal) return;
    
    // Set default date & time (tomorrow 11:00 AM)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateInput = document.getElementById('meeting-date-input');
    const timeInput = document.getElementById('meeting-time-input');
    if (dateInput) dateInput.value = tomorrow.toISOString().split('T')[0];
    if (timeInput) timeInput.value = '11:00';

    modal.classList.add('active');
  }

  scheduleMeeting() {
    const titleInput = document.getElementById('meeting-title-input');
    const dateInput = document.getElementById('meeting-date-input');
    const timeInput = document.getElementById('meeting-time-input');
    const durSelect = document.getElementById('meeting-duration-select');

    const title = titleInput ? titleInput.value.trim() : '';
    const date = dateInput ? dateInput.value : '';
    const time = timeInput ? timeInput.value : '';
    const duration = durSelect ? durSelect.value : '30 mins';

    if (!title || !date || !time) {
      alert('Please enter meeting title, date, and time!');
      return;
    }

    const currentUser = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser : null;
    const newMeeting = {
      id: 'meet_' + Date.now(),
      title: title,
      date: date,
      time: time,
      duration: duration,
      host: currentUser ? currentUser.name : 'You',
      avatar: currentUser ? currentUser.avatar : 'https://api.dicebear.com/7.x/bottts/svg?seed=MeetingHost'
    };

    if (window.ChatterApp) {
      window.ChatterApp.meetings.unshift(newMeeting);
      window.ChatterApp.saveMeetings();
      window.ChatterApp.renderMeetingsTab();
    }

    const modal = document.getElementById('schedule-meeting-modal');
    if (modal) modal.classList.remove('active');
    if (titleInput) titleInput.value = '';

    // If active chat exists, share invite message
    const activeChat = this.getActiveChat();
    if (activeChat) {
      this.sendMessage({
        type: 'meeting',
        meetingId: newMeeting.id,
        text: `📅 Scheduled Meeting: "${title}" on ${date} at ${time} (${duration})`
      });
    }

    alert(`🎉 Meeting "${title}" scheduled successfully!`);
    if (window.ChatterApp) window.ChatterApp.switchTab('meetings');
  }

  openEmailMemoModal() {
    const modal = document.getElementById('email-memo-modal');
    if (modal) modal.classList.add('active');
  }

  sendEmailMemo() {
    const subjInput = document.getElementById('email-subject-input');
    const bodyInput = document.getElementById('email-body-input');
    const prioChecked = document.querySelector('input[name="email-priority"]:checked');

    const subject = subjInput ? subjInput.value.trim() : '';
    const body = bodyInput ? bodyInput.value.trim() : '';
    const priority = prioChecked ? prioChecked.value : 'normal';

    if (!subject || !body) {
      alert('Please enter subject and message body!');
      return;
    }

    const currentUser = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser : null;
    const newMemo = {
      id: 'memo_' + Date.now(),
      subject: subject,
      body: body,
      priority: priority,
      sender: currentUser ? currentUser.name : 'You',
      avatar: currentUser ? currentUser.avatar : 'https://api.dicebear.com/7.x/bottts/svg?seed=MemoSender',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (window.ChatterApp) {
      window.ChatterApp.memos.unshift(newMemo);
      window.ChatterApp.saveMemos();
      window.ChatterApp.renderEmailTab();
    }

    const modal = document.getElementById('email-memo-modal');
    if (modal) modal.classList.remove('active');
    if (subjInput) subjInput.value = '';
    if (bodyInput) bodyInput.value = '';

    // Send in chat if active
    const activeChat = this.getActiveChat();
    if (activeChat) {
      this.sendMessage({
        type: 'memo',
        text: `✉️ [${priority.toUpperCase()} MEMO] ${subject}\n\n${body}`
      });
    }

    alert(`✉️ Memo "${subject}" sent successfully!`);
    if (window.ChatterApp) window.ChatterApp.switchTab('email');
  }

  updateBlockedStateUI() {
    const activeChat = this.getActiveChat();
    const inputArea = document.querySelector('.chat-input-wrapper');
    const blockedBanner = document.getElementById('chat-blocked-banner');

    if (!activeChat || !inputArea) return;
    const isBlocked = this.blockedContacts.includes(activeChat.id);

    if (isBlocked) {
      inputArea.style.display = 'none';
      if (blockedBanner) blockedBanner.style.display = 'block';
    } else {
      inputArea.style.display = 'flex';
      if (blockedBanner) blockedBanner.style.display = 'none';
    }
  }

  toggleVoiceRecording() {
    if (window.VoiceRecorder) {
      window.VoiceRecorder.toggleRecording();
    }
  }

  resetRecordingUI() {
    const bar = document.getElementById('recording-bar-ui');
    if (bar) bar.style.display = 'none';
  }

  renderSettingsBlockedList() {
    const container = document.getElementById('settings-blocked-list-container');
    const badge = document.getElementById('blocked-count-badge');
    if (badge) badge.textContent = this.blockedContacts.length;
    if (!container) return;

    if (this.blockedContacts.length === 0) {
      container.innerHTML = `<p style="font-size: 12.5px; color: var(--text-muted); text-align: center; margin: 8px 0;">No contacts currently blocked.</p>`;
      return;
    }

    container.innerHTML = this.blockedContacts.map(id => {
      const chat = this.chats.find(c => c.id === id) || { name: 'Blocked Contact (' + id + ')' };
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle);">
          <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${chat.name}</span>
          <button class="btn-unblock-pill" onclick="window.ChatEngine.unblockContact('${id}')">Unblock</button>
        </div>
      `;
    }).join('');
  }

  renderSettingsVideoBlockedList() {
    // Video block renderer
  }

  unblockContact(id) {
    this.blockedContacts = this.blockedContacts.filter(item => item !== id);
    localStorage.setItem('gitpit_blocked_contacts', JSON.stringify(this.blockedContacts));
    this.renderSettingsBlockedList();
    this.updateBlockedStateUI();
    alert('Contact unblocked!');
  }
}

// Global instance
window.addEventListener('DOMContentLoaded', () => {
  window.ChatEngine = new ChatEngine();
});


