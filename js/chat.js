// GitPit - Production Chat Engine with Real Users, Media Lightbox, Calendar Date Jump, Profile Media Gallery & Editing

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
      name: 'GitPit AI 🤖',
      username: '@ai_assistant',
      phone: '+91 80000 00000',
      email: 'ai@chatterpatter.app',
      isGroup: false,
      isAi: true,
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=GitPitAI',
      unreadCount: 1,
      pinned: true,
      online: true,
      bio: 'Smart AI Bot • Powered by GitPit Neural Intelligence',
      messages: [
        {
          id: 'm_welcome',
          senderId: 'ai_assistant',
          senderName: 'GitPit AI Assistant 🤖',
          senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=GitPitAI',
          text: 'Hello! 👋 I am your GitPit AI Assistant.\n\nFeel free to ask me anything, draft emails, get coding assistance, video conference tips, or everyday guidance! ✨',
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
      this.chats[aiChatIndex].name = 'GitPit AI Assistant 🤖';
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

    // Load any previously cached synced contacts immediately into chats on init
    // Strict Official Demo Whitelist (AI + Aarav + Priya + Rohan + Ananya)
    const allowedOfficialIds = new Set(['chat_ai', 'user_9811122334', 'user_9822233445', 'user_9833344556', 'user_9844455667']);

    this.chats = (this.chats || []).filter(c => {
      if (allowedOfficialIds.has(c.id)) return true;
      const cName = (c.name || '').toLowerCase();
      if (cName.includes('aarav') || cName.includes('priya') || cName.includes('rohan') || cName.includes('ananya') || c.isAi) {
        return true;
      }
      return false;
    });

    // Clear old localStorage clutter from previous test sessions
    localStorage.removeItem('gitpit_synced_contacts');
    localStorage.removeItem('gitpit_phonebook');

    // Ensure all 4 official demo users from initialChats are present
    if (window.MOCK_DATA && Array.isArray(window.MOCK_DATA.initialChats)) {
      window.MOCK_DATA.initialChats.forEach(initC => {
        if (!this.chats.some(c => c.id === initC.id)) {
          this.chats.push(JSON.parse(JSON.stringify(initC)));
        }
      });
    }
    this.saveChats();

    this.bindEvents();
    this.renderChatList();
    this.syncRegisteredUsers();
  }

  clearOldChatsCache() {
    localStorage.removeItem('chatterpatter_chats');
    localStorage.removeItem('gitpit_chats');
    localStorage.removeItem('gitpit_synced_contacts');
    localStorage.removeItem('gitpit_phonebook');
    this.chats = (window.MOCK_DATA && window.MOCK_DATA.initialChats) ? JSON.parse(JSON.stringify(window.MOCK_DATA.initialChats)) : [];
    this.saveChats();
    this.renderChatList();
    alert('✓ Chat list cleaned and reset successfully!');
  }

  handleSyncedContacts(syncedUsers = []) {
    if (!Array.isArray(syncedUsers) || syncedUsers.length === 0) return;
    const currentUserId = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.id : null;
    const currentPhone = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.phone : null;
    const cleanMyPhone = (currentPhone || '').replace(/\D/g, '').slice(-10);
    const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};

    syncedUsers.forEach(u => {
      if (currentUserId && u.id === currentUserId) return;
      const cleanPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanMyPhone && cleanPhone && cleanPhone === cleanMyPhone) return;

      const savedEntry = phonebook[u.id] || (cleanPhone ? phonebook[cleanPhone] : null);
      const displayName = savedEntry ? savedEntry.savedName : (u.name || (cleanPhone ? `+91 ${cleanPhone}` : 'Contact'));
      const contactId = u.id || (cleanPhone ? `user_${cleanPhone}` : `user_${Date.now()}`);

      // Add or update in registeredUsers array
      const existingRegIdx = (this.registeredUsers || []).findIndex(ru => ru.id === contactId || (cleanPhone && ru.phone && ru.phone.replace(/\D/g, '').includes(cleanPhone)));
      const regRecord = {
        id: contactId,
        name: displayName,
        phone: u.phone || (cleanPhone ? `+91${cleanPhone}` : ''),
        avatar: u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanPhone || contactId}`,
        bio: u.bio || 'GitPit Member 🚀',
        online: u.online !== undefined ? u.online : true,
        is_registered: true
      };
      if (existingRegIdx === -1) {
        this.registeredUsers.push(regRecord);
      } else {
        this.registeredUsers[existingRegIdx] = { ...this.registeredUsers[existingRegIdx], ...regRecord };
      }

      // If an ACTIVE chat thread already exists, update contact metadata only
      const existingChat = this.chats.find(c => c.id === contactId || (cleanPhone && c.phone && c.phone.replace(/\D/g, '').includes(cleanPhone)));
      if (existingChat) {
        if (displayName) existingChat.name = displayName;
        if (displayName) existingChat.savedName = displayName;
        if (u.avatar) existingChat.avatar = u.avatar;
        if (u.phone) existingChat.phone = u.phone;
        if (u.bio) existingChat.bio = u.bio;
        if (u.online !== undefined) existingChat.online = u.online;
      }
    });

    this.saveChats();
    this.renderChatList();
  }

  async syncRegisteredUsers() {
    try {
      const base = window.API_BASE || '';
      const token = (window.AuthManager && window.AuthManager.authToken) || localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token') || '';
      const currentUserId = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.id : null;
      const currentPhone = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.phone : null;
      const cleanMyPhone = (currentPhone || '').replace(/\D/g, '').slice(-10);
      const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};
      
      // 1. Check cached synced contacts
      let cachedSynced = [];
      try {
        cachedSynced = JSON.parse(localStorage.getItem('gitpit_synced_contacts') || '[]');
      } catch (e) {}

      // 2. Sync from Server API
      let users = [];
      try {
        const resp = await fetch(`${base}/api/users${currentUserId ? '?userId=' + currentUserId : ''}`, {
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        if (resp.ok) {
          users = await resp.json();
        }
      } catch(e) {}

      // Merge server users with cached synced contacts
      if (Array.isArray(cachedSynced) && cachedSynced.length > 0) {
        cachedSynced.forEach(cs => {
          const csPhone = (cs.phone || '').replace(/\D/g, '').slice(-10);
          if (!users.some(u => u.id === cs.id || (csPhone && u.phone && u.phone.replace(/\D/g, '').includes(csPhone)))) {
            users.push(cs);
          }
        });
      }

      if (!Array.isArray(users) || users.length === 0) {
        users = (window.MOCK_DATA && window.MOCK_DATA.demoUsers) ? [...window.MOCK_DATA.demoUsers] : [];
      } else if (window.MOCK_DATA && window.MOCK_DATA.demoUsers) {
        window.MOCK_DATA.demoUsers.forEach(du => {
          if (!users.some(u => u.id === du.id || (u.phone && du.phone && u.phone.replace(/\D/g, '').includes(du.phone.replace(/\D/g, '').slice(-10))))) {
            users.push(du);
          }
        });
      }
      if (Array.isArray(users)) {
        // Enforce 4 demo users whitelist
        const obsoleteIds = ['user_9855566778', 'user_9866677889', 'user_9877788990', 'user_9888899001', 'user_9899900112', 'user_9800011223'];
        const obsoleteNames = ['vikram', 'neha', 'aditya', 'sneha', 'karan', 'meera', 'user 9952'];

        users = users.filter(u => {
          const uName = (u.name || '').toLowerCase();
          if (obsoleteIds.includes(u.id) || obsoleteNames.some(on => uName.includes(on))) {
            return false;
          }
          return true;
        });

        this.registeredUsers = users;
        users.forEach(u => {
          if (currentUserId && u.id === currentUserId) return;
          const cleanPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
          if (cleanMyPhone && cleanPhone && cleanPhone === cleanMyPhone) return;

          // Check if already in local phonebook or create entry
          let savedBookEntry = phonebook[u.id] || (cleanPhone ? phonebook[cleanPhone] : null);
          if (!savedBookEntry && u.name) {
            // Auto-recognize into phonebook
            phonebook[u.id] = { savedName: u.name, phone: u.phone || '', contactId: u.id };
            if (cleanPhone) {
              phonebook[cleanPhone] = { savedName: u.name, phone: u.phone || '', contactId: u.id };
            }
            savedBookEntry = phonebook[u.id];
          }

          const existing = this.chats.find(c => c.id === u.id || (cleanPhone && c.phone && c.phone.replace(/\D/g, '').includes(cleanPhone)));
          if (existing) {
            if (savedBookEntry) existing.name = savedBookEntry.savedName;
            existing.avatar = u.avatar || existing.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanPhone || u.id}`;
            existing.online = (u.online !== undefined) ? u.online : existing.online;
            existing.bio = u.bio || existing.bio;
            if (u.phone) existing.phone = u.phone;
            if (u.email) existing.email = u.email;
          }
        });

        // Persist auto-synced phonebook
        localStorage.setItem('gitpit_phonebook', JSON.stringify(phonebook));
      }

      this.saveChats();
      this.renderChatList();
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

    // Chat Filter Chips (All, Unread, Groups, Contacts, News Flash)
    document.querySelectorAll('.chat-filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        if (filter === 'news') {
          if (window.ChatterApp) window.ChatterApp.switchTab('news');
        } else {
          if (window.ChatterApp) window.ChatterApp.switchTab('chats');
          this.filterChatsByType(filter);
        }
      });
    });

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

    // Global Outside Click to Close Attach Popup
    document.addEventListener('click', (e) => {
      const attachPopup = document.getElementById('chat-attach-popup');
      const attachBtn = document.getElementById('btn-chat-attach');
      if (attachPopup && !attachPopup.contains(e.target) && e.target !== attachBtn) {
        attachPopup.classList.remove('active');
      }
    });

    // Hidden File Upload Change Handlers

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

    // Initialize Draggable / Movable Chat Bar
    this.initDraggableChatBar();
  }

  filterChatsByType(filterType) {
    this.currentFilterType = filterType || 'all';
    
    // If currently viewing another tab (e.g., Calls, Meetings, News, Settings), switch back to Chats view
    if (window.ChatterApp && window.ChatterApp.currentTab !== 'chats') {
      window.ChatterApp.switchTab('chats');
    }

    document.querySelectorAll('.chat-filter-chip').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === this.currentFilterType);
    });
    this.renderChatList();
  }

  markAllChatsAsRead() {
    this.chats.forEach(c => {
      c.unreadCount = 0;
      if (c.messages) {
        c.messages.forEach(m => { m.status = 'read'; });
      }
    });
    this.saveChats();
    this.renderChatList();
    alert('✓ All conversations marked as read.');
  }

  toggleStarMessage(msgId) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;
    const msg = activeChat.messages.find(m => m.id === msgId);
    if (!msg) return;

    msg.starred = !msg.starred;
    this.saveChats();
    this.renderMessages();

    const menu = document.getElementById(`msg-menu-${msgId}`);
    if (menu) menu.classList.remove('active');
  }

  openStarredMessagesModal() {
    const modal = document.getElementById('starred-messages-modal');
    const container = document.getElementById('starred-messages-list');
    if (!modal || !container) return;

    const starredList = [];
    this.chats.forEach(c => {
      (c.messages || []).forEach(m => {
        if (m.starred) {
          starredList.push({ chatName: c.name, chatId: c.id, avatar: c.avatar, ...m });
        }
      });
    });

    if (starredList.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">No starred messages yet. ⭐</div>`;
    } else {
      container.innerHTML = starredList.map(item => `
        <div style="background: var(--bg-card); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-subtle); display: flex; align-items: flex-start; gap: 10px; cursor: pointer;" onclick="window.ChatEngine.openChat('${item.chatId}'); document.getElementById('starred-messages-modal').classList.remove('active');">
          <img class="avatar-img" style="width: 32px; height: 32px;" src="${item.avatar || 'assets/logo-icon.svg'}" alt="${item.chatName}">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${item.chatName}</span>
              <span style="font-size: 11px; color: var(--text-muted);">${item.timestamp}</span>
            </div>
            <div style="font-size: 13.5px; color: var(--text-primary);">${item.text || (item.type ? '📎 ' + item.type : '')}</div>
          </div>
          <button style="background: transparent; border: none; font-size: 15px; color: #eab308; cursor: pointer;" onclick="event.stopPropagation(); window.ChatEngine.toggleStarMessage('${item.id}')" title="Unstar">⭐</button>
        </div>
      `).join('');
    }
  }

  openScheduleMeetingModal() {
    const modal = document.getElementById('schedule-meeting-modal');
    if (!modal) return;
    modal.classList.add('active');
    this.populateMeetingInvitees();
  }

  populateMeetingInvitees(filterText = '') {
    const container = document.getElementById('meeting-invitees-container');
    if (!container) return;

    const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};
    const currentUserId = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.id : null;
    const cleanFilter = (filterText || '').toLowerCase().trim();

    const contactsMap = new Map();
    (this.registeredUsers || []).forEach(u => {
      if (currentUserId && u.id === currentUserId) return;
      const cleanPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
      const saved = phonebook[u.id] || (cleanPhone ? phonebook[cleanPhone] : null);
      const name = saved ? saved.savedName : (u.name || (cleanPhone ? `+91 ${cleanPhone}` : 'Contact'));
      const avatar = (saved && (saved.photoUri || saved.avatar)) || u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanPhone || u.id}`;
      contactsMap.set(u.id || cleanPhone, { id: u.id, name, avatar, phone: u.phone });
    });

    Object.entries(phonebook).forEach(([key, item]) => {
      if (!item || !item.savedName) return;
      const cleanDigits = (item.phone || key).replace(/\D/g, '').slice(-10);
      const contactId = item.contactId || (cleanDigits ? `user_${cleanDigits}` : key);
      if (!contactsMap.has(contactId) && !contactsMap.has(cleanDigits)) {
        contactsMap.set(contactId, {
          id: contactId,
          name: item.savedName,
          avatar: item.photoUri || item.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits}`,
          phone: item.phone
        });
      }
    });

    let list = Array.from(contactsMap.values());
    if (cleanFilter) {
      list = list.filter(c => (c.name || '').toLowerCase().includes(cleanFilter) || (c.phone || '').includes(cleanFilter));
    }

    if (list.length === 0) {
      container.innerHTML = '<div style="padding: 10px; font-size: 12px; color: var(--text-muted); text-align: center;">No contacts found</div>';
      return;
    }

    container.innerHTML = list.map(c => `
      <label style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--bg-card); border-radius: 6px; cursor: pointer; user-select: none;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img class="avatar-img" style="width: 26px; height: 26px;" src="${c.avatar}" alt="${c.name}">
          <span style="font-size: 12.5px; font-weight: 600; color: var(--text-primary);">${c.name}</span>
        </div>
        <input type="checkbox" class="meeting-invitee-checkbox" value="${c.name.replace(/"/g, '&quot;')}" data-id="${c.id}" onchange="window.ChatEngine && window.ChatEngine.onMeetingInviteeToggle(this)" style="width: 16px; height: 16px; accent-color: var(--brand-green);">
      </label>
    `).join('');
  }

  filterMeetingInvitees(query) {
    this.populateMeetingInvitees(query);
  }

  onMeetingInviteeToggle(checkbox) {
    const checked = document.querySelectorAll('.meeting-invitee-checkbox:checked');
    const MAX_PARTICIPANTS = 100;

    if (checked.length > MAX_PARTICIPANTS) {
      if (checkbox) checkbox.checked = false;
      alert(`⚠️ Participant Limit Exceeded: Maximum ${MAX_PARTICIPANTS} invitees allowed per meeting.`);
      return;
    }

    const counter = document.getElementById('meeting-invitees-counter');
    if (counter) {
      counter.textContent = `Selected: ${checked.length} / ${MAX_PARTICIPANTS} max`;
      if (checked.length >= MAX_PARTICIPANTS) {
        counter.style.color = 'var(--brand-danger)';
      } else {
        counter.style.color = 'var(--brand-green)';
      }
    }
  }

  async submitScheduleMeeting() {
    const titleInput = document.getElementById('meeting-title-input');
    const dateInput = document.getElementById('meeting-date-input');
    const timeInput = document.getElementById('meeting-time-input');
    const durationInput = document.getElementById('meeting-duration-input');

    const title = titleInput ? titleInput.value.trim() : '';
    const date = dateInput ? dateInput.value : '';
    const time = timeInput ? timeInput.value : '';
    const duration = durationInput ? durationInput.value : '45 mins';

    if (!title || !date || !time) {
      alert('Please fill in all meeting details.');
      return;
    }

    const selectedInvitees = [];
    document.querySelectorAll('.meeting-invitee-checkbox:checked').forEach(cb => {
      selectedInvitees.push(cb.value);
    });

    const MAX_PARTICIPANTS = 100;
    if (selectedInvitees.length > MAX_PARTICIPANTS) {
      alert(`⚠️ Maximum ${MAX_PARTICIPANTS} invitees allowed per meeting session.`);
      return;
    }

    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const newMeeting = {
      id: 'meet_' + Date.now(),
      title: title,
      date: date,
      time: time,
      duration: duration,
      invitees: selectedInvitees,
      participantCount: selectedInvitees.length + 1,
      host: currentUser ? (currentUser.name || 'You') : 'You',
      avatar: currentUser ? (currentUser.avatar || 'assets/logo-icon.svg') : 'assets/logo-icon.svg'
    };

    if (window.ChatterApp) {
      window.ChatterApp.meetings.unshift(newMeeting);
      localStorage.setItem('chatterpatter_meetings', JSON.stringify(window.ChatterApp.meetings));
      window.ChatterApp.renderMeetingsTab();
    }

    // Persist to backend server
    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || '';
      await fetch(`${base}/api/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(newMeeting)
      });
    } catch(e) {}

    const modal = document.getElementById('schedule-meeting-modal');
    if (modal) modal.classList.remove('active');
    if (titleInput) titleInput.value = '';

    alert(`📅 Meeting "${title}" scheduled with ${selectedInvitees.length} invitees successfully!`);
  }

  renderChatList() {
    const listElem = document.getElementById('chat-list-items');
    if (!listElem) return;

    const currentUserId = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.id : null;
    const currentPhone = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.phone : null;
    const cleanMyPhone = (currentPhone || '').replace(/\D/g, '').slice(-10);
    const filter = this.currentFilterType || 'all';
    const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};

    // 1. If Contacts Tab is Selected
    if (filter === 'contacts') {
      const regList = [];
      const nonRegList = [];
      const regMap = new Set();
      const regPhoneSet = new Set();
      const regUserById = new Map();

      // Gather all registered users from memory, cache, and demo list
      const allReg = [...(this.registeredUsers || [])];
      try {
        const cachedSynced = JSON.parse(localStorage.getItem('gitpit_synced_contacts') || '[]');
        if (Array.isArray(cachedSynced)) {
          cachedSynced.forEach(cs => {
            if (!allReg.some(u => u.id === cs.id || (cs.phone && u.phone && cs.phone.slice(-10) === u.phone.slice(-10)))) {
              allReg.push(cs);
            }
          });
        }
      } catch (e) {}

      allReg.forEach(u => {
        if (!u) return;
        const uPhone10 = (u.phone || '').replace(/\D/g, '').slice(-10);
        if (uPhone10 && uPhone10.length >= 10) {
          regPhoneSet.add(uPhone10);
        }
        if (u.id) {
          regUserById.set(u.id, u);
        }
        if (uPhone10) {
          regUserById.set(uPhone10, u);
        }
      });

      // Populate from Registered Users
      allReg.forEach(u => {
        if (currentUserId && u.id === currentUserId) return;
        const cleanPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
        if (cleanMyPhone && cleanPhone && cleanPhone === cleanMyPhone) return;

        const saved = phonebook[u.id] || (cleanPhone ? phonebook[cleanPhone] : null);
        const displayName = saved ? (saved.savedName || saved.name) : (u.name || (cleanPhone ? `+91 ${cleanPhone}` : 'GitPit Member'));
        const avatar = (saved && (saved.photoUri || saved.avatar)) || u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanPhone || u.id}`;
        const contactId = u.id || `user_${cleanPhone}`;

        if (!regMap.has(contactId) && (!cleanPhone || !regMap.has(cleanPhone))) {
          regMap.add(contactId);
          if (cleanPhone) regMap.add(cleanPhone);
          regList.push({
            id: contactId,
            name: displayName,
            phone: u.phone || (cleanPhone ? `+91 ${cleanPhone}` : ''),
            avatar: avatar,
            bio: u.bio || 'GitPit Member 🟢',
            online: u.online !== undefined ? u.online : true,
            isRegistered: true
          });
        }
      });

      // Populate from Phonebook (Registered vs Non-Registered)
      Object.entries(phonebook).forEach(([key, entry]) => {
        if (!entry || (!entry.savedName && !entry.name)) return;
        const cleanDigits = (entry.phone || key).replace(/\D/g, '').slice(-10);
        if (!cleanDigits || cleanDigits.length < 10) return;
        if (cleanMyPhone && cleanDigits === cleanMyPhone) return;

        const contactName = entry.savedName || entry.name || `+91 ${cleanDigits}`;
        const contactAvatar = entry.photoUri || entry.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits}`;

        // Check if this phonebook contact is registered on GitPit
        const isReg = regPhoneSet.has(cleanDigits) || regUserById.has(cleanDigits) || regUserById.has(entry.contactId);

        if (isReg) {
          if (!regMap.has(cleanDigits)) {
            const regUser = regUserById.get(cleanDigits) || regUserById.get(entry.contactId);
            const contactId = (regUser && regUser.id) || entry.contactId || `user_${cleanDigits}`;
            regMap.add(cleanDigits);
            regMap.add(contactId);
            regList.push({
              id: contactId,
              name: contactName,
              phone: entry.phone || `+91 ${cleanDigits}`,
              avatar: contactAvatar,
              bio: (regUser && regUser.bio) || 'GitPit Member 🟢',
              online: regUser && regUser.online !== undefined ? regUser.online : true,
              isRegistered: true
            });
          }
        } else {
          if (!regMap.has(cleanDigits) && !regMap.has(entry.contactId)) {
            nonRegList.push({
              id: entry.contactId || `invite_${cleanDigits}`,
              name: contactName,
              phone: entry.phone || `+91 ${cleanDigits}`,
              avatar: contactAvatar,
              isRegistered: false
            });
          }
        }
      });

      let contactsHtml = '';
      if (regList.length > 0) {
        contactsHtml += `
          <div style="padding: 10px 14px 4px 14px; font-size: 11px; font-weight: 700; color: var(--brand-green); text-transform: uppercase; letter-spacing: 0.5px;">
            🟢 Contacts on GitPit (${regList.length})
          </div>
          ${regList.map(c => `
            <li class="chat-item" onclick="window.ChatEngine.startChatWithUser('${c.id}', '${c.name.replace(/'/g, "\\'")}', '${c.phone}', '${c.avatar}')">
              <div class="avatar-wrapper">
                <img class="avatar-img" src="${c.avatar}" alt="${c.name}">
                ${c.online ? '<span class="online-indicator active"></span>' : ''}
              </div>
              <div class="chat-item-info">
                <div class="chat-item-top">
                  <span class="chat-item-name">${c.name}</span>
                  <span class="chat-item-time" style="color: var(--brand-green); font-weight: 600;">Chat 💬</span>
                </div>
                <div class="chat-item-bottom">
                  <span class="chat-item-lastmsg">📱 ${c.phone}</span>
                </div>
              </div>
            </li>
          `).join('')}
        `;
      }

      if (nonRegList.length > 0) {
        contactsHtml += `
          <div style="padding: 14px 14px 4px 14px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
            ✉️ Invite Contacts to GitPit (${nonRegList.length})
          </div>
          ${nonRegList.map(c => `
            <li class="chat-item" style="opacity: 0.85;" onclick="window.open('https://api.whatsapp.com/send?phone=${encodeURIComponent(c.phone)}&text=' + encodeURIComponent('Hey! Let\\'s chat and video call on GitPit: https://chitchat-chatterpatter.onrender.com'), '_blank')">
              <div class="avatar-wrapper">
                <img class="avatar-img" src="${c.avatar}" alt="${c.name}">
              </div>
              <div class="chat-item-info">
                <div class="chat-item-top">
                  <span class="chat-item-name">${c.name}</span>
                  <span class="chat-item-time" style="color: var(--brand-blue); font-weight: 600;">Invite ✉️</span>
                </div>
                <div class="chat-item-bottom">
                  <span class="chat-item-lastmsg">${c.phone}</span>
                </div>
              </div>
            </li>
          `).join('')}
        `;
      }

      if (regList.length === 0 && nonRegList.length === 0) {
        contactsHtml = `
          <div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
            <p style="margin-bottom: 12px; font-weight: 500;">No synced contacts found.</p>
            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              <button class="btn-action-primary" style="font-size: 13px;" onclick="window.AuthManager && window.AuthManager.grantContactsAndSync()">
                🔄 Sync Contacts
              </button>
              <button class="btn-action-secondary" style="font-size: 13px;" onclick="window.ChatEngine.openNewConversationModal()">
                ✏️ New Chat
              </button>
            </div>
          </div>
        `;
      }

      listElem.innerHTML = contactsHtml;
      return;
    }

    // 2. Active Messages Filter (All, Groups, Unread)
    let displayChats = (this.chats || []).filter(c => {
      if (c.deleted || c.deletedAt) return false;
      if (currentUserId && c.id === currentUserId) return false;
      if (cleanMyPhone && c.phone && c.phone.replace(/\D/g, '').includes(cleanMyPhone)) return false;

      // AI assistant is always allowed as pinned companion
      if (c.isAi || c.id === 'chat_ai') return true;

      // Must have sent or received at least 1 message
      const hasMessages = Array.isArray(c.messages) && c.messages.length > 0;
      return hasMessages;
    });

    if (filter === 'unread') {
      displayChats = displayChats.filter(c => c.unreadCount > 0);
    } else if (filter === 'groups') {
      displayChats = displayChats.filter(c => c.isGroup);
    }

    if (displayChats.length === 0) {
      if (filter === 'groups') {
        listElem.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
            <p style="margin-bottom: 12px; font-weight: 500;">No group conversations yet.</p>
            <button class="btn-action-primary" style="margin-top: 4px; font-size: 13px;" onclick="window.ChatterApp && window.ChatterApp.openNewGroupModal()">
              ➕ Create New Group
            </button>
          </div>
        `;
        return;
      }

      if (filter === 'unread') {
        listElem.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">✨</div>
            <p style="font-weight: 500;">All caught up! No unread messages.</p>
          </div>
        `;
        return;
      }

      listElem.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
          <div style="font-size: 36px; margin-bottom: 10px;">💬</div>
          <h4 style="color: var(--text-primary); margin-bottom: 6px; font-size: 15px;">Welcome to GitPit</h4>
          <p style="font-size: 13px; margin-bottom: 16px;">No active conversations yet. Start a new chat or talk to AI.</p>
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button class="btn-action-primary" style="font-size: 13px;" onclick="window.ChatEngine.openNewConversationModal()">
              ✏️ Start New Chat
            </button>
            <button class="btn-action-secondary" style="font-size: 13px;" onclick="window.ChatEngine.openChat('chat_ai')">
              🤖 Talk to AI
            </button>
          </div>
        </div>
      `;
      return;
    }

    listElem.innerHTML = displayChats.map(chat => {
      const cleanPhone = (chat.phone || '').replace(/\D/g, '').slice(-10);
      const savedEntry = phonebook[chat.id] || (cleanPhone ? phonebook[cleanPhone] : null);
      const displayName = chat.isAi ? 'GitPit AI 🤖' : (savedEntry ? (savedEntry.savedName || savedEntry.name) : (chat.savedName || chat.name || chat.phone || 'Contact'));
      const displayAvatar = chat.avatar || 'assets/logo-icon.svg';

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
            <img class="avatar-img" src="${displayAvatar}" alt="${displayName}" onerror="this.src='assets/logo-icon.svg'">
            ${onlineDot}
          </div>
          <div class="chat-item-info">
            <div class="chat-item-top">
              <span class="chat-item-name">${isPinned}${displayName}</span>
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

    // Switch back to chats tab if searching from Calls, Meetings, etc.
    if (window.ChatterApp && window.ChatterApp.currentTab !== 'chats') {
      window.ChatterApp.switchTab('chats');
    }

    const cleanQuery = query.toLowerCase().trim();
    const digitsOnly = query.replace(/\D/g, '');

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

    let directChatBanner = '';
    if (digitsOnly.length >= 4) {
      const fullNum = digitsOnly.length === 10 ? `+91${digitsOnly}` : digitsOnly;
      directChatBanner = `
        <div style="background: rgba(0, 168, 132, 0.12); border: 1.5px dashed var(--brand-green); padding: 12px; border-radius: 8px; margin-bottom: 10px; cursor: pointer; display: flex; align-items: center; justify-content: space-between;" onclick="window.ChatEngine.startChatWithNewNumber('${fullNum}')">
          <div>
            <div style="font-weight: 700; font-size: 13.5px; color: var(--brand-green);">💬 Start Chat with ${fullNum}</div>
            <div style="font-size: 11.5px; color: var(--text-secondary);">Direct message via GitPit</div>
          </div>
          <span style="font-size: 18px;">➔</span>
        </div>
      `;
    }

    if (filtered.length === 0) {
      listElem.innerHTML = `
        ${directChatBanner}
        <div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 13.5px;">
          🔍 No existing contacts found matching "<b>${query}</b>"<br>
          <button class="btn-action-primary" style="margin-top: 14px; font-size: 12px;" onclick="window.ChatEngine.startNewChatWithSearch('${query.replace(/'/g, "\\'")}')">
            💬 Start New Chat with "${query}"
          </button>
        </div>
      `;
      return;
    }

    listElem.innerHTML = directChatBanner + filtered.map(chat => `
      <li class="chat-item ${chat.id === this.activeChatId ? 'active' : ''}" onclick="window.ChatEngine.openChat('${chat.id}')">
        <div class="avatar-wrapper">
          <img class="avatar-img" src="${chat.avatar || 'assets/logo-icon.svg'}" alt="${chat.name}">
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
    const cleanTargetPhone = (target || '').replace(/\D/g, '').slice(-10);
    const existingRegUser = (this.registeredUsers || []).find(u => {
      if (u.name && u.name.toLowerCase() === target.toLowerCase()) return true;
      if (cleanTargetPhone && u.phone && u.phone.replace(/\D/g, '').includes(cleanTargetPhone)) return true;
      if (u.email && u.email.toLowerCase() === target.toLowerCase()) return true;
      return false;
    });

    if (existingRegUser) {
      let existingChat = this.chats.find(c => c.id === existingRegUser.id);
      if (!existingChat) {
        existingChat = {
          id: existingRegUser.id,
          name: existingRegUser.name || target,
          phone: existingRegUser.phone || '',
          email: existingRegUser.email || '',
          username: existingRegUser.username || '',
          avatar: existingRegUser.avatar || 'assets/logo-icon.svg',
          bio: existingRegUser.bio || 'GitPit Member 🚀',
          messages: [],
          unreadCount: 0,
          online: existingRegUser.online !== undefined ? existingRegUser.online : true
        };
        this.chats.unshift(existingChat);
        this.saveChats();
        this.renderChatList();
      }
      this.openChat(existingChat.id);
      return;
    }

    const normalized = cleanTargetPhone.length === 10 ? `+91${cleanTargetPhone}` : target;
    const newContact = {
      id: cleanTargetPhone.length === 10 ? `user_${cleanTargetPhone}` : ('user_' + Date.now()),
      name: target,
      phone: cleanTargetPhone.length === 10 ? normalized : (target.includes('@') ? '' : target),
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

    const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};
    const cleanPhone = (chat.phone || '').replace(/\D/g, '').slice(-10);
    const savedEntry = phonebook[chat.id] || (cleanPhone ? phonebook[cleanPhone] : null);
    const displayName = chat.isAi ? 'GitPit AI 🤖' : (savedEntry ? savedEntry.savedName : (chat.savedName || chat.name || chat.phone || 'Contact'));
    const displayAvatar = chat.avatar || 'assets/logo-icon.svg';

    document.getElementById('active-chat-avatar').src = displayAvatar;
    document.getElementById('active-chat-name').textContent = displayName;
    const statusElem = document.getElementById('active-chat-status');
    const isAi = chat.isAi || chat.id === 'chat_ai';

    statusElem.textContent = isAi
      ? '🤖 Smart AI Assistant • Always Active'
      : (chat.isGroup
        ? `${(chat.members || []).length} members`
        : (chat.phone ? chat.phone : (chat.online ? 'Online' : (chat.lastSeen ? `Last seen ${chat.lastSeen}` : 'GitPit'))));
    statusElem.className = 'status-text';

    // Toggle AI Prompt Chips
    const aiChipsBar = document.getElementById('ai-prompt-chips-bar');
    if (aiChipsBar) {
      aiChipsBar.style.display = isAi ? 'block' : 'none';
    }

    this.updateBlockedStateUI();
    this.updateStrangerShieldUI();
    this.renderMessages();
    this.scrollToBottom();
    this.loadChatWallpaper(chatId);

    // Fetch conversation history from server database
    this.loadMessagesFromServer(chatId);
  }

  async loadMessagesFromServer(chatId) {
    if (!chatId || chatId === 'chat_ai') return;
    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || (window.AuthManager ? window.AuthManager.authToken : '');
      const resp = await fetch(`${base}/api/messages/${chatId}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await resp.json();
      const messagesList = Array.isArray(data) ? data : (data && data.messages ? data.messages : []);
      const cleanPhone = (chatId || '').replace(/\D/g, '').slice(-10);
      const chat = this.chats.find(c => c.id === chatId || (cleanPhone && c.phone && c.phone.replace(/\D/g, '').includes(cleanPhone)));
      if (chat) {
        messagesList.forEach(serverMsg => {
          const exists = chat.messages.some(m => m.id === serverMsg.id);
          if (!exists) {
            chat.messages.push(serverMsg);
          }
        });
        chat.messages.sort((a, b) => (a.createdAt || a.timestamp || 0) - (b.createdAt || b.timestamp || 0));
        this.saveChats();
        if (this.activeChatId === chat.id || this.activeChatId === chatId) {
          this.renderMessages();
          this.scrollToBottom();
        }
      }
    } catch (e) {
      console.warn('[MESSAGES] Could not load server messages:', e.message);
    }
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
      const isMedia = ['image', 'video', 'document', 'voice'].includes(msg.type);
      const isStrangerMediaBlocked = !isOutgoing && isMedia && this.isStrangerShieldActive() && this.isUnknownContact(activeChat);

      if (msg.isDeleted) {
        bodyHtml = `<div class="msg-deleted-text">🚫 This message was deleted</div>`;
      } else if (isStrangerMediaBlocked) {
        bodyHtml = `
          <div class="stranger-shield-media-block" style="padding: 12px; background: rgba(239, 68, 68, 0.08); border: 1.5px dashed var(--brand-danger); border-radius: 8px; text-align: center; max-width: 280px;">
            <div style="font-size: 24px; margin-bottom: 4px;">🛡️🔒</div>
            <div style="font-size: 12.5px; font-weight: 700; color: var(--brand-danger); margin-bottom: 4px;">Stranger Shield Protected</div>
            <div style="font-size: 11.5px; color: var(--text-secondary); margin-bottom: 8px;">Attachment from unsaved contact is locked.</div>
            <button type="button" class="auth-submit-btn" style="font-size: 11.5px; padding: 4px 10px; background: var(--brand-green); border: none; border-radius: 6px; color: #fff; font-weight: 700;" onclick="window.ChatEngine.trustActiveContact()">
              ✓ Trust Contact to View
            </button>
          </div>
        `;
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
      } else if (msg.type === 'news') {
        bodyHtml = `
          <div class="news-bubble-card" style="background: var(--bg-card); border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); max-width: 320px;">
            ${msg.image ? `<img src="${msg.image}" style="width: 100%; height: 130px; object-fit: cover;" alt="News">` : ''}
            <div style="padding: 10px;">
              <div style="font-size: 11px; font-weight: 700; color: var(--brand-orange); text-transform: uppercase; margin-bottom: 4px;">⚡ Flash News • ${msg.source || 'GitPit'}</div>
              <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary); margin-bottom: 6px; line-height: 1.3;">${msg.title || 'Breaking Update'}</div>
              <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 8px;">${msg.summary || ''}</div>
              <div style="font-size: 10.5px; color: var(--text-muted);">${msg.time || 'Recent'}</div>
            </div>
          </div>
        `;
      } else {
        bodyHtml = `<div>${this.formatText(msg.text)}</div>`;
      }

      // Message Action dropdown trigger
      const canEdit = isOutgoing && !msg.isDeleted && !msg.type;
      const starLabel = msg.starred ? '⭐ Unstar' : '⭐ Star';
      const starBadge = msg.starred ? '<span style="color: #eab308; font-size: 11px; margin-right: 2px;">⭐</span>' : '';

      const actionsMenuHtml = `
        <div class="msg-action-dropdown-wrapper">
          <button class="btn-msg-more" onclick="event.stopPropagation(); window.ChatEngine.toggleMsgMenu('${msg.id}')">⋮</button>
          <div class="msg-action-menu" id="msg-menu-${msg.id}">
            <button class="msg-action-item" onclick="window.ChatEngine.toggleStarMessage('${msg.id}')">${starLabel}</button>
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
              ${starBadge}
              ${editedBadge}
              <span>${msg.time || (msg.timestamp ? (typeof msg.timestamp === 'number' ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : msg.timestamp) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>
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
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || (window.AuthManager ? window.AuthManager.authToken : '');
      await fetch(`${base}/api/messages/${msgId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
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
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || (window.AuthManager ? window.AuthManager.authToken : '');
      await fetch(`${base}/api/messages/${msgId}?everyone=${isEveryone}`, {
        method: 'DELETE',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
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
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || (window.AuthManager ? window.AuthManager.authToken : '');
      await fetch(`${base}/api/chats/${chatId}`, {
        method: 'DELETE',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
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
      downloadBtn.onclick = () => this.downloadDocument('GitPit_Image_' + Date.now() + '.jpg', imageUrl);
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

  // ================= SAVE TO PHONEBOOK FROM ACTIVE CHAT OR SETTINGS =================
  openSaveContactModal(defaultName = '', defaultPhone = '', defaultEmail = '') {
    const modal = document.getElementById('save-contact-modal');
    if (!modal) return;

    const nameInp = document.getElementById('save-contact-name-input');
    const phoneInp = document.getElementById('save-contact-phone-input');
    const emailInp = document.getElementById('save-contact-email-input');
    const countrySelect = document.getElementById('save-contact-country-code');

    if (nameInp) nameInp.value = defaultName || '';
    if (emailInp) emailInp.value = defaultEmail || '';

    if (phoneInp) {
      const raw = (defaultPhone || '').trim();
      if (raw.startsWith('+')) {
        const matchedPrefix = ['+91', '+1', '+44', '+971', '+61', '+81'].find(p => raw.startsWith(p));
        if (matchedPrefix) {
          if (countrySelect) countrySelect.value = matchedPrefix;
          phoneInp.value = raw.slice(matchedPrefix.length).trim();
        } else {
          if (countrySelect) countrySelect.value = '+91';
          phoneInp.value = raw.replace(/\D/g, '');
        }
      } else {
        if (countrySelect) countrySelect.value = '+91';
        phoneInp.value = raw.replace(/\D/g, '');
      }
    }

    modal.classList.add('active');
  }

  promptSaveActiveContactToPhonebook() {
    const activeChat = this.getActiveChat();
    if (!activeChat) {
      this.openSaveContactModal();
      return;
    }
    if (activeChat.isAi || activeChat.id === 'chat_ai') {
      alert('GitPit AI Assistant is already a permanent contact.');
      return;
    }

    const currentName = activeChat.savedName || activeChat.name || '';
    this.openSaveContactModal(currentName, activeChat.phone || '', activeChat.email || '');
  }

  submitSaveContactModal() {
    const nameInp = document.getElementById('save-contact-name-input');
    const phoneInp = document.getElementById('save-contact-phone-input');
    const emailInp = document.getElementById('save-contact-email-input');
    const countrySelect = document.getElementById('save-contact-country-code');

    const name = nameInp ? nameInp.value.trim() : '';
    const rawDigits = phoneInp ? phoneInp.value.replace(/\D/g, '') : '';
    const countryCode = countrySelect ? countrySelect.value : '+91';
    const email = emailInp ? emailInp.value.trim() : '';

    if (!name) {
      alert('Please enter a contact name.');
      return;
    }
    if (!rawDigits || rawDigits.length < 5) {
      alert('Please enter a valid phone number.');
      return;
    }

    const fullPhone = `${countryCode}${rawDigits}`;
    const cleanDigits = rawDigits.slice(-10);

    if (window.AuthManager) {
      window.AuthManager.saveContactToPhonebook(cleanDigits, name, fullPhone);
    }

    // Update existing chat or add new chat
    let chat = this.chats.find(c => (c.phone && c.phone.replace(/\D/g, '').includes(cleanDigits)) || c.id === `user_${cleanDigits}`);
    if (chat) {
      chat.savedName = name;
      chat.name = name;
      chat.phone = fullPhone;
      if (email) chat.email = email;
    } else {
      chat = {
        id: `user_${cleanDigits}`,
        name: name,
        savedName: name,
        phone: fullPhone,
        email: email,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits}`,
        bio: 'Hey there! I am using GitPit 🚀',
        online: true,
        isGroup: false,
        unreadCount: 0,
        messages: []
      };
      this.chats.unshift(chat);
    }

    this.saveChats();
    this.renderChatList();

    const headerName = document.getElementById('active-chat-name');
    if (headerName && this.activeChatId === chat.id) headerName.textContent = name;

    const modal = document.getElementById('save-contact-modal');
    if (modal) modal.classList.remove('active');

    alert(`✅ Contact saved as "${name}" (${fullPhone}) in your Phonebook!`);
  }

  // ================= NEW CONVERSATION DIRECTORY PICKER =================
  openNewConversationModal() {
    const modal = document.getElementById('new-chat-picker-modal');
    if (!modal) return;
    modal.classList.add('active');
    
    // Render cached contacts instantly with 0ms delay
    this.populateNewChatDirectory();

    // Background sync only if needed without blocking UI
    if (window.AuthManager && typeof window.AuthManager.grantContactsAndSync === 'function') {
      const lastSync = parseInt(sessionStorage.getItem('last_contacts_sync') || '0', 10);
      if (Date.now() - lastSync > 300000) { // 5 minutes cache
        sessionStorage.setItem('last_contacts_sync', Date.now().toString());
        setTimeout(() => {
          window.AuthManager.grantContactsAndSync(false).then(() => {
            this.populateNewChatDirectory();
          }).catch(() => {});
        }, 100);
      }
    }
  }

  async populateNewChatDirectory(filterText = '', showAllInvites = false) {
    const container = document.getElementById('new-chat-contacts-list');
    if (!container) return;

    const cleanFilter = (filterText || '').toLowerCase().trim();
    const cleanFilterDigits = (filterText || '').replace(/\D/g, '');

    const currentUserId = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.id : null;
    const currentPhone = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.phone : null;
    const cleanMyPhone = (currentPhone || '').replace(/\D/g, '').slice(-10);
    const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};

    const registeredMap = new Map();
    const nonRegisteredMap = new Map();
    const regPhoneSet = new Set();
    const regUserById = new Map();

    // 1. Gather all registered users
    const allReg = [...(this.registeredUsers || [])];
    try {
      const cachedSynced = JSON.parse(localStorage.getItem('gitpit_synced_contacts') || '[]');
      if (Array.isArray(cachedSynced)) {
        cachedSynced.forEach(cs => {
          if (!allReg.some(u => u.id === cs.id || (cs.phone && u.phone && cs.phone.slice(-10) === u.phone.slice(-10)))) {
            allReg.push(cs);
          }
        });
      }
    } catch (e) {}

    allReg.forEach(u => {
      if (!u) return;
      const uPhone10 = (u.phone || '').replace(/\D/g, '').slice(-10);
      if (uPhone10 && uPhone10.length >= 10) regPhoneSet.add(uPhone10);
      if (u.id) regUserById.set(u.id, u);
      if (uPhone10) regUserById.set(uPhone10, u);
    });

    // Populate registered list
    allReg.forEach(u => {
      if (currentUserId && u.id === currentUserId) return;
      const cleanPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
      if (cleanMyPhone && cleanPhone && cleanPhone === cleanMyPhone) return;

      const saved = phonebook[u.id] || (cleanPhone ? phonebook[cleanPhone] : null);
      const displayName = saved ? (saved.savedName || saved.name) : (u.name || (cleanPhone ? `+91 ${cleanPhone}` : 'GitPit Member'));
      const avatar = (saved && (saved.photoUri || saved.avatar)) || u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanPhone || u.id}`;
      const contactKey = cleanPhone || u.id;

      registeredMap.set(contactKey, {
        id: u.id || `user_${cleanPhone}`,
        name: displayName,
        phone: u.phone || (cleanPhone ? `+91 ${cleanPhone}` : ''),
        avatar: avatar,
        bio: u.bio || 'Active on GitPit 🟢',
        isRegistered: true
      });
    });

    // Populate from phonebook (Registered vs Non-Registered with real native photos)
    Object.entries(phonebook).forEach(([key, item]) => {
      if (!item || (!item.savedName && !item.name)) return;
      const cleanDigits = (item.phone || key).replace(/\D/g, '').slice(-10);
      if (!cleanDigits || cleanDigits.length < 10) return;
      if (cleanMyPhone && cleanDigits === cleanMyPhone) return;

      const contactName = item.savedName || item.name || `+91 ${cleanDigits}`;
      const contactAvatar = item.photoUri || item.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits}`;
      const isReg = regPhoneSet.has(cleanDigits) || regUserById.has(cleanDigits) || regUserById.has(item.contactId);

      if (isReg) {
        if (!registeredMap.has(cleanDigits)) {
          const regUser = regUserById.get(cleanDigits) || regUserById.get(item.contactId);
          const contactId = (regUser && regUser.id) || item.contactId || `user_${cleanDigits}`;
          registeredMap.set(cleanDigits, {
            id: contactId,
            name: contactName,
            phone: item.phone || `+91 ${cleanDigits}`,
            avatar: contactAvatar,
            bio: (regUser && regUser.bio) || 'Active on GitPit 🟢',
            isRegistered: true
          });
        }
      } else {
        if (!registeredMap.has(cleanDigits) && !nonRegisteredMap.has(cleanDigits)) {
          nonRegisteredMap.set(cleanDigits, {
            id: item.contactId || `invite_${cleanDigits}`,
            name: contactName,
            phone: item.phone || `+91 ${cleanDigits}`,
            avatar: contactAvatar,
            bio: 'Phonebook Contact',
            isRegistered: false
          });
        }
      }
    });

    let regList = Array.from(registeredMap.values());
    let nonRegList = Array.from(nonRegisteredMap.values());

    if (cleanFilter) {
      regList = regList.filter(c => {
        return (c.name || '').toLowerCase().includes(cleanFilter) || (c.phone || '').replace(/\D/g, '').includes(cleanFilterDigits);
      });
      nonRegList = nonRegList.filter(c => {
        return (c.name || '').toLowerCase().includes(cleanFilter) || (c.phone || '').replace(/\D/g, '').includes(cleanFilterDigits);
      });
    }

    if (regList.length === 0 && nonRegList.length === 0) {
      if (cleanFilterDigits.length >= 10) {
        container.innerHTML = `
          <div style="text-align: center; padding: 20px; background: var(--bg-card); border-radius: 8px;">
            <p style="font-size: 13px; color: var(--text-primary); margin-bottom: 10px;">
              Start direct chat with <b>+91 ${cleanFilterDigits.slice(-10)}</b>
            </p>
            <button class="auth-submit-btn" style="background: var(--brand-green); font-size: 13px;" onclick="window.ChatEngine.startChatWithNewNumber('${cleanFilterDigits.slice(-10)}')">
              💬 Start Direct Chat
            </button>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 24px 16px;">
            <p style="margin-bottom: 12px;">No phonebook contacts found.</p>
            <button class="btn-action-primary" style="font-size: 13px;" onclick="window.AuthManager && window.AuthManager.grantContactsAndSync()">
              🔄 Sync Native Phone Contacts
            </button>
          </div>
        `;
      }
      return;
    }

    let html = '';

    // Section 1: Contacts on GitPit
    if (regList.length > 0) {
      html += `
        <div style="padding: 6px 10px; font-size: 11px; font-weight: 700; color: var(--brand-green); text-transform: uppercase; letter-spacing: 0.5px;">
          🟢 Contacts on GitPit (${regList.length})
        </div>
      `;
      html += regList.map(c => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-subtle); margin-bottom: 6px; cursor: pointer;" onclick="document.getElementById('new-chat-picker-modal').classList.remove('active'); window.ChatEngine.startChatWithUser('${c.id}', '${c.name.replace(/'/g, "\\'")}', '${c.phone}', '${c.avatar}')">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img class="avatar-img" style="width: 38px; height: 38px; object-fit: cover;" src="${c.avatar}" alt="${c.name}">
            <div>
              <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">${c.name}</div>
              <div style="font-size: 11.5px; color: var(--brand-green);">🟢 ${c.phone ? c.phone : 'GitPit Member'}</div>
            </div>
          </div>
          <button class="btn-schedule-new" style="font-size: 12px; padding: 5px 12px; background: var(--brand-green);">Chat 💬</button>
        </div>
      `).join('');
    }

    // Section 2: Invite to GitPit (Paginated / Limited to 35 for instantaneous rendering)
    if (nonRegList.length > 0) {
      const displayInvites = (cleanFilter || showAllInvites) ? nonRegList : nonRegList.slice(0, 35);
      html += `
        <div style="padding: 12px 10px 6px 10px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
          ✉️ Invite Contacts to GitPit (${nonRegList.length})
        </div>
      `;
      html += displayInvites.map(c => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-subtle); margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img class="avatar-img" style="width: 38px; height: 38px; opacity: 0.9; object-fit: cover;" src="${c.avatar}" alt="${c.name}">
            <div>
              <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">${c.name}</div>
              <div style="font-size: 11.5px; color: var(--text-muted);">${c.phone || 'Non-registered'}</div>
            </div>
          </div>
          <button class="btn-schedule-new" style="font-size: 12px; padding: 5px 12px; background: transparent; border: 1px solid var(--brand-blue); color: var(--brand-blue);" onclick="window.open('https://api.whatsapp.com/send?phone=${encodeURIComponent(c.phone)}&text=' + encodeURIComponent('Hey! Let\\'s chat and video call on GitPit: https://chitchat-chatterpatter.onrender.com'), '_blank')">
            Invite ✉️
          </button>
        </div>
      `).join('');

      if (!cleanFilter && !showAllInvites && nonRegList.length > 35) {
        html += `
          <div style="text-align: center; padding: 10px;">
            <button class="btn-action-secondary" style="font-size: 12px; padding: 8px 16px;" onclick="window.ChatEngine.populateNewChatDirectory('', true)">
              ➕ Show All ${nonRegList.length} Contacts
            </button>
          </div>
        `;
      }
    }

    container.innerHTML = html;
  }

  filterNewChatDirectory(query) {
    this.populateNewChatDirectory(query);
  }

  startChatWithUser(userId, name, phone, avatar) {
    const modal = document.getElementById('new-chat-picker-modal');
    if (modal) modal.classList.remove('active');

    const cleanDigits = (phone || userId || '').replace(/\D/g, '').slice(-10);
    let chat = this.chats.find(c => c.id === userId || (cleanDigits && c.phone && c.phone.replace(/\D/g, '').includes(cleanDigits)));
    if (!chat) {
      const fullPhone = cleanDigits.length === 10 ? `+91${cleanDigits}` : (phone || '');
      chat = {
        id: userId || `user_${cleanDigits || Date.now()}`,
        name: name,
        savedName: name,
        phone: fullPhone,
        avatar: avatar || (cleanDigits ? `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits}` : 'assets/logo-icon.svg'),
        bio: 'GitPit Member 🚀',
        online: true,
        isGroup: false,
        unreadCount: 0,
        messages: []
      };
      this.chats.unshift(chat);
      this.saveChats();
      this.renderChatList();
    }
    this.openChat(chat.id);
  }

  startChatWithNewNumber(phoneNumber) {
    const cleanDigits = (phoneNumber || '').replace(/\D/g, '').slice(-10);
    const fullPhone = cleanDigits.length === 10 ? `+91${cleanDigits}` : (phoneNumber || '+910000000000');
    this.startChatWithUser(`user_${cleanDigits || Date.now()}`, fullPhone, fullPhone, `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits || 'user'}`);
  }

  // ================= CHAT WALLPAPER MANAGER =================
  openWallpaperModal() {
    const modal = document.getElementById('chat-wallpaper-modal');
    if (!modal) return;
    modal.classList.add('active');
  }

  setWallpaperColor(color) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    if (color) {
      container.style.backgroundColor = color;
      container.style.backgroundImage = 'none';
      if (this.activeChatId) {
        localStorage.setItem(`gitpit_wallpaper_${this.activeChatId}`, color);
      }
    } else {
      this.resetChatWallpaper();
    }

    const modal = document.getElementById('chat-wallpaper-modal');
    if (modal) modal.classList.remove('active');
  }

  handleCustomWallpaperUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const container = document.getElementById('chat-messages-container');
      if (container) {
        container.style.backgroundImage = `url(${dataUrl})`;
        container.style.backgroundSize = 'cover';
        container.style.backgroundPosition = 'center';
        container.style.backgroundColor = 'transparent';
      }
      if (this.activeChatId) {
        localStorage.setItem(`gitpit_wallpaper_${this.activeChatId}`, dataUrl);
      }
      const modal = document.getElementById('chat-wallpaper-modal');
      if (modal) modal.classList.remove('active');
    };
    reader.readAsDataURL(file);
  }

  loadChatWallpaper(chatId) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    const saved = localStorage.getItem(`gitpit_wallpaper_${chatId}`);
    if (saved) {
      if (saved.startsWith('data:') || saved.startsWith('http')) {
        container.style.backgroundImage = `url(${saved})`;
        container.style.backgroundSize = 'cover';
        container.style.backgroundPosition = 'center';
        container.style.backgroundColor = 'transparent';
      } else {
        container.style.backgroundColor = saved;
        container.style.backgroundImage = 'none';
      }
    } else {
      container.style.backgroundColor = '';
      container.style.backgroundImage = '';
    }
  }

  resetChatWallpaper() {
    const container = document.getElementById('chat-messages-container');
    if (container) {
      container.style.backgroundColor = '';
      container.style.backgroundImage = '';
    }
    if (this.activeChatId) {
      localStorage.removeItem(`gitpit_wallpaper_${this.activeChatId}`);
    }
    const modal = document.getElementById('chat-wallpaper-modal');
    if (modal) modal.classList.remove('active');
  }

  // ================= CONTACT PROFILE MODAL & SHARED FILES =================
  openContactProfile(contactId) {
    const contact = this.chats.find(c => c.id === contactId) || this.registeredUsers.find(u => u.id === contactId);
    if (!contact) return;

    const modal = document.getElementById('contact-profile-modal');
    if (!modal) return;

    document.getElementById('contact-profile-avatar').src = contact.avatar || 'assets/logo-icon.svg';
    document.getElementById('contact-profile-name').textContent = contact.savedName || contact.name || contact.phone || 'Contact';
    document.getElementById('contact-profile-status').textContent = contact.bio || contact.status || 'Hey there! I am using GitPit 🚀';
    
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
    // If Voice Note Recording is in progress, stop & dispatch voice note via Send button
    if (window.VoiceRecorder && window.VoiceRecorder.isRecording) {
      window.VoiceRecorder.stopRecording((data) => {
        if (data && data.audioUrl) {
          this.sendVoiceNote(data);
        }
      });
      this.resetRecordingUI();
      return;
    }

    const emojiContainer = document.getElementById('emoji-picker-container');
    if (emojiContainer) emojiContainer.classList.remove('active');

    const attachPopup = document.getElementById('chat-attach-popup');
    if (attachPopup) attachPopup.classList.remove('active');

    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    const textarea = document.getElementById('chat-input-textarea');
    let text = textarea ? textarea.value.trim() : '';

    if (!customPayload && !text) return;

    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const senderId = currentUser ? currentUser.id : 'me';
    const senderName = currentUser ? currentUser.name : 'You';
    const senderAvatar = currentUser ? currentUser.avatar : '';
    const senderPhone = currentUser ? currentUser.phone : '';
    const recipientPhone = activeChat ? (activeChat.phone || '') : '';
    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      chatId: activeChat.id,
      senderId: senderId,
      senderName: senderName,
      senderAvatar: senderAvatar,
      senderPhone: senderPhone,
      recipientPhone: recipientPhone,
      recipientId: activeChat.id,
      text: text,
      time: formattedTime,
      timestamp: Date.now(),
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
        senderPhone: senderPhone,
        recipientPhone: recipientPhone,
        recipientId: activeChat.id,
        isAiChat: activeChat.isAi || activeChat.id === 'chat_ai'
      });
    }

    // Direct AI Response Trigger
    if (activeChat.isAi || activeChat.id === 'chat_ai' || (activeChat.id && activeChat.id.includes('ai'))) {
      setTimeout(() => {
        this.handleClientAiReply(newMsg.text, senderName);
      }, 300);
    }

    // Persist via REST API Fallback
    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || (window.AuthManager ? window.AuthManager.authToken : '');
      fetch(`${base}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          ...newMsg,
          senderPhone: senderPhone,
          recipientPhone: recipientPhone,
          recipientId: activeChat.id,
          isAiChat: activeChat.isAi || activeChat.id === 'chat_ai'
        })
      }).catch(() => {});
    } catch (e) {}
  }

  async handleClientAiReply(userText, userName) {
    const activeChat = this.getActiveChat();
    if (!activeChat) return;

    const statusElem = document.getElementById('active-chat-status');
    if (statusElem) {
      statusElem.textContent = '🤖 GitPit AI is typing...';
      statusElem.classList.add('typing');
    }

    let answer = '';
    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || '';
      const resp = await fetch(`${base}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ prompt: userText, userName: userName })
      });
      const data = await resp.json();
      if (data && data.reply) {
        answer = data.reply;
      }
    } catch(e) {}

    if (!answer) {
      const query = (userText || '').trim().toLowerCase();
      // Math calculator
      const mathMatch = (userText || '').match(/^[\d\s\+\-\*\/\(\)\.\^\%]+$/);
      if (mathMatch && (userText || '').match(/[\+\-\*\/]/)) {
        try {
          const sanitized = userText.replace(/[^-()\d/*+.]/g, '');
          const result = Function(`'use strict'; return (${sanitized})`)();
          answer = `🧮 **Calculation Result:**\n\`${userText.trim()}\` = **${result}**`;
        } catch(e) {}
      }

      if (!answer) {
        if (/leave application|resignation|formal email|write an email|letter/i.test(query)) {
          answer = `📝 **Professional Draft:**\n\n**Subject:** Formal Leave Application / Absence Notice\n\nDear Sir/Madam,\n\nI am writing to formally request a leave of absence from [Start Date] to [End Date] due to [personal/medical reasons]. All my ongoing tasks are documented and delegated.\n\nThank you for your understanding.\n\nBest regards,\n**${userName || 'Friend'}**`;
        } else if (/joke|funny|riddle/i.test(query)) {
          answer = `😂 **Here is a fun joke for you:**\n\nWhy don't scientists trust atoms?\n\nBecause they make up everything! 🤣⚛️`;
        } else if (/hi|hello|hey|greetings/i.test(query)) {
          answer = `Hello ${userName || 'Friend'}! 👋✨\n\nI am your **GitPit AI Assistant**. I can assist you with:\n\n• 💡 **General Questions & Research**\n• ✍️ **Drafting Emails, Applications & Memos**\n• 💻 **Programming & Coding Assistance**\n• 🌐 **Language Translations**\n• 📞 **Video Calling & Screen Sharing Tips**\n\nHow can I help you right now?`;
        } else {
          answer = `🤖 **GitPit AI Assistant:**\n\nI am here to help you with: *"**${userText}**"*\n\n• You can ask me to write emails, prepare meeting agendas, solve math equations, or explain code.\n• How would you like me to assist you with this? ✨`;
        }
      }
    }

    if (statusElem) {
      statusElem.textContent = '🤖 GitPit AI Assistant • Online';
      statusElem.classList.remove('typing');
    }

    const aiReplyMsg = {
      id: 'msg_ai_' + Date.now(),
      chatId: activeChat.id,
      senderId: 'ai_assistant',
      senderName: 'GitPit AI Assistant 🤖',
      senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=GitPitAI',
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
  }

  async uploadMediaToServer(dataUrl, fileName, fileType) {
    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || (window.AuthManager ? window.AuthManager.authToken : '');
      const resp = await fetch(`${base}/api/media/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ dataUrl, fileName, fileType })
      });
      const data = await resp.json();
      if (data && data.success && data.mediaUrl) {
        return data.mediaUrl;
      }
    } catch (e) {
      console.warn('[MEDIA UPLOAD] S3/R2 upload fallback to inline:', e.message);
    }
    return dataUrl;
  }

  handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        // High Definition Resizing (Max 1920px)
        const maxDimension = 1920;
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const uploadedUrl = await this.uploadMediaToServer(optimizedDataUrl, file.name || 'Photo.jpg', 'image/jpeg');

        this.sendMessage({
          type: 'image',
          mediaUrl: uploadedUrl,
          fileName: file.name || 'Photo.jpg',
          fileSize: (file.size / 1024).toFixed(1) + ' KB'
        });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  handleDocUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target.result;
      const uploadedUrl = await this.uploadMediaToServer(dataUrl, file.name, file.type || 'application/octet-stream');

      this.sendMessage({
        type: 'document',
        mediaUrl: uploadedUrl,
        fileUrl: uploadedUrl,
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(1) + ' KB'
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  toggleAttachMenu(e) {
    if (e) e.stopPropagation();
    const popup = document.getElementById('chat-attach-popup');
    if (popup) popup.classList.toggle('active');
  }

  openPhotoAttachmentPicker() {
    const popup = document.getElementById('chat-attach-popup');
    if (popup) popup.classList.remove('active');
    const fileInput = document.getElementById('hidden-file-photo');
    if (fileInput) fileInput.click();
  }

  openDocAttachmentPicker() {
    const popup = document.getElementById('chat-attach-popup');
    if (popup) popup.classList.remove('active');
    const fileInput = document.getElementById('hidden-file-doc');
    if (fileInput) fileInput.click();
  }

  sendCurrentLocation() {
    const popup = document.getElementById('chat-attach-popup');
    if (popup) popup.classList.remove('active');

    if (!navigator.geolocation) {
      alert('Geolocation is not supported on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        this.sendMessage({
          type: 'location',
          latitude: lat,
          longitude: lng,
          mapUrl: mapUrl,
          text: `📍 Live Location: https://maps.google.com/?q=${lat},${lng}`
        });
      },
      (err) => {
        alert('Could not retrieve GPS coordinates. Please allow location permissions in device settings.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
    if (!msg) return;
    const currentUser = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser : null;
    const currentUserId = currentUser ? currentUser.id : 'me';
    const currentPhone = currentUser ? currentUser.phone : '';
    const cleanMyPhone = (currentPhone || '').replace(/\D/g, '').slice(-10);

    // If this is an incoming message from myself, don't duplicate
    const isFromMe = msg.senderId === currentUserId || (cleanMyPhone && msg.senderPhone && msg.senderPhone.includes(cleanMyPhone));
    if (isFromMe && msg.senderId === currentUserId) {
      return;
    }

    const isGroupOrAi = msg.chatId === 'chat_ai' || (msg.chatId && msg.chatId.startsWith('group_'));
    let targetChat = null;

    if (isGroupOrAi) {
      targetChat = this.chats.find(c => c.id === msg.chatId);
    } else {
      const cleanSenderPhone = (msg.senderPhone || msg.senderId || '').replace(/\D/g, '').slice(-10);
      targetChat = this.chats.find(c => {
        if (c.id === msg.senderId) return true;
        const cPhone10 = (c.phone || c.id || '').replace(/\D/g, '').slice(-10);
        if (cleanSenderPhone && cPhone10 && cPhone10 === cleanSenderPhone) return true;
        return false;
      });
    }

    const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};
    const cleanSender = (msg.senderPhone || msg.senderId || '').replace(/\D/g, '').slice(-10);
    const savedEntry = phonebook[msg.senderId] || (cleanSender ? phonebook[cleanSender] : null);
    const displayName = savedEntry ? (savedEntry.savedName || savedEntry.name) : (msg.senderName || (cleanSender ? `+91 ${cleanSender}` : 'Friend'));
    const displayAvatar = (savedEntry && (savedEntry.photoUri || savedEntry.avatar)) || msg.senderAvatar || (cleanSender ? `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanSender}` : 'assets/logo-icon.svg');

    if (!targetChat) {
      targetChat = {
        id: cleanSender ? `user_${cleanSender}` : (msg.senderId || ('user_' + Date.now())),
        name: displayName,
        savedName: savedEntry ? (savedEntry.savedName || savedEntry.name) : '',
        phone: msg.senderPhone || (cleanSender ? `+91 ${cleanSender}` : ''),
        avatar: displayAvatar,
        messages: [],
        unreadCount: 0,
        online: true
      };
      this.chats.unshift(targetChat);
    }

    if (!msg.time) {
      msg.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Check duplicate
    if (!targetChat.messages.some(m => m.id === msg.id)) {
      targetChat.messages.push(msg);
      if (this.activeChatId !== targetChat.id) {
        targetChat.unreadCount = (targetChat.unreadCount || 0) + 1;
      }
    }

    this.saveChats();
    this.renderChatList();

    const activeChat = this.getActiveChat();
    const activePhone10 = activeChat ? (activeChat.phone || activeChat.id || '').replace(/\D/g, '').slice(-10) : '';
    const cleanSenderDigits = (msg.senderPhone || msg.senderId || '').replace(/\D/g, '').slice(-10);
    const isCurrentActive = this.activeChatId === targetChat.id || (activeChat && (this.activeChatId === msg.chatId || (cleanSenderDigits && activePhone10 && cleanSenderDigits === activePhone10)));

    if (isCurrentActive) {
      if (this.activeChatId !== targetChat.id) {
        this.activeChatId = targetChat.id;
      }
      this.renderMessages();
      this.scrollToBottom();
    } else {
      // Trigger Foreground In-App Notification Banner
      if (window.ChatterApp && window.ChatterApp.showInAppBanner) {
        const previewText = msg.text || (msg.type ? `📎 ${msg.type.toUpperCase()}` : 'New message');
        window.ChatterApp.showInAppBanner(displayName, previewText, targetChat.avatar, () => {
          this.openChat(targetChat.id);
        });
      }
    }
    this.playAudioPop();

    // Trigger System Notification if tab is in background
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(displayName || 'GitPit Message', {
          body: msg.text || (msg.type ? '📎 ' + msg.type : 'New message received'),
          icon: msg.senderAvatar || 'assets/logo-icon.svg'
        });
      }
    } catch (e) {}
  }

  sendVoiceNote(data) {
    if (!data || !data.audioUrl) return;
    this.sendMessage({
      type: 'voice',
      audioUrl: data.audioUrl,
      mediaUrl: data.audioUrl,
      duration: data.duration || '0:05',
      seconds: data.seconds || 5
    });
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

  openScheduleMeetingModal() {
    this.openMeetingModal();
  }

  submitScheduleMeeting() {
    this.scheduleMeeting();
  }

  scheduleMeeting() {
    const titleInput = document.getElementById('meeting-title-input');
    const dateInput = document.getElementById('meeting-date-input');
    const timeInput = document.getElementById('meeting-time-input');
    const durSelect = document.getElementById('meeting-duration-input') || document.getElementById('meeting-duration-select');

    const title = titleInput ? titleInput.value.trim() : '';
    const date = dateInput ? dateInput.value : '';
    const time = timeInput ? timeInput.value : '';
    const duration = durSelect ? durSelect.value : '45 mins';

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
      avatar: currentUser ? (currentUser.avatar || 'assets/logo-icon.svg') : 'assets/logo-icon.svg'
    };

    if (window.ChatterApp) {
      window.ChatterApp.meetings.unshift(newMeeting);
      if (typeof window.ChatterApp.saveMeetings === 'function') {
        window.ChatterApp.saveMeetings();
      } else {
        localStorage.setItem('chatterpatter_meetings', JSON.stringify(window.ChatterApp.meetings));
      }
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
    if (!window.VoiceRecorder) return;
    const recBar = document.getElementById('recording-bar-ui');
    const inputArea = document.getElementById('chat-input-wrapper');
    const timerDisplay = document.getElementById('recording-time-display');

    if (window.VoiceRecorder.isRecording) {
      window.VoiceRecorder.stopRecording((audioData) => {
        this.resetRecordingUI();
        if (audioData) {
          this.sendMessage({
            type: 'voice',
            audioUrl: audioData.audioUrl,
            duration: audioData.duration || '0:05'
          });
        }
      });
    } else {
      if (recBar) recBar.style.display = 'flex';
      if (inputArea) inputArea.style.display = 'none';
      if (timerDisplay) timerDisplay.textContent = '0:00';

      window.VoiceRecorder.startRecording(
        (timeStr) => {
          if (timerDisplay) timerDisplay.textContent = timeStr;
        },
        (audioData) => {
          this.resetRecordingUI();
          if (audioData) {
            this.sendMessage({
              type: 'voice',
              audioUrl: audioData.audioUrl,
              duration: audioData.duration || '0:05'
            });
          }
        }
      );
    }
  }

  resetRecordingUI() {
    const recBar = document.getElementById('recording-bar-ui');
    const inputArea = document.getElementById('chat-input-wrapper');
    if (recBar) recBar.style.display = 'none';
    if (inputArea) inputArea.style.display = 'flex';
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

  // ================= EMOJI & GIF PICKER =================
  toggleEmojiPicker(e) {
    if (e) e.stopPropagation();
    const container = document.getElementById('emoji-picker-container');
    if (container) {
      container.classList.toggle('active');
    }
  }

  switchPickerTab(tabName) {
    const tabEmojis = document.getElementById('picker-tab-emojis');
    const tabGifs = document.getElementById('picker-tab-gifs');
    const panelEmojis = document.getElementById('picker-panel-emojis');
    const panelGifs = document.getElementById('picker-panel-gifs');

    if (tabEmojis) tabEmojis.classList.toggle('active', tabName === 'emojis');
    if (tabGifs) tabGifs.classList.toggle('active', tabName === 'gifs');

    if (panelEmojis) panelEmojis.style.display = tabName === 'emojis' ? 'grid' : 'none';
    if (panelGifs) panelGifs.style.display = tabName === 'gifs' ? 'block' : 'none';
  }

  insertEmoji(emoji) {
    const textarea = document.getElementById('chat-input-textarea');
    if (textarea) {
      const start = textarea.selectionStart || textarea.value.length;
      const end = textarea.selectionEnd || textarea.value.length;
      const text = textarea.value;
      textarea.value = text.substring(0, start) + emoji + text.substring(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
    }
    const container = document.getElementById('emoji-picker-container');
    if (container) container.classList.remove('active');
  }

  sendGifSticker(gifUrl, title) {
    const activeChat = this.getActiveChat();
    if (!activeChat) {
      alert('Please select or open a chat first!');
      return;
    }

    this.sendMessage({
      type: 'image',
      mediaUrl: gifUrl,
      text: title || '🎬 GIF Sticker'
    });

    const container = document.getElementById('emoji-picker-container');
    if (container) container.classList.remove('active');
  }

  // ================= MOVABLE / DRAGGABLE CHAT BAR =================
  initDraggableChatBar() {
    const bar = document.getElementById('chat-input-bar-container');
    const handle = document.getElementById('chat-bar-drag-handle');
    if (!bar || !handle) return;

    let isDragging = false;
    let startY = 0;
    let currentOffsetY = 0;

    const onStart = (clientY) => {
      isDragging = true;
      startY = clientY;
      bar.style.transition = 'none';
    };

    const onMove = (clientY) => {
      if (!isDragging) return;
      const deltaY = startY - clientY;
      // Allow moving up by up to 200px or down
      const clampedDelta = Math.max(-10, Math.min(deltaY, 220));
      currentOffsetY = clampedDelta;
      bar.style.transform = `translateY(-${clampedDelta}px)`;
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      bar.style.transition = 'transform 0.25s ease';
      // Snap back if moved only slightly, otherwise keep position
      if (currentOffsetY < 30) {
        bar.style.transform = 'translateY(0px)';
        currentOffsetY = 0;
      }
    };

    // Mouse drag
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onStart(e.clientY);
    });
    document.addEventListener('mousemove', (e) => onMove(e.clientY));
    document.addEventListener('mouseup', onEnd);

    // Touch drag
    handle.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onStart(e.touches[0].clientY);
      }
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        onMove(e.touches[0].clientY);
      }
    }, { passive: true });
    document.addEventListener('touchend', onEnd);
  }

  isStrangerShieldActive() {
    const priv = (window.AuthManager && window.AuthManager.currentUser && window.AuthManager.currentUser.privacy) || JSON.parse(localStorage.getItem('gitpit_privacy') || '{}');
    const mode = localStorage.getItem('gitpit_stranger_shield_mode') || priv.strangerShieldMode;
    if (mode === 'off') return false;
    const localSetting = localStorage.getItem('gitpit_restrict_unknown_media');
    if (localSetting === 'false') return false;
    return true; // Active by default for complete safety
  }

  isContactTrusted(chatId) {
    if (!chatId) return false;
    const trusted = JSON.parse(localStorage.getItem('gitpit_trusted_contacts') || '[]');
    const cleanDigits = chatId.replace(/\D/g, '').slice(-10);
    return trusted.includes(chatId) || (cleanDigits && trusted.includes(cleanDigits)) || (cleanDigits && trusted.includes(`user_${cleanDigits}`));
  }

  isUnknownContact(chat) {
    if (!chat || chat.isGroup || chat.isAi || chat.id === 'chat_ai') return false;
    if (this.isContactTrusted(chat.id)) return false;

    const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};
    const cleanDigits = (chat.phone || chat.id || '').replace(/\D/g, '').slice(-10);

    // If contact is saved in device native phonebook, it is a known contact
    if (phonebook[chat.id] || (cleanDigits && phonebook[cleanDigits])) {
      return false;
    }

    // Otherwise, it is an UNSAVED NUMBER / STRANGER -> Guard with Stranger Shield
    return true;
  }

  updateStrangerShieldUI() {
    const banner = document.getElementById('stranger-shield-banner');
    if (!banner) return;
    const activeChat = this.getActiveChat();
    if (activeChat && this.isStrangerShieldActive() && this.isUnknownContact(activeChat)) {
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }

  trustContact(chatId) {
    const chat = this.chats.find(c => c.id === chatId);
    const trusted = JSON.parse(localStorage.getItem('gitpit_trusted_contacts') || '[]');
    const cleanDigits = (chat ? (chat.phone || chat.id) : chatId).replace(/\D/g, '').slice(-10);

    if (!trusted.includes(chatId)) trusted.push(chatId);
    if (cleanDigits && !trusted.includes(cleanDigits)) trusted.push(cleanDigits);
    if (cleanDigits && !trusted.includes(`user_${cleanDigits}`)) trusted.push(`user_${cleanDigits}`);

    localStorage.setItem('gitpit_trusted_contacts', JSON.stringify(trusted));
    this.updateStrangerShieldUI();
    this.renderMessages();
    alert(`🛡️ ${chat ? (chat.savedName || chat.name || chat.phone) : 'Contact'} is now marked as a Trusted Contact. Media and attachments are unlocked!`);
  }

  trustActiveContact() {
    if (this.activeChatId) {
      this.trustContact(this.activeChatId);
    }
  }

  shareNewsToChat(article, chatId) {
    if (!article) return;
    const targetChat = this.chats.find(c => c.id === chatId);
    if (!targetChat) return;

    this.activeChatId = chatId;
    this.openChat(chatId);

    const newsText = `📰 *${article.title}*\n\n${article.summary}\n\n🔗 *Source:* ${article.source} • ${article.time}`;
    this.sendMessage({
      type: 'news',
      title: article.title,
      summary: article.summary,
      source: article.source,
      time: article.time,
      image: article.image,
      text: newsText
    });
  }
}

// Global instance
window.addEventListener('DOMContentLoaded', () => {
  window.ChatEngine = new ChatEngine();
});


