// GitPit - Production Authentication, Persistent Sessions, Mandatory Phone Verification & Contact Sync Manager

function getApiBaseUrl() {
  return 'https://chitchat-chatterpatter.onrender.com';
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

    // Sync Contacts & Registered Users
    if (window.ChatEngine) {
      window.ChatEngine.syncRegisteredUsers();
    }

    // Auto-sync native device contacts in background
    setTimeout(() => {
      this.grantContactsAndSync();
    }, 1000);
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

    // Direct 1-Click Test Login (Bypass OTP)
    const quickTestBtn = document.getElementById('btn-quick-test-login');
    if (quickTestBtn) {
      quickTestBtn.addEventListener('click', () => this.handleDirectTestLogin());
    }

    // Mobile Number Step 2: Verify OTP
    const verifyOtpBtn = document.getElementById('btn-verify-otp');
    if (verifyOtpBtn) {
      verifyOtpBtn.addEventListener('click', () => this.handleVerifyOtp());
    }

    // Bypass OTP button on step 2
    const bypassOtpBtn = document.getElementById('btn-bypass-verify-otp');
    if (bypassOtpBtn) {
      bypassOtpBtn.addEventListener('click', () => {
        const boxes = document.querySelectorAll('.otp-box-input');
        boxes.forEach(b => { b.value = '0'; });
        this.handleVerifyOtp();
      });
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
    let cleaned = String(phone).trim().replace(/[^\d+]/g, '');
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
    if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.slice(1);
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length === 10) return `+91${digitsOnly}`;
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) return `+${digitsOnly}`;
    if (cleaned.startsWith('+')) return cleaned;
    return digitsOnly ? `+${digitsOnly}` : '';
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

  // Direct 1-Click Test Login (Instant Bypass)
  async handleDirectTestLogin() {
    const countryCode = document.getElementById('country-code-select')?.value || '+91';
    let rawInput = document.getElementById('mobile-number-input')?.value.trim() || '';
    let cleanDigits = rawInput.replace(/\D/g, '').slice(-10);
    
    // Generate a random test phone number if none entered
    if (!cleanDigits || cleanDigits.length < 10) {
      cleanDigits = '98' + Math.floor(10000000 + Math.random() * 90000000);
      const phoneInput = document.getElementById('mobile-number-input');
      if (phoneInput) phoneInput.value = cleanDigits;
    }

    const nameInput = document.getElementById('mobile-name-input')?.value.trim();
    const displayName = nameInput || `User ${cleanDigits.slice(-4)}`;
    const fullPhone = `${countryCode}${cleanDigits}`;

    const loadingState = document.getElementById('auth-loading-state');
    const mobilePanel = document.getElementById('auth-panel-mobile');

    if (mobilePanel) mobilePanel.style.display = 'none';
    if (loadingState) {
      loadingState.style.display = 'block';
      document.getElementById('auth-loading-text').textContent = 'Logging in directly with Test Account... ⚡';
    }

    try {
      const resp = await fetch(`${window.API_BASE}/api/auth/test-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          name: displayName
        })
      });
      const data = await resp.json();

      if (loadingState) loadingState.style.display = 'none';
      if (mobilePanel) mobilePanel.style.display = 'block';

      if (data.success && data.user && data.token) {
        this.loginSuccess(data.user, data.token);
      } else {
        alert(data.error || 'Test login failed. Please try again.');
      }
    } catch (err) {
      if (loadingState) loadingState.style.display = 'none';
      if (mobilePanel) mobilePanel.style.display = 'block';
      alert('Network error during test login. Please check connection.');
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
  async grantContactsAndSync(interactive = false) {
    const consentModal = document.getElementById('contact-sync-consent-modal');
    if (consentModal) consentModal.classList.remove('active');
    localStorage.setItem('gitpit_contacts_synced', 'true');
    let rawContacts = [];

    // 1. Try Native Capacitor Plugin
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Contacts) {
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
            if (!phonesToSync.includes(normalized)) {
              phonesToSync.push(normalized);
            }
            phonebook[clean10] = {
              savedName: contactName,
              phone: normalized,
              photoUri: c.photoUri || c.avatar || '',
              avatar: c.photoUri || c.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${clean10}`,
              contactId: `user_${clean10}`
            };
          }
        });
      });

      localStorage.setItem('gitpit_phonebook', JSON.stringify(phonebook));

      // Batch Sync against backend (Chunks of 150 items to prevent payload/timeout limits on 5000+ contacts)
      if (phonesToSync.length > 0 && this.authToken) {
        const chunkSize = 150;
        let matchedCount = 0;
        const allMatchedUsers = [];

        for (let i = 0; i < phonesToSync.length; i += chunkSize) {
          const chunk = phonesToSync.slice(i, i + chunkSize);
          try {
            const resp = await fetch(`${window.API_BASE}/api/contacts/sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
              },
              body: JSON.stringify({ phoneNumbers: chunk })
            });
            const data = await resp.json();
            if (data.matchedUsers && Array.isArray(data.matchedUsers)) {
              matchedCount += data.matchedUsers.length;
              data.matchedUsers.forEach(mu => {
                const clean10 = (mu.phone || '').replace(/\D/g, '').slice(-10);
                const localContactName = (clean10 && phonebook[clean10]) ? phonebook[clean10].savedName : (mu.name || `Contact (+91 ${clean10})`);
                const enriched = {
                  ...mu,
                  id: mu.id || `user_${clean10}`,
                  name: localContactName,
                  savedName: localContactName,
                  phone: mu.phone || (clean10 ? `+91${clean10}` : ''),
                  avatar: mu.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${clean10 || mu.id}`,
                  bio: mu.bio || 'GitPit Member 🚀',
                  online: mu.online !== undefined ? mu.online : true
                };
                allMatchedUsers.push(enriched);

                if (clean10) {
                  phonebook[clean10] = {
                    savedName: localContactName,
                    name: localContactName,
                    phone: enriched.phone,
                    contactId: enriched.id,
                    avatar: enriched.avatar
                  };
                }
                if (mu.id) {
                  phonebook[mu.id] = {
                    savedName: localContactName,
                    name: localContactName,
                    phone: enriched.phone,
                    contactId: mu.id,
                    avatar: enriched.avatar
                  };
                }
              });
            }
          } catch (e) {
            console.warn('[CONTACTS SYNC API] Batch error:', e.message);
          }
        }

        // Persist synced contacts and updated phonebook
        localStorage.setItem('gitpit_phonebook', JSON.stringify(phonebook));
        localStorage.setItem('gitpit_synced_contacts', JSON.stringify(allMatchedUsers));

        if (interactive) {
          alert(`✅ Contacts Synced! Found ${matchedCount} contacts using GitPit.`);
        }

        if (window.ChatEngine) {
          window.ChatEngine.handleSyncedContacts(allMatchedUsers);
          window.ChatEngine.syncRegisteredUsers();
          window.ChatEngine.renderChatList();
        }
      }

      if (window.ChatEngine) {
        window.ChatEngine.renderChatList();
      }
    } else {
      if (window.ChatEngine) {
        window.ChatEngine.syncRegisteredUsers();
        window.ChatEngine.renderChatList();
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
      bio: 'Hey there! I am using GitPit 🚀',
      privacy: {}
    };

    const avatarImg = document.getElementById('profile-modal-avatar');
    if (avatarImg) avatarImg.src = u.avatar;

    const nameInp = document.getElementById('profile-name-input');
    if (nameInp) nameInp.value = u.name || '';

    const bioInp = document.getElementById('profile-bio-input');
    if (bioInp) bioInp.value = u.bio || u.status || '';

    // Handle Phone and Country Code (Default +91)
    const countryCodeSelect = document.getElementById('profile-country-code-select');
    const phoneInp = document.getElementById('profile-phone-input');
    if (phoneInp) {
      const rawPhone = (u.phone || '').trim();
      if (rawPhone.startsWith('+')) {
        const matchedPrefix = ['+91', '+1', '+44', '+971', '+61', '+81', '+49', '+33', '+65', '+966'].find(p => rawPhone.startsWith(p));
        if (matchedPrefix) {
          if (countryCodeSelect) countryCodeSelect.value = matchedPrefix;
          phoneInp.value = rawPhone.slice(matchedPrefix.length).trim();
        } else {
          if (countryCodeSelect) countryCodeSelect.value = '+91';
          phoneInp.value = rawPhone.replace(/\D/g, '');
        }
      } else {
        if (countryCodeSelect) countryCodeSelect.value = '+91';
        phoneInp.value = rawPhone.replace(/\D/g, '');
      }
    }

    const emailInp = document.getElementById('profile-email-input');
    if (emailInp) emailInp.value = u.email || '';

    const dobInp = document.getElementById('profile-dob-input');
    if (dobInp) dobInp.value = u.dob || '';

    const genderInp = document.getElementById('profile-gender-input');
    if (genderInp) genderInp.value = u.gender || '';

    modal.classList.add('active');
  }

  async handleProfilePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target.result;
      const avatarImg = document.getElementById('profile-modal-avatar');
      if (avatarImg) avatarImg.src = base64Data;

      try {
        const base = window.API_BASE || '';
        const token = this.authToken || localStorage.getItem('gitpit_auth_token') || '';
        const uploadResp = await fetch(`${base}/api/media/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({
            dataUrl: base64Data,
            fileName: file.name || 'avatar.jpg',
            fileType: file.type || 'image/jpeg'
          })
        });
        const uploadData = await uploadResp.json();
        const finalUrl = uploadData.url || base64Data;
        if (this.currentUser) {
          this.currentUser.avatar = finalUrl;
          this.currentUser.tempAvatar = finalUrl;
        }
      } catch (err) {
        if (this.currentUser) {
          this.currentUser.avatar = base64Data;
          this.currentUser.tempAvatar = base64Data;
        }
      }
    };
    reader.readAsDataURL(file);
  }

  async saveUserProfile() {
    if (!this.currentUser) return;

    const name = document.getElementById('profile-name-input')?.value.trim() || this.currentUser.name;
    const bio = document.getElementById('profile-bio-input')?.value.trim() || '';
    const countryCode = document.getElementById('profile-country-code-select')?.value || '+91';
    const rawDigits = (document.getElementById('profile-phone-input')?.value || '').replace(/\D/g, '');
    const phone = rawDigits ? `${countryCode}${rawDigits}` : (this.currentUser.phone || '');
    const email = document.getElementById('profile-email-input')?.value.trim() || this.currentUser.email || '';
    const dob = document.getElementById('profile-dob-input')?.value || '';
    const gender = document.getElementById('profile-gender-input')?.value || '';

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
    this.currentUser.gender = gender;

    localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));
    localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));

    const profileAvatar = document.getElementById('current-user-avatar');
    if (profileAvatar) {
      profileAvatar.src = this.currentUser.avatar;
      profileAvatar.title = `${this.currentUser.name} (${this.currentUser.phone || ''})`;
    }

    // Persist to server
    try {
      const base = window.API_BASE || '';
      const token = this.authToken || localStorage.getItem('gitpit_auth_token') || '';
      await fetch(`${base}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          name: this.currentUser.name,
          bio: this.currentUser.bio,
          avatar: this.currentUser.avatar,
          phone: this.currentUser.phone,
          email: this.currentUser.email
        })
      });
    } catch (e) {
      console.warn('[PROFILE] Profile saved locally:', e.message);
    }

    if (window.ChatEngine) {
      window.ChatEngine.syncRegisteredUsers();
    }

    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.classList.remove('active');
    alert('✅ Profile updated successfully!');
  }

  // ================= LINKED DEVICES =================
  async openLinkedDevicesModal() {
    const modal = document.getElementById('linked-devices-modal');
    if (!modal) return;
    modal.classList.add('active');
    this.renderLinkedDevices();
  }

  async renderLinkedDevices() {
    const container = document.getElementById('linked-devices-list');
    if (!container) return;

    try {
      const base = window.API_BASE || '';
      const token = this.authToken || localStorage.getItem('gitpit_auth_token') || '';
      const resp = await fetch(`${base}/api/devices`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await resp.json();
      const devices = data.devices || [];

      if (devices.length === 0) {
        container.innerHTML = `
          <div style="background: var(--bg-card); padding: 14px; border-radius: 8px; border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 24px;">📱</span>
              <div>
                <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">Current Device (Active)</div>
                <div style="font-size: 11.5px; color: var(--brand-green);">Active Now 🟢</div>
              </div>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = devices.map(d => `
        <div style="background: var(--bg-card); padding: 12px; border-radius: 8px; border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 22px;">💻</span>
            <div>
              <div style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${d.deviceName || 'Web Client'} (${d.os || 'Windows'})</div>
              <div style="font-size: 11px; color: var(--text-muted);">${d.lastActive || 'Active'} • ${d.location || 'India'}</div>
            </div>
          </div>
          <button class="btn-cancel-meeting-small" onclick="window.AuthManager.unlinkDevice('${d.id}')">Unlink</button>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<div style="color: var(--text-muted); padding: 10px;">Unable to fetch linked devices.</div>`;
    }
  }

  async unlinkDevice(deviceId) {
    if (!confirm('Are you sure you want to log out / unlink this device?')) return;
    try {
      const base = window.API_BASE || '';
      const token = this.authToken || localStorage.getItem('gitpit_auth_token') || '';
      await fetch(`${base}/api/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      this.renderLinkedDevices();
    } catch (e) {}
  }

  // ================= PRIVACY SETTINGS =================
  openPrivacySettingsModal() {
    const modal = document.getElementById('privacy-settings-modal');
    if (!modal) return;

    const priv = (this.currentUser && this.currentUser.privacy) || JSON.parse(localStorage.getItem('gitpit_privacy') || '{}');
    const localStrangerShield = localStorage.getItem('gitpit_restrict_unknown_media');

    const strangerShieldToggle = document.getElementById('privacy-stranger-shield-toggle');
    const strangerShieldModeSelect = document.getElementById('privacy-stranger-shield-mode-select');
    const localStrangerShieldMode = localStorage.getItem('gitpit_stranger_shield_mode');
    
    if (strangerShieldToggle) {
      strangerShieldToggle.checked = localStrangerShield !== null ? localStrangerShield !== 'false' : priv.strangerShield !== false;
    }
    if (strangerShieldModeSelect) {
      strangerShieldModeSelect.value = localStrangerShieldMode || priv.strangerShieldMode || 'strict';
      if (strangerShieldToggle) {
        strangerShieldModeSelect.disabled = !strangerShieldToggle.checked;
      }
    }

    const fileRecSelect = document.getElementById('privacy-file-receiving-select');
    if (fileRecSelect) fileRecSelect.value = priv.fileReceiving || 'contacts';

    const statusVisSelect = document.getElementById('privacy-status-visibility-select');
    if (statusVisSelect) statusVisSelect.value = priv.statusVisibility || 'contacts';

    const lastSeenSelect = document.getElementById('privacy-last-seen-select');
    if (lastSeenSelect) lastSeenSelect.value = priv.lastSeen || 'everyone';

    const photoSelect = document.getElementById('privacy-profile-photo-select');
    if (photoSelect) photoSelect.value = priv.profilePhoto || 'everyone';

    const aboutSelect = document.getElementById('privacy-about-select');
    if (aboutSelect) aboutSelect.value = priv.about || 'everyone';

    const readReceiptsToggle = document.getElementById('privacy-read-receipts-toggle');
    if (readReceiptsToggle) readReceiptsToggle.checked = priv.readReceipts !== false;

    const hidePhoneToggle = document.getElementById('privacy-hide-phone-toggle');
    if (hidePhoneToggle) hidePhoneToggle.checked = !!priv.hidePhone;

    const hideEmailToggle = document.getElementById('privacy-hide-email-toggle');
    if (hideEmailToggle) hideEmailToggle.checked = !!priv.hideEmail;

    const timerSelect = document.getElementById('privacy-disappearing-timer');
    if (timerSelect) timerSelect.value = priv.disappearingTimer || 'off';

    const screenLockToggle = document.getElementById('privacy-screen-lock-toggle');
    if (screenLockToggle) screenLockToggle.checked = !!priv.screenLock;

    modal.classList.add('active');
  }

  async savePrivacySettings() {
    const strangerShield = document.getElementById('privacy-stranger-shield-toggle')?.checked !== false;
    const strangerShieldMode = document.getElementById('privacy-stranger-shield-mode-select')?.value || 'strict';
    const fileReceiving = document.getElementById('privacy-file-receiving-select')?.value || 'contacts';
    const statusVisibility = document.getElementById('privacy-status-visibility-select')?.value || 'contacts';
    const lastSeen = document.getElementById('privacy-last-seen-select')?.value || 'everyone';
    const profilePhoto = document.getElementById('privacy-profile-photo-select')?.value || 'everyone';
    const about = document.getElementById('privacy-about-select')?.value || 'everyone';
    const readReceipts = document.getElementById('privacy-read-receipts-toggle')?.checked !== false;
    const hidePhone = !!document.getElementById('privacy-hide-phone-toggle')?.checked;
    const hideEmail = !!document.getElementById('privacy-hide-email-toggle')?.checked;
    const disappearingTimer = document.getElementById('privacy-disappearing-timer')?.value || 'off';
    const screenLock = !!document.getElementById('privacy-screen-lock-toggle')?.checked;

    const privacyData = {
      strangerShield,
      strangerShieldMode,
      fileReceiving,
      statusVisibility,
      lastSeen,
      profilePhoto,
      about,
      readReceipts,
      hidePhone,
      hideEmail,
      disappearingTimer,
      screenLock
    };

    localStorage.setItem('gitpit_privacy', JSON.stringify(privacyData));
    localStorage.setItem('gitpit_restrict_unknown_media', (strangerShield && strangerShieldMode !== 'off') ? 'true' : 'false');
    localStorage.setItem('gitpit_stranger_shield_mode', strangerShieldMode);
    localStorage.setItem('gitpit_file_receiving_privacy', fileReceiving);

    if (this.currentUser) {
      this.currentUser.privacy = privacyData;
      localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));
      localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));
    }

    // Persist to server API
    try {
      const base = window.API_BASE || '';
      const token = this.authToken || localStorage.getItem('gitpit_auth_token') || '';
      await fetch(`${base}/api/user/privacy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ privacy: privacyData })
      });
    } catch (e) {
      console.warn('[PRIVACY] Saved locally:', e.message);
    }

    const modal = document.getElementById('privacy-settings-modal');
    if (modal) modal.classList.remove('active');
    alert('✅ Privacy Settings successfully updated!');
  }

  // ================= STRANGER SHIELD MODAL =================
  openStrangerShieldModal() {
    const modal = document.getElementById('stranger-shield-modal');
    if (!modal) return;

    const priv = (this.currentUser && this.currentUser.privacy) || JSON.parse(localStorage.getItem('gitpit_privacy') || '{}');
    const localStrangerShield = localStorage.getItem('gitpit_restrict_unknown_media');
    const localStrangerShieldMode = localStorage.getItem('gitpit_stranger_shield_mode');

    const toggle = document.getElementById('modal-stranger-shield-toggle');
    const modeSelect = document.getElementById('modal-stranger-shield-mode-select');
    const statusBadge = document.getElementById('stranger-shield-status-badge');

    const isActive = localStrangerShield !== null ? localStrangerShield !== 'false' : priv.strangerShield !== false;
    const mode = localStrangerShieldMode || priv.strangerShieldMode || 'strict';

    if (toggle) toggle.checked = isActive;
    if (modeSelect) {
      modeSelect.value = mode;
      modeSelect.disabled = !isActive;
    }
    if (statusBadge) {
      statusBadge.textContent = isActive ? `🟢 ACTIVE (${mode === 'strict' ? 'Strict Protection' : mode})` : '🔴 OFF (Unprotected)';
      statusBadge.style.color = isActive ? 'var(--brand-green)' : 'var(--brand-danger)';
    }

    // Populate Whitelisted / Trusted Numbers
    const trustedList = document.getElementById('modal-trusted-contacts-list');
    if (trustedList) {
      const trusted = JSON.parse(localStorage.getItem('gitpit_trusted_contacts') || '[]');
      if (trusted.length === 0) {
        trustedList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 12px 8px; font-size: 12px;">No whitelisted numbers yet. Click <b>"➕ Add Number"</b> above to whitelist a contact.</div>`;
      } else {
        const phonebook = this.getPhonebook();
        trustedList.innerHTML = trusted.map(chatId => {
          const chat = (window.ChatEngine && window.ChatEngine.chats) ? window.ChatEngine.chats.find(c => c.id === chatId) : null;
          let cleanDigits = chatId.replace(/\D/g, '').slice(-10);
          let displayName = chat ? (chat.savedName || chat.name || chat.phone) : (phonebook[cleanDigits]?.name || phonebook[chatId]?.name || chatId);
          let phoneSub = cleanDigits ? `+91 ${cleanDigits}` : '';
          
          return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 7px 4px; border-bottom: 1px solid var(--border-subtle);">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">🛡️</span>
                <div>
                  <div style="font-weight: 700; font-size: 12.5px; color: var(--text-primary);">${displayName}</div>
                  ${phoneSub ? `<div style="font-size: 11px; color: var(--text-muted);">${phoneSub}</div>` : ''}
                </div>
              </div>
              <button style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: var(--brand-danger); border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 700; cursor: pointer;" onclick="window.AuthManager.removeTrustedContact('${chatId}')">Untrust</button>
            </div>
          `;
        }).join('');
      }
    }

    modal.classList.add('active');
  }

  addTrustedNumberFromInput() {
    const input = document.getElementById('input-stranger-shield-new-number');
    if (!input) return;
    const rawVal = input.value.trim();
    if (!rawVal) {
      alert('Please enter a 10-digit mobile number or contact name to whitelist.');
      return;
    }

    const cleanDigits = rawVal.replace(/\D/g, '').slice(-10);
    const idToTrust = cleanDigits ? `user_${cleanDigits}` : rawVal.toLowerCase().replace(/\s+/g, '_');

    const trusted = JSON.parse(localStorage.getItem('gitpit_trusted_contacts') || '[]');
    if (trusted.includes(idToTrust) || (cleanDigits && trusted.some(t => t.includes(cleanDigits)))) {
      alert(`⚠️ "${rawVal}" is already on your whitelisted trusted list.`);
      return;
    }

    trusted.push(idToTrust);
    if (cleanDigits && !trusted.includes(cleanDigits)) {
      trusted.push(cleanDigits);
    }
    localStorage.setItem('gitpit_trusted_contacts', JSON.stringify(trusted));

    // Save into local phonebook as well so it is recognized as a saved contact
    if (cleanDigits) {
      const phonebook = this.getPhonebook();
      if (!phonebook[cleanDigits]) {
        phonebook[cleanDigits] = {
          name: rawVal.replace(/\d/g, '').trim() || `Trusted Contact (+91 ${cleanDigits})`,
          phone: `+91 ${cleanDigits}`
        };
        localStorage.setItem('gitpit_phonebook', JSON.stringify(phonebook));
      }
    }

    input.value = '';
    const addRow = document.getElementById('stranger-shield-add-row');
    if (addRow) addRow.style.display = 'none';

    if (window.ChatEngine) window.ChatEngine.updateStrangerShieldUI();
    this.openStrangerShieldModal();
    alert(`🛡️ Contact "${rawVal}" successfully whitelisted! They can now send photos, videos, and media without restriction.`);
  }

  removeTrustedContact(chatId) {
    const cleanDigits = chatId.replace(/\D/g, '').slice(-10);
    const trusted = JSON.parse(localStorage.getItem('gitpit_trusted_contacts') || '[]');
    const updated = trusted.filter(id => id !== chatId && (!cleanDigits || !id.includes(cleanDigits)));
    localStorage.setItem('gitpit_trusted_contacts', JSON.stringify(updated));
    if (window.ChatEngine) window.ChatEngine.updateStrangerShieldUI();
    this.openStrangerShieldModal();
  }

  async saveStrangerShieldModalSettings() {
    const strangerShield = document.getElementById('modal-stranger-shield-toggle')?.checked !== false;
    const strangerShieldMode = document.getElementById('modal-stranger-shield-mode-select')?.value || 'strict';

    const priv = (this.currentUser && this.currentUser.privacy) || JSON.parse(localStorage.getItem('gitpit_privacy') || '{}');
    priv.strangerShield = strangerShield;
    priv.strangerShieldMode = strangerShieldMode;

    localStorage.setItem('gitpit_privacy', JSON.stringify(priv));
    localStorage.setItem('gitpit_restrict_unknown_media', (strangerShield && strangerShieldMode !== 'off') ? 'true' : 'false');
    localStorage.setItem('gitpit_stranger_shield_mode', strangerShieldMode);

    if (this.currentUser) {
      this.currentUser.privacy = priv;
      localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));
      localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));
    }

    if (window.ChatEngine) {
      window.ChatEngine.updateStrangerShieldUI();
    }

    // Persist to server API
    try {
      const base = window.API_BASE || '';
      const token = this.authToken || localStorage.getItem('gitpit_auth_token') || '';
      await fetch(`${base}/api/user/privacy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ privacy: priv })
      });
    } catch (e) {}

    const modal = document.getElementById('stranger-shield-modal');
    if (modal) modal.classList.remove('active');
    alert('🛡️ Anti-Fraud Stranger Shield settings successfully updated!');
  }

  // ==========================================
  // PHONEBOOK & CONTACT SYNC HELPERS
  // ==========================================
  getPhonebook() {
    try {
      const stored = localStorage.getItem('gitpit_phonebook');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.warn('[PHONEBOOK] Error reading phonebook:', e);
      return {};
    }
  }

  saveContactToPhonebook(contactKey, savedName, phone, avatar = '') {
    try {
      const phonebook = this.getPhonebook();
      const cleanDigits = (contactKey || phone || '').replace(/\D/g, '').slice(-10);
      const entry = {
        savedName: savedName,
        name: savedName,
        phone: phone || (cleanDigits ? `+91${cleanDigits}` : ''),
        contactId: `user_${cleanDigits || contactKey}`,
        avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanDigits || contactKey}`
      };
      if (cleanDigits) phonebook[cleanDigits] = entry;
      phonebook[contactKey] = entry;
      phonebook[entry.contactId] = entry;
      localStorage.setItem('gitpit_phonebook', JSON.stringify(phonebook));
      return phonebook;
    } catch (e) {
      console.warn('[PHONEBOOK] Error saving contact to phonebook:', e);
      return {};
    }
  }

  openContactSyncModal() {
    const modal = document.getElementById('contact-sync-modal') || document.getElementById('contact-sync-consent-modal');
    if (modal) modal.classList.add('active');
  }

  syncPhoneContacts() {
    const modal = document.getElementById('contact-sync-modal');
    if (modal) modal.classList.remove('active');
    return this.grantContactsAndSync();
  }
}

// Instantiate globally
window.addEventListener('DOMContentLoaded', () => {
  window.AuthManager = new AuthManager();
});
