'use strict';

// GitPit v1.0.4 Point 8: schedule meetings and deliver an invitation message to every selected GitPit invitee.
(function installMeetingInvitesV8() {
  const base = () => window.API_BASE || 'https://chitchat-chatterpatter.onrender.com';
  const token = () => (window.AuthManager && window.AuthManager.authToken) || localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token') || '';

  async function postJson(path, body) {
    const r = await fetch(`${base()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token() ? `Bearer ${token()}` : ''
      },
      body: JSON.stringify(body)
    });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
    return data;
  }

  function resolveInvitee(checkbox) {
    const rawId = checkbox && checkbox.dataset ? checkbox.dataset.id : '';
    const rawName = checkbox ? checkbox.value : '';
    const users = (window.ChatEngine && window.ChatEngine.registeredUsers) || [];
    let match = users.find(u => u && u.id === rawId);
    if (!match && rawName) match = users.find(u => u && String(u.name || '').toLowerCase() === String(rawName).toLowerCase());
    if (!match && rawId && window.ChatEngine) {
      const chat = (window.ChatEngine.chats || []).find(c => c.id === rawId);
      if (chat) match = { id: chat.id, name: chat.name, phone: chat.phone, avatar: chat.avatar };
    }
    return match || (rawId ? { id: rawId, name: rawName || 'GitPit User' } : null);
  }

  async function sendInvite(meeting, invitee, host) {
    if (!invitee || !invitee.id) throw new Error('Invitee is not a registered GitPit user');
    const now = Date.now();
    const text = `📅 GitPit Meeting Invitation\n\n${host.name || 'A GitPit user'} invited you to: ${meeting.title}\nDate: ${meeting.date}\nTime: ${meeting.time}\nDuration: ${meeting.duration}\n\nOpen GitPit Meetings to view the meeting.`;
    return postJson('/api/messages', {
      id: `meet_inv_${meeting.id}_${invitee.id}_${now}`,
      chatId: invitee.id,
      recipientId: invitee.id,
      recipientPhone: invitee.phone || '',
      senderId: host.id,
      senderName: host.name || 'GitPit User',
      senderPhone: host.phone || '',
      senderAvatar: host.avatar || '',
      type: 'meeting_invite',
      text,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      meetingDate: meeting.date,
      meetingTime: meeting.time,
      meetingDuration: meeting.duration,
      timestamp: now,
      createdAt: now,
      status: 'sent'
    });
  }

  function install() {
    const chat = window.ChatEngine;
    if (!chat || chat.__meetingInvitesV8) return !!chat;
    chat.__meetingInvitesV8 = true;

    chat.submitScheduleMeeting = async function() {
      const titleInput = document.getElementById('meeting-title-input');
      const dateInput = document.getElementById('meeting-date-input');
      const timeInput = document.getElementById('meeting-time-input');
      const durationInput = document.getElementById('meeting-duration-input');
      const title = titleInput ? titleInput.value.trim() : '';
      const date = dateInput ? dateInput.value : '';
      const time = timeInput ? timeInput.value : '';
      const duration = durationInput ? durationInput.value : '45 mins';
      if (!title || !date || !time) { alert('Please fill in all meeting details.'); return; }

      const checked = Array.from(document.querySelectorAll('.meeting-invitee-checkbox:checked'));
      if (checked.length > 100) { alert('Maximum 100 invitees allowed per meeting session.'); return; }
      if (checked.length === 0) { alert('Please select at least one GitPit invitee.'); return; }

      const host = window.AuthManager && window.AuthManager.currentUser;
      if (!host || !token()) { alert('Please log in again before scheduling a meeting.'); return; }
      const invitees = checked.map(resolveInvitee).filter(Boolean);
      const unresolved = invitees.filter(i => !i.id || String(i.id).startsWith('invite_'));
      if (unresolved.length) {
        alert('One or more selected contacts are not registered on GitPit. Please select registered GitPit contacts only.');
        return;
      }

      const meeting = {
        id: `meet_${Date.now()}`,
        title, date, time, duration,
        invitees: invitees.map(i => ({ id: i.id, name: i.name || '', phone: i.phone || '' })),
        participantCount: invitees.length + 1,
        hostId: host.id,
        host: host.name || 'You',
        hostPhone: host.phone || '',
        avatar: host.avatar || 'assets/logo-icon.svg',
        createdAt: Date.now()
      };

      // Save locally immediately so scheduling never appears to fail because of network latency.
      if (window.ChatterApp) {
        window.ChatterApp.meetings = window.ChatterApp.meetings || [];
        window.ChatterApp.meetings.unshift(meeting);
        localStorage.setItem('chatterpatter_meetings', JSON.stringify(window.ChatterApp.meetings));
        localStorage.setItem('gitpit_meetings', JSON.stringify(window.ChatterApp.meetings));
        if (typeof window.ChatterApp.renderMeetingsTab === 'function') window.ChatterApp.renderMeetingsTab();
      }

      // Try the existing meeting endpoint when available, but invite delivery does not depend on it.
      try { await postJson('/api/meetings', meeting); } catch (e) { console.warn('[MEETING V8] meeting API unavailable; local schedule retained:', e.message); }

      const results = await Promise.allSettled(invitees.map(i => sendInvite(meeting, i, host)));
      const delivered = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - delivered;
      meeting.invitesDelivered = delivered;
      meeting.invitesFailed = failed;
      if (window.ChatterApp) {
        localStorage.setItem('chatterpatter_meetings', JSON.stringify(window.ChatterApp.meetings));
        localStorage.setItem('gitpit_meetings', JSON.stringify(window.ChatterApp.meetings));
        if (typeof window.ChatterApp.renderMeetingsTab === 'function') window.ChatterApp.renderMeetingsTab();
      }

      document.getElementById('schedule-meeting-modal')?.classList.remove('active');
      if (titleInput) titleInput.value = '';
      if (dateInput) dateInput.value = '';
      if (timeInput) timeInput.value = '';
      checked.forEach(cb => { cb.checked = false; });
      const counter = document.getElementById('meeting-invitees-counter');
      if (counter) counter.textContent = 'Selected: 0 / 100 max';

      if (failed === 0) alert(`📅 Meeting scheduled. Invitation delivered to all ${delivered} invitee(s).`);
      else alert(`📅 Meeting scheduled. ${delivered} invitation(s) delivered; ${failed} failed. Please retry failed invitees.`);
    };

    console.log('[MEETING V8] Point 8 meeting invite delivery installed');
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => { tries++; if (install() || tries > 80) clearInterval(timer); }, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) install(); });
})();
