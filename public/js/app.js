// ChatterPatter - Main Application Controller & Tab Navigation

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
    this.renderMeetingsTab();
    this.renderEmailTab();
  }

  promptInstallPWA() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          alert('🎉 ChatterPatter app installed on your device Home Screen!');
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
        this.socket = io();
        this.socket.on('connect', () => {
          console.log('⚡ Connected to ChatterPatter Socket.io Server:', this.socket.id);
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
            textElem.textContent = `🚨 ${news.title} (${news.source || 'ChatterPatter'})`;
          }
        });
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
        threeDotsDropdown.classList.toggle('active');
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
        if (window.ChatEngine) window.ChatEngine.openMeetingModal();
      });
    }

    // Compose Memo button in tab
    const composeMemoBtn = document.getElementById('btn-compose-memo-tab');
    if (composeMemoBtn) {
      composeMemoBtn.addEventListener('click', () => {
        if (window.ChatEngine) window.ChatEngine.openEmailMemoModal();
      });
    }
  }

  switchTab(tabName) {
    this.currentTab = tabName;

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

    if (window.I18N) {
      window.I18N.applyTranslations(window.I18N.currentLang);
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

  joinMeeting(title, host, avatar) {
    if (window.CallManager) {
      window.CallManager.startCall(title, avatar, 'video');
    }
  }

  cancelMeeting(meetingId) {
    this.meetings = this.meetings.filter(m => m.id !== meetingId);
    localStorage.setItem('chatterpatter_meetings', JSON.stringify(this.meetings));
    this.renderMeetingsTab();
  }

  renderEmailTab() {
    const container = document.getElementById('memos-list-items');
    if (!container) return;

    if (this.emailMemos.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">No memos in inbox.</div>`;
      return;
    }

    container.innerHTML = this.emailMemos.map(memo => `
      <div class="memo-item-card" onclick="alert('Subject: ${memo.subject.replace(/'/g, "\\'")}\\n\\nFrom: ${memo.sender}\\n\\n${memo.body.replace(/'/g, "\\'")}')">
        <div class="memo-top-row">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img class="avatar-img" style="width: 32px; height: 32px;" src="${memo.senderAvatar}" alt="${memo.sender}">
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

    if (container && window.ChatEngine) {
      const regularChats = window.ChatEngine.chats.filter(c => !c.isGroup && !c.isAi);
      container.innerHTML = regularChats.map(c => `
        <label class="group-member-checkbox-item">
          <input type="checkbox" class="group-select-member" value="${c.name}" checked style="width: 17px; height: 17px; accent-color: var(--brand-green);">
          <img class="avatar-img" style="width: 32px; height: 32px;" src="${c.avatar}" alt="${c.name}">
          <span style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${c.name}</span>
        </label>
      `).join('');
    }

    modal.classList.add('active');
  }

  createCustomGroup() {
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
}

window.addEventListener('DOMContentLoaded', () => {
  window.ChatterApp = new ChatterApp();
});
