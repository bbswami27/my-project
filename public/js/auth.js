// ChatterPatter - Multi-Method Authentication Handler

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.otpTimer = null;
    this.otpSecondsLeft = 0;
    this.init();
  }

  init() {
    // Check if user is already logged in localStorage
    const savedUser = localStorage.getItem('chatterpatter_user');
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
      } catch (e) {
        console.error('Failed to parse saved user:', e);
      }
    }

    this.bindEvents();
    this.renderUI();
  }

  bindEvents() {
    // Auth Method Tab Switching
    const authTabs = document.querySelectorAll('.auth-tab-btn');
    authTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
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
      box.addEventListener('input', (e) => {
        if (box.value.length === 1 && index < otpBoxes.length - 1) {
          otpBoxes[index + 1].focus();
        }
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && box.value === '' && index > 0) {
          otpBoxes[index - 1].focus();
        }
      });
      // Support pasting 6-digit OTP
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
        if (/^\d{6}$/.test(pasteData)) {
          otpBoxes.forEach((b, i) => b.value = pasteData[i] || '');
          otpBoxes[otpBoxes.length - 1].focus();
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
        // Switch to OTP verification view
        document.getElementById('mobile-step-phone').style.display = 'none';
        document.getElementById('mobile-step-otp').style.display = 'block';
        document.getElementById('display-phone-target').textContent = fullPhone;

        // Auto-fill OTP in demo mode for instant testing!
        if (data.devOtp) {
          const otpBoxes = document.querySelectorAll('.otp-box-input');
          data.devOtp.split('').forEach((digit, idx) => {
            if (otpBoxes[idx]) otpBoxes[idx].value = digit;
          });
          const banner = document.getElementById('otp-demo-hint');
          if (banner) {
            banner.innerHTML = `✨ <b>Demo Mode Active:</b> Auto-filled OTP code <code>${data.devOtp}</code>`;
            banner.style.display = 'block';
          }
        }

        this.startOtpTimer(60);
      }
    } catch (err) {
      console.error('OTP Send error:', err);
      // Fallback in case of offline: directly show OTP step with 123456
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
        body: JSON.stringify({ phone: fullPhone, otp })
      });
      const data = await resp.json();

      if (data.success && data.user) {
        this.loginSuccess(data.user);
      } else {
        alert(data.error || 'Verification failed. Please try 123456');
      }
    } catch (err) {
      // Offline fallback login
      const user = {
        id: 'user_' + phoneInput.replace(/[^0-9]/g, ''),
        name: `User ${phoneInput.slice(-4)}`,
        phone: fullPhone,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${phoneInput}`,
        status: 'Hey there! I am using ChatterPatter 🚀'
      };
      this.loginSuccess(user);
    }
  }

  handleGoogleLogin() {
    // 1-Click Google Sign-In Simulation
    const googleUser = {
      id: 'google_user_' + Date.now().toString(36),
      name: 'Google Explorer',
      email: 'user.google@gmail.com',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      status: 'Connected with Google on ChatterPatter 🌐'
    };
    this.loginSuccess(googleUser);
  }

  handleEmailAuth() {
    const name = document.getElementById('email-name-input').value.trim() || 'Chatter User';
    const email = document.getElementById('email-addr-input').value.trim();
    const avatarChoice = document.querySelector('input[name="avatar-choice"]:checked')?.value || 'adventurer';

    const user = {
      id: 'user_' + Math.random().toString(36).substr(2, 9),
      name: name,
      email: email,
      avatar: `https://api.dicebear.com/7.x/${avatarChoice}/svg?seed=${name}`,
      status: 'Chatting on ChatterPatter ✨'
    };
    this.loginSuccess(user);
  }

  loginWithDemoUser(userId) {
    const demo = window.MOCK_DATA.demoUsers.find(u => u.id === userId);
    if (demo) {
      this.loginSuccess(demo);
    }
  }

  openProfileModal() {
    const modal = document.getElementById('user-profile-modal');
    if (!modal) return;

    const u = this.currentUser || {
      name: 'Alex Johnson',
      username: '@alex_j',
      phone: '+91 98765 43210',
      email: 'alex@gitpit.app',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      bio: 'Tech enthusiast, coffee lover & full-stack architect 💻☕',
      status: 'Building the future on GitPit 🚀',
      dob: '1996-08-15',
      anniversary: '2023-11-20',
      customDate: '2021-04-10'
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

    const annInp = document.getElementById('profile-anniversary-input');
    if (annInp) annInp.value = u.anniversary || '';

    const customInp = document.getElementById('profile-custom-date-input');
    if (customInp) customInp.value = u.customDate || '';

    // Activity / Presence Status
    const presenceSelect = document.getElementById('profile-presence-select');
    const customStatusWrapper = document.getElementById('profile-custom-status-wrapper');
    const customStatusInp = document.getElementById('profile-custom-status-text');

    if (presenceSelect) {
      presenceSelect.value = u.presence || 'online';
      if (customStatusWrapper) {
        customStatusWrapper.style.display = u.presence === 'custom' ? 'block' : 'none';
      }
    }
    if (customStatusInp) {
      customStatusInp.value = u.customStatusText || '';
    }

    modal.classList.add('active');
  }

  saveUserProfile() {
    if (!this.currentUser) {
      this.currentUser = { id: 'user_me', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80' };
    }

    const name = document.getElementById('profile-name-input')?.value.trim() || this.currentUser.name;
    const username = document.getElementById('profile-username-input')?.value.trim() || '';
    const bio = document.getElementById('profile-bio-input')?.value.trim() || '';
    const phone = document.getElementById('profile-phone-input')?.value.trim() || '';
    const email = document.getElementById('profile-email-input')?.value.trim() || '';
    const dob = document.getElementById('profile-dob-input')?.value || '';
    const anniversary = document.getElementById('profile-anniversary-input')?.value || '';
    const customDate = document.getElementById('profile-custom-date-input')?.value || '';
    
    // Presence & Custom Status
    const presence = document.getElementById('profile-presence-select')?.value || 'online';
    const customStatusText = document.getElementById('profile-custom-status-text')?.value.trim() || '';

    this.currentUser.name = name;
    this.currentUser.username = username.startsWith('@') ? username : (username ? '@' + username : '');
    this.currentUser.bio = bio;
    this.currentUser.status = bio;
    this.currentUser.phone = phone;
    this.currentUser.email = email;
    this.currentUser.dob = dob;
    this.currentUser.anniversary = anniversary;
    this.currentUser.customDate = customDate;
    this.currentUser.presence = presence;
    this.currentUser.customStatusText = customStatusText;

    localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));
    localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));

    const profileAvatar = document.getElementById('current-user-avatar');
    if (profileAvatar) profileAvatar.src = this.currentUser.avatar;

    let presenceLabel = 'Online';
    if (presence === 'busy') presenceLabel = '🔴 Busy (Do Not Disturb)';
    else if (presence === 'meeting') presenceLabel = '📅 In a Meeting';
    else if (presence === 'away') presenceLabel = '🏃 Away';
    else if (presence === 'traveling') presenceLabel = '✈️ Traveling';
    else if (presence === 'custom' && customStatusText) presenceLabel = `✏️ ${customStatusText}`;

    alert(`✅ Profile and Presence Status updated to: ${presenceLabel}`);
    const modal = document.getElementById('user-profile-modal');
    if (modal) modal.classList.remove('active');
  }
}

// Global instance
window.addEventListener('DOMContentLoaded', () => {
  window.AuthManager = new AuthManager();
});
