'use strict';

// GitPit Contact Directory v5
// Canonical contact pipeline for device phonebook -> registered GitPit users -> New Chat directory.
(function installGitPitContactDirectoryV5() {
  const API = () => window.API_BASE || 'https://chitchat-chatterpatter.onrender.com';
  const digits10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);
  const normalizePhone = (value) => {
    const d = digits10(value);
    return d.length === 10 ? `+91${d}` : '';
  };
  const safeJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch (_) { return fallback; }
  };

  function contactName(contact) {
    if (!contact) return 'Contact';
    if (typeof contact.name === 'string' && contact.name.trim()) return contact.name.trim();
    if (contact.name && typeof contact.name === 'object') {
      const value = contact.name.display || [contact.name.given, contact.name.middle, contact.name.family].filter(Boolean).join(' ');
      if (value) return value;
    }
    return contact.displayName || contact.givenName || contact.fullName || 'Contact';
  }

  function contactNumbers(contact) {
    const out = [];
    const candidates = [];
    if (Array.isArray(contact?.phones)) candidates.push(...contact.phones);
    if (Array.isArray(contact?.phoneNumbers)) candidates.push(...contact.phoneNumbers);
    if (Array.isArray(contact?.tel)) candidates.push(...contact.tel);
    if (contact?.phoneNumber) candidates.push(contact.phoneNumber);
    if (contact?.phone) candidates.push(contact.phone);
    candidates.forEach((candidate) => {
      const raw = typeof candidate === 'string'
        ? candidate
        : (candidate?.number || candidate?.value || candidate?.phoneNumber || candidate?.phone || '');
      const phone = normalizePhone(raw);
      if (phone && !out.includes(phone)) out.push(phone);
    });
    return out;
  }

  async function readDeviceContacts(interactive) {
    const plugin = window.Capacitor?.Plugins?.Contacts;
    if (!plugin) {
      if (interactive) alert('Contacts access is not available in this APK. Please install the latest GitPit build.');
      return [];
    }
    try {
      if (typeof plugin.requestPermissions === 'function') {
        const permission = await plugin.requestPermissions();
        const state = permission?.contacts || permission?.readContacts || permission?.read;
        if (state && !['granted', 'limited'].includes(state)) {
          if (interactive) alert('Please allow Contacts permission for GitPit.');
          return [];
        }
      }
    } catch (error) {
      console.warn('[CONTACT V5] permission warning', error);
    }

    try {
      let result;
      try {
        result = await plugin.getContacts({ projection: { name: true, phones: true, image: true } });
      } catch (_) {
        result = await plugin.getContacts();
      }
      return Array.isArray(result?.contacts) ? result.contacts : [];
    } catch (error) {
      console.error('[CONTACT V5] device read failed', error);
      if (interactive) alert('Phone contacts could not be read. Please check Contacts permission.');
      return [];
    }
  }

  function buildDeviceDirectory(nativeContacts) {
    const directory = {};
    nativeContacts.forEach((contact) => {
      const name = contactName(contact);
      const avatar = contact?.image?.base64String || contact?.photoUri || contact?.avatar || '';
      contactNumbers(contact).forEach((phone) => {
        const key = digits10(phone);
        if (!key) return;
        directory[key] = {
          id: `device_${key}`,
          savedName: name,
          name,
          phone,
          originalPhone: phone,
          avatar: avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
          source: 'device',
          isSavedContact: true,
          isRegistered: false
        };
      });
    });
    return directory;
  }

  async function lookupRegistered(deviceDirectory) {
    const token = window.AuthManager?.authToken || localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token') || '';
    const numbers = Object.values(deviceDirectory).map((entry) => entry.phone).filter(Boolean);
    const matched = [];

    for (let i = 0; i < numbers.length; i += 150) {
      const chunk = numbers.slice(i, i + 150);
      try {
        const response = await fetch(`${API()}/api/contacts/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({ phoneNumbers: chunk })
        });
        if (!response.ok) continue;
        const data = await response.json();
        const users = data.matchedUsers || data.registered || data.users || [];
        if (Array.isArray(users)) matched.push(...users);
      } catch (error) {
        console.warn('[CONTACT V5] contact matching failed', error);
      }
    }

    // Fetch complete registered directory too. This ensures registered GitPit users appear in New Chat
    // even before they have an existing chat thread.
    try {
      const currentId = window.AuthManager?.currentUser?.id || '';
      const response = await fetch(`${API()}/api/users${currentId ? `?userId=${encodeURIComponent(currentId)}` : ''}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      if (response.ok) {
        const users = await response.json();
        if (Array.isArray(users)) {
          users.forEach((user) => {
            const d = digits10(user?.phone);
            if (!user || !d) return;
            if (!matched.some((m) => m.id === user.id || digits10(m.phone) === d)) matched.push(user);
          });
        }
      }
    } catch (error) {
      console.warn('[CONTACT V5] registered directory fetch failed', error);
    }

    return matched;
  }

  function mergeDirectory(deviceDirectory, registeredUsers) {
    const currentUser = window.AuthManager?.currentUser || null;
    const myId = currentUser?.id || '';
    const myPhone = digits10(currentUser?.phone);
    const appDirectory = new Map();

    // Device contacts first so device-saved names always win.
    Object.values(deviceDirectory).forEach((entry) => {
      const d = digits10(entry.phone);
      if (d && d !== myPhone) appDirectory.set(d, { ...entry });
    });

    (registeredUsers || []).forEach((user) => {
      if (!user || user.id === myId) return;
      const d = digits10(user.phone);
      if (!d || d === myPhone) return;
      const saved = appDirectory.get(d);
      const merged = {
        id: user.id || saved?.id || `user_${d}`,
        registeredUserId: user.id || '',
        name: saved?.savedName || saved?.name || user.name || `+91 ${d}`,
        savedName: saved?.savedName || saved?.name || user.name || `+91 ${d}`,
        phone: normalizePhone(user.phone || saved?.phone),
        originalPhone: saved?.originalPhone || saved?.phone || normalizePhone(user.phone),
        avatar: saved?.avatar || user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || d)}`,
        bio: user.bio || 'GitPit Member',
        online: !!user.online,
        source: saved ? 'device' : 'gitpit',
        isSavedContact: !!saved,
        isRegistered: true,
        is_registered: true
      };
      appDirectory.set(d, merged);
    });

    const list = Array.from(appDirectory.values()).sort((a, b) => {
      if (a.isRegistered !== b.isRegistered) return a.isRegistered ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    const phonebook = {};
    list.forEach((entry) => {
      const d = digits10(entry.phone || entry.originalPhone);
      if (!d) return;
      phonebook[d] = { ...entry };
      if (entry.registeredUserId) phonebook[entry.registeredUserId] = { ...entry };
    });

    localStorage.setItem('gitpit_device_contacts', JSON.stringify(Object.values(deviceDirectory)));
    localStorage.setItem('gitpit_phonebook', JSON.stringify(phonebook));
    localStorage.setItem('gitpit_registered_directory', JSON.stringify(list.filter((entry) => entry.isRegistered)));
    localStorage.setItem('gitpit_synced_contacts', JSON.stringify(list.filter((entry) => entry.isRegistered)));
    localStorage.setItem('gitpit_last_contact_refresh', String(Date.now()));

    return list;
  }

  function ensureChatForContact(entry) {
    const chat = window.ChatEngine;
    if (!chat || !entry) return null;
    const d = digits10(entry.phone || entry.originalPhone);
    const id = entry.registeredUserId || entry.id || (d ? `user_${d}` : '');
    if (!id) return null;
    let thread = (chat.chats || []).find((item) => item.id === id || (d && digits10(item.phone) === d));
    if (!thread) {
      thread = {
        id,
        name: entry.savedName || entry.name || entry.phone,
        phone: entry.phone || entry.originalPhone || '',
        avatar: entry.avatar || 'assets/logo-icon.svg',
        bio: entry.bio || (entry.isRegistered ? 'GitPit Member' : 'Phone Contact'),
        online: !!entry.online,
        isRegistered: !!entry.isRegistered,
        is_registered: !!entry.isRegistered,
        isGroup: false,
        isAi: false,
        unreadCount: 0,
        messages: []
      };
      chat.chats.push(thread);
      try { chat.saveChats(); } catch (_) {}
    } else {
      thread.name = entry.savedName || entry.name || thread.name;
      thread.phone = entry.phone || thread.phone;
      thread.avatar = entry.avatar || thread.avatar;
      thread.isRegistered = !!entry.isRegistered;
      thread.is_registered = !!entry.isRegistered;
    }
    return thread;
  }

  function startChat(entry) {
    if (!entry?.isRegistered) {
      const phone = entry?.phone || entry?.originalPhone || '';
      if (phone && typeof window.ChatEngine?.inviteContact === 'function') {
        window.ChatEngine.inviteContact(phone, entry.name || 'Contact');
      } else if (phone) {
        alert(`${entry.name || phone} is not registered on GitPit. You can invite this contact.`);
      }
      return;
    }
    const thread = ensureChatForContact(entry);
    if (!thread) return;
    closeNewChatModal();
    if (typeof window.ChatEngine?.openChat === 'function') window.ChatEngine.openChat(thread.id);
  }

  function closeNewChatModal() {
    const roots = document.querySelectorAll('#new-chat-modal, #new-contact-chat-modal, .new-chat-modal, [data-modal="new-chat"]');
    roots.forEach((root) => root.classList.remove('active'));
  }

  function findNewChatRoot() {
    return document.querySelector('#new-chat-modal, #new-contact-chat-modal, .new-chat-modal, [data-modal="new-chat"]') ||
      Array.from(document.querySelectorAll('.modal, .overlay-modal, [role="dialog"]')).find((node) => /new\s*chat/i.test(node.textContent || '')) || null;
  }

  function findDirectoryContainer(root) {
    if (!root) return null;
    return root.querySelector('#new-chat-contacts-list, #new-chat-contact-list, #new-chat-list, #registered-contacts-list, .new-chat-contacts-list, .new-chat-contact-list, [data-role="new-chat-list"]') ||
      Array.from(root.querySelectorAll('ul, .contact-list, .contacts-list, .modal-body, .modal-content')).find((node) => /contact|registered/i.test(node.className || node.id || '')) || null;
  }

  function renderNewChatDirectory() {
    const root = findNewChatRoot();
    if (!root) return false;
    const container = findDirectoryContainer(root);
    if (!container) return false;

    const registered = safeJson('gitpit_registered_directory', []);
    const device = safeJson('gitpit_device_contacts', []);
    const byPhone = new Map();
    device.forEach((entry) => {
      const d = digits10(entry.phone || entry.originalPhone);
      if (d) byPhone.set(d, { ...entry });
    });
    registered.forEach((entry) => {
      const d = digits10(entry.phone || entry.originalPhone);
      if (d) byPhone.set(d, { ...byPhone.get(d), ...entry, isRegistered: true });
    });
    const directory = Array.from(byPhone.values()).sort((a, b) => {
      if (!!a.isRegistered !== !!b.isRegistered) return a.isRegistered ? -1 : 1;
      return String(a.name || a.savedName || '').localeCompare(String(b.name || b.savedName || ''));
    });

    container.innerHTML = '';
    if (!directory.length) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted,#8696a0)">No contacts found. Tap Refresh Contacts after allowing phonebook access.</div>';
    } else {
      directory.forEach((entry) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'gitpit-directory-contact-row';
        row.style.cssText = 'width:100%;display:flex;align-items:center;gap:12px;padding:11px 12px;border:0;border-bottom:1px solid rgba(127,127,127,.16);background:transparent;color:inherit;text-align:left;cursor:pointer;';
        const label = entry.isRegistered ? 'GitPit • Registered' : 'Phone contact • Invite';
        row.innerHTML = `<img src="${entry.avatar || 'assets/logo-icon.svg'}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover"><span style="min-width:0;flex:1"><strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(entry.savedName || entry.name || entry.phone || 'Contact')}</strong><small style="display:block;opacity:.72;margin-top:2px">${escapeHtml(entry.phone || '')} • ${label}</small></span>${entry.isRegistered ? '<span title="Registered" style="font-size:18px">✓</span>' : '<span style="font-size:12px;opacity:.75">INVITE</span>'}`;
        row.addEventListener('click', () => startChat(entry));
        container.appendChild(row);
      });
    }

    activateNewContactButton(root);
    addRefreshButton(root);
    return true;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function activateNewContactButton(root) {
    const candidates = Array.from(root.querySelectorAll('button, [role="button"], .btn'));
    const button = candidates.find((node) => /new\s*contact|add\s*contact|save\s*contact/i.test((node.textContent || '').trim()));
    if (!button || button.dataset.gitpitContactV5Bound === '1') return;
    button.dataset.gitpitContactV5Bound = '1';
    button.disabled = false;
    button.style.pointerEvents = 'auto';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof window.ChatEngine?.openSaveContactModal === 'function') {
        window.ChatEngine.openSaveContactModal();
      } else if (typeof window.AuthManager?.openContactSyncModal === 'function') {
        window.AuthManager.openContactSyncModal();
      }
    });
  }

  function addRefreshButton(root) {
    if (root.querySelector('[data-gitpit-contact-refresh="v5"]')) return;
    const header = root.querySelector('.modal-header, .modal-title, header') || root;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.gitpitContactRefresh = 'v5';
    button.textContent = '↻ Refresh Contacts';
    button.style.cssText = 'margin:8px;padding:7px 10px;border-radius:8px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;cursor:pointer;font-weight:600;';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Refreshing…';
      await syncAllContacts(true);
      button.disabled = false;
      button.textContent = '↻ Refresh Contacts';
    });
    header.appendChild(button);
  }

  async function syncAllContacts(interactive) {
    const nativeContacts = await readDeviceContacts(!!interactive);
    const deviceDirectory = buildDeviceDirectory(nativeContacts);
    const registeredUsers = await lookupRegistered(deviceDirectory);
    const directory = mergeDirectory(deviceDirectory, registeredUsers);

    const chat = window.ChatEngine;
    if (chat) {
      chat.registeredUsers = directory.filter((entry) => entry.isRegistered).map((entry) => ({
        id: entry.registeredUserId || entry.id,
        name: entry.savedName || entry.name,
        phone: entry.phone,
        avatar: entry.avatar,
        bio: entry.bio,
        online: !!entry.online,
        isRegistered: true,
        is_registered: true
      }));
      // Do not auto-create chat threads for every phonebook entry. New Chat directory is the contact directory.
      try { chat.renderChatList(); } catch (_) {}
    }

    renderNewChatDirectory();
    window.dispatchEvent(new CustomEvent('gitpit-contacts-refreshed', { detail: { count: directory.length, registered: directory.filter((e) => e.isRegistered).length } }));
    if (interactive) {
      const registeredCount = directory.filter((entry) => entry.isRegistered).length;
      alert(`Contacts refreshed. ${directory.length} phone contacts loaded; ${registeredCount} are registered on GitPit.`);
    }
    return directory;
  }

  function patchManagers() {
    const auth = window.AuthManager;
    const chat = window.ChatEngine;
    if (!auth || !chat) return false;

    if (!auth.__gitpitContactDirectoryV5) {
      auth.__gitpitContactDirectoryV5 = true;
      auth.grantContactsAndSync = (interactive = false) => syncAllContacts(!!interactive);
      auth.syncPhoneContacts = () => syncAllContacts(true);
    }

    if (!chat.__gitpitContactDirectoryV5) {
      chat.__gitpitContactDirectoryV5 = true;
      chat.syncRegisteredUsers = async () => {
        const device = safeJson('gitpit_device_contacts', []);
        const deviceDirectory = {};
        device.forEach((entry) => {
          const d = digits10(entry.phone || entry.originalPhone);
          if (d) deviceDirectory[d] = { ...entry };
        });
        const users = await lookupRegistered(deviceDirectory);
        const directory = mergeDirectory(deviceDirectory, users);
        chat.registeredUsers = directory.filter((entry) => entry.isRegistered).map((entry) => ({
          id: entry.registeredUserId || entry.id,
          name: entry.savedName || entry.name,
          phone: entry.phone,
          avatar: entry.avatar,
          bio: entry.bio,
          online: !!entry.online,
          isRegistered: true,
          is_registered: true
        }));
        renderNewChatDirectory();
        return chat.registeredUsers;
      };
      chat.populateNewChatDirectory = renderNewChatDirectory;
    }

    return true;
  }

  let attempts = 0;
  const boot = setInterval(() => {
    attempts += 1;
    if (patchManagers()) {
      clearInterval(boot);
      if (window.AuthManager?.currentUser) setTimeout(() => syncAllContacts(false), 600);
    } else if (attempts > 80) {
      clearInterval(boot);
    }
  }, 200);

  // Auto sync on app resume / connectivity and periodically while logged in.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.AuthManager?.currentUser) setTimeout(() => syncAllContacts(false), 250);
  });
  window.addEventListener('online', () => {
    if (window.AuthManager?.currentUser) setTimeout(() => syncAllContacts(false), 250);
  });
  setInterval(() => {
    if (window.AuthManager?.currentUser && !document.hidden) syncAllContacts(false);
  }, 30000);

  // New Chat modal can be dynamically opened/rendered.
  const observer = new MutationObserver(() => {
    if (findNewChatRoot()) renderNewChatDirectory();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
})();
