// GitPit - Core Chat Engine & Messaging (with Block/Unblock, Group Chats, Edit, Delete, Meetings, Memos, Disappearing Messages)

class ChatEngine {
  constructor() {
    this.chats = [];
    this.activeChatId = null;
    this.replyingToMessage = null;
    this.selectedMessageForAction = null;
    this.blockedContacts = [];
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

    const savedBlocked = localStorage.getItem('gitpit_blocked_contacts');
    if (savedBlocked) {
      try {
        this.blockedContacts = JSON.parse(savedBlocked);
      } catch (e) {
        this.blockedContacts = [];
      }
    }

    this.bindEvents();
    this.renderChatList();
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

    // Send / Mic Button
    const sendBtn = document.getElementById('btn-send-message');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const text = textarea ? textarea.value.trim() : '';
        if (text.length > 0) {
          this.sendMessage();
        } else {
          this.toggleVoiceRecording();
        }
      });
    }

    // Cancel Voice Recording
    const cancelRecBtn = document.getElementById('btn-cancel-recording');
    if (cancelRecBtn) {
      cancelRecBtn.addEventListener('click', () => {
        window.VoiceRecorder.cancelRecording();
        this.resetRecordingUI();
      });
    }

    // Emoji Picker Toggle
    const emojiBtn = document.getElementById('btn-toggle-emoji');
    const emojiPicker = document.getElementById('emoji-picker-container');
    if (emojiBtn && emojiPicker) {
      emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle('active');
      });

      emojiPicker.querySelectorAll('.emoji-btn').forEach(b => {
        b.addEventListener('click', () => {
          if (textarea) {
            textarea.value += b.textContent;
            textarea.focus();
          }
        });
      });

      document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
          emojiPicker.classList.remove('active');
        }
      });
    }

    // Attachment Menu Dropdown Toggle
    const attachBtn = document.getElementById('btn-attach-media');
    const attachMenu = document.getElementById('chat-attachment-menu');
    const fileInput = document.getElementById('chat-file-upload');

    if (attachBtn && attachMenu) {
      attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        attachMenu.classList.toggle('active');
      });

      document.addEventListener('click', (e) => {
        if (!attachMenu.contains(e.target) && e.target !== attachBtn) {
          attachMenu.classList.remove('active');
        }
      });
    }

    // Attachment Options Actions
    const optDocument = document.getElementById('opt-attach-document');
    const optPhoto = document.getElementById('opt-attach-photo');
    const optLocation = document.getElementById('opt-attach-location');
    const optPayment = document.getElementById('opt-attach-payment');
    const optQr = document.getElementById('opt-attach-qr');
    const optMeeting = document.getElementById('opt-attach-meeting');
    const optEmail = document.getElementById('opt-attach-email');
    const docInput = document.getElementById('chat-doc-upload');

    if (optDocument && docInput) {
      optDocument.addEventListener('click', () => {
        if (attachMenu) attachMenu.classList.remove('active');
        docInput.click();
      });
      docInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleDocumentUpload(file);
      });
    }

    if (optPhoto && fileInput) {
      optPhoto.addEventListener('click', () => {
        if (attachMenu) attachMenu.classList.remove('active');
        fileInput.click();
      });
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleFileUpload(file);
      });
    }

    if (optLocation) {
      optLocation.addEventListener('click', () => {
        if (attachMenu) attachMenu.classList.remove('active');
        if (window.LocationService) window.LocationService.shareCurrentLocation();
      });
    }

    if (optPayment) {
      optPayment.addEventListener('click', () => {
        if (attachMenu) attachMenu.classList.remove('active');
        if (window.PaymentManager) window.PaymentManager.openPaymentModal();
      });
    }

    if (optQr) {
      optQr.addEventListener('click', () => {
        if (attachMenu) attachMenu.classList.remove('active');
        if (window.PaymentManager) window.PaymentManager.openQrModal();
      });
    }

    if (optMeeting) {
      optMeeting.addEventListener('click', () => {
        if (attachMenu) attachMenu.classList.remove('active');
        this.openMeetingModal();
      });
    }

    if (optEmail) {
      optEmail.addEventListener('click', () => {
        if (attachMenu) attachMenu.classList.remove('active');
        this.openEmailMemoModal();
      });
    }

    // Close Reply Preview
    const closeReplyBtn = document.getElementById('btn-close-reply');
    if (closeReplyBtn) {
      closeReplyBtn.addEventListener('click', () => this.clearReplyQuote());
    }

    // Mobile Back Button
    const backBtn = document.getElementById('btn-chat-back-mobile');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        document.getElementById('sidebar-container').classList.remove('mobile-hidden');
        document.getElementById('chat-main-area').classList.remove('mobile-active');
        this.activeChatId = null;
      });
    }

    // Header Call Buttons
    const audioCallBtn = document.getElementById('btn-chat-audio-call');
    const videoCallBtn = document.getElementById('btn-chat-video-call');
    if (audioCallBtn) {
      audioCallBtn.addEventListener('click', () => {
        const activeChat = this.getActiveChat();
        if (!activeChat) return;
        if (this.isContactBlocked(activeChat.id)) {
          alert('🚫 Cannot call a blocked contact. Please unblock first.');
          return;
        }
        if (window.CallManager) {
          window.CallManager.startCall(activeChat.name, activeChat.avatar, 'audio', activeChat.id);
        }
      });
    }
    if (videoCallBtn) {
      videoCallBtn.addEventListener('click', () => {
        const activeChat = this.getActiveChat();
        if (!activeChat) return;
        if (this.isContactBlocked(activeChat.id)) {
          alert('🚫 Cannot video call a blocked contact. Please unblock first.');
          return;
        }
        if (window.CallManager) {
          window.CallManager.startCall(activeChat.name, activeChat.avatar, 'video', activeChat.id);
        }
      });
    }

    // Chat Header 3-Dots Dropdown
    const chatThreeDotsBtn = document.getElementById('btn-chat-header-dots');
    const chatDropdown = document.getElementById('chat-header-dropdown-menu');
    if (chatThreeDotsBtn && chatDropdown) {
      chatThreeDotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chatDropdown.classList.toggle('active');
      });

      document.addEventListener('click', (e) => {
        if (!chatDropdown.contains(e.target) && e.target !== chatThreeDotsBtn) {
          chatDropdown.classList.remove('active');
        }
      });
    }

    // Block / Unblock Video Calls Button inside Chat Menu
    const toggleVideoBlockBtn = document.getElementById('menu-chat-toggle-video-block');
    if (toggleVideoBlockBtn) {
      toggleVideoBlockBtn.addEventListener('click', () => {
        if (chatDropdown) chatDropdown.classList.remove('active');
        this.toggleVideoBlockActiveContact();
      });
    }

    // Block / Unblock Button inside Chat Menu
    const toggleBlockBtn = document.getElementById('menu-chat-toggle-block');
    if (toggleBlockBtn) {
      toggleBlockBtn.addEventListener('click', () => {
        if (chatDropdown) chatDropdown.classList.remove('active');
        this.toggleBlockActiveContact();
      });
    }

    // Clear Chat inside Chat Menu
    const clearChatBtn = document.getElementById('menu-chat-clear');
    if (clearChatBtn) {
      clearChatBtn.addEventListener('click', () => {
        if (chatDropdown) chatDropdown.classList.remove('active');
        this.clearActiveChatMessages();
      });
    }

    // Disappearing Messages Settings Trigger
    const disappearingBtn = document.getElementById('btn-chat-disappearing-settings');
    const disappearingModal = document.getElementById('disappearing-settings-modal');
    const closeDisappearingBtn = document.getElementById('btn-close-disappearing');

    if (disappearingBtn && disappearingModal) {
      disappearingBtn.addEventListener('click', () => disappearingModal.classList.add('active'));
    }
    if (closeDisappearingBtn && disappearingModal) {
      closeDisappearingBtn.addEventListener('click', () => disappearingModal.classList.remove('active'));
    }

    // Disappearing Duration Radios
    const durationRadios = document.querySelectorAll('input[name="disappearing-duration"]');
    durationRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.setDisappearingDuration(e.target.value);
      });
    });

    // Edit Message Modal Form
    const saveEditBtn = document.getElementById('btn-save-edit-message');
    const closeEditBtn = document.getElementById('btn-close-edit-modal');
    if (saveEditBtn) {
      saveEditBtn.addEventListener('click', () => this.confirmEditMessage());
    }
    if (closeEditBtn) {
      closeEditBtn.addEventListener('click', () => {
        document.getElementById('edit-message-modal').classList.remove('active');
      });
    }

    // Delete Message Modal Form
    const delEveryoneBtn = document.getElementById('btn-delete-for-everyone');
    const delForMeBtn = document.getElementById('btn-delete-for-me');
    const closeDelBtn = document.getElementById('btn-close-delete-modal');

    if (delEveryoneBtn) {
      delEveryoneBtn.addEventListener('click', () => this.confirmDeleteMessage('everyone'));
    }
    if (delForMeBtn) {
      delForMeBtn.addEventListener('click', () => this.confirmDeleteMessage('me'));
    }
    if (closeDelBtn) {
      closeDelBtn.addEventListener('click', () => {
        document.getElementById('delete-message-modal').classList.remove('active');
      });
    }

    // Meeting Schedule Submit
    const submitMeetingBtn = document.getElementById('btn-submit-schedule-meeting');
    const closeMeetingBtn = document.getElementById('btn-close-meeting-modal');
    if (submitMeetingBtn) {
      submitMeetingBtn.addEventListener('click', () => this.confirmScheduleMeeting());
    }
    if (closeMeetingBtn) {
      closeMeetingBtn.addEventListener('click', () => {
        document.getElementById('schedule-meeting-modal').classList.remove('active');
      });
    }

    // Email Memo Submit
    const submitEmailBtn = document.getElementById('btn-submit-email-memo');
    const closeEmailBtn = document.getElementById('btn-close-email-memo');
    if (submitEmailBtn) {
      submitEmailBtn.addEventListener('click', () => this.confirmSendEmailMemo());
    }
    if (closeEmailBtn) {
      closeEmailBtn.addEventListener('click', () => {
        document.getElementById('email-memo-modal').classList.remove('active');
      });
    }
  }

  isContactBlocked(chatId) {
    return this.blockedContacts.includes(chatId);
  }

  toggleBlockActiveContact() {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    if (this.isContactBlocked(activeChat.id)) {
      this.unblockContact(activeChat.id);
    } else {
      this.blockContact(activeChat.id);
    }
  }

  blockContact(chatId) {
    if (!this.blockedContacts.includes(chatId)) {
      this.blockedContacts.push(chatId);
      localStorage.setItem('gitpit_blocked_contacts', JSON.stringify(this.blockedContacts));
    }
    const chat = this.chats.find(c => c.id === chatId);
    const name = chat ? chat.name : 'Contact';
    alert(`🚫 ${name} has been blocked.`);
    this.updateBlockedStateUI();
    this.renderSettingsBlockedList();
  }

  unblockContact(chatId) {
    this.blockedContacts = this.blockedContacts.filter(id => id !== chatId);
    localStorage.setItem('gitpit_blocked_contacts', JSON.stringify(this.blockedContacts));
    const chat = this.chats.find(c => c.id === chatId);
    const name = chat ? chat.name : 'Contact';
    alert(`✅ ${name} has been unblocked.`);
    this.updateBlockedStateUI();
    this.renderSettingsBlockedList();
  }

  renderSettingsBlockedList() {
    const container = document.getElementById('settings-blocked-list-container');
    const badge = document.getElementById('blocked-count-badge');
    if (!container) return;

    if (badge) badge.textContent = this.blockedContacts.length;

    if (this.blockedContacts.length === 0) {
      container.innerHTML = `<p style="font-size: 12.5px; color: var(--text-muted); text-align: center; margin: 8px 0;">No contacts currently blocked.</p>`;
      return;
    }

    container.innerHTML = this.blockedContacts.map(chatId => {
      const chat = this.chats.find(c => c.id === chatId) || {
        name: 'Blocked User',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=blocked'
      };
      return `
        <div class="settings-blocked-item">
          <div class="blocked-item-info">
            <img class="blocked-item-avatar" src="${chat.avatar}" alt="${chat.name}">
            <span style="font-size: 13.5px; font-weight: 600; color: var(--text-primary);">${chat.name}</span>
          </div>
          <button class="btn-unblock-item" onclick="window.ChatEngine.unblockContact('${chatId}')">
            Unblock
          </button>
        </div>
      `;
    }).join('');
  }

  toggleVideoBlockActiveContact() {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    if (this.isVideoBlocked(activeChat.id)) {
      this.unblockVideoContact(activeChat.id);
    } else {
      this.blockVideoContact(activeChat.id);
    }
  }

  isVideoBlocked(chatId) {
    const list = JSON.parse(localStorage.getItem('gitpit_video_blocked_contacts') || '[]');
    return list.includes(chatId);
  }

  blockVideoContact(chatId) {
    let list = JSON.parse(localStorage.getItem('gitpit_video_blocked_contacts') || '[]');
    if (!list.includes(chatId)) {
      list.push(chatId);
      localStorage.setItem('gitpit_video_blocked_contacts', JSON.stringify(list));
    }
    const chat = this.chats.find(c => c.id === chatId);
    const name = chat ? chat.name : 'Contact';
    alert(`📹 Video calls from ${name} are now BLOCKED. (Voice calls & text chat remain active)`);
    this.updateVideoBlockedStateUI();
    this.renderSettingsVideoBlockedList();
  }

  unblockVideoContact(chatId) {
    let list = JSON.parse(localStorage.getItem('gitpit_video_blocked_contacts') || '[]');
    list = list.filter(id => id !== chatId);
    localStorage.setItem('gitpit_video_blocked_contacts', JSON.stringify(list));
    const chat = this.chats.find(c => c.id === chatId);
    const name = chat ? chat.name : 'Contact';
    alert(`📹 Video calls from ${name} are now UNBLOCKED.`);
    this.updateVideoBlockedStateUI();
    this.renderSettingsVideoBlockedList();
  }

  updateVideoBlockedStateUI() {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    const isVideoBlocked = this.isVideoBlocked(activeChat.id);
    const textElem = document.getElementById('chat-video-block-text');
    if (textElem) {
      textElem.textContent = isVideoBlocked ? 'Unblock Video Calls' : 'Block Video Calls';
    }
  }

  renderSettingsVideoBlockedList() {
    const container = document.getElementById('settings-video-blocked-list-container');
    const badge = document.getElementById('video-blocked-count-badge');
    if (!container) return;

    const list = JSON.parse(localStorage.getItem('gitpit_video_blocked_contacts') || '[]');
    if (badge) badge.textContent = list.length;

    if (list.length === 0) {
      container.innerHTML = `<p style="font-size: 12.5px; color: var(--text-muted); text-align: center; margin: 8px 0;">No individual contacts video-blocked.</p>`;
      return;
    }

    container.innerHTML = list.map(chatId => {
      const chat = this.chats.find(c => c.id === chatId) || {
        name: 'Contact',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=videoblocked'
      };
      return `
        <div class="settings-blocked-item">
          <div class="blocked-item-info">
            <img class="blocked-item-avatar" src="${chat.avatar}" alt="${chat.name}">
            <span style="font-size: 13.5px; font-weight: 600; color: var(--text-primary);">${chat.name}</span>
          </div>
          <button class="btn-unblock-item" style="background: var(--brand-orange);" onclick="window.ChatEngine.unblockVideoContact('${chatId}')">
            Unblock Video
          </button>
        </div>
      `;
    }).join('');
  }

  updateBlockedStateUI() {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    const isBlocked = this.isContactBlocked(activeChat.id);
    const inputBar = document.getElementById('chat-input-bar-container');
    const blockedBanner = document.getElementById('chat-blocked-banner');
    const blockMenuItem = document.getElementById('menu-chat-toggle-block');

    if (blockedBanner && inputBar) {
      if (isBlocked) {
        inputBar.style.display = 'none';
        blockedBanner.classList.add('active');
        if (blockMenuItem) blockMenuItem.innerHTML = `<span class="dropdown-item-icon">✅</span><span>Unblock Contact</span>`;
      } else {
        inputBar.style.display = 'flex';
        blockedBanner.classList.remove('active');
        if (blockMenuItem) blockMenuItem.innerHTML = `<span class="dropdown-item-icon">🚫</span><span>Block Contact</span>`;
      }
    }

    this.updateVideoBlockedStateUI();
  }

  clearActiveChatMessages() {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;
    if (confirm(`Are you sure you want to clear all messages with ${activeChat.name}?`)) {
      activeChat.messages = [];
      this.saveChats();
      this.renderMessages();
      this.renderChatList();
    }
  }

  renderChatList() {
    const listElem = document.getElementById('chat-list-items');
    if (!listElem) return;

    listElem.innerHTML = this.chats.map(chat => {
      const lastMsg = chat.messages && chat.messages.length > 0
        ? chat.messages[chat.messages.length - 1]
        : { text: 'No messages yet', timestamp: '' };

      const unreadBadge = chat.unreadCount > 0
        ? `<div class="chat-item-badge">${chat.unreadCount}</div>`
        : '';

      const onlineDot = chat.online
        ? `<div class="online-dot"></div>`
        : '';

      const isActive = chat.id === this.activeChatId ? 'active' : '';
      const hasUnread = chat.unreadCount > 0 ? 'has-unread' : '';

      return `
        <li class="chat-item ${isActive} ${hasUnread}" onclick="window.ChatEngine.openChat('${chat.id}')">
          <div class="avatar-wrapper">
            <img class="avatar-img" src="${chat.avatar}" alt="${chat.name}">
            ${onlineDot}
          </div>
          <div class="chat-item-info">
            <div class="chat-item-top">
              <span class="chat-item-name">${chat.name}</span>
              <span class="chat-item-time">${lastMsg.timestamp || ''}</span>
            </div>
            <div class="chat-item-bottom">
              <span class="chat-item-lastmsg">
                ${lastMsg.isDeleted ? '🚫 This message was deleted' : (lastMsg.type === 'voice' ? '🎙️ Voice note' : (lastMsg.type === 'image' ? '📷 Photo' : (lastMsg.type === 'location' ? '📍 Location' : (lastMsg.type === 'payment' ? '💸 Payment' : (lastMsg.type === 'meeting' ? '📅 Meeting' : (lastMsg.type === 'email_memo' ? '✉️ ' + lastMsg.emailSubject : (lastMsg.type === 'news' ? '📰 ' + lastMsg.newsTitle : lastMsg.text)))))))}
              </span>
              ${unreadBadge}
            </div>
          </div>
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
    const cleanDigits = cleanQuery.replace(/\D/g, ''); // Numbers only for phone search

    const filtered = this.chats.filter(c => {
      const matchName = (c.name || '').toLowerCase().includes(cleanQuery);
      const matchUsername = (c.username || '').toLowerCase().includes(cleanQuery);
      const matchEmail = (c.email || '').toLowerCase().includes(cleanQuery);
      
      const phoneDigits = (c.phone || '').replace(/\D/g, '');
      const matchPhone = cleanDigits.length >= 3 && phoneDigits.includes(cleanDigits);

      const matchMessages = (c.messages || []).some(m => (m.text || '').toLowerCase().includes(cleanQuery));

      return matchName || matchUsername || matchEmail || matchPhone || matchMessages;
    });

    const listElem = document.getElementById('chat-list-items');
    if (!listElem) return;

    if (filtered.length === 0) {
      listElem.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 13.5px;">
          🔍 No contacts or messages found matching "<b>${query}</b>"<br>
          <button class="btn-action-primary" style="margin-top: 14px; font-size: 12px;" onclick="window.ChatEngine.startNewChatWithSearch('${query.replace(/'/g, "\\'")}')">
            💬 Start New Chat with "${query}"
          </button>
        </div>
      `;
      return;
    }

    listElem.innerHTML = filtered.map(chat => {
      const lastMsg = chat.messages[chat.messages.length - 1] || { text: '' };
      const phoneTag = chat.phone ? `<span style="font-size: 11px; color: var(--brand-blue); background: var(--bg-card); padding: 1px 6px; border-radius: 4px; margin-right: 4px;">📱 ${chat.phone}</span>` : '';
      const emailTag = chat.email ? `<span style="font-size: 11px; color: var(--brand-orange); background: var(--bg-card); padding: 1px 6px; border-radius: 4px;">✉️ ${chat.email}</span>` : '';

      return `
        <li class="chat-item ${chat.id === this.activeChatId ? 'active' : ''}" onclick="window.ChatEngine.openChat('${chat.id}')">
          <div class="avatar-wrapper">
            <img class="avatar-img" src="${chat.avatar}" alt="${chat.name}">
          </div>
          <div class="chat-item-info">
            <div class="chat-item-top">
              <span class="chat-item-name">${chat.name}</span>
              <span class="chat-item-time">${lastMsg.timestamp || ''}</span>
            </div>
            <div style="margin: 2px 0;">
              ${phoneTag} ${emailTag}
            </div>
            <div class="chat-item-bottom">
              <span class="chat-item-lastmsg">${lastMsg.text || 'Tap to chat'}</span>
            </div>
          </div>
        </li>
      `;
    }).join('');
  }

  startNewChatWithSearch(target) {
    const newContact = {
      id: 'chat_' + Date.now(),
      name: target,
      phone: target.includes('@') ? '' : target,
      email: target.includes('@') ? target : '',
      username: '@' + target.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(target)}`,
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
    this.cleanDisappearingMessages(chat);
    this.saveChats();
    this.renderChatList();

    document.getElementById('sidebar-container').classList.add('mobile-hidden');
    document.getElementById('chat-main-area').classList.add('mobile-active');

    document.getElementById('chat-empty-state').style.display = 'none';
    document.getElementById('chat-active-view').style.display = 'flex';

    document.getElementById('active-chat-avatar').src = chat.avatar;
    document.getElementById('active-chat-name').textContent = chat.name;
    const statusElem = document.getElementById('active-chat-status');
    statusElem.textContent = chat.isGroup
      ? `${(chat.members || []).length} members: ${(chat.members || []).slice(0, 3).join(', ')}...`
      : (chat.online ? 'Online' : (chat.lastSeen ? `Last seen ${chat.lastSeen}` : 'GitPit'));
    statusElem.className = 'status-text';

    this.updateBlockedStateUI();
    this.renderMessages();
    this.scrollToBottom();
  }

  cleanDisappearingMessages(chat) {
    if (!chat.disappearing || chat.disappearing === 'never') return;

    const now = Date.now();
    let maxAgeMs = 24 * 60 * 60 * 1000;
    if (chat.disappearing === '7d') maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    if (chat.disappearing === '90d') maxAgeMs = 90 * 24 * 60 * 60 * 1000;

    chat.messages = chat.messages.filter(m => {
      if (!m.createdAt) return true;
      return (now - m.createdAt) < maxAgeMs;
    });
  }

  setDisappearingDuration(duration) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    activeChat.disappearing = duration;
    this.saveChats();
    this.renderMessages();

    const modal = document.getElementById('disappearing-settings-modal');
    if (modal) modal.classList.remove('active');

    alert(`⏳ Disappearing messages set to: ${duration === 'never' ? 'Off' : duration}`);
  }

  getActiveChat() {
    return this.chats.find(c => c.id === this.activeChatId);
  }

  renderMessages() {
    const activeChat = this.getActiveChat();
    const container = document.getElementById('chat-messages-scroll');
    if (!activeChat || !container) return;

    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const currentUserId = currentUser ? currentUser.id : 'me';

    let disappearingHtml = '';
    if (activeChat.disappearing && activeChat.disappearing !== 'never') {
      disappearingHtml = `
        <div class="disappearing-banner">
          ⏳ Disappearing messages are active (${activeChat.disappearing}). Messages will automatically vanish.
        </div>
      `;
    }

    let html = `
      <div class="date-divider">
        <span class="date-badge">TODAY</span>
      </div>
      ${disappearingHtml}
    `;

    const colors = ['sender-color-1', 'sender-color-2', 'sender-color-3', 'sender-color-4', 'sender-color-5'];

    activeChat.messages.forEach((msg, idx) => {
      const isOutgoing = msg.senderId === currentUserId || msg.senderId === 'me';
      const wrapperClass = isOutgoing ? 'msg-outgoing' : 'msg-incoming';

      const ticks = isOutgoing
        ? `<span class="msg-ticks ${msg.status === 'read' ? 'ticks-read' : 'ticks-sent'}">✓✓</span>`
        : '';

      const editedBadge = msg.isEdited ? `<span class="msg-edited-tag">Edited</span>` : '';

      // Group Sender Tag
      let groupSenderHeader = '';
      if (activeChat.isGroup && !isOutgoing && msg.senderName) {
        const colorClass = colors[idx % colors.length];
        groupSenderHeader = `<span class="group-sender-tag ${colorClass}">${msg.senderName}</span>`;
      }

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
            <button class="voice-play-btn" onclick="window.VoiceRecorder.playVoiceNote(this, '${msg.audioUrl || ''}', '${msg.duration || '0:05'}')">▶</button>
            <div class="voice-waveform-container">
              <div class="waveform-bars">
                <div class="wave-bar" style="height: 8px"></div>
                <div class="wave-bar" style="height: 18px"></div>
                <div class="wave-bar" style="height: 12px"></div>
                <div class="wave-bar" style="height: 22px"></div>
                <div class="wave-bar" style="height: 16px"></div>
                <div class="wave-bar" style="height: 10px"></div>
                <div class="wave-bar" style="height: 20px"></div>
                <div class="wave-bar" style="height: 14px"></div>
              </div>
              <span class="voice-duration">${msg.duration || '0:05'}</span>
            </div>
          </div>
        `;
      } else if (msg.type === 'image') {
        bodyHtml = `
          <div class="msg-media-preview" onclick="window.open('${msg.mediaUrl}', '_blank')">
            <img src="${msg.mediaUrl}" alt="Photo">
          </div>
          ${msg.text ? `<div>${this.formatText(msg.text)}</div>` : ''}
        `;
      } else if (msg.type === 'location') {
        bodyHtml = `
          <div class="location-bubble-card">
            <div class="location-map-preview">
              <span class="location-pin-marker">📍</span>
            </div>
            <div class="location-body">
              <div class="location-title">${msg.locationTitle || 'Live Location'}</div>
              <div class="location-address">${msg.locationAddress || 'Current Location Coordinates'}</div>
              <a href="${msg.mapUrl || '#'}" target="_blank" class="location-btn-open">
                🗺️ Open in Google Maps ↗
              </a>
            </div>
          </div>
        `;
      } else if (msg.type === 'document') {
        const ext = (msg.fileName || '').split('.').pop().toLowerCase();
        let badgeClass = 'doc-badge-generic';
        let iconEmoji = '📄';

        if (ext === 'pdf') {
          badgeClass = 'doc-badge-pdf';
          iconEmoji = '📕';
        } else if (ext === 'doc' || ext === 'docx') {
          badgeClass = 'doc-badge-word';
          iconEmoji = '📘';
        } else if (ext === 'xls' || ext === 'xlsx') {
          badgeClass = 'doc-badge-excel';
          iconEmoji = '📗';
        } else if (ext === 'zip' || ext === 'rar') {
          badgeClass = 'doc-badge-zip';
          iconEmoji = '📦';
        }

        bodyHtml = `
          <div class="document-bubble-card">
            <div class="doc-icon-badge ${badgeClass}">${iconEmoji}</div>
            <div class="doc-meta">
              <div class="doc-filename" title="${msg.fileName}">${msg.fileName}</div>
              <div class="doc-details">${msg.fileSize || 'Document'} • ${ext.toUpperCase()}</div>
            </div>
            <button class="doc-download-btn" title="Download Document" onclick="window.ChatEngine.downloadDocument('${msg.fileName.replace(/'/g, "\\'")}', '${msg.fileUrl || ''}')">
              ⬇️
            </button>
          </div>
          ${msg.text && msg.text !== msg.fileName ? `<div>${this.formatText(msg.text)}</div>` : ''}
        `;
      } else if (msg.type === 'attachment_blocked') {
        bodyHtml = `
          <div class="attachment-blocked-card">
            <div class="blocked-card-title">
              <span>🔒</span>
              <span>Attachment Blocked (Unknown Sender)</span>
            </div>
            <div class="blocked-card-desc">
              A file attachment from an unsaved number was blocked by your Privacy Settings.
            </div>
            <button class="btn-trust-contact" onclick="window.ChatEngine.trustContact('${activeChat.id}')">
              🛡️ Trust & Save Contact
            </button>
          </div>
        `;
      } else if (msg.type === 'payment') {
        bodyHtml = `
          <div class="payment-bubble-card">
            <div class="payment-bubble-header">
              <span class="upi-badge-logo">⚡ UPI PAYMENT</span>
              <span class="payment-status-pill">✓ SUCCESS</span>
            </div>
            <div class="payment-amount-display">₹${msg.amount || '0'}</div>
            <div class="payment-note-text">${msg.note || 'GitPit Payment'}</div>
            <div class="payment-txn-id">Ref ID: ${msg.txnId || 'UPI12345678'}</div>
          </div>
        `;
      } else if (msg.type === 'meeting') {
        bodyHtml = `
          <div class="meeting-bubble-card">
            <div class="meeting-header">
              <span class="meeting-badge">📅 SCHEDULED MEETING</span>
              <span style="font-size: 11px; color: var(--text-muted);">${msg.meetingDuration || '30 mins'}</span>
            </div>
            <div class="meeting-title">${msg.meetingTitle}</div>
            <div class="meeting-datetime">🕒 ${msg.meetingDate} at ${msg.meetingTime}</div>
            <button class="meeting-join-btn" onclick="window.CallManager && window.CallManager.startCall('${activeChat.name}', '${activeChat.avatar}', 'video', '${activeChat.id}')">
              📹 Join Video Meeting
            </button>
          </div>
        `;
      } else if (msg.type === 'email_memo') {
        bodyHtml = `
          <div class="email-memo-bubble-card">
            <div class="email-memo-header">
              <span>✉️ QUICK EMAIL / MEMO</span>
              <span class="email-priority-pill ${msg.emailPriority === 'urgent' ? 'priority-urgent' : 'priority-normal'}">${msg.emailPriority}</span>
            </div>
            <div class="email-memo-subject">${msg.emailSubject}</div>
            <div class="email-memo-body">${this.formatText(msg.text)}</div>
          </div>
        `;
      } else if (msg.type === 'news') {
        bodyHtml = `
          <div class="news-bubble-card" onclick="window.NewsService && window.NewsService.openArticleModal('${msg.newsId}')">
            ${msg.newsImage ? `<img class="news-bubble-img" src="${msg.newsImage}" alt="News">` : ''}
            <div class="news-bubble-body">
              <div class="news-bubble-source">${msg.newsSource || 'GitPit Flash News'}</div>
              <div class="news-bubble-title">${msg.newsTitle}</div>
            </div>
          </div>
          ${msg.text ? `<div>${this.formatText(msg.text)}</div>` : ''}
        `;
      } else {
        bodyHtml = `<div>${this.formatText(msg.text)}</div>`;
      }

      let reactionHtml = '';
      if (msg.reactions && msg.reactions.length > 0) {
        reactionHtml = `
          <div class="msg-reactions">
            ${msg.reactions.map(r => `<span>${r.emoji}</span>`).join('')}
          </div>
        `;
      }

      const now = Date.now();
      const isWithin15Min = (now - (msg.createdAt || now)) < (15 * 60 * 1000);
      const canEdit = isOutgoing && !msg.isDeleted && isWithin15Min && !msg.type;

      html += `
        <div class="msg-wrapper ${wrapperClass}" id="msg-${msg.id}">
          <div class="reaction-bar-popup">
            <button class="react-emoji-btn" onclick="window.ChatEngine.addReaction('${msg.id}', '❤️')">❤️</button>
            <button class="react-emoji-btn" onclick="window.ChatEngine.addReaction('${msg.id}', '👍')">👍</button>
            <button class="react-emoji-btn" onclick="window.ChatEngine.addReaction('${msg.id}', '😂')">😂</button>
            <button class="react-emoji-btn" onclick="window.ChatEngine.addReaction('${msg.id}', '😮')">😮</button>
            <button class="react-emoji-btn" onclick="window.ChatEngine.setReplyQuote('${msg.id}')" title="Reply">↩️</button>
            ${canEdit ? `<button class="react-emoji-btn" onclick="window.ChatEngine.openEditModal('${msg.id}')" title="Edit message (15 mins)">✏️</button>` : ''}
            <button class="react-emoji-btn" onclick="window.ChatEngine.openDeleteModal('${msg.id}')" title="Delete message">🗑️</button>
            <button class="react-emoji-btn" onclick="window.ReminderManager.openReminderModal({ text: '${msg.text ? msg.text.replace(/'/g, "\\'") : 'Message Reminder'}', title: 'Chat Reminder' })" title="Set Reminder">⏰</button>
          </div>
          <div class="msg-bubble">
            ${groupSenderHeader}
            ${quotedHtml}
            ${bodyHtml}
            <div class="msg-meta">
              ${editedBadge}
              <span>${msg.timestamp}</span>
              ${ticks}
            </div>
          </div>
          ${reactionHtml}
        </div>
      `;
    });

    container.innerHTML = html;
  }

  formatText(text) {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
  }

  scrollToBottom() {
    const container = document.getElementById('chat-messages-scroll');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  sendMessage(customPayload = null) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    if (this.isContactBlocked(activeChat.id)) {
      alert('🚫 You cannot send messages to a blocked contact. Please unblock first.');
      return;
    }

    const isSavedContact = window.MOCK_DATA.demoUsers.some(u => u.name === activeChat.name) || activeChat.id === 'chat_ai' || activeChat.id.startsWith('group_');
    const isUnknownContact = !isSavedContact && (activeChat.id.includes('unknown') || activeChat.id.startsWith('chat_user_'));

    // 🛡️ 1. Anti-Fraud Stranger Shield (Only Text & Location Allowed from Unknown)
    const strangerShieldActive = localStorage.getItem('gitpit_restrict_unknown_media') !== 'false';
    if (customPayload && isUnknownContact && strangerShieldActive) {
      if (customPayload.type !== 'text' && customPayload.type !== 'location') {
        alert('🛡️ Anti-Fraud Shield Active: Only plain text & 📍 Location are allowed with unknown contacts. File attachments, photos, audio & payments are blocked to protect against fraud.');
        return;
      }
    }

    // 📁 2. 4-Tier File & Document Receiving/Sending Privacy
    const filePrivacy = localStorage.getItem('gitpit_file_receiving_privacy') || 'contacts';
    const isFilePayload = customPayload && (customPayload.type === 'document' || customPayload.type === 'image' || customPayload.type === 'voice' || customPayload.type === 'file');

    if (isFilePayload) {
      if (filePrivacy === 'nobody') {
        alert('🚫 File & Attachment transfers are completely disabled in your Privacy Settings (Text Only Mode).');
        return;
      }
      if (filePrivacy === 'selected') {
        const allowedFiles = JSON.parse(localStorage.getItem('gitpit_allowed_file_contacts') || '[]');
        if (!allowedFiles.includes(activeChat.id)) {
          alert('🚫 File & Attachment transfers are restricted to Selected Persons Only in your Privacy Settings.');
          return;
        }
      }
      if (filePrivacy === 'contacts' && isUnknownContact) {
        alert('⚠️ File attachments with unknown contacts are restricted in your Privacy Settings.');
        return;
      }
    }

    const textarea = document.getElementById('chat-input-textarea');
    let text = textarea ? textarea.value.trim() : '';

    if (!customPayload && !text) return;

    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const senderId = currentUser ? currentUser.id : 'me';
    const senderName = currentUser ? currentUser.name : 'You';

    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      chatId: activeChat.id,
      senderId: senderId,
      senderName: senderName,
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

    if (window.ChatterApp && window.ChatterApp.socket) {
      window.ChatterApp.socket.emit('send_message', {
        ...newMsg,
        recipientId: activeChat.id,
        isAiChat: activeChat.isAi || activeChat.id === 'chat_ai'
      });
    }
  }

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

  confirmEditMessage() {
    if (!this.selectedMessageForAction) return;

    const input = document.getElementById('edit-message-input');
    const newText = input ? input.value.trim() : '';
    if (!newText) {
      alert('Message cannot be empty!');
      return;
    }

    this.selectedMessageForAction.text = newText;
    this.selectedMessageForAction.isEdited = true;
    this.saveChats();
    this.renderMessages();

    const modal = document.getElementById('edit-message-modal');
    if (modal) modal.classList.remove('active');
  }

  openDeleteModal(msgId) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;
    const msg = activeChat.messages.find(m => m.id === msgId);
    if (!msg) return;

    this.selectedMessageForAction = msg;
    const modal = document.getElementById('delete-message-modal');
    if (modal) modal.classList.add('active');
  }

  confirmDeleteMessage(type = 'everyone') {
    const activeChat = this.getActiveChat();
    if (!activeChat || !this.selectedMessageForAction) return;

    if (type === 'everyone') {
      this.selectedMessageForAction.isDeleted = true;
      this.selectedMessageForAction.text = '🚫 This message was deleted';
    } else {
      activeChat.messages = activeChat.messages.filter(m => m.id !== this.selectedMessageForAction.id);
    }

    this.saveChats();
    this.renderMessages();
    this.renderChatList();

    const modal = document.getElementById('delete-message-modal');
    if (modal) modal.classList.remove('active');
  }

  openMeetingModal() {
    const modal = document.getElementById('schedule-meeting-modal');
    if (!modal) return;
    
    const dateInput = document.getElementById('meeting-date-input');
    const timeInput = document.getElementById('meeting-time-input');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (timeInput) timeInput.value = '16:00';

    modal.classList.add('active');
  }

  confirmScheduleMeeting() {
    const title = document.getElementById('meeting-title-input').value.trim() || 'GitPit Project Sync';
    const date = document.getElementById('meeting-date-input').value;
    const time = document.getElementById('meeting-time-input').value;
    const duration = document.getElementById('meeting-duration-select').value;

    this.sendMessage({
      type: 'meeting',
      meetingTitle: title,
      meetingDate: date,
      meetingTime: time,
      meetingDuration: duration,
      text: `📅 Scheduled Meeting: ${title} on ${date} at ${time}`
    });

    const modal = document.getElementById('schedule-meeting-modal');
    if (modal) modal.classList.remove('active');
  }

  openEmailMemoModal() {
    const modal = document.getElementById('email-memo-modal');
    if (modal) modal.classList.add('active');
  }

  confirmSendEmailMemo() {
    const subject = document.getElementById('email-subject-input').value.trim() || 'GitPit Memo';
    const priority = document.querySelector('input[name="email-priority"]:checked')?.value || 'normal';
    const body = document.getElementById('email-body-input').value.trim();

    if (!body) {
      alert('Please enter your memo body text');
      return;
    }

    this.sendMessage({
      type: 'email_memo',
      emailSubject: subject,
      emailPriority: priority,
      text: body
    });

    const modal = document.getElementById('email-memo-modal');
    if (modal) modal.classList.remove('active');
  }

  setReplyQuote(msgId) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;
    const msg = activeChat.messages.find(m => m.id === msgId);
    if (!msg) return;

    this.replyingToMessage = {
      id: msg.id,
      senderName: msg.senderName || 'Contact',
      text: msg.text || (msg.type === 'voice' ? 'Voice note' : 'Photo')
    };

    const replyBar = document.getElementById('chat-reply-preview-bar');
    if (replyBar) {
      replyBar.style.display = 'flex';
      document.getElementById('reply-preview-sender').textContent = this.replyingToMessage.senderName;
      document.getElementById('reply-preview-text').textContent = this.replyingToMessage.text;
    }

    const textarea = document.getElementById('chat-input-textarea');
    if (textarea) textarea.focus();
  }

  clearReplyQuote() {
    this.replyingToMessage = null;
    const replyBar = document.getElementById('chat-reply-preview-bar');
    if (replyBar) replyBar.style.display = 'none';
  }

  addReaction(msgId, emoji) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;
    const msg = activeChat.messages.find(m => m.id === msgId);
    if (!msg) return;

    if (!msg.reactions) msg.reactions = [];
    msg.reactions.push({ emoji });
    this.saveChats();
    this.renderMessages();
  }

  handleFileUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      this.sendMessage({
        type: 'image',
        mediaUrl: dataUrl,
        text: file.name
      });
    };
    reader.readAsDataURL(file);
  }

  handleDocumentUpload(file) {
    const sizeInKb = file.size / 1024;
    const formattedSize = sizeInKb > 1024
      ? (sizeInKb / 1024).toFixed(1) + ' MB'
      : Math.round(sizeInKb) + ' KB';

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      this.sendMessage({
        type: 'document',
        fileName: file.name,
        fileSize: formattedSize,
        fileUrl: dataUrl,
        text: file.name
      });
    };
    reader.readAsDataURL(file);
  }

  downloadDocument(fileName, fileUrl) {
    if (fileUrl && fileUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      alert(`⬇️ Downloading "${fileName}"...`);
    }
  }

  trustContact(chatId) {
    const chat = this.chats.find(c => c.id === chatId);
    if (!chat) return;
    alert(`🛡️ ${chat.name} has been added to your trusted contacts. Attachments and media are now enabled!`);
    this.renderMessages();
  }

  toggleVoiceRecording() {
    const sendBtn = document.getElementById('btn-send-message');
    const recBar = document.getElementById('recording-bar-ui');
    const inputWrapper = document.getElementById('chat-input-wrapper');

    if (!window.VoiceRecorder.isRecording) {
      sendBtn.classList.add('recording');
      recBar.classList.add('active');
      inputWrapper.style.display = 'none';

      window.VoiceRecorder.startRecording(
        (timeStr) => {
          document.getElementById('recording-time-display').textContent = timeStr;
        },
        (result) => {
          this.sendMessage({
            type: 'voice',
            audioUrl: result.audioUrl,
            duration: result.duration
          });
        }
      );
    } else {
      window.VoiceRecorder.stopRecording((result) => {
        this.sendMessage({
          type: 'voice',
          audioUrl: result.audioUrl,
          duration: result.duration
        });
      });
      this.resetRecordingUI();
    }
  }

  resetRecordingUI() {
    const sendBtn = document.getElementById('btn-send-message');
    const recBar = document.getElementById('recording-bar-ui');
    const inputWrapper = document.getElementById('chat-input-wrapper');

    if (sendBtn) sendBtn.classList.remove('recording');
    if (recBar) recBar.classList.remove('active');
    if (inputWrapper) inputWrapper.style.display = 'flex';
  }

  handleTyping() {
    const activeChat = this.getActiveChat();
    if (activeChat && window.ChatterApp && window.ChatterApp.socket) {
      window.ChatterApp.socket.emit('typing', { chatId: activeChat.id, isTyping: true });
    }
  }

  onReceiveMessage(msg) {
    if (this.isContactBlocked(msg.chatId) || this.isContactBlocked(msg.senderId)) {
      console.log('Ignored message from blocked contact');
      return;
    }

    let chat = this.chats.find(c => c.id === msg.chatId || (c.isAi && msg.senderId === 'ai_assistant'));
    if (!chat) {
      chat = {
        id: msg.chatId || 'chat_' + msg.senderId,
        name: msg.senderName || 'New Contact',
        avatar: msg.senderAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=new',
        messages: [],
        unreadCount: 0,
        online: true
      };
      this.chats.unshift(chat);
    }

    if (!chat.messages.some(m => m.id === msg.id)) {
      chat.messages.push(msg);
      if (this.activeChatId !== chat.id) {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
      }
      this.saveChats();
      this.renderChatList();
      if (this.activeChatId === chat.id) {
        this.renderMessages();
        this.scrollToBottom();
      }
      this.playAudioPop();
    }
  }

  shareNewsToChat(article, targetChatId) {
    let chat = this.chats.find(c => c.id === targetChatId);
    if (!chat) return;

    this.openChat(targetChatId);
    this.sendMessage({
      type: 'news',
      newsId: article.id,
      newsTitle: article.title,
      newsSource: article.source,
      newsImage: article.image,
      text: `📰 Shared from GitPit Flash News:\n${article.title}`
    });
  }

  saveChats() {
    localStorage.setItem('gitpit_chats', JSON.stringify(this.chats));
    localStorage.setItem('chatterpatter_chats', JSON.stringify(this.chats));
  }

  playAudioPop() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {}
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.ChatEngine = new ChatEngine();
});
