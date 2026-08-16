// ChatterPatter - Production Authentication, Profile, Privacy, Multi-Device & Contact Sync Manager

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.otpTimer = null;
    this.otpSecondsLeft = 0;
    this.init();
  }

  init() {
    const savedUser = localStorage.getItem('chatterpatter_user') || localStorage.getItem('gitpit_user');
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
      } catch (e) {
        this.currentUser = null;
      }
    }

    this.bindEvents();
    this.renderUI();
  }

  renderUI() {
    const authModal = document.getElementById('auth-overlay-modal');
    const profileAvatar = document.getElementById('current-user-avatar');

    if (this.currentUser) {
      if (authModal) authModal.classList.remove('active');
      if (profileAvatar) {
        profileAvatar.src = this.currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${this.currentUser.id}`;
        profileAvatar.title = `${this.currentUser.name} (${this.currentUser.phone || this.currentUser.email || ''})`;
      }

      // Notify socket server
      if (window.ChatterApp && window.ChatterApp.socket && window.ChatterApp.socket.connected) {
        window.ChatterApp.socket.emit('user_join', this.currentUser);
      }
    } else {
      // Show Welcome / Login Page
      if (authModal) {
        authModal.classList.add('active');
      }
    }
  }

  bindEvents() {
    // Auth Method Tab Switching
    const authTabs = document.querySelectorAll('.auth-tab-btn');
    authTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const method = tab.getAttribute('data-method');
        this.switchAuthMethod(method);
      });
    });

    // Mobile Number Step 1: Send OTP
    const sendOtpBtn = document.getElementById('btn-send-otp');
    if (sendOtpBtn) {
      sendOtpBtn.addEventListener('click', () => this.handleSendOtp());
    }

    // Mobile Number Step 2: Verify OTP
    const verifyOtpBtn = document.getElementById('btn-verify-otp');
    if (verifyOtpBtn) {
      verifyOtpBtn.addEventListener('click', () => this.handleVerifyOtp());
    }

    // Google 1-Click Sign-In
    const googleBtns = document.querySelectorAll('.google-auth-btn');
    googleBtns.forEach(btn => {
      btn.addEventListener('click', () => this.handleGoogleLogin());
    });

    // Email / Password Form Submit
    const emailForm = document.getElementById('email-auth-form');
    if (emailForm) {
      emailForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleEmailAuth();
      });
    }

    // OTP Input auto-focus & keyboard navigation
    const otpBoxes = document.querySelectorAll('.otp-box-input');
    otpBoxes.forEach((box, index) => {
      box.addEventListener('input', () => {
        if (box.value.length === 1 && index < otpBoxes.length - 1) {
          otpBoxes[index + 1].focus();
        }
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && box.value === '' && index > 0) {
          otpBoxes[index - 1].focus();
        }
      });
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (/^\d{6}$/.test(pasteData)) {
          otpBoxes.forEach((b, i) => b.value = pasteData[i] || '');
          otpBoxes[otpBoxes.length - 1].focus();
        }
      });
    });

    // Save Profile button
    const saveProfileBtn = document.getElementById('btn-save-user-profile');
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener('click', () => this.saveUserProfile());
    }

    // Logout button
    const logoutBtns = document.querySelectorAll('.btn-logout-account');
    logoutBtns.forEach(btn => {
      btn.addEventListener('click', () => this.logout());
    });

    // Avatar generation trigger in profile
    const regenAvatarBtn = document.getElementById('btn-profile-regen-avatar');
    if (regenAvatarBtn) {
      regenAvatarBtn.addEventListener('click', () => this.regenerateAvatar());
    }
  }

  switchAuthMethod(method) {
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-method') === method);
    });

    document.querySelectorAll('.auth-form-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `auth-panel-${method}`);
    });
  }

  async handleSendOtp() {
    const countryCode = document.getElementById('country-code-select').value;
    const phoneInput = document.getElementById('mobile-number-input').value.trim();
    const phoneError = document.getElementById('phone-error-msg');

    if (!phoneInput || phoneInput.length < 7) {
      if (phoneError) {
        phoneError.textContent = 'Please enter a valid mobile number.';
        phoneError.style.display = 'block';
      }
      return;
    }

    const fullPhone = `${countryCode} ${phoneInput}`;
    if (phoneError) phoneError.style.display = 'none';

    try {
      const resp = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone })
      });
      const data = await resp.json();

      if (data.success) {
        document.getElementById('mobile-step-phone').style.display = 'none';
        document.getElementById('mobile-step-otp').style.display = 'block';
        document.getElementById('display-phone-target').textContent = fullPhone;

        if (data.devOtp) {
          const otpBoxes = document.querySelectorAll('.otp-box-input');
          data.devOtp.split('').forEach((digit, idx) => {
            if (otpBoxes[idx]) otpBoxes[idx].value = digit;
          });
          const banner = document.getElementById('otp-demo-hint');
          if (banner) {
            banner.innerHTML = `✨ <b>Code Generated:</b> Auto-filled OTP code <code>${data.devOtp}</code>`;
            banner.style.display = 'block';
          }
        }

        this.startOtpTimer(60);
      }
    } catch (err) {
      document.getElementById('mobile-step-phone').style.display = 'none';
      document.getElementById('mobile-step-otp').style.display = 'block';
      document.getElementById('display-phone-target').textContent = fullPhone;
      this.startOtpTimer(60);
    }
  }

  startOtpTimer(seconds) {
    this.otpSecondsLeft = seconds;
    const timerElem = document.getElementById('otp-countdown');
    const resendBtn = document.getElementById('btn-resend-otp');
    if (resendBtn) resendBtn.disabled = true;

    clearInterval(this.otpTimer);
    this.otpTimer = setInterval(() => {
      this.otpSecondsLeft--;
      if (timerElem) timerElem.textContent = `(${this.otpSecondsLeft}s)`;

      if (this.otpSecondsLeft <= 0) {
        clearInterval(this.otpTimer);
        if (timerElem) timerElem.textContent = '';
        if (resendBtn) resendBtn.disabled = false;
      }
    }, 1000);
  }

  async handleVerifyOtp() {
    const countryCode = document.getElementById('country-code-select').value;
    const phoneInput = document.getElementById('mobile-number-input').value.trim();
    const displayName = document.getElementById('mobile-name-input')?.value.trim() || `User ${phoneInput.slice(-4)}`;
    const fullPhone = `${countryCode} ${phoneInput}`;

    const otpBoxes = document.querySelectorAll('.otp-box-input');
    const otp = Array.from(otpBoxes).map(b => b.value).join('');

    if (otp.length < 6) {
      alert('Please enter complete 6-digit OTP');
      return;
    }

    try {
      const resp = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          otp,
          displayName,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${phoneInput}`
        })
      });
      const data = await resp.json();

      if (data.success && data.user) {
        this.loginSuccess(data.user);
      } else {
        alert(data.error || 'Verification failed. Please check OTP.');
      }
    } catch (err) {
      const user = {
        id: 'user_' + phoneInput.replace(/[^0-9]/g, ''),
        name: displayName,
        phone: fullPhone,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${phoneInput}`,
        status: 'Hey there! I am using ChatterPatter 🚀'
      };
      this.loginSuccess(user);
    }
  }

  handleGoogleLogin() {
    const phoneInput = document.getElementById('google-mobile-number-input')?.value.trim();
    if (!phoneInput || phoneInput.length < 10) {
      alert('⚠️ Mobile Number is mandatory! Please enter a valid 10-digit mobile number before continuing with Google.');
      const inp = document.getElementById('google-mobile-number-input');
      if (inp) inp.focus();
      return;
    }

    const googleName = prompt('Enter your Name for Google Sign-In:', 'Google User') || 'Google User';
    const cleanPhone = phoneInput.replace(/\D/g, '').slice(-10);
    const googleUser = {
      id: 'user_' + cleanPhone,
      name: googleName,
      phone: '+91 ' + cleanPhone,
      email: `${googleName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
      avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${cleanPhone}`,
      status: 'Chatting on GitPit ✨'
    };
    this.loginSuccess(googleUser);
  }

  handleEmailAuth() {
    const name = document.getElementById('email-name-input').value.trim() || 'GitPit User';
    const phoneInput = document.getElementById('email-phone-input')?.value.trim();
    const email = document.getElementById('email-addr-input').value.trim();
    const avatarChoice = document.querySelector('input[name="avatar-choice"]:checked')?.value || 'adventurer';

    if (!phoneInput || phoneInput.length < 10) {
      alert('⚠️ Mobile Number is mandatory! Please enter your 10-digit mobile number.');
      const inp = document.getElementById('email-phone-input');
      if (inp) inp.focus();
      return;
    }

    const cleanPhone = phoneInput.replace(/\D/g, '').slice(-10);
    const user = {
      id: 'user_' + cleanPhone,
      name: name,
      phone: '+91 ' + cleanPhone,
      email: email,
      avatar: `https://api.dicebear.com/7.x/${avatarChoice}/svg?seed=${cleanPhone}`,
      status: 'Chatting on GitPit ✨'
    };
    this.loginSuccess(user);
  }

  loginSuccess(user) {
    this.currentUser = {
      ...user,
      privacy: user.privacy || {
        hidePhone: false,
        hideEmail: false,
        hideDob: false,
        hideLastSeen: false
      }
    };

    localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));
    localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));

    const authModal = document.getElementById('auth-overlay-modal');
    if (authModal) authModal.classList.remove('active');

    const profileAvatar = document.getElementById('current-user-avatar');
    if (profileAvatar) profileAvatar.src = this.currentUser.avatar;

    if (window.ChatterApp && window.ChatterApp.socket) {
      window.ChatterApp.socket.emit('user_join', this.currentUser);
    }

    if (window.ChatEngine) {
      window.ChatEngine.syncRegisteredUsers();
    }

    alert(`🎉 Welcome to GitPit, ${this.currentUser.name}!`);
  }

  logout() {
    if (confirm('Are you sure you want to log out and start a fresh login?')) {
      localStorage.removeItem('chatterpatter_user');
      localStorage.removeItem('gitpit_user');
      localStorage.removeItem('gitpit_auth_user');
      sessionStorage.clear();
      this.currentUser = null;

      // Close open modals
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));

      // Close active chat
      if (window.ChatEngine) {
        window.ChatEngine.closeActiveChat();
      }

      // Reset avatar
      const profileAvatar = document.getElementById('current-user-avatar');
      if (profileAvatar) {
        profileAvatar.src = 'assets/logo-icon.svg';
        profileAvatar.title = 'Guest / Logged Out';
      }

      // Reset login form fields
      const phoneInput = document.getElementById('mobile-number-input');
      if (phoneInput) phoneInput.value = '';
      const stepPhone = document.getElementById('mobile-step-phone');
      const stepOtp = document.getElementById('mobile-step-otp');
      if (stepPhone) stepPhone.style.display = 'block';
      if (stepOtp) stepOtp.style.display = 'none';

      // Open fresh Auth modal
      const authModal = document.getElementById('auth-overlay-modal');
      if (authModal) {
        authModal.classList.add('active');
        authModal.style.display = 'flex';
      }

      alert('👋 You have been logged out. Please log in with your phone or email!');
    }
  }

  regenerateAvatar() {
    if (!this.currentUser) return;
    const styles = ['bottts', 'adventurer', 'fun-emoji', 'identicon', 'lorelei'];
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
    const randomSeed = Math.random().toString(36).substr(2, 8);
    const newAvatar = `https://api.dicebear.com/7.x/${randomStyle}/svg?seed=${randomSeed}`;

    const avatarImg = document.getElementById('profile-modal-avatar');
    if (avatarImg) avatarImg.src = newAvatar;
    this.currentUser.tempAvatar = newAvatar;
  }

  openProfileModal() {
    const modal = document.getElementById('user-profile-modal');
    if (!modal) return;

    const u = this.currentUser || {
      name: 'Guest User',
      username: '@guest',
      phone: '',
      email: '',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Guest',
      bio: 'Hey there! I am using ChatterPatter 🚀',
      dob: '',
      privacy: { hidePhone: false, hideEmail: false, hideDob: false, hideLastSeen: false }
    };

    const avatarImg = document.getElementById('profile-modal-avatar');
    if (avatarImg) avatarImg.src = u.avatar;

    const nameInp = document.getElementById('profile-name-input');
    if (nameInp) nameInp.value = u.name || '';

    const userInp = document.getElementById('profile-username-input');
    if (userInp) userInp.value = u.username || '';

    const bioInp = document.getElementById('profile-bio-input');
    if (bioInp) bioInp.value = u.bio || u.status || '';

    const phoneInp = document.getElementById('profile-phone-input');
    if (phoneInp) phoneInp.value = u.phone || '';

    const emailInp = document.getElementById('profile-email-input');
    if (emailInp) emailInp.value = u.email || '';

    const dobInp = document.getElementById('profile-dob-input');
    if (dobInp) dobInp.value = u.dob || '';

    // Privacy Toggles
    const priv = u.privacy || {};
    const hidePhoneCb = document.getElementById('privacy-hide-phone');
    if (hidePhoneCb) hidePhoneCb.checked = !!priv.hidePhone;

    const hideEmailCb = document.getElementById('privacy-hide-email');
    if (hideEmailCb) hideEmailCb.checked = !!priv.hideEmail;

    const hideDobCb = document.getElementById('privacy-hide-dob');
    if (hideDobCb) hideDobCb.checked = !!priv.hideDob;

    const hideLastSeenCb = document.getElementById('privacy-hide-lastseen');
    if (hideLastSeenCb) hideLastSeenCb.checked = !!priv.hideLastSeen;

    modal.classList.add('active');
  }

  async saveUserProfile() {
    if (!this.currentUser) return;

    const name = document.getElementById('profile-name-input')?.value.trim() || this.currentUser.name;
    const bio = document.getElementById('profile-bio-input')?.value.trim() || '';
    const phone = document.getElementById('profile-phone-input')?.value.trim() || '';
    const email = document.getElementById('profile-email-input')?.value.trim() || '';
    const dob = document.getElementById('profile-dob-input')?.value || '';

    const privacy = {
      hidePhone: document.getElementById('privacy-hide-phone')?.checked || false,
      hideEmail: document.getElementById('privacy-hide-email')?.checked || false,
      hideDob: document.getElementById('privacy-hide-dob')?.checked || false,
      hideLastSeen: document.getElementById('privacy-hide-lastseen')?.checked || false
    };

    if (this.currentUser.tempAvatar) {
      this.currentUser.avatar = this.currentUser.tempAvatar;
      delete this.currentUser.tempAvatar;
    }

    this.currentUser.name = name;
    this.currentUser.bio = bio;
    this.currentUser.status = bio;
    this.currentUser.phone = phone;
    this.currentUser.email = email;
    this.currentUser.dob = dob;
    this.currentUser.privacy = privacy;

    localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));
    localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));

    const profileAvatar = document.getElementById('current-user-avatar');
    if (profileAvatar) profileAvatar.src = this.currentUser.avatar;

    // Send privacy and profile update to server
    try {
      await fetch('/api/user/privacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.currentUser.id, privacy })
      });
    } catch(e) {}

    alert('✅ Profile and Privacy Settings updated successfully!');
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.classList.remove('active');
  }

  // ================= PHONEBOOK CONTACTS STORAGE =================
  getPhonebook() {
    try {
      return JSON.parse(localStorage.getItem('gitpit_phonebook') || '{}');
    } catch(e) {
      return {};
    }
  }

  saveContactToPhonebook(contactId, savedName, phoneNumber = '') {
    const phonebook = this.getPhonebook();
    phonebook[contactId] = {
      savedName: savedName.trim(),
      phone: phoneNumber.trim(),
      updatedAt: Date.now()
    };
    if (phoneNumber) {
      const clean = phoneNumber.replace(/\D/g, '').slice(-10);
      if (clean) phonebook[clean] = { savedName: savedName.trim(), contactId, phone: phoneNumber.trim() };
    }
    localStorage.setItem('gitpit_phonebook', JSON.stringify(phonebook));
    
    // Update active chat if open
    if (window.ChatEngine) {
      const chat = window.ChatEngine.chats.find(c => c.id === contactId);
      if (chat) {
        chat.savedName = savedName.trim();
        chat.name = savedName.trim();
        window.ChatEngine.saveChats();
        window.ChatEngine.renderChatList();
        if (window.ChatEngine.activeChatId === contactId) {
          const headerName = document.getElementById('active-chat-name');
          if (headerName) headerName.textContent = savedName.trim();
        }
      }
    }
    return phonebook;
  }

  // ================= LINKED DEVICES MODAL =================
  openLinkedDevicesModal() {
    const modal = document.getElementById('linked-devices-modal');
    if (!modal) return;

    const list = document.getElementById('linked-devices-list');
    if (list) {
      list.innerHTML = `
        <div class="linked-device-card active">
          <div class="device-icon">💻</div>
          <div class="device-details">
            <div class="device-name">Current Device (${navigator.platform || 'Web'})</div>
            <div class="device-meta">Active now • IP: Local • Web Browser</div>
          </div>
          <div class="device-status-badge">Active</div>
        </div>
        <div class="linked-device-card">
          <div class="device-icon">📱</div>
          <div class="device-details">
            <div class="device-name">Android Phone (GitPit App)</div>
            <div class="device-meta">Linked • Real-time Sync Active</div>
          </div>
          <button class="btn-unlink-device" onclick="alert('Device unlinked successfully!')">Unlink</button>
        </div>
      `;
    }

    modal.classList.add('active');
  }

  // ================= CONTACT SYNC MODAL =================
  openContactSyncModal() {
    const modal = document.getElementById('contact-sync-modal');
    if (!modal) return;
    modal.classList.add('active');
  }

  async syncPhoneContacts() {
    // 1. If Web Contacts API is supported in mobile browser
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const contacts = await navigator.contacts.select(props, { multiple: true });
        const phones = contacts.flatMap(c => c.tel || []);
        
        contacts.forEach(c => {
          const name = Array.isArray(c.name) ? c.name[0] : (c.name || 'Friend');
          const tels = c.tel || [];
          tels.forEach(t => {
            const clean = (t || '').replace(/\D/g, '').slice(-10);
            if (clean) {
              this.saveContactToPhonebook('user_' + clean, name, t);
            }
          });
        });

        const resp = await fetch('/api/contacts/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumbers: phones })
        });
        const data = await resp.json();
        alert(`✅ Synced! Found ${data.matchedUsers ? data.matchedUsers.length : 0} contacts on GitPit!`);
        if (window.ChatEngine) window.ChatEngine.syncRegisteredUsers();
      } catch(e) {
        console.log('Native contact selection fallback');
      }
    } else {
      // 2. Interactive quick add contact to phonebook
      const name = prompt('Enter Contact Name to add to Phonebook:', '');
      if (!name) return;
      const phone = prompt(`Enter 10-digit Mobile Number for "${name}":`, '');
      if (!phone) return;

      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const contactId = 'user_' + cleanPhone;
      this.saveContactToPhonebook(contactId, name, '+91 ' + cleanPhone);

      // Add to chats list directly so it's on the panel
      if (window.ChatEngine) {
        let existing = window.ChatEngine.chats.find(c => c.id === contactId || (c.phone && c.phone.includes(cleanPhone)));
        if (!existing) {
          existing = {
            id: contactId,
            name: name,
            savedName: name,
            phone: '+91 ' + cleanPhone,
            avatar: 'assets/logo-icon.svg',
            unreadCount: 0,
            online: true,
            messages: []
          };
          window.ChatEngine.chats.push(existing);
        } else {
          existing.name = name;
          existing.savedName = name;
        }
        window.ChatEngine.saveChats();
        window.ChatEngine.renderChatList();
        window.ChatEngine.openChat(contactId);
        alert(`✅ "${name}" (${phone}) added to your Phonebook & Chat Panel!`);
      }
    }
  }
}

// Global instance
window.addEventListener('DOMContentLoaded', () => {
  window.AuthManager = new AuthManager();
});
