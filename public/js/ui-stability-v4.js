'use strict';

// GitPit UI Stability v4
// 1) Delete one local conversation without collapsing the mobile interface.
// 2) Keep authenticated users out of the login overlay during resume/re-render.
// 3) Keep Anti-Fraud Stranger Shield as its own settings item only.
(function installUiStabilityV4() {
  function hasAuthenticatedSession() {
    try {
      const token = localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token');
      const raw = localStorage.getItem('gitpit_user') || localStorage.getItem('chatterpatter_user');
      if (!token || !raw) return false;
      const user = JSON.parse(raw);
      return !!(user && user.id && user.phoneVerified);
    } catch (_) {
      return false;
    }
  }

  function keepAuthenticatedUiVisible() {
    if (!hasAuthenticatedSession()) return;
    const auth = window.AuthManager;
    const overlay = document.getElementById('auth-overlay-modal');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.style.display = 'none';
    }
    const app = document.getElementById('app-container');
    if (app) app.style.display = '';
    try {
      if (auth && auth.currentUser) auth.hideLoginModal();
    } catch (_) {}
  }

  function restoreChatShell() {
    const sidebar = document.getElementById('sidebar-container');
    const chatArea = document.getElementById('chat-main-area');
    const emptyState = document.getElementById('chat-empty-state');
    const activeView = document.getElementById('chat-active-view');
    if (sidebar) sidebar.classList.remove('mobile-hidden');
    if (chatArea) chatArea.classList.remove('mobile-active');
    if (emptyState) emptyState.style.display = 'flex';
    if (activeView) activeView.style.display = 'none';
    try {
      if (window.ChatterApp) window.ChatterApp.switchTab('chats');
    } catch (_) {}
  }

  function installChatDeleteFix() {
    const chat = window.ChatEngine;
    if (!chat || chat.__gitpitDeleteChatV4) return !!chat;
    chat.__gitpitDeleteChatV4 = true;

    // Individual chat deletion is intentionally local-only until the backend has
    // a per-user deletion table. The old endpoint broadcasts chat_deleted globally.
    chat.deleteChat = function(chatId) {
      const target = (this.chats || []).find(c => c.id === chatId);
      if (!target) {
        restoreChatShell();
        return;
      }
      if (!confirm(`Delete conversation with ${target.savedName || target.name || target.phone || 'this contact'}?`)) return;

      this.chats = (this.chats || []).filter(c => c.id !== chatId);
      if (this.activeChatId === chatId) this.activeChatId = null;
      try { this.saveChats(); } catch (_) {}
      restoreChatShell();
      try { this.renderChatList(); } catch (_) {}
    };

    return true;
  }

  function removeShieldFromPrivacyModal() {
    const modal = document.getElementById('privacy-settings-modal');
    if (!modal) return;

    // Remove only the Stranger Shield control/section from Privacy. The dedicated
    // Anti-Fraud Stranger Shield menu item/modal remains untouched.
    const candidates = Array.from(modal.querySelectorAll('div,section,label,button'));
    for (const el of candidates) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!text.includes('stranger shield') && !text.includes('anti-fraud')) continue;
      if (el.closest('#stranger-shield-modal')) continue;

      // Prefer removing a settings row/card rather than a tiny child label.
      let row = el;
      for (let i = 0; i < 4 && row.parentElement && row.parentElement !== modal; i++) {
        const parent = row.parentElement;
        const parentText = (parent.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (parentText.includes('stranger shield') && parentText.length < 700) row = parent;
        else break;
      }
      row.style.display = 'none';
    }
  }

  function installAuthGuard() {
    const auth = window.AuthManager;
    if (!auth || auth.__gitpitAuthUiV4) return !!auth;
    auth.__gitpitAuthUiV4 = true;

    if (typeof auth.showLoginModal === 'function') {
      const originalShow = auth.showLoginModal.bind(auth);
      auth.showLoginModal = function() {
        if (hasAuthenticatedSession() && this.currentUser && this.authToken) {
          keepAuthenticatedUiVisible();
          return;
        }
        return originalShow();
      };
    }
    return true;
  }

  function apply() {
    installChatDeleteFix();
    installAuthGuard();
    keepAuthenticatedUiVisible();
    removeShieldFromPrivacyModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      apply();
      if (tries > 40 || (window.ChatEngine && window.AuthManager)) clearInterval(timer);
    }, 250);
    setTimeout(apply, 50);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(apply, 100);
  });
  window.addEventListener('pageshow', () => setTimeout(apply, 100));
  window.addEventListener('online', () => setTimeout(keepAuthenticatedUiVisible, 100));

  // Privacy modal content can be rendered dynamically, so re-clean when opened.
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('#menu-opt-privacy, [onclick*="openPrivacySettingsModal"]') : null;
    if (t) setTimeout(removeShieldFromPrivacyModal, 100);
  }, true);
})();
