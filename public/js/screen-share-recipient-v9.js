'use strict';

(function installScreenShareRecipientV9(){
  function getRegisteredContacts(){
    const me = window.AuthManager && window.AuthManager.currentUser;
    const myId = me && me.id;
    const phonebook = window.AuthManager && window.AuthManager.getPhonebook ? window.AuthManager.getPhonebook() : {};
    const users = (window.ChatEngine && Array.isArray(window.ChatEngine.registeredUsers)) ? window.ChatEngine.registeredUsers : [];
    const map = new Map();
    users.forEach(u => {
      if (!u || !u.id || u.id === myId) return;
      const p10 = String(u.phone || '').replace(/\D/g,'').slice(-10);
      const saved = phonebook[u.id] || (p10 ? phonebook[p10] : null);
      map.set(u.id, {
        id: u.id,
        name: (saved && (saved.savedName || saved.name)) || u.name || u.phone || 'GitPit Contact',
        phone: u.phone || '',
        avatar: (saved && (saved.photoUri || saved.avatar)) || u.avatar || 'assets/logo-icon.svg'
      });
    });
    return Array.from(map.values());
  }

  function ensureModal(){
    let modal = document.getElementById('screen-share-recipient-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'screen-share-recipient-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:420px;width:92%;max-height:82vh;display:flex;flex-direction:column;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
          <div>
            <h3 style="margin:0;">🖥️ Share Screen With</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">Select one registered GitPit contact first.</div>
          </div>
          <button type="button" id="screen-share-recipient-close" class="modal-close-btn">✕</button>
        </div>
        <input id="screen-share-recipient-search" class="form-input" type="search" placeholder="Search contact..." style="margin-bottom:10px;">
        <div id="screen-share-recipient-list" style="overflow:auto;display:flex;flex-direction:column;gap:6px;min-height:120px;"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#screen-share-recipient-close').onclick = () => modal.classList.remove('active');
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
    modal.querySelector('#screen-share-recipient-search').addEventListener('input', e => renderList(e.target.value));
    return modal;
  }

  function renderList(filter=''){
    const list = document.getElementById('screen-share-recipient-list');
    if (!list) return;
    const q = String(filter || '').trim().toLowerCase();
    const contacts = getRegisteredContacts().filter(c => !q || String(c.name||'').toLowerCase().includes(q) || String(c.phone||'').includes(q));
    if (!contacts.length) {
      list.innerHTML = '<div style="padding:22px;text-align:center;color:var(--text-muted);">No registered GitPit contacts found. Refresh contacts first.</div>';
      return;
    }
    list.innerHTML = contacts.map(c => `
      <button type="button" class="screen-share-contact" data-id="${c.id}" style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border-subtle);border-radius:10px;background:var(--bg-card);color:var(--text-primary);text-align:left;cursor:pointer;">
        <img src="${c.avatar}" alt="${String(c.name||'Contact').replace(/"/g,'&quot;')}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">
        <span style="flex:1;min-width:0;"><b>${c.name}</b><br><small style="color:var(--text-muted);">${c.phone || 'Registered on GitPit'}</small></span>
        <span>›</span>
      </button>`).join('');
    list.querySelectorAll('.screen-share-contact').forEach(btn => {
      btn.onclick = () => {
        const c = contacts.find(x => x.id === btn.dataset.id);
        if (c) startFor(c);
      };
    });
  }

  function startFor(contact){
    const modal = document.getElementById('screen-share-recipient-modal');
    if (modal) modal.classList.remove('active');
    if (!window.CallManager || typeof window.CallManager.startCall !== 'function') {
      alert('Calling service is not ready yet. Please try again.');
      return;
    }
    window.__gitpitScreenShareRecipient = contact;
    window.CallManager.startCall(contact.name, contact.avatar || 'assets/logo-icon.svg', 'video', contact.id);
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const cm = window.CallManager;
      if (cm && cm.activeCall && !cm.isScreenSharing && typeof cm.toggleScreenShare === 'function') {
        clearInterval(timer);
        setTimeout(() => cm.toggleScreenShare(), 500);
      } else if (tries > 30) clearInterval(timer);
    }, 300);
  }

  function openPicker(){
    const modal = ensureModal();
    const search = modal.querySelector('#screen-share-recipient-search');
    if (search) search.value = '';
    renderList('');
    modal.classList.add('active');
  }

  function patch(){
    if (!window.ChatterApp || window.ChatterApp.__screenShareRecipientV9) return false;
    window.ChatterApp.__screenShareRecipientV9 = true;
    window.ChatterApp.startScreenSharing = openPicker;
    console.log('[SCREEN SHARE V9] recipient selection required');
    return true;
  }

  let tries=0;
  const t=setInterval(()=>{ tries++; if(patch() || tries>80) clearInterval(t); },250);
  window.addEventListener('online',patch);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) patch(); });
})();
