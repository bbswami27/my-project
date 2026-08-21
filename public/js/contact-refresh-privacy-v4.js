'use strict';

// GitPit Contact Refresh + Privacy cleanup v4
(function installContactRefreshPrivacyV4() {
  let installed = false;

  function refreshChatSurfaces() {
    const chat = window.ChatEngine;
    if (!chat) return;
    try { if (typeof chat.syncRegisteredUsers === 'function') chat.syncRegisteredUsers(); } catch (_) {}
    setTimeout(() => {
      try { if (typeof chat.populateNewChatDirectory === 'function') chat.populateNewChatDirectory(); } catch (_) {}
      try { if (typeof chat.renderChatList === 'function') chat.renderChatList(); } catch (_) {}
    }, 250);
  }

  function hidePrivacyShieldDuplicate() {
    // Keep the dedicated Anti-Fraud Stranger Shield modal/menu. Remove only entries inside Privacy UI.
    const privacyRoots = Array.from(document.querySelectorAll('[id*="privacy" i], [class*="privacy" i]'))
      .filter(el => /modal|settings|panel|content/i.test(`${el.id} ${el.className}`));

    privacyRoots.forEach(root => {
      const candidates = Array.from(root.querySelectorAll('div, li, section, label, button'));
      candidates.forEach(el => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || !/stranger\s*shield|anti[-\s]*fraud\s*stranger/i.test(text)) return;
        // Do not hide the whole privacy modal; hide the nearest setting-sized row/card only.
        let row = el.closest('.setting-item, .settings-item, .privacy-item, .privacy-setting, .settings-row, .setting-row, .form-group, li');
        if (!row) row = el;
        if (row === root) return;
        row.style.display = 'none';
        row.setAttribute('data-gitpit-privacy-shield-duplicate-hidden', 'true');
      });
    });
  }

  function patchAuth() {
    const auth = window.AuthManager;
    if (!auth || auth.__contactRefreshPrivacyV4) return !!auth;
    auth.__contactRefreshPrivacyV4 = true;

    // Identity Routing v2 already supplies the safe native read-only sync.
    // Wrap both entry points so manual/automatic refresh immediately updates visible registered status.
    for (const methodName of ['grantContactsAndSync', 'syncPhoneContacts']) {
      const original = typeof auth[methodName] === 'function' ? auth[methodName].bind(auth) : null;
      if (!original) continue;
      auth[methodName] = async function(...args) {
        const result = await original(...args);
        refreshChatSurfaces();
        localStorage.setItem('gitpit_last_contact_refresh', String(Date.now()));
        return result;
      };
    }

    const originalPrivacy = typeof auth.openPrivacySettingsModal === 'function'
      ? auth.openPrivacySettingsModal.bind(auth)
      : null;
    if (originalPrivacy) {
      auth.openPrivacySettingsModal = function(...args) {
        const result = originalPrivacy(...args);
        setTimeout(hidePrivacyShieldDuplicate, 0);
        setTimeout(hidePrivacyShieldDuplicate, 200);
        return result;
      };
    }

    refreshChatSurfaces();
    hidePrivacyShieldDuplicate();
    return true;
  }

  const boot = setInterval(() => {
    if (patchAuth()) {
      clearInterval(boot);
      installed = true;
    }
  }, 250);
  setTimeout(() => clearInterval(boot), 15000);

  // Auto refresh when app returns to foreground or network reconnects.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.AuthManager?.currentUser) {
      setTimeout(async () => {
        try { await window.AuthManager.grantContactsAndSync(false); } catch (_) { refreshChatSurfaces(); }
        hidePrivacyShieldDuplicate();
      }, 300);
    }
  });
  window.addEventListener('online', () => {
    if (!window.AuthManager?.currentUser) return;
    setTimeout(async () => {
      try { await window.AuthManager.grantContactsAndSync(false); } catch (_) { refreshChatSurfaces(); }
    }, 300);
  });

  // Remove duplicate again if Privacy modal content is dynamically rendered.
  const observer = new MutationObserver(() => {
    if (!installed) patchAuth();
    hidePrivacyShieldDuplicate();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
