// ChatterPatter - Production Authentication, Persistent Sessions, Mandatory Phone Verification & Contact Sync Manager

function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || origin.includes('capacitor://') || origin.includes('ionic://')) {
      return 'https://chitchat-chatterpatter.onrender.com';
    }
  }
  return '';
}

window.API_BASE = getApiBaseUrl();

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authToken = null;
    this.otpTimer = null;
    this.otpSecondsLeft = 0;
    this.mandatoryOtpTimer = null;
    this.mandatoryOtpSecondsLeft = 0;
    this.pendingSocialUser = null;
    this.init();
  }

  async init() {
    this.authToken = localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token');
    const savedUser = localStorage.getItem('gitpit_user') || localStorage.getItem('chatterpatter_user');
    
    // Purge any legacy stale mock/guest users
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        const isLegacyDemo = !u || !u.id || u.id === 'user_guest' || u.id === 'user_demo' || u.name === 'Guest User' || ['user_alex', 'user_priya', 'user_rahul', 'user_sarah'].includes(u.id);
        if (isLegacyDemo || !this.authToken) {
          localStorage.removeItem('gitpit_user');
          localStorage.removeItem('chatterpatter_user');
          localStorage.removeItem('gitpit_auth_token');
          localStorage.removeItem('chatterpatter_token');
          this.currentUser = null;
          this.authToken = null;
        } else {
          this.currentUser = u;
        }
      } catch (e) {
        this.currentUser = null;
      }
    }

    this.bindEvents();

    // Verify session on server if token and user exist
    if (this.authToken && this.currentUser && this.currentUser.phoneVerified) {
      try {
        const resp = await fetch(`${window.API_BASE}/api/auth/session`, {
          headers: { 'Authorization': `Bearer ${this.authToken}` }
        });
        const data = await resp.json();
        if (data.success && data.user && data.user.phoneVerified) {
          this.currentUser = data.user;
          localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));
          localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));
          this.renderAuthenticatedUI();
          return;
        } else {
          // Token expired or invalid on server
          this.logout(false);
          return;
        }
      } catch (err) {
        console.warn('[AUTH] Offline or network check, validating cached session');
        if (this.currentUser && this.currentUser.phoneVerified && this.authToken) {
          this.renderAuthenticatedUI();
          return;
        }
      }
    }

    // Default: Show Login modal for all fresh / unauthenticated visits
    this.showLoginModal();
  }

  showLoginModal() {
    const authModal = document.getElementById('auth-overlay-modal');
    if (authModal) {
      authModal.classList.add('active');
      authModal.style.display = 'flex';
    }
  }

  hideLoginModal() {
    const authModal = document.getElementById('auth-overlay-modal');
    if (authModal) {
      authModal.classList.remove('active');
      authModal.style.display = 'none';
    }
  }

  renderAuthenticatedUI() {
    this.hideLoginModal();

    const profileAvatar = document.getElementById('current-user-avatar');
    if (profileAvatar && this.currentUser) {
      profileAvatar.src = this.currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${this.currentUser.id}`;
      profileAvatar.title = `${this.currentUser.name} (${this.currentUser.phone || ''})`;
    }

    // Connect socket with authenticated user
    if (window.ChatterApp && window.ChatterApp.socket) {
      window.ChatterApp.socket.emit('user_join', this.currentUser);
    }

    // Sync Contacts
    if (window.ChatEngine) {
      window.ChatEngine.syncRegisteredUsers();
    }

    // If first time login, prompt contact sync consent
    const syncDone = localStorage.getItem('gitpit_contacts_synced');
    if (!syncDone) {
      setTimeout(() => {
        const consentModal = document.getElementById('contact-sync-consent-modal');
        if (consentModal) consentModal.classList.add('active');
      }, 800);
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

    // Google Sign-In
    const googleBtn = document.getElementById('btn-google-sign-in');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => this.handleGoogleLogin());
    }

    // Email / Password Form Submit
    const emailForm = document.getElementById('email-auth-form');
    if (emailForm) {
      emailForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleEmailAuth();
      });
    }

    // OTP Input auto-focus & keyboard navigation
    this.setupOtpInputNavigation('.otp-box-input');
    this.setupOtpInputNavigation('.mandatory-otp-box');

    // Save Profile button
    const saveProfileBtn = document.getElementById('btn-save-user-profile');
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener('click', () => this.saveUserProfile());
    }

    // Logout button
    const logoutBtns = document.querySelectorAll('.btn-logout-account');
    logoutBtns.forEach(btn => {
      btn.addEventListener('click', () => this.logout(true));
    });

    // Avatar generation trigger in profile
    const regenAvatarBtn = document.getElementById('btn-profile-regen-avatar');
    if (regenAvatarBtn) {
      regenAvatarBtn.addEventListener('click', () => this.regenerateAvatar());
    }
  }

  setupOtpInputNavigation(selector) {
    const otpBoxes = document.querySelectorAll(selector);
    otpBoxes.forEach((box, index) => {
      box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '');
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
        const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasteData.length > 0) {
          pasteData.split('').forEach((d, i) => {
            if (otpBoxes[i]) otpBoxes[i].value = d;
          });
          const targetIndex = Math.min(pasteData.length, otpBoxes.length - 1);
          otpBoxes[targetIndex].focus();
        }
      });
    });
  }

  switchAuthMethod(method) {
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-method') === method);
    });

    document.querySelectorAll('.auth-form-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `auth-panel-${method}`);
    });
  }

  normalizePhone(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (phone.startsWith('+')) return `+${digits}`;
    return digits ? `+${digits}` : '';
  }

  // ==========================================
  // MOBILE OTP AUTHENTICATION
  // ==========================================
  async handleSendOtp() {
    const countryCode = document.getElementById('country-code-select').value;
    const rawInput = document.getElementById('mobile-number-input').value.trim();
    const phoneError = document.getElementById('phone-error-msg');
    const sendBtn = document.getElementById('btn-send-otp');

    const cleanDigits = rawInput.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 10) {
      if (phoneError) {
        phoneError.textContent = 'Please enter a valid 10-digit mobile number.';
        phoneError.style.display = 'block';
      }
      return;
    }

    const fullPhone = `${countryCode}${cleanDigits.slice(-10)}`;
    if (phoneError) phoneError.style.display = 'none';

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending Code... ⏳';
    }

    try {
      const resp = await fetch(`${window.API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone })
      });
      const data = await resp.json();

      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send 6-Digit OTP 🚀';
      }

      if (data.success) {
        document.getElementById('mobile-step-phone').style.display = 'none';
        document.getElementById('mobile-step-otp').style.display = 'block';
        document.getElementById('display-phone-target').textContent = fullPhone;
        this.startOtpTimer(data.cooldown || 60);

        if (data.codeHint) {
          const otpBoxes = document.querySelectorAll('.otp-box-input');
          data.codeHint.split('').forEach((digit, idx) => {
            if (otpBoxes[idx]) otpBoxes[idx].value = digit;
          });
          alert(`📲 Verification Code: ${data.codeHint}\n(Code auto-filled. Tap "Verify & Continue" to enter)`);
        }

        const firstBox = document.querySelector('.otp-box-input');
        if (firstBox) firstBox.focus();
      } else {
        alert(data.error || 'Failed to send OTP. Please try again.');
      }
    } catch (err) {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send 6-Digit OTP 🚀';
      }
      alert('Network error while requesting OTP. Please check your internet connection.');
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
    const rawInput = document.getElementById('mobile-number-input').value.trim();
    const cleanDigits = rawInput.replace(/\D/g, '').slice(-10);
    const displayName = document.getElementById('mobile-name-input')?.value.trim() || `User ${cleanDigits.slice(-4)}`;
    const fullPhone = `${countryCode}${cleanDigits}`;

    const otpBoxes = document.querySelectorAll('.otp-box-input');
    const otp = Array.from(otpBoxes).map(b => b.value).join('');

    if (otp.length < 6) {
      alert('Please enter complete 6-digit OTP code.');
      return;
    }

    const verifyBtn = document.getElementById('btn-verify-otp');
    const loadingState = document.getElementById('auth-loading-state');
    const mobilePanel = document.getElementById('auth-panel-mobile');

    if (verifyBtn) verifyBtn.disabled = true;
    if (mobilePanel) mobilePanel.style.display = 'none';
    if (loadingState) {
      loadingState.style.display = 'block';
      document.getElementById('auth-loading-text').textContent = 'Verifying Code & Authorizing...';
    }

    try {
      const resp = await fetch(`${window.API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          otp,
          name: displayName,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits}`
        })
      });
      const data = await resp.json();

      if (loadingState) loadingState.style.display = 'none';
      if (mobilePanel) mobilePanel.style.display = 'block';
      if (verifyBtn) verifyBtn.disabled = false;

      if (data.success && data.user && data.token) {
        this.loginSuccess(data.user, data.token);
      } else {
        alert(data.error || 'Verification failed. Please check the code entered.');
      }
    } catch (err) {
      if (loadingState) loadingState.style.display = 'none';
      if (mobilePanel) mobilePanel.style.display = 'block';
      if (verifyBtn) verifyBtn.disabled = false;
      alert('Network error during verification. Please check your connection.');
    }
  }

  // ==========================================
  // GOOGLE SIGN-IN FLOW
  // ==========================================
  async handleGoogleLogin() {
    const name = document.getElementById('google-name-input')?.value.trim() || 'Google User';
    const email = document.getElementById('google-email-input')?.value.trim();

    if (!email || !email.includes('@')) {
      alert('Please enter a valid Gmail / Email address.');
      const inp = document.getElementById('google-email-input');
      if (inp) inp.focus();
      return;
    }

    try {
      const resp = await fetch(`${window.API_BASE}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email })
      });
      const data = await resp.json();

      if (data.success) {
        if (data.phoneVerificationRequired) {
          this.pendingSocialUser = { name, email, userId: data.userId };
          this.openMandatoryPhoneModal();
        } else if (data.user && data.token) {
          this.loginSuccess(data.user, data.token);
        }
      } else {
        alert(data.error || 'Google login failed.');
      }
    } catch (err) {
      alert('Network error connecting to Google Auth service.');
    }
  }

  // ==========================================
  // EMAIL / PASSWORD FLOW
  // ==========================================
  async handleEmailAuth() {
    const name = document.getElementById('email-name-input')?.value.trim() || 'User';
    const email = document.getElementById('email-addr-input')?.value.trim();
    const password = document.getElementById('email-password-input')?.value;

    if (!email || !password || password.length < 6) {
      alert('Please enter a valid email and a password of at least 6 characters.');
      return;
    }

    try {
      // Try login first, or register if new
      let resp = await fetch(`${window.API_BASE}/api/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      let data = await resp.json();

      if (!resp.ok) {
        resp = await fetch(`${window.API_BASE}/api/auth/email/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        data = await resp.json();
      }

      if (data.success) {
        if (data.phoneVerificationRequired) {
          this.pendingSocialUser = { name, email, userId: data.userId };
          this.openMandatoryPhoneModal();
        } else if (data.user && data.token) {
          this.loginSuccess(data.user, data.token);
        }
      } else {
        alert(data.error || 'Email authentication failed.');
      }
    } catch (err) {
      alert('Network error connecting to email authentication.');
    }
  }

  // ==========================================
  // MANDATORY PHONE VERIFICATION MODAL
  // ==========================================
  openMandatoryPhoneModal() {
    this.hideLoginModal();
    const modal = document.getElementById('mandatory-phone-verify-modal');
    if (modal) modal.classList.add('active');
  }

  async sendMandatoryPhoneOtp() {
    const rawInput = document.getElementById('mandatory-phone-input').value.trim();
    const cleanDigits = rawInput.replace(/\D/g, '').slice(-10);
    const errElem = document.getElementById('mandatory-phone-error');
    const sendBtn = document.getElementById('btn-send-mandatory-otp');

    if (cleanDigits.length < 10) {
      if (errElem) {
        errElem.textContent = 'Please enter a valid 10-digit mobile number.';
        errElem.style.display = 'block';
      }
      return;
    }

    const fullPhone = `+91${cleanDigits}`;
    if (errElem) errElem.style.display = 'none';
    if (sendBtn) sendBtn.disabled = true;

    try {
      const resp = await fetch(`${window.API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone })
      });
      const data = await resp.json();
      if (sendBtn) sendBtn.disabled = false;

      if (data.success) {
        document.getElementById('mandatory-step-phone').style.display = 'none';
        document.getElementById('mandatory-step-otp').style.display = 'block';
        document.getElementById('mandatory-display-phone').textContent = fullPhone;
        this.startMandatoryOtpTimer(data.cooldown || 60);

        if (data.codeHint) {
          const otpBoxes = document.querySelectorAll('.mandatory-otp-box');
          data.codeHint.split('').forEach((digit, idx) => {
            if (otpBoxes[idx]) otpBoxes[idx].value = digit;
          });
          alert(`📲 Verification Code: ${data.codeHint}\n(Code auto-filled. Tap "Verify & Complete Setup" to continue)`);
        }

        const firstBox = document.querySelector('.mandatory-otp-box');
        if (firstBox) firstBox.focus();
      } else {
        alert(data.error || 'Failed to send OTP.');
      }
    } catch (e) {
      if (sendBtn) sendBtn.disabled = false;
      alert('Network error sending OTP.');
    }
  }

  startMandatoryOtpTimer(seconds) {
    this.mandatoryOtpSecondsLeft = seconds;
    const timerElem = document.getElementById('mandatory-otp-countdown');
    const resendBtn = document.getElementById('btn-resend-mandatory-otp');
    if (resendBtn) resendBtn.disabled = true;

    clearInterval(this.mandatoryOtpTimer);
    this.mandatoryOtpTimer = setInterval(() => {
      this.mandatoryOtpSecondsLeft--;
      if (timerElem) timerElem.textContent = `(${this.mandatoryOtpSecondsLeft}s)`;

      if (this.mandatoryOtpSecondsLeft <= 0) {
        clearInterval(this.mandatoryOtpTimer);
        if (timerElem) timerElem.textContent = '';
        if (resendBtn) resendBtn.disabled = false;
      }
    }, 1000);
  }

  async verifyMandatoryPhoneOtp() {
    const rawInput = document.getElementById('mandatory-phone-input').value.trim();
    const cleanDigits = rawInput.replace(/\D/g, '').slice(-10);
    const fullPhone = `+91${cleanDigits}`;

    const otpBoxes = document.querySelectorAll('.mandatory-otp-box');
    const otp = Array.from(otpBoxes).map(b => b.value).join('');

    if (otp.length < 6) {
      alert('Please enter complete 6-digit OTP code.');
      return;
    }

    try {
      const resp = await fetch(`${window.API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          otp,
          name: this.pendingSocialUser ? this.pendingSocialUser.name : `User ${cleanDigits.slice(-4)}`,
          email: this.pendingSocialUser ? this.pendingSocialUser.email : ''
        })
      });
      const data = await resp.json();

      if (data.success && data.user && data.token) {
        const modal = document.getElementById('mandatory-phone-verify-modal');
        if (modal) modal.classList.remove('active');
        this.loginSuccess(data.user, data.token);
      } else {
        alert(data.error || 'Verification failed.');
      }
    } catch (e) {
      alert('Network error verifying OTP.');
    }
  }

  // ==========================================
  // SUCCESSFUL LOGIN HANDLER
  // ==========================================
  loginSuccess(user, token) {
    this.currentUser = {
      ...user,
      phoneVerified: true
    };
    this.authToken = token;

    localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));
    localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));
    localStorage.setItem('gitpit_auth_token', token);
    localStorage.setItem('chatterpatter_token', token);

    this.renderAuthenticatedUI();
  }

  // ==========================================
  // NATIVE CONTACT SYNC VIA CAPACITOR / WEB
  // ==========================================
  async grantContactsAndSync() {
    const consentModal = document.getElementById('contact-sync-consent-modal');
    if (consentModal) consentModal.classList.remove('active');
    localStorage.setItem('gitpit_contacts_synced', 'true');

    let rawContacts = [];

    // 1. Try Native Capacitor Plugin
    if (window.Capacitor && window.Capacitor.isPluginAvailable('Contacts')) {
      try {
        const result = await window.Capacitor.Plugins.Contacts.getContacts();
        if (result && result.contacts) {
          rawContacts = result.contacts;
        }
      } catch (err) {
        console.warn('[CONTACTS] Capacitor plugin access warning:', err.message);
      }
    }

    // 2. Try Web Contacts API
    if (rawContacts.length === 0 && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        const props = ['name', 'tel'];
        const webContacts = await navigator.contacts.select(props, { multiple: true });
        if (webContacts && Array.isArray(webContacts)) {
          rawContacts = webContacts.map(c => ({
            name: Array.isArray(c.name) ? c.name[0] : (c.name || 'Friend'),
            phones: c.tel || []
          }));
        }
      } catch (e) {}
    }

    // Process & Sync Found Contacts
    if (rawContacts.length > 0) {
      const phonebook = JSON.parse(localStorage.getItem('gitpit_phonebook') || '{}');
      const phonesToSync = [];

      rawContacts.forEach(c => {
        const contactName = c.name || c.displayName || 'Friend';
        const numbers = Array.isArray(c.phones) ? c.phones : [c.phoneNumber || c.phone || ''];
        
        numbers.forEach(num => {
          if (!num) return;
          const clean10 = num.replace(/\D/g, '').slice(-10);
          if (clean10.length === 10) {
            const normalized = `+91${clean10}`;
            phonesToSync.push(normalized);
            phonebook[clean10] = {
              savedName: contactName,
              phone: normalized,
              contactId: `user_${clean10}`
            };
          }
        });
      });

      localStorage.setItem('gitpit_phonebook', JSON.stringify(phonebook));

      // Match against backend registered users
      if (phonesToSync.length > 0 && this.authToken) {
        try {
          const resp = await fetch(`${window.API_BASE}/api/contacts/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.authToken}`
            },
            body: JSON.stringify({ phoneNumbers: phonesToSync })
          });
          const data = await resp.json();
          if (data.matchedUsers) {
            alert(`✅ Contacts Synced! Found ${data.matchedUsers.length} people using ChatterPatter.`);
            if (window.ChatEngine) {
              window.ChatEngine.syncRegisteredUsers();
            }
          }
        } catch (e) {
          console.warn('[CONTACTS SYNC API] Error matching contacts:', e.message);
        }
      }
    } else {
      if (window.ChatEngine) {
        window.ChatEngine.syncRegisteredUsers();
      }
    }
  }

  // ==========================================
  // LOGOUT
  // ==========================================
  async logout(promptUser = true) {
    if (promptUser && !confirm('Are you sure you want to log out?')) {
      return;
    }

    if (this.authToken) {
      try {
        await fetch(`${window.API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.authToken}` }
        });
      } catch (e) {}
    }

    // Complete cleanup of storage
    localStorage.removeItem('chatterpatter_user');
    localStorage.removeItem('gitpit_user');
    localStorage.removeItem('gitpit_auth_token');
    localStorage.removeItem('chatterpatter_token');
    localStorage.removeItem('gitpit_auth_user');
    localStorage.removeItem('gitpit_contacts_synced');
    sessionStorage.clear();

    this.currentUser = null;
    this.authToken = null;

    // Reset input fields
    const phoneInput = document.getElementById('mobile-number-input');
    if (phoneInput) phoneInput.value = '';
    const nameInput = document.getElementById('mobile-name-input');
    if (nameInput) nameInput.value = '';
    const stepPhone = document.getElementById('mobile-step-phone');
    const stepOtp = document.getElementById('mobile-step-otp');
    if (stepPhone) stepPhone.style.display = 'block';
    if (stepOtp) stepOtp.style.display = 'none';

    // Close open chat & modals
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));

    if (window.ChatEngine) {
      window.ChatEngine.closeActiveChat();
    }

    // Reset profile avatar
    const profileAvatar = document.getElementById('current-user-avatar');
    if (profileAvatar) {
      profileAvatar.src = 'assets/logo-icon.svg';
      profileAvatar.title = 'Logged Out';
    }

    // Show fresh login modal
    this.showLoginModal();
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
      name: 'User',
      username: '@user',
      phone: '',
      email: '',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=user',
      bio: 'Hey there! I am using ChatterPatter 🚀',
      privacy: {}
    };

    const avatarImg = document.getElementById('profile-modal-avatar');
    if (avatarImg) avatarImg.src = u.avatar;

    const nameInp = document.getElementById('profile-name-input');
    if (nameInp) nameInp.value = u.name || '';

    const bioInp = document.getElementById('profile-bio-input');
    if (bioInp) bioInp.value = u.bio || u.status || '';

    const phoneInp = document.getElementById('profile-phone-input');
    if (phoneInp) phoneInp.value = u.phone || '';

    const emailInp = document.getElementById('profile-email-input');
    if (emailInp) emailInp.value = u.email || '';

    modal.classList.add('active');
  }

  async saveUserProfile() {
    if (!this.currentUser) return;

    const name = document.getElementById('profile-name-input')?.value.trim() || this.currentUser.name;
    const bio = document.getElementById('profile-bio-input')?.value.trim() || '';

    if (this.currentUser.tempAvatar) {
      this.currentUser.avatar = this.currentUser.tempAvatar;
      delete this.currentUser.tempAvatar;
    }

    this.currentUser.name = name;
    this.currentUser.bio = bio;
    this.currentUser.status = bio;

    localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));
    localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));

    const profileAvatar = document.getElementById('current-user-avatar');
    if (profileAvatar) profileAvatar.src = this.currentUser.avatar;

    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.classList.remove('active');
    alert('✅ Profile updated successfully!');
  }
}

// Instantiate globally
window.addEventListener('DOMContentLoaded', () => {
  window.AuthManager = new AuthManager();
});
