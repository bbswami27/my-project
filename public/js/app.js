// GitPit - Main Application Controller & Tab Navigation

class ChatterApp {
  constructor() {
    this.currentTab = 'chats';
    this.isDarkTheme = true;
    this.isNewsFlashOn = true;
    this.socket = null;
    this.meetings = [];
    this.emailMemos = [];
    this.init();
  }

  init() {
    // Load Settings
    const savedTheme = localStorage.getItem('chatterpatter_theme');
    if (savedTheme === 'light') {
      this.isDarkTheme = false;
      document.body.classList.add('light-theme');
    }

    const savedFlash = localStorage.getItem('chatterpatter_news_flash');
    if (savedFlash === 'false') {
      this.isNewsFlashOn = false;
      const bar = document.getElementById('news-flash-ticker-bar');
      if (bar) bar.style.display = 'none';
      document.querySelectorAll('.news-flash-toggle-checkbox').forEach(cb => cb.checked = false);
      const label = document.getElementById('news-flash-status-label');
      if (label) label.textContent = 'OFF';
    }

    // 🛡️ Ensure Mandatory Default Privacy & Anti-Fraud Security Settings
    if (localStorage.getItem('gitpit_restrict_unknown_media') === null) {
      localStorage.setItem('gitpit_restrict_unknown_media', 'true');
    }
    if (!localStorage.getItem('gitpit_file_receiving_privacy')) {
      localStorage.setItem('gitpit_file_receiving_privacy', 'contacts');
    }
    if (!localStorage.getItem('gitpit_video_call_privacy')) {
      localStorage.setItem('gitpit_video_call_privacy', 'contacts');
    }

    // Load Meetings & Memos
    const savedMeetings = localStorage.getItem('chatterpatter_meetings');
    if (savedMeetings) {
      try { this.meetings = JSON.parse(savedMeetings); }
      catch (e) { this.meetings = [...window.MOCK_DATA.initialMeetings]; }
    } else {
      this.meetings = [...window.MOCK_DATA.initialMeetings];
    }

    const savedMemos = localStorage.getItem('chatterpatter_memos');
    if (savedMemos) {
      try { this.emailMemos = JSON.parse(savedMemos); }
      catch (e) { this.emailMemos = [...window.MOCK_DATA.initialEmailMemos]; }
    } else {
      this.emailMemos = [...window.MOCK_DATA.initialEmailMemos];
    }

    this.deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const installBtn = document.getElementById('btn-install-pwa-app');
      if (installBtn) installBtn.style.display = 'flex';
    });

    this.initSocket();
    this.bindEvents();
    this.initBackNavigation();
    this.renderMeetingsTab();
    this.renderEmailTab();

    // Restore preserved active tab across configuration changes / orientation
    const savedTab = sessionStorage.getItem('gitpit_active_tab') || 'chats';
    if (savedTab && savedTab !== 'chats') {
      this.switchTab(savedTab);
    }
  }

  promptInstallPWA() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          alert('🎉 GitPit app installed on your device Home Screen!');
        }
        this.deferredPrompt = null;
      });
    } else {
      alert('📱 Phone me App Download / Install karne ke liye:\n\n1. Browser ke top-right 3-dots (⋮) par tap karein.\n2. "Install App" ya "Add to Home Screen" par click karein!\n\nYe bina App store ke direct aapke phone me install ho jayegi! ✨');
    }
  }

  initSocket() {
    try {
      if (typeof io !== 'undefined') {
        const socketUrl = 'https://chitchat-chatterpatter.onrender.com';

        this.socket = io(socketUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 30,
          reconnectionDelay: 1000
        });

        this.socket.on('connect', () => {
          console.log('⚡ Connected to ChatterPatter Socket Server:', this.socket.id, 'via', socketUrl);
          const currentUser = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser : null;
          if (currentUser) {
            this.socket.emit('user_join', currentUser);
          }
          if (window.ChatEngine) {
            window.ChatEngine.syncRegisteredUsers();
          }
        });

        this.socket.on('user_registered', (newUser) => {
          console.log('👥 New user registered on network:', newUser);
          if (window.ChatEngine) {
            window.ChatEngine.syncRegisteredUsers();
          }
        });

        this.socket.on('receive_message', (msg) => {
          if (window.ChatEngine) window.ChatEngine.onReceiveMessage(msg);
        });

        this.socket.on('message_edited', (msg) => {
          if (window.ChatEngine) {
            const chat = window.ChatEngine.chats.find(c => c.id === msg.chatId);
            if (chat) {
              const m = chat.messages.find(item => item.id === msg.id);
              if (m) {
                m.text = msg.text;
                m.edited = true;
                if (window.ChatEngine.activeChatId === msg.chatId) {
                  window.ChatEngine.renderMessages();
                }
                window.ChatEngine.renderChatList();
              }
            }
          }
        });

        this.socket.on('message_deleted', (data) => {
          if (window.ChatEngine) {
            window.ChatEngine.chats.forEach(chat => {
              const idx = chat.messages.findIndex(m => m.id === data.id);
              if (idx !== -1) {
                if (data.isForEveryone) {
                  chat.messages[idx].isDeleted = true;
                  chat.messages[idx].text = '🚫 This message was deleted';
                  chat.messages[idx].mediaUrl = null;
                } else {
                  chat.messages.splice(idx, 1);
                }
              }
            });
            window.ChatEngine.renderMessages();
            window.ChatEngine.renderChatList();
          }
        });

        this.socket.on('chat_deleted', (data) => {
          if (window.ChatEngine) {
            window.ChatEngine.chats = window.ChatEngine.chats.filter(c => c.id !== data.chatId);
            window.ChatEngine.saveChats();
            window.ChatEngine.renderChatList();
            if (window.ChatEngine.activeChatId === data.chatId) {
              window.ChatEngine.activeChatId = null;
              document.getElementById('chat-empty-state').style.display = 'flex';
              document.getElementById('chat-active-view').style.display = 'none';
            }
          }
        });

        this.socket.on('user_registered', () => {
          if (window.ChatEngine) window.ChatEngine.syncRegisteredUsers();
        });

        this.socket.on('online_users', (users) => {
          if (window.ChatEngine && Array.isArray(users)) {
            window.ChatEngine.chats.forEach(c => {
              if (c.id === 'chat_ai') return;
              const match = users.find(u => u.id === c.id || (u.phone && u.phone === c.phone));
              c.online = !!match;
            });
            window.ChatEngine.renderChatList();
          }
        });

        this.socket.on('news_flash_update', (news) => {
          const textElem = document.getElementById('ticker-headline-text');
          if (textElem) {
            textElem.textContent = `🚨 ${news.title} (${news.source || 'GitPit'})`;
          }
        });

        // ==========================================
        // 📞 WebRTC Signaling Listeners
        // ==========================================
        const handleIncomingCall = (callData) => {
          if (!callData) return;
          const currentUser = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser : null;
          const currentUserId = currentUser ? currentUser.id : null;
          const currentPhone = currentUser ? currentUser.phone : null;
          const cleanMyPhone = (currentPhone || '').replace(/\D/g, '').slice(-10);
          const cleanTargetPhone = (callData.recipientPhone || callData.recipientId || callData.userToCall || '').replace(/\D/g, '').slice(-10);
          const cleanCallerPhone = (callData.callerPhone || callData.callerId || '').replace(/\D/g, '').slice(-10);

          // 1. Ignore if call originated from myself
          if (currentUserId && callData.callerId === currentUserId) return;
          if (cleanMyPhone && cleanCallerPhone && cleanMyPhone === cleanCallerPhone) return;

          // 2. Validate recipient match: matches ID or matches 10-digit mobile number
          let isTargetRecipient = false;
          if (callData.userToCall && currentUserId && (callData.userToCall === currentUserId || callData.userToCall === ('user_' + cleanMyPhone))) {
            isTargetRecipient = true;
          }
          if (callData.recipientId && currentUserId && (callData.recipientId === currentUserId || callData.recipientId === ('user_' + cleanMyPhone))) {
            isTargetRecipient = true;
          }
          if (cleanMyPhone && cleanTargetPhone && (cleanMyPhone === cleanTargetPhone || cleanTargetPhone.includes(cleanMyPhone) || cleanMyPhone.includes(cleanTargetPhone))) {
            isTargetRecipient = true;
          }
          if (!callData.recipientId && !callData.userToCall && !cleanTargetPhone) {
            isTargetRecipient = true;
          }

          if (!isTargetRecipient) {
            return;
          }

          // 3. Look up Phonebook for saved contact name
          const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};
          const savedEntry = phonebook[callData.callerId] || (cleanCallerPhone ? phonebook[cleanCallerPhone] : null);
          const callerDisplayName = savedEntry ? savedEntry.savedName : (callData.callerName || callData.callerPhone || 'Incoming Caller');
          const callerAvatar = callData.callerAvatar || 'assets/logo-icon.svg';

          if (window.CallManager) {
            window.CallManager.showIncomingCallPrompt(
              callerDisplayName,
              callerAvatar,
              callData.callType || 'audio',
              callData.callerId || ('user_' + cleanCallerPhone),
              callData.fromSocketId || callData.callerSocketId,
              callData.signalData,
              callData.callerPhone || ''
            );
          }
        };

        // 1. Incoming Call Offer
        this.socket.on('incoming-call', handleIncomingCall);
        this.socket.on('incoming_call', handleIncomingCall);

        // 2. Call Accepted Answer
        const handleCallAccepted = (data) => {
          if (window.CallManager) {
            window.CallManager.handleCallAccepted(data);
          }
        };
        this.socket.on('call-accepted', handleCallAccepted);
        this.socket.on('call_accepted', handleCallAccepted);

        // 3. ICE Candidate
        const handleIceCandidate = (data) => {
          if (window.CallManager) {
            window.CallManager.handleIceCandidate(data);
          }
        };
        this.socket.on('ice-candidate', handleIceCandidate);
        this.socket.on('ice_candidate', handleIceCandidate);

        // 4. Call Rejected
        const handleCallRejected = (data) => {
          if (window.CallManager) {
            window.CallManager.handleCallRejected(data);
          }
        };
        this.socket.on('call-rejected', handleCallRejected);
        this.socket.on('call_rejected', handleCallRejected);

        // 5. Call Ended
        const handleCallEnded = () => {
          if (window.CallManager && window.CallManager.activeCall) {
            window.CallManager.endCall(true);
          }
        };
        this.socket.on('end-call', handleCallEnded);
        this.socket.on('call_ended', handleCallEnded);
      }
    } catch (err) {
      console.warn('Socket.io connection warning:', err);
    }
  }

  bindEvents() {
    // Main Tab Switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Top Filter Chips Switching (All, Unread, Groups, Contacts, News Flash)
    document.querySelectorAll('.chat-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const filter = chip.getAttribute('data-filter');
        if (filter === 'news') {
          this.switchTab('news');
        } else {
          this.switchTab('chats');
          if (window.ChatEngine) {
            window.ChatEngine.filterChatsByType(filter);
          }
        }
      });
    });

    // Theme Toggle
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // 3-Dots Vertical Menu Toggle
    const threeDotsBtn = document.getElementById('btn-main-three-dots');
    const threeDotsDropdown = document.getElementById('main-three-dots-dropdown');

    if (threeDotsBtn && threeDotsDropdown) {
      threeDotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = threeDotsDropdown.classList.contains('active');
        if (!isOpen) {
          this.drillDownMenu('root');
          threeDotsDropdown.classList.add('active');
        } else {
          threeDotsDropdown.classList.remove('active');
        }
      });

      document.addEventListener('click', (e) => {
        if (!threeDotsDropdown.contains(e.target) && e.target !== threeDotsBtn) {
          threeDotsDropdown.classList.remove('active');
        }
      });
    }

    // Dropdown Item Actions
    const optNewGroup = document.getElementById('menu-opt-new-group');
    const optProfile = document.getElementById('menu-opt-profile');
    const optSettings = document.getElementById('menu-opt-settings');

    if (optNewGroup) {
      optNewGroup.addEventListener('click', () => {
        if (threeDotsDropdown) threeDotsDropdown.classList.remove('active');
        this.openNewGroupModal();
      });
    }

    if (optProfile) {
      optProfile.addEventListener('click', () => {
        if (threeDotsDropdown) threeDotsDropdown.classList.remove('active');
        if (window.AuthManager) window.AuthManager.openProfileModal();
      });
    }

    if (optSettings) {
      optSettings.addEventListener('click', () => {
        if (threeDotsDropdown) threeDotsDropdown.classList.remove('active');
        this.openSettingsModal();
      });
    }

    const optStrangerShield = document.getElementById('menu-opt-stranger-shield');
    if (optStrangerShield) {
      optStrangerShield.addEventListener('click', () => {
        if (threeDotsDropdown) threeDotsDropdown.classList.remove('active');
        this.openStrangerShieldModal();
      });
    }

    const optPrivacy = document.getElementById('menu-opt-privacy');
    if (optPrivacy) {
      optPrivacy.addEventListener('click', () => {
        if (threeDotsDropdown) threeDotsDropdown.classList.remove('active');
        this.openPrivacySettingsModal();
      });
    }

    // App Settings Modal Toggle (Direct Header Button & 3-Dots)
    const headerSettingsBtn = document.getElementById('btn-header-settings');
    const settingsBtn = document.getElementById('btn-open-settings');
    const settingsModal = document.getElementById('app-settings-modal');
    const closeSettingsBtn = document.getElementById('btn-close-settings');

    if (headerSettingsBtn) {
      headerSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    }
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openSettingsModal());
    }
    if (closeSettingsBtn && settingsModal) {
      closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
    }

    // News Flash Checkbox Toggles
    const flashCheckboxes = document.querySelectorAll('.news-flash-toggle-checkbox');
    flashCheckboxes.forEach(cb => {
      cb.addEventListener('change', (e) => {
        this.toggleNewsFlash(e.target.checked);
      });
    });

    // Create Group / New Chat Modal
    const newChatBtn = document.getElementById('btn-new-chat');
    const newChatModal = document.getElementById('new-chat-modal');
    const closeNewChatBtn = document.getElementById('btn-close-new-chat');
    const submitGroupBtn = document.getElementById('btn-submit-create-group');

    if (newChatBtn) {
      newChatBtn.addEventListener('click', () => this.openNewGroupModal());
    }
    if (closeNewChatBtn && newChatModal) {
      closeNewChatBtn.addEventListener('click', () => newChatModal.classList.remove('active'));
    }
    if (submitGroupBtn) {
      submitGroupBtn.addEventListener('click', () => this.createCustomGroup());
    }

    // Profile Modal Open & Close Handlers
    const profileAvatarTop = document.getElementById('current-user-avatar');
    const closeProfileBtn = document.getElementById('btn-close-profile-modal');
    if (profileAvatarTop) {
      profileAvatarTop.addEventListener('click', () => {
        if (window.AuthManager) window.AuthManager.openProfileModal();
      });
    }
    if (closeProfileBtn) {
      closeProfileBtn.addEventListener('click', () => {
        const modal = document.getElementById('user-profile-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Status Privacy Close Handler
    const closeStatusPrivacyBtn = document.getElementById('btn-close-status-privacy');
    if (closeStatusPrivacyBtn) {
      closeStatusPrivacyBtn.addEventListener('click', () => {
        const modal = document.getElementById('status-privacy-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Video Privacy Contacts Close Handler
    const closeVideoPrivacyBtn = document.getElementById('btn-close-video-privacy-modal');
    if (closeVideoPrivacyBtn) {
      closeVideoPrivacyBtn.addEventListener('click', () => {
        const modal = document.getElementById('video-privacy-contacts-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // File Privacy Contacts Close Handler
    const closeFilePrivacyBtn = document.getElementById('btn-close-file-privacy-modal');
    if (closeFilePrivacyBtn) {
      closeFilePrivacyBtn.addEventListener('click', () => {
        const modal = document.getElementById('file-privacy-contacts-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Settings Modal Exit/Close Handlers (Top X, Top Back, Bottom Exit)
    ['btn-close-settings', 'btn-back-settings', 'btn-footer-exit-settings'].forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => {
          const modal = document.getElementById('app-settings-modal');
          if (modal) modal.classList.remove('active');
        });
      }
    });

    // Global Modal Backdrop Click to Dismiss
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Global ESC Key to Close Active Modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
          modal.classList.remove('active');
        });
      }
    });

    // Schedule New Meeting button in tab
    const scheduleNewMeetingBtn = document.getElementById('btn-schedule-new-meeting-tab');
    if (scheduleNewMeetingBtn) {
      scheduleNewMeetingBtn.addEventListener('click', () => {
        const modal = document.getElementById('schedule-meeting-modal');
        if (modal) modal.classList.add('active');
      });
    }

    // Compose Memo button in tab
    const composeMemoBtn = document.getElementById('btn-compose-memo-tab');
    if (composeMemoBtn) {
      composeMemoBtn.addEventListener('click', () => {
        this.openComposeMemoModal();
      });
    }
  }

  initBackNavigation() {
    // 1. Native Capacitor Hardware / Gesture Back Button Handler
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.addListener('backButton', () => {
        this.handleGlobalBack();
      });
    }

    // 2. Web / Browser History Back Stack Handler
    window.addEventListener('popstate', () => {
      this.handleGlobalBack();
    });
  }

  handleGlobalBack() {
    // Priority 1: Close active 3-dots dropdown menu or drilldown sub-panel
    const threeDotsDropdown = document.getElementById('main-three-dots-dropdown');
    if (threeDotsDropdown && threeDotsDropdown.classList.contains('active')) {
      const activePanel = document.querySelector('.dropdown-panel.active');
      if (activePanel && activePanel.id !== 'menu-panel-root') {
        this.drillDownMenu('root');
        return true;
      }
      threeDotsDropdown.classList.remove('active');
      return true;
    }

    // Priority 2: Close active modals (top-most active modal first)
    const activeModals = document.querySelectorAll('.modal.active, .custom-modal.active, .lightbox-modal.active');
    if (activeModals.length > 0) {
      const topModal = activeModals[activeModals.length - 1];
      topModal.classList.remove('active');
      return true;
    }

    // Priority 3: Close active mobile chat view and return to chat list
    const chatMainArea = document.getElementById('chat-main-area');
    if (chatMainArea && chatMainArea.classList.contains('mobile-active')) {
      chatMainArea.classList.remove('mobile-active');
      if (window.ChatEngine) {
        window.ChatEngine.activeChatId = null;
      }
      return true;
    }

    // Priority 4: Return to 'chats' root tab if on a sub-tab
    if (this.currentTab !== 'chats') {
      this.switchTab('chats');
      return true;
    }

    // Priority 5: If on root chat list, exit or minimize
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.exitApp();
    }
    return false;
  }

  drillDownMenu(panelName = 'root') {
    document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`menu-panel-${panelName}`);
    if (target) {
      target.classList.add('active');
    }
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    sessionStorage.setItem('gitpit_active_tab', tabName);

    // Close 3-dots dropdown if open
    const threeDotsDropdown = document.getElementById('main-three-dots-dropdown');
    if (threeDotsDropdown) threeDotsDropdown.classList.remove('active');

    // Update Tab Navigation Active State
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
    });

    // Switch View Containers
    document.querySelectorAll('.tab-view').forEach(v => {
      v.classList.remove('active');
    });

    const targetView = document.getElementById(`tab-view-${tabName}`);
    if (targetView) {
      targetView.classList.add('active');
    }

    if (tabName === 'payments' && window.PaymentManager) {
      window.PaymentManager.renderPaymentsTab();
    }
    if (tabName === 'meetings') {
      this.renderMeetingsTab();
    }
    if (tabName === 'email') {
      this.renderEmailTab();
    }
    if (tabName === 'news' && window.NewsService) {
      window.NewsService.fetchArticles(window.NewsService.activeCategory || 'All');
    }
    if (tabName === 'settings') {
      this.renderSettingsTab();
    }

    if (window.I18N) {
      window.I18N.applyTranslations(window.I18N.currentLang);
    }
  }

  renderSettingsTab() {
    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const avatarImg = document.getElementById('settings-tab-user-avatar');
    const nameElem = document.getElementById('settings-tab-user-name');
    const phoneElem = document.getElementById('settings-tab-user-phone');

    if (currentUser) {
      if (avatarImg) avatarImg.src = currentUser.avatar || 'assets/logo-icon.svg';
      if (nameElem) nameElem.textContent = currentUser.name || 'My Profile';
      if (phoneElem) phoneElem.textContent = currentUser.phone ? `${currentUser.phone} (Verified)` : '+91 Verified Account';
    }
  }

  renderMeetingsTab() {
    const container = document.getElementById('meetings-list-items');
    if (!container) return;

    if (this.meetings.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">No scheduled meetings.</div>`;
      return;
    }

    container.innerHTML = this.meetings.map(m => `
      <div class="meeting-item-card" id="meeting-card-${m.id}">
        <div class="meeting-card-top">
          <div class="meeting-host-info">
            <img class="avatar-img" style="width: 38px; height: 38px;" src="${m.avatar}" alt="${m.host}">
            <div>
              <div class="meeting-card-title">${m.title}</div>
              <div style="font-size: 11.5px; color: var(--text-muted);">Host: ${m.host} • ${m.duration}</div>
            </div>
          </div>
        </div>
        <div class="meeting-card-time">
          <span>🕒</span> <span>${m.date} at ${m.time}</span>
        </div>
        <div class="meeting-actions-row">
          <button class="btn-join-meeting-small" onclick="window.ChatterApp.joinMeeting('${m.title}', '${m.host}', '${m.avatar}')">
            📹 Join Call
          </button>
          <button class="btn-cancel-meeting-small" onclick="window.ChatterApp.cancelMeeting('${m.id}')">
            Cancel
          </button>
        </div>
      </div>
    `).join('');
  }

  joinMeeting(title, host, avatar, meetingId) {
    if (window.CallManager) {
      window.CallManager.startCall(title, avatar, 'video');
    }
    this.meetings = this.meetings.filter(m => m.id !== meetingId);
    localStorage.setItem('chatterpatter_meetings', JSON.stringify(this.meetings));
    this.renderMeetingsTab();

    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || '';
      fetch(`${base}/api/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
    } catch(e) {}
  }

  saveMeetings() {
    localStorage.setItem('chatterpatter_meetings', JSON.stringify(this.meetings));
  }

  saveMemos() {
    localStorage.setItem('chatterpatter_memos', JSON.stringify(this.emailMemos));
  }

  async loadMeetingsFromServer() {
    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || '';
      const resp = await fetch(`${base}/api/meetings`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        this.meetings = data;
        localStorage.setItem('chatterpatter_meetings', JSON.stringify(this.meetings));
        this.renderMeetingsTab();
      }
    } catch (e) {}
  }

  async loadMemosFromServer() {
    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || '';
      const resp = await fetch(`${base}/api/memos`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        this.emailMemos = data;
        localStorage.setItem('chatterpatter_memos', JSON.stringify(this.emailMemos));
        this.renderEmailTab();
      }
    } catch (e) {}
  }

  renderEmailTab() {
    const container = document.getElementById('memos-list-items');
    if (!container) return;

    if (this.emailMemos.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">No memos in inbox.</div>`;
      return;
    }

    container.innerHTML = this.emailMemos.map(memo => `
      <div class="memo-item-card" onclick="window.ChatterApp.openMemoDetail('${memo.id}')">
        <div class="memo-top-row">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img class="avatar-img" style="width: 32px; height: 32px;" src="${memo.senderAvatar || 'assets/logo-icon.svg'}" alt="${memo.sender}">
            <div>
              <div style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${memo.sender}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${memo.time}</div>
            </div>
          </div>
          <span class="email-priority-pill ${memo.priority === 'urgent' ? 'priority-urgent' : 'priority-normal'}">
            ${memo.priority}
          </span>
        </div>
        <div class="memo-subject-text">${memo.subject}</div>
        <div class="memo-body-preview">${memo.body}</div>
      </div>
    `).join('');
  }

  openMemoDetail(memoId) {
    const memo = this.emailMemos.find(m => m.id === memoId);
    if (!memo) return;

    this.activeMemo = memo;

    const modal = document.getElementById('memo-detail-modal');
    if (!modal) return;

    document.getElementById('memo-modal-subject').textContent = memo.subject;
    document.getElementById('memo-modal-sender').textContent = memo.sender;
    document.getElementById('memo-modal-time').textContent = memo.time;
    document.getElementById('memo-modal-avatar').src = memo.senderAvatar || 'assets/logo-icon.svg';
    document.getElementById('memo-modal-body').textContent = memo.body;

    const priorityElem = document.getElementById('memo-modal-priority');
    if (priorityElem) {
      priorityElem.textContent = memo.priority.toUpperCase();
      priorityElem.className = `email-priority-pill ${memo.priority === 'urgent' ? 'priority-urgent' : 'priority-normal'}`;
    }

    modal.classList.add('active');
  }

  deleteCurrentMemo() {
    if (!this.activeMemo) return;
    if (!confirm(`Delete memo: "${this.activeMemo.subject}"?`)) return;

    const memoId = this.activeMemo.id;
    this.emailMemos = this.emailMemos.filter(m => m.id !== memoId);
    localStorage.setItem('chatterpatter_memos', JSON.stringify(this.emailMemos));
    this.renderEmailTab();

    const modal = document.getElementById('memo-detail-modal');
    if (modal) modal.classList.remove('active');

    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || '';
      fetch(`${base}/api/memos/${memoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
    } catch(e) {}
  }

  replyToCurrentMemo() {
    if (!this.activeMemo) return;
    const modal = document.getElementById('memo-detail-modal');
    if (modal) modal.classList.remove('active');

    this.switchTab('chats');
    if (window.ChatEngine) {
      window.ChatEngine.openChat('chat_ai');
      const input = document.getElementById('chat-message-input');
      if (input) {
        input.value = `Re: ${this.activeMemo.subject} - `;
        input.focus();
      }
    }
  }

  cancelMeeting(meetingId) {
    this.meetings = this.meetings.filter(m => m.id !== meetingId);
    localStorage.setItem('chatterpatter_meetings', JSON.stringify(this.meetings));
    this.renderMeetingsTab();
  }

  openComposeMemoModal() {
    const modal = document.getElementById('compose-memo-modal');
    if (modal) modal.classList.add('active');
  }

  updateMemoWordCount(textarea) {
    if (!textarea) return;
    const text = textarea.value.trim();
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const counter = document.getElementById('memo-word-counter');
    if (counter) {
      counter.textContent = `${wordCount} / 500 words`;
      if (wordCount > 500) {
        counter.style.color = 'var(--brand-danger, #ef4444)';
        counter.style.fontWeight = '800';
      } else {
        counter.style.color = 'var(--text-muted, #8696a0)';
        counter.style.fontWeight = '600';
      }
    }
  }

  async submitComposeMemo() {
    const recipInput = document.getElementById('compose-memo-recipient');
    const subjInput = document.getElementById('compose-memo-subject');
    const prioInput = document.getElementById('compose-memo-priority');
    const bodyInput = document.getElementById('compose-memo-body');

    const recipient = recipInput ? recipInput.value.trim() : '';
    const subject = subjInput ? subjInput.value.trim() : '';
    const priority = prioInput ? prioInput.value : 'normal';
    const body = bodyInput ? bodyInput.value.trim() : '';

    // Requirement 7: Mandatory Email Format Validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!recipient || !emailPattern.test(recipient)) {
      alert('⚠️ Please enter a valid recipient email address (e.g. user@gmail.com).');
      if (recipInput) recipInput.focus();
      return;
    }

    if (!subject || !body) {
      alert('Please fill in both Subject and Message Body.');
      return;
    }

    // Requirement 7: Enforce 500 Words Maximum Limit
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    if (wordCount > 500) {
      alert(`⚠️ Memo body exceeds the 500-word limit (${wordCount} words). Please shorten your message.`);
      if (bodyInput) bodyInput.focus();
      return;
    }

    const reminderDateInput = document.getElementById('compose-memo-reminder-date');
    const reminderTimeInput = document.getElementById('compose-memo-reminder-time');
    const reminderDate = reminderDateInput ? reminderDateInput.value : '';
    const reminderTime = reminderTimeInput ? reminderTimeInput.value : '';

    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    const newMemo = {
      id: 'memo_' + Date.now(),
      recipient: recipient,
      subject: subject,
      priority: priority,
      body: body,
      reminderAt: (reminderDate && reminderTime) ? `${reminderDate} ${reminderTime}` : null,
      sender: currentUser ? (currentUser.name || 'You') : 'You',
      senderAvatar: currentUser ? (currentUser.avatar || 'assets/logo-icon.svg') : 'assets/logo-icon.svg',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (reminderDate && reminderTime) {
      const reminderTs = new Date(`${reminderDate}T${reminderTime}`).getTime();
      const delay = reminderTs - Date.now();
      if (delay > 0) {
        setTimeout(() => {
          this.showInAppBanner(
            `⏰ Memo Reminder: ${subject}`,
            `Reminder for memo sent to ${recipient}`,
            newMemo.senderAvatar,
            () => this.switchTab('email')
          );
        }, Math.min(delay, 2147483647));
      }
    }

    this.emailMemos.unshift(newMemo);
    localStorage.setItem('chatterpatter_memos', JSON.stringify(this.emailMemos));
    this.renderEmailTab();

    // Persist to backend server
    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || '';
      await fetch(`${base}/api/memos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(newMemo)
      });
    } catch (e) {}

    const modal = document.getElementById('compose-memo-modal');
    if (modal) modal.classList.remove('active');
    if (recipInput) recipInput.value = '';
    if (subjInput) subjInput.value = '';
    if (bodyInput) bodyInput.value = '';
    if (reminderDateInput) reminderDateInput.value = '';
    if (reminderTimeInput) reminderTimeInput.value = '';
    const counter = document.getElementById('memo-word-counter');
    if (counter) counter.textContent = '0 / 500 words';

    alert(`✉️ Memo "${subject}" sent to ${recipient}${newMemo.reminderAt ? ` (Reminder set for ${newMemo.reminderAt})` : ''} successfully!`);
  }

  // ================= IN-APP NOTIFICATION BANNER =================
  showInAppBanner(title, message, avatar, onClickHandler) {
    const banner = document.getElementById('in-app-notification-banner');
    if (!banner) return;
    const titleEl = document.getElementById('in-app-banner-title');
    const msgEl = document.getElementById('in-app-banner-msg');
    const avatarEl = document.getElementById('in-app-banner-avatar');
    if (titleEl) titleEl.textContent = title || 'GitPit Notification';
    if (msgEl) msgEl.textContent = message || 'New message received';
    if (avatarEl) avatarEl.src = avatar || 'assets/logo-icon.svg';

    this.inAppBannerClickHandler = onClickHandler;
    banner.style.display = 'flex';
    setTimeout(() => banner.classList.add('show'), 10);

    // Pleasant notification chime
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}

    clearTimeout(this.inAppBannerTimer);
    this.inAppBannerTimer = setTimeout(() => this.dismissInAppBanner(), 4500);
  }

  dismissInAppBanner() {
    const banner = document.getElementById('in-app-notification-banner');
    if (banner) {
      banner.classList.remove('show');
      setTimeout(() => { banner.style.display = 'none'; }, 350);
    }
  }

  handleInAppBannerClick() {
    if (this.inAppBannerClickHandler) {
      this.inAppBannerClickHandler();
    }
    this.dismissInAppBanner();
  }

  startScreenSharing() {
    if (window.CallManager) {
      window.CallManager.startCall('Screen Sharing Room', 'assets/logo-icon.svg', 'video');
      setTimeout(() => {
        if (window.CallManager && !window.CallManager.isScreenSharing) {
          window.CallManager.toggleScreenShare();
        }
      }, 1200);
    }
  }

  openNotificationsModal() {
    const modal = document.getElementById('notifications-settings-modal');
    if (modal) modal.classList.add('active');
  }

  saveNotificationSettings() {
    const sound = document.getElementById('setting-sound-alerts')?.checked ?? true;
    const push = document.getElementById('setting-push-alerts')?.checked ?? true;
    const ringtone = document.getElementById('setting-call-ringtone')?.checked ?? true;

    localStorage.setItem('gitpit_notify_sound', sound.toString());
    localStorage.setItem('gitpit_notify_push', push.toString());
    localStorage.setItem('gitpit_notify_ringtone', ringtone.toString());

    const modal = document.getElementById('notifications-settings-modal');
    if (modal) modal.classList.remove('active');
    alert('✓ Notification preferences saved successfully!');
  }

  openChatPreferencesModal() {
    const modal = document.getElementById('chat-preferences-modal');
    if (modal) modal.classList.add('active');
  }

  toggleTheme() {
    this.isDarkTheme = !this.isDarkTheme;
    document.body.classList.toggle('light-theme', !this.isDarkTheme);
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.textContent = this.isDarkTheme ? '☀️' : '🌙';
    }
    localStorage.setItem('chatterpatter_theme', this.isDarkTheme ? 'dark' : 'light');
  }

  toggleNewsFlash(isOn) {
    this.isNewsFlashOn = isOn;
    const tickerBar = document.getElementById('news-flash-ticker-bar');
    if (tickerBar) {
      tickerBar.style.display = isOn ? 'flex' : 'none';
    }
    document.querySelectorAll('.news-flash-toggle-checkbox').forEach(cb => cb.checked = isOn);
    const label = document.getElementById('news-flash-status-label');
    if (label) label.textContent = isOn ? 'ON' : 'OFF';

    localStorage.setItem('chatterpatter_news_flash', isOn.toString());
  }

  openNewGroupModal() {
    const modal = document.getElementById('new-chat-modal');
    const container = document.getElementById('group-members-checklist');
    if (!modal) return;

    if (container) {
      const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};
      const currentUserId = window.AuthManager && window.AuthManager.currentUser ? window.AuthManager.currentUser.id : null;
      const contactsMap = new Map();

      // 1. Registered Users
      if (window.ChatEngine && Array.isArray(window.ChatEngine.registeredUsers)) {
        window.ChatEngine.registeredUsers.forEach(u => {
          if (currentUserId && u.id === currentUserId) return;
          const cleanPhone = (u.phone || '').replace(/\D/g, '').slice(-10);
          const saved = phonebook[u.id] || (cleanPhone ? phonebook[cleanPhone] : null);
          const name = saved ? saved.savedName : (u.name || (cleanPhone ? `+91 ${cleanPhone}` : 'Contact'));
          const avatar = (saved && (saved.photoUri || saved.avatar)) || u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanPhone || u.id}`;
          contactsMap.set(u.id || cleanPhone, { id: u.id, name, avatar, phone: u.phone });
        });
      }

      // 2. Phonebook Entries
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

      const list = Array.from(contactsMap.values());

      if (list.length === 0) {
        container.innerHTML = '<div style="padding: 10px; font-size: 12px; color: var(--text-muted); text-align: center;">No contacts found to add.</div>';
      } else {
        container.innerHTML = list.map(c => `
          <label style="display: flex; align-items: center; justify-content: space-between; padding: 7px 8px; background: var(--bg-card); border-radius: 6px; margin-bottom: 4px; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <img class="avatar-img" style="width: 32px; height: 32px;" src="${c.avatar}" alt="${c.name}">
              <div>
                <span style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${c.name}</span>
                ${c.phone ? `<div style="font-size: 11px; color: var(--text-muted);">${c.phone}</div>` : ''}
              </div>
            </div>
            <input type="checkbox" class="group-select-member" value="${c.name.replace(/"/g, '&quot;')}" data-id="${c.id}" style="width: 17px; height: 17px; accent-color: var(--brand-green);">
          </label>
        `).join('');
      }
    }

    modal.classList.add('active');
  }

  async createCustomGroup() {
    const input = document.getElementById('new-group-name');
    const groupName = input ? input.value.trim() : '';

    if (!groupName) {
      alert('Please enter a group name!');
      return;
    }

    const selectedMembers = ['You'];
    document.querySelectorAll('.group-select-member:checked').forEach(cb => {
      selectedMembers.push(cb.value);
    });

    const newGroup = {
      id: 'group_' + Date.now(),
      name: groupName,
      isGroup: true,
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(groupName)}`,
      unreadCount: 0,
      pinned: false,
      members: selectedMembers,
      messages: [
        {
          id: 'gm_' + Date.now(),
          senderId: 'system',
          senderName: 'System',
          text: `🎉 You created group "${groupName}" with ${selectedMembers.slice(1).join(', ') || 'members'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'read'
        }
      ]
    };

    if (window.ChatEngine) {
      window.ChatEngine.chats.unshift(newGroup);
      window.ChatEngine.saveChats();
      window.ChatEngine.renderChatList();
      window.ChatEngine.openChat(newGroup.id);
    }

    // Persist to backend server database
    try {
      const base = window.API_BASE || '';
      const token = localStorage.getItem('gitpit_auth_token') || '';
      await fetch(`${base}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(newGroup)
      });
    } catch (e) {
      console.warn('[GROUP] Group saved locally:', e.message);
    }

    const modal = document.getElementById('new-chat-modal');
    if (modal) modal.classList.remove('active');
    if (input) input.value = '';
    alert(`🎉 Group "${groupName}" created with ${selectedMembers.length} members!`);
  }

  openSettingsModal() {
    const modal = document.getElementById('app-settings-modal');
    if (!modal) return;

    // Load Group Privacy Setting
    const groupPrivacy = localStorage.getItem('gitpit_group_privacy') || 'approval';
    const groupSelect = document.getElementById('setting-group-privacy-select');
    if (groupSelect) groupSelect.value = groupPrivacy;

    // Load Video Call Privacy Setting
    const videoPrivacy = localStorage.getItem('gitpit_video_call_privacy') || 'contacts';
    const videoSelect = document.getElementById('setting-video-call-privacy');
    if (videoSelect) videoSelect.value = videoPrivacy;
    const videoConfigBtn = document.getElementById('btn-configure-video-contacts');
    if (videoConfigBtn) videoConfigBtn.style.display = videoPrivacy === 'selected' ? 'block' : 'none';

    // Load File Receiving Privacy Setting
    const filePrivacy = localStorage.getItem('gitpit_file_receiving_privacy') || 'contacts';
    const fileSelect = document.getElementById('setting-file-receiving-privacy');
    if (fileSelect) fileSelect.value = filePrivacy;
    const fileConfigBtn = document.getElementById('btn-configure-file-contacts');
    if (fileConfigBtn) fileConfigBtn.style.display = filePrivacy === 'selected' ? 'block' : 'none';

    // Load Unknown Media Setting (Anti-Fraud Stranger Shield)
    const restrictMedia = localStorage.getItem('gitpit_restrict_unknown_media') !== 'false';
    const mediaCb = document.getElementById('setting-restrict-unknown-media');
    if (mediaCb) mediaCb.checked = restrictMedia;

    // Load Language Setting
    const savedLang = localStorage.getItem('gitpit_language') || 'en';
    const langSelect = document.getElementById('settings-language-select');
    if (langSelect) langSelect.value = savedLang;

    // Render Blocked Contacts List
    if (window.ChatEngine) {
      window.ChatEngine.renderSettingsBlockedList();
      window.ChatEngine.renderSettingsVideoBlockedList();
    }

    modal.classList.add('active');
  }

  openStatusPrivacyModal() {
    const modal = document.getElementById('status-privacy-modal');
    if (!modal) return;

    const privacyType = localStorage.getItem('gitpit_status_privacy_type') || 'contacts';
    const radio = document.querySelector(`input[name="status-privacy-type"][value="${privacyType}"]`);
    if (radio) radio.checked = true;

    this.handleStatusPrivacyTypeChange(privacyType);
    modal.classList.add('active');
  }

  handleStatusPrivacyTypeChange(type) {
    const checklistContainer = document.getElementById('status-privacy-checklist-container');
    const checklistTitle = document.getElementById('status-privacy-checklist-title');
    const listElem = document.getElementById('status-privacy-contacts-list');
    if (!checklistContainer || !listElem) return;

    if (type === 'contacts_except' || type === 'only_share_with') {
      checklistContainer.style.display = 'block';
      checklistTitle.textContent = type === 'contacts_except'
        ? '🚫 Hide status from (Select contacts):'
        : '🔒 Share status only with (Select contacts):';

      const selected = JSON.parse(localStorage.getItem('gitpit_status_privacy_selected_contacts') || '[]');
      const contacts = window.ChatEngine ? window.ChatEngine.chats.filter(c => !c.isGroup && !c.isAi) : [];

      listElem.innerHTML = contacts.map(c => `
        <label class="status-contact-check-row">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${c.avatar}" style="width: 28px; height: 28px; border-radius: 50%;">
            <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${c.name}</span>
          </div>
          <input type="checkbox" class="status-privacy-contact-cb" value="${c.id}" ${selected.includes(c.id) ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--brand-blue);">
        </label>
      `).join('') || '<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">No contacts found.</div>';
    } else {
      checklistContainer.style.display = 'none';
    }
  }

  saveStatusPrivacy() {
    const selectedRadio = document.querySelector('input[name="status-privacy-type"]:checked');
    const privacyType = selectedRadio ? selectedRadio.value : 'contacts';

    const selectedContacts = [];
    document.querySelectorAll('.status-privacy-contact-cb:checked').forEach(cb => {
      selectedContacts.push(cb.value);
    });

    localStorage.setItem('gitpit_status_privacy_type', privacyType);
    localStorage.setItem('gitpit_status_privacy_selected_contacts', JSON.stringify(selectedContacts));

    let typeLabel = 'My Contacts';
    if (privacyType === 'everyone') typeLabel = 'Everyone (To All)';
    else if (privacyType === 'contacts_except') typeLabel = `My Contacts Except (${selectedContacts.length} excluded)`;
    else if (privacyType === 'only_share_with') typeLabel = `Only Share With (${selectedContacts.length} selected)`;

    alert(`✅ Status Privacy updated to: ${typeLabel}`);
    const modal = document.getElementById('status-privacy-modal');
    if (modal) modal.classList.remove('active');
  }

  handleVideoPrivacyChange(value) {
    localStorage.setItem('gitpit_video_call_privacy', value);
    const btn = document.getElementById('btn-configure-video-contacts');
    if (btn) btn.style.display = value === 'selected' ? 'block' : 'none';

    if (value === 'selected') {
      this.openVideoPrivacyContactsModal();
    } else {
      let label = 'My Contacts Only';
      if (value === 'everyone') label = 'Everyone (To All)';
      if (value === 'nobody') label = 'Nobody (Block All Video Calls)';
      alert(`✅ Video Call Privacy set to: ${label}`);
    }
  }

  openVideoPrivacyContactsModal() {
    const modal = document.getElementById('video-privacy-contacts-modal');
    const listElem = document.getElementById('video-privacy-contacts-list');
    if (!modal || !listElem) return;

    const allowed = JSON.parse(localStorage.getItem('gitpit_allowed_video_contacts') || '[]');
    const contacts = window.ChatEngine ? window.ChatEngine.chats.filter(c => !c.isGroup && !c.isAi) : [];

    listElem.innerHTML = contacts.map(c => `
      <label class="status-contact-check-row">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${c.avatar}" style="width: 28px; height: 28px; border-radius: 50%;">
          <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${c.name}</span>
        </div>
        <input type="checkbox" class="video-allowed-contact-cb" value="${c.id}" ${allowed.includes(c.id) ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--brand-blue);">
      </label>
    `).join('') || '<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">No contacts found.</div>';

    modal.classList.add('active');
  }

  saveVideoPrivacyContacts() {
    const allowed = [];
    document.querySelectorAll('.video-allowed-contact-cb:checked').forEach(cb => {
      allowed.push(cb.value);
    });
    localStorage.setItem('gitpit_allowed_video_contacts', JSON.stringify(allowed));
    alert(`✅ ${allowed.length} contact(s) allowed for Video Calls.`);
    const modal = document.getElementById('video-privacy-contacts-modal');
    if (modal) modal.classList.remove('active');
  }

  handleFilePrivacyChange(value) {
    localStorage.setItem('gitpit_file_receiving_privacy', value);
    const btn = document.getElementById('btn-configure-file-contacts');
    if (btn) btn.style.display = value === 'selected' ? 'block' : 'none';

    if (value === 'selected') {
      this.openFilePrivacyContactsModal();
    } else {
      let label = 'My Contacts Only';
      if (value === 'everyone') label = 'Everyone (To All)';
      if (value === 'nobody') label = 'Nobody (Block All File Attachments)';
      alert(`✅ File Receiving Privacy set to: ${label}`);
    }
  }

  openFilePrivacyContactsModal() {
    const modal = document.getElementById('file-privacy-contacts-modal');
    const listElem = document.getElementById('file-privacy-contacts-list');
    if (!modal || !listElem) return;

    const allowed = JSON.parse(localStorage.getItem('gitpit_allowed_file_contacts') || '[]');
    const contacts = window.ChatEngine ? window.ChatEngine.chats.filter(c => !c.isGroup && !c.isAi) : [];

    listElem.innerHTML = contacts.map(c => `
      <label class="status-contact-check-row">
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${c.avatar}" style="width: 28px; height: 28px; border-radius: 50%;">
          <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${c.name}</span>
        </div>
        <input type="checkbox" class="file-allowed-contact-cb" value="${c.id}" ${allowed.includes(c.id) ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--brand-blue);">
      </label>
    `).join('') || '<div style="color: var(--text-muted); font-size: 12px; padding: 10px;">No contacts found.</div>';

    modal.classList.add('active');
  }

  saveFilePrivacyContacts() {
    const allowed = [];
    document.querySelectorAll('.file-allowed-contact-cb:checked').forEach(cb => {
      allowed.push(cb.value);
    });
    localStorage.setItem('gitpit_allowed_file_contacts', JSON.stringify(allowed));
    alert(`✅ ${allowed.length} contact(s) allowed for File & Media transfers.`);
    const modal = document.getElementById('file-privacy-contacts-modal');
    if (modal) modal.classList.remove('active');
  }

  openPrivacySettingsModal() {
    if (window.AuthManager && typeof window.AuthManager.openPrivacySettingsModal === 'function') {
      window.AuthManager.openPrivacySettingsModal();
    } else {
      const modal = document.getElementById('privacy-settings-modal');
      if (modal) modal.classList.add('active');
    }
  }

  openStrangerShieldModal() {
    if (window.AuthManager && typeof window.AuthManager.openStrangerShieldModal === 'function') {
      window.AuthManager.openStrangerShieldModal();
    } else {
      const modal = document.getElementById('stranger-shield-modal');
      if (modal) modal.classList.add('active');
    }
  }

  openNotificationsModal() {
    const modal = document.getElementById('notifications-settings-modal');
    if (modal) modal.classList.add('active');
  }

  saveNotificationSettings() {
    const sound = document.getElementById('setting-sound-alerts')?.checked !== false;
    const push = document.getElementById('setting-push-alerts')?.checked !== false;
    const callRing = document.getElementById('setting-call-ringtone')?.checked !== false;

    localStorage.setItem('gitpit_sound_alerts', sound ? 'true' : 'false');
    localStorage.setItem('gitpit_push_alerts', push ? 'true' : 'false');
    localStorage.setItem('gitpit_call_ringtone', callRing ? 'true' : 'false');

    const modal = document.getElementById('notifications-settings-modal');
    if (modal) modal.classList.remove('active');
    alert('✅ Notification settings saved successfully!');
  }

  openChatPreferencesModal() {
    const modal = document.getElementById('chat-preferences-modal');
    if (modal) modal.classList.add('active');
  }

  openScheduleMeetingModal() {
    const modal = document.getElementById('schedule-meeting-modal');
    if (modal) modal.classList.add('active');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.ChatterApp = new ChatterApp();
});
