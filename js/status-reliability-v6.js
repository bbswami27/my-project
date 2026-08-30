'use strict';

// GitPit v1.0.4 Point 5 — durable, realtime text/photo/video status.
(function installStatusReliabilityV6() {
  function apiBase() { return window.API_BASE || 'https://chitchat-chatterpatter.onrender.com'; }
  function authToken() { return (window.AuthManager && window.AuthManager.authToken) || localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token') || ''; }
  function headers(json = false) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    const t = authToken(); if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  async function uploadMedia(dataUrl, fileName, fileType) {
    const r = await fetch(`${apiBase()}/api/media/upload`, {
      method: 'POST', headers: headers(true),
      body: JSON.stringify({ dataUrl, fileName, fileType })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success || !d.mediaUrl) throw new Error(d.error || `Media upload failed (${r.status})`);
    return d.mediaUrl;
  }

  function serverStatusToStory(s) {
    if (!s) return null;
    const userId = s.userId || s.authorId || s.senderId || 'unknown';
    const item = {
      type: s.type || (s.mediaUrl ? 'image' : 'text'),
      mediaUrl: s.mediaUrl || s.url || '',
      text: s.text || s.caption || '',
      caption: s.caption || s.text || '',
      bgColor: s.bgColor || '#0284c7'
    };
    return {
      id: s.storyId || `story_${userId}`,
      authorId: userId,
      authorName: s.author || s.authorName || 'GitPit User',
      authorAvatar: s.avatar || s.authorAvatar || 'assets/logo-icon.svg',
      time: s.time || 'Recent',
      timestamp: Number(s.timestamp || s.createdAt || Date.now()),
      viewed: false,
      items: [item]
    };
  }

  function mergeServerStatus(manager, status) {
    const incoming = serverStatusToStory(status);
    if (!incoming || !manager) return;
    const existing = manager.stories.find(st => st.id === incoming.id || (st.authorId === incoming.authorId && incoming.authorId !== 'unknown'));
    if (existing) {
      const it = incoming.items[0];
      const duplicate = (existing.items || []).some(x => x.serverId === status.id || (x.mediaUrl && it.mediaUrl && x.mediaUrl === it.mediaUrl && x.text === it.text));
      if (!duplicate) existing.items = [...(existing.items || []), { ...it, serverId: status.id }];
      existing.time = incoming.time; existing.timestamp = incoming.timestamp;
    } else {
      incoming.items[0].serverId = status.id;
      manager.stories.unshift(incoming);
    }
    manager.saveStories(); manager.renderStatusTab();
  }

  async function refreshStatuses(manager) {
    if (!authToken()) return;
    try {
      const r = await fetch(`${apiBase()}/api/status`, { headers: headers(false) });
      const d = await r.json();
      const list = Array.isArray(d) ? d : (Array.isArray(d.statuses) ? d.statuses : []);
      list.forEach(s => mergeServerStatus(manager, s));
    } catch (e) { console.warn('[STATUS V6] refresh failed', e.message); }
  }

  function install() {
    const manager = window.StoriesManager;
    if (!manager || manager.__statusReliabilityV6) return !!manager;
    manager.__statusReliabilityV6 = true;

    manager.publishNewStatus = async function() {
      const textInput = document.getElementById('new-status-text');
      const directText = textInput ? textInput.value.trim() : '';
      if (this.selectedMediaQueue.length === 0 && !directText) {
        alert('Please enter text or attach a photo/video.'); return;
      }
      const me = window.AuthManager && window.AuthManager.currentUser;
      if (!me || !authToken()) { alert('Please log in again before posting status.'); return; }

      const btn = document.getElementById('btn-publish-status');
      const oldLabel = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

      try {
        let items = [];
        if (this.selectedMediaQueue.length) {
          for (const m of this.selectedMediaQueue) {
            let mediaUrl = m.mediaUrl || '';
            if (!mediaUrl && m.dataUrl) {
              const mime = m.type === 'video' ? 'video/mp4' : 'image/jpeg';
              mediaUrl = await uploadMedia(m.dataUrl, m.fileName || `GitPit_Status_${Date.now()}.${m.type === 'video' ? 'mp4' : 'jpg'}`, mime);
            }
            items.push({ type: m.type || 'image', mediaUrl, text: m.caption || m.text || '', caption: m.caption || m.text || '' });
          }
        } else {
          const dot = document.querySelector('.color-dot.active');
          items.push({ type: 'text', text: directText, caption: directText, bgColor: dot ? dot.getAttribute('data-color') : '#0284c7' });
        }

        const posted = [];
        for (const item of items) {
          const payload = { ...item, timestamp: Date.now(), time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) };
          const r = await fetch(`${apiBase()}/api/status`, { method:'POST', headers:headers(true), body:JSON.stringify(payload) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.success) throw new Error(d.error || `Status post failed (${r.status})`);
          posted.push(d.status || payload);
        }

        posted.forEach(s => mergeServerStatus(this, s));
        this.clearSelectedMedia();
        const modal = document.getElementById('create-status-modal'); if (modal) modal.classList.remove('active');
        alert(`✅ ${posted.length} status update${posted.length > 1 ? 's' : ''} posted successfully.`);
      } catch (e) {
        console.error('[STATUS V6] publish failed', e);
        alert(`Status not posted: ${e.message}`);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = oldLabel || 'Post Status ✨'; }
      }
    };

    refreshStatuses(manager);
    const socket = window.ChatterApp && window.ChatterApp.socket;
    if (socket && !socket.__statusV6) {
      socket.__statusV6 = true;
      socket.on('new_status_update', s => mergeServerStatus(manager, s));
    }
    console.log('[STATUS V6] Point 5 durable status installed');
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => { tries++; if (install() || tries > 80) clearInterval(timer); }, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && window.StoriesManager) refreshStatuses(window.StoriesManager); });
  window.addEventListener('online', () => window.StoriesManager && refreshStatuses(window.StoriesManager));
})();
