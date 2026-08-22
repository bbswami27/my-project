'use strict';

(function(){
  const API_BASE = window.GITPIT_CORE_API || '';
  const token = () => localStorage.getItem('gitpit_core_token') || '';
  const cacheKey = 'gitpit_core_contacts_cache';

  function normalizeContact(c, index) {
    const displayName = c?.displayName || c?.name?.display || [c?.name?.given,c?.name?.family].filter(Boolean).join(' ') || c?.givenName || c?.fullName || 'Contact';
    const phones = [];
    const src = c?.phones || c?.phoneNumbers || [];
    if (Array.isArray(src)) src.forEach(p => phones.push(typeof p === 'string' ? p : (p?.number || p?.value || '')));
    if (c?.phone) phones.push(c.phone);
    if (c?.phoneNumber) phones.push(c.phoneNumber);
    return { order:index, name:displayName, phones:[...new Set(phones.filter(Boolean))] };
  }

  async function getPlugin(){
    return window.Capacitor?.Plugins?.Contacts || null;
  }

  async function ensurePermission(){
    const p = await getPlugin();
    if (!p) return { granted:false, reason:'contacts_plugin_unavailable' };
    try {
      const current = await p.checkPermissions?.();
      if (current?.contacts === 'granted' || current?.readContacts === 'granted') return { granted:true };
      const requested = await p.requestPermissions?.();
      const granted = requested?.contacts === 'granted' || requested?.readContacts === 'granted';
      return { granted, reason:granted ? null : 'permission_denied' };
    } catch (e) {
      return { granted:false, reason:e.message || 'permission_error' };
    }
  }

  async function readPhonebook(){
    const p = await getPlugin();
    if (!p) return [];
    const perm = await ensurePermission();
    if (!perm.granted) throw new Error(perm.reason || 'Contacts permission denied');
    let result;
    try { result = await p.getContacts({ projection:{ name:true, phones:true } }); }
    catch (_) { result = await p.getContacts(); }
    const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
    return contacts.map(normalizeContact).filter(c => c.phones.length);
  }

  async function matchOnServer(phonebook){
    const r = await fetch(`${API_BASE}/api/v2/contacts/match`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token()}` },
      body:JSON.stringify({ contacts:phonebook })
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data.error || `Contacts sync failed (${r.status})`);
    const payload = { registered:data.registered || [], phonebook:data.phonebook || [], syncedAt:Date.now() };
    localStorage.setItem(cacheKey, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('gitpit-core-contacts-updated',{ detail:payload }));
    return payload;
  }

  async function sync(){
    if (!token()) throw new Error('Login required');
    const phonebook = await readPhonebook();
    return matchOnServer(phonebook);
  }

  function cached(){
    try { return JSON.parse(localStorage.getItem(cacheKey) || '{"registered":[],"phonebook":[]}'); }
    catch (_) { return { registered:[], phonebook:[] }; }
  }

  let timer = null;
  function startAutoSync(){
    stopAutoSync();
    sync().catch(e => console.warn('[CORE V2 CONTACTS] initial sync failed',e.message));
    timer = setInterval(()=>sync().catch(()=>{}), 5 * 60 * 1000);
    window.addEventListener('focus', onFocus);
  }
  function onFocus(){ sync().catch(()=>{}); }
  function stopAutoSync(){ if (timer) clearInterval(timer); timer=null; window.removeEventListener('focus',onFocus); }

  window.GitPitCoreContacts = { ensurePermission, readPhonebook, sync, cached, startAutoSync, stopAutoSync };
})();
