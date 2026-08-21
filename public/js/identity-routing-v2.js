'use strict';

// GitPit Contact Identity & Routing Repair v2
// Read-only device contacts + canonical registered-user mapping.
// Never writes to the Android phonebook and never replaces a saved number with server data.
(function installIdentityRoutingV2() {
  const API = () => window.API_BASE || 'https://chitchat-chatterpatter.onrender.com';
  const digits10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
  const normalizeIndia = (v) => {
    const d = digits10(v);
    return d.length === 10 ? `+91${d}` : '';
  };

  function contactName(c) {
    if (!c) return 'Contact';
    if (typeof c.name === 'string') return c.name;
    if (Array.isArray(c.name)) return c.name[0] || 'Contact';
    if (c.name && typeof c.name === 'object') {
      return c.name.display || [c.name.given, c.name.middle, c.name.family].filter(Boolean).join(' ') || 'Contact';
    }
    return c.displayName || c.givenName || 'Contact';
  }

  function contactNumbers(c) {
    const raw = [];
    const candidates = [];
    if (Array.isArray(c?.phones)) candidates.push(...c.phones);
    if (Array.isArray(c?.phoneNumbers)) candidates.push(...c.phoneNumbers);
    if (Array.isArray(c?.tel)) candidates.push(...c.tel);
    if (c?.phoneNumber) candidates.push(c.phoneNumber);
    if (c?.phone) candidates.push(c.phone);
    for (const p of candidates) {
      const value = typeof p === 'string' ? p : (p?.number || p?.value || p?.phoneNumber || p?.phone || '');
      const n = normalizeIndia(value);
      if (n && !raw.includes(n)) raw.push(n);
    }
    return raw;
  }

  async function getNativeContacts() {
    const plugin = window.Capacitor?.Plugins?.Contacts;
    if (!plugin) return [];
    try {
      if (typeof plugin.requestPermissions === 'function') {
        const perm = await plugin.requestPermissions();
        const state = perm?.contacts || perm?.readContacts || perm?.read;
        if (state && !['granted', 'limited'].includes(state)) return [];
      }
    } catch (e) {
      console.warn('[CONTACT V2] permission request warning:', e.message);
    }

    try {
      let result;
      try {
        result = await plugin.getContacts({ projection: { name: true, phones: true, image: true } });
      } catch (_) {
        result = await plugin.getContacts();
      }
      return Array.isArray(result?.contacts) ? result.contacts : [];
    } catch (e) {
      console.warn('[CONTACT V2] native read warning:', e.message);
      return [];
    }
  }

  function devicePhonebookFrom(contacts) {
    const book = {};
    for (const c of contacts) {
      const name = contactName(c);
      const photo = c?.image?.base64String || c?.photoUri || c?.avatar || '';
      for (const phone of contactNumbers(c)) {
        const d = digits10(phone);
        if (!d) continue;
        book[d] = {
          savedName: name,
          name,
          phone,                  // derived only from the actual device contact
          originalPhone: phone,   // immutable reference used by GitPit
          photoUri: photo,
          avatar: photo || `https://api.dicebear.com/7.x/bottts/svg?seed=${d}`,
          source: 'device',
          isSavedContact: true
        };
      }
    }
    return book;
  }

  function readPhonebook() {
    try { return JSON.parse(localStorage.getItem('gitpit_phonebook') || '{}') || {}; }
    catch (_) { return {}; }
  }

  function writePhonebook(book) {
    localStorage.setItem('gitpit_phonebook', JSON.stringify(book || {}));
  }

  function mergeRegistry(users) {
    const chat = window.ChatEngine;
    if (!chat || !Array.isArray(users)) return;
    const book = readPhonebook();
    const currentId = window.AuthManager?.currentUser?.id;
    const existing = Array.isArray(chat.registeredUsers) ? chat.registeredUsers : [];
    const registry = new Map();

    for (const u of existing) {
      if (!u || u.id === currentId) continue;
      const key = digits10(u.phone) || u.id;
      registry.set(key, u);
    }

    for (const u of users) {
      if (!u || u.id === currentId) continue;
      const d = digits10(u.phone);
      if (!d) continue;
      const saved = book[d];
      const enriched = {
        ...u,
        phone: normalizeIndia(u.phone),
        name: saved?.savedName || saved?.name || u.name || `+91 ${d}`,
        savedName: saved?.savedName || saved?.name || u.name || `+91 ${d}`,
        isRegistered: true,
        is_registered: true
      };
      registry.set(d, enriched);

      // Add server identity to the local phonebook entry without replacing its number.
      if (saved) {
        saved.contactId = u.id;
        saved.registeredUserId = u.id;
        saved.isRegistered = true;
        saved.serverPhone = normalizeIndia(u.phone);
        book[d] = saved;
        book[u.id] = { ...saved };
      }

      // Canonicalize existing chat identity by exact 10-digit phone match.
      for (const c of (chat.chats || [])) {
        if (!c || c.isGroup || c.isAi || c.id === 'chat_ai') continue;
        const chatPhone = digits10(c.phone || c.id);
        if (chatPhone && chatPhone === d) {
          const oldId = c.id;
          c.id = u.id;
          c.phone = normalizeIndia(u.phone);
          c.registeredUserId = u.id;
          c.isRegistered = true;
          c.is_registered = true;
          if (saved?.savedName) c.name = saved.savedName;
          if (chat.activeChatId === oldId) chat.activeChatId = u.id;
        }
      }
    }

    chat.registeredUsers = Array.from(registry.values());
    writePhonebook(book);
    localStorage.setItem('gitpit_synced_contacts', JSON.stringify(chat.registeredUsers));
    try { chat.saveChats(); } catch (_) {}
    try { chat.renderChatList(); } catch (_) {}
  }

  async function resolveNumbers(numbers) {
    const unique = [...new Set((numbers || []).map(normalizeIndia).filter(Boolean))];
    if (!unique.length) return [];
    const matched = [];
    for (let i = 0; i < unique.length; i += 150) {
      const chunk = unique.slice(i, i + 150);
      try {
        const resp = await fetch(`${API()}/api/contacts/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': window.AuthManager?.authToken ? `Bearer ${window.AuthManager.authToken}` : ''
          },
          body: JSON.stringify({ phoneNumbers: chunk })
        });
        const data = await resp.json();
        const list = data.matchedUsers || data.registered || [];
        if (Array.isArray(list)) matched.push(...list);
      } catch (e) {
        console.warn('[CONTACT V2] registration lookup warning:', e.message);
      }
    }
    mergeRegistry(matched);
    return matched;
  }

  async function resolveAllKnownNumbers() {
    const book = readPhonebook();
    const numbers = [];
    for (const [key, entry] of Object.entries(book)) {
      const n = normalizeIndia(entry?.originalPhone || entry?.phone || key);
      if (n) numbers.push(n);
    }
    for (const c of (window.ChatEngine?.chats || [])) {
      const n = normalizeIndia(c?.phone || c?.id);
      if (n) numbers.push(n);
    }
    return resolveNumbers(numbers);
  }

  async function fixedContactSync(interactive = false) {
    const native = await getNativeContacts();
    if (native.length) {
      // Replace stale/corrupted device-derived cache with a fresh READ-ONLY snapshot.
      // Keep manually added GitPit contacts only when they are not present on device.
      const fresh = devicePhonebookFrom(native);
      const previous = readPhonebook();
      for (const [key, entry] of Object.entries(previous)) {
        if (!entry || entry.source === 'device') continue;
        const d = digits10(entry.originalPhone || entry.phone || key);
        if (d && !fresh[d]) fresh[d] = { ...entry, phone: normalizeIndia(entry.originalPhone || entry.phone || key) };
      }
      writePhonebook(fresh);
      localStorage.setItem('gitpit_contacts_synced', 'true');
    }

    const matched = await resolveAllKnownNumbers();
    if (interactive) {
      if (!native.length && !window.Capacitor?.Plugins?.Contacts) {
        alert('Contacts plugin is not available in this build. Please install the latest GitPit APK.');
      } else {
        alert(`✅ Contacts synced safely. ${matched.length} saved contacts are registered on GitPit.`);
      }
    }
    return matched;
  }

  function freezeVerifiedAccountPhone(auth) {
    if (!auth?.currentUser?.id || !auth?.currentUser?.phone) return;
    const key = `gitpit_verified_phone_${auth.currentUser.id}`;
    const current = normalizeIndia(auth.currentUser.phone);
    let verified = localStorage.getItem(key);
    if (!verified && current) {
      verified = current;
      localStorage.setItem(key, verified);
    }
    if (!verified) return;
    auth.currentUser.phone = verified;
    const inp = document.getElementById('profile-phone-input');
    const cc = document.getElementById('profile-country-code-select');
    if (inp) {
      inp.value = digits10(verified);
      inp.readOnly = true;
      inp.title = 'Verified login number. Change requires OTP verification.';
    }
    if (cc) {
      cc.value = '+91';
      cc.disabled = true;
    }
  }

  function install() {
    const auth = window.AuthManager;
    const chat = window.ChatEngine;
    if (!auth || !chat) return false;

    if (!auth.__identityRoutingV2) {
      auth.__identityRoutingV2 = true;
      auth.grantContactsAndSync = fixedContactSync;
      auth.syncPhoneContacts = () => fixedContactSync(true);

      const originalRender = typeof auth.renderAuthenticatedUI === 'function' ? auth.renderAuthenticatedUI.bind(auth) : null;
      if (originalRender) {
        auth.renderAuthenticatedUI = function() {
          const out = originalRender();
          freezeVerifiedAccountPhone(this);
          setTimeout(() => fixedContactSync(false), 900);
          return out;
        };
      }

      const originalProfile = typeof auth.openProfileModal === 'function' ? auth.openProfileModal.bind(auth) : null;
      if (originalProfile) {
        auth.openProfileModal = function() {
          const out = originalProfile();
          freezeVerifiedAccountPhone(this);
          return out;
        };
      }

      const originalSaveProfile = typeof auth.saveUserProfile === 'function' ? auth.saveUserProfile.bind(auth) : null;
      if (originalSaveProfile) {
        auth.saveUserProfile = async function() {
          freezeVerifiedAccountPhone(this);
          const key = this.currentUser?.id ? `gitpit_verified_phone_${this.currentUser.id}` : '';
          const verified = key ? localStorage.getItem(key) : '';
          if (verified) this.currentUser.phone = verified;
          const out = await originalSaveProfile();
          if (verified) {
            this.currentUser.phone = verified;
            localStorage.setItem('gitpit_user', JSON.stringify(this.currentUser));
            localStorage.setItem('chatterpatter_user', JSON.stringify(this.currentUser));
          }
          return out;
        };
      }
    }

    // A saved phonebook contact is known even before registration lookup completes.
    chat.isUnknownContact = function(targetChat) {
      if (!targetChat || targetChat.isGroup || targetChat.isAi || targetChat.id === 'chat_ai') return false;
      const book = readPhonebook();
      const d = digits10(targetChat.phone || targetChat.id);
      if (d && book[d]?.isSavedContact) return false;
      if (targetChat.id && book[targetChat.id]?.isSavedContact) return false;
      return true;
    };

    freezeVerifiedAccountPhone(auth);
    setTimeout(resolveAllKnownNumbers, 300);
    return true;
  }

  let attempts = 0;
  const boot = setInterval(() => {
    attempts += 1;
    if (install() || attempts > 40) clearInterval(boot);
  }, 250);

  window.addEventListener('online', () => setTimeout(resolveAllKnownNumbers, 300));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(resolveAllKnownNumbers, 500);
  });
  setInterval(() => {
    if (window.AuthManager?.currentUser) resolveAllKnownNumbers();
  }, 15000);
})();
