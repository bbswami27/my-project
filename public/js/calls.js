// ChatterPatter - Audio & Video Calling Manager (with Screen Sharing, Group Calls, Camera Toggle, Silent & Delete)

class CallManager {
  constructor() {
    this.callLogs = [];
    this.activeCall = null;
    this.callDurationTimer = null;
    this.callSeconds = 0;
    this.ringtoneInterval = null;
    this.localStream = null;
    this.screenStream = null;
    this.isScreenSharing = false;
    this.remoteAudioCtx = null;
    this.isMicMuted = false;
    this.isSpeakerMuted = false;
    this.isCameraOff = false;
    this.isSilent = false;
    this.currentFacingMode = 'user';
    this.groupParticipants = [];
    this.animationFrameId = null;
    this.init();
  }

  init() {
    const saved = localStorage.getItem('chatterpatter_calls') || localStorage.getItem('gitpit_calls');
    if (saved) {
      try {
        this.callLogs = JSON.parse(saved);
      } catch (e) {
        this.callLogs = [...window.MOCK_DATA.initialCalls];
      }
    } else {
      this.callLogs = [...window.MOCK_DATA.initialCalls];
    }

    this.bindEvents();
    this.renderCallsTab();
  }

  bindEvents() {
    // End Call Button
    const endBtn = document.getElementById('btn-end-call');
    if (endBtn) {
      endBtn.addEventListener('click', () => this.endCall());
    }

    // Mute Microphone (Outgoing Audio)
    const micBtn = document.getElementById('btn-call-mute');
    if (micBtn) {
      micBtn.addEventListener('click', () => this.toggleMicMute());
    }

    // Mute Speaker / Deafening (Incoming Audio)
    const speakerBtn = document.getElementById('btn-call-speaker-mute');
    if (speakerBtn) {
      speakerBtn.addEventListener('click', () => this.toggleSpeakerMute());
    }

    // Toggle Camera ON / OFF
    const cameraBtn = document.getElementById('btn-call-camera');
    if (cameraBtn) {
      cameraBtn.addEventListener('click', () => this.toggleCamera());
    }

    // Toggle Screen Share
    const screenshareBtn = document.getElementById('btn-call-screenshare');
    if (screenshareBtn) {
      screenshareBtn.addEventListener('click', () => this.toggleScreenShare());
    }

    // Flip Front/Back Camera
    const flipBtn = document.getElementById('btn-call-flip-camera');
    if (flipBtn) {
      flipBtn.addEventListener('click', () => this.flipCamera());
    }

    // Add Participant to Call (Group Call)
    const addParticipantBtn = document.getElementById('btn-call-add-participant');
    if (addParticipantBtn) {
      addParticipantBtn.addEventListener('click', () => this.openAddParticipantModal());
    }

    // Silent Ringtone Button
    const silentBtn = document.getElementById('btn-call-silent');
    if (silentBtn) {
      silentBtn.addEventListener('click', () => this.toggleSilent());
    }

    // Close Add Participant Modal
    const closeAddModal = document.getElementById('btn-close-add-participant');
    if (closeAddModal) {
      closeAddModal.addEventListener('click', () => {
        document.getElementById('add-participant-modal').classList.remove('active');
      });
    }

    // Incoming Call Permission Choices
    const btnAcceptVideo = document.getElementById('btn-incoming-accept-video');
    const btnAcceptAudio = document.getElementById('btn-incoming-accept-audio');
    const btnDecline = document.getElementById('btn-incoming-decline');

    if (btnAcceptVideo) {
      btnAcceptVideo.addEventListener('click', () => {
        const promptModal = document.getElementById('incoming-call-prompt-modal');
        if (promptModal) promptModal.classList.remove('active');
        if (this.pendingIncomingCall) {
          const { name, avatar, contactId } = this.pendingIncomingCall;
          this.startCall(name, avatar, 'video', contactId);
        }
      });
    }

    if (btnAcceptAudio) {
      btnAcceptAudio.addEventListener('click', () => {
        const promptModal = document.getElementById('incoming-call-prompt-modal');
        if (promptModal) promptModal.classList.remove('active');
        if (this.pendingIncomingCall) {
          const { name, avatar, contactId } = this.pendingIncomingCall;
          this.startCall(name, avatar, 'audio', contactId);
        }
      });
    }

    if (btnDecline) {
      btnDecline.addEventListener('click', () => {
        const promptModal = document.getElementById('incoming-call-prompt-modal');
        if (promptModal) promptModal.classList.remove('active');
        this.stopRingtone();
        this.pendingIncomingCall = null;
        alert('Call declined.');
      });
    }
  }

  showIncomingCallPrompt(name, avatar, type = 'video', contactId = null) {
    const videoPrivacy = localStorage.getItem('gitpit_video_call_privacy') || 'contacts';
    const isSavedContact = window.ChatEngine && window.ChatEngine.chats.some(c => c.id === contactId || c.name === name);
    const videoBlockedList = JSON.parse(localStorage.getItem('gitpit_video_blocked_contacts') || '[]');
    const isPerContactVideoBlocked = contactId && videoBlockedList.includes(contactId);

    // 1. Check Per-Contact Video Block
    if (type === 'video' && isPerContactVideoBlocked) {
      console.log('Video calls from this contact are blocked in personal settings.');
      alert(`🚫 Incoming video call from "${name}" was blocked because video calling is blocked for this contact.`);
      return;
    }

    // 2. Block All Video Calls (Nobody / Voice Only Mode)
    if (type === 'video' && videoPrivacy === 'nobody') {
      console.log('All incoming video calls are blocked in privacy settings.');
      alert(`🚫 Incoming video call from "${name}" was declined because "Block All Video Calls" is active in your Settings.`);
      return;
    }

    // 3. Selected Persons Only Video Privacy
    if (type === 'video' && videoPrivacy === 'selected') {
      const allowedList = JSON.parse(localStorage.getItem('gitpit_allowed_video_contacts') || '[]');
      if (!contactId || !allowedList.includes(contactId)) {
        console.log('Caller is not in allowed video callers list.');
        alert(`🚫 Incoming video call from "${name}" was blocked because your Privacy Settings only allow video calls from Selected Persons.`);
        return;
      }
    }

    // 4. Contacts Only Video Privacy (Block Unknown)
    if (type === 'video' && videoPrivacy === 'contacts' && !isSavedContact) {
      console.log('Blocked incoming video call from unknown caller due to privacy settings.');
      alert(`🚫 Incoming video call from unknown caller "${name}" was automatically blocked by your privacy settings.`);
      return;
    }

    this.pendingIncomingCall = { name, avatar, type, contactId };

    document.getElementById('incoming-caller-name').textContent = name;
    document.getElementById('incoming-call-avatar').src = avatar;
    document.getElementById('incoming-call-subtitle').textContent = `Incoming ${type === 'video' ? 'Video' : 'Voice'} Call from ${name}...`;

    const promptModal = document.getElementById('incoming-call-prompt-modal');
    if (promptModal) promptModal.classList.add('active');

    this.startRingtone();
  }

  renderCallsTab() {
    const listElem = document.getElementById('calls-list-items');
    if (!listElem) return;

    if (this.callLogs.length === 0) {
      listElem.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">No call history.</div>`;
      return;
    }

    listElem.innerHTML = this.callLogs.map(call => {
      let icon = '📞';
      let iconClass = 'call-icon-outgoing';
      if (call.direction === 'incoming') {
        icon = '↙';
        iconClass = 'call-icon-incoming';
      } else if (call.direction === 'missed') {
        icon = '↙';
        iconClass = 'call-icon-missed';
      } else {
        icon = '↗';
      }

      return `
        <div class="call-item" id="call-entry-${call.id}">
          <div class="avatar-wrapper">
            <img class="avatar-img" src="${call.avatar}" alt="${call.name}">
          </div>
          <div class="call-meta">
            <span class="call-user-name">${call.name}</span>
            <div class="call-info-row">
              <span class="${iconClass}">${icon}</span>
              <span>${call.time} • ${call.duration || '0:00'}</span>
            </div>
          </div>
          <div class="call-actions-group">
            <button class="call-action-btn" title="Call back" onclick="window.CallManager.showIncomingCallPrompt('${call.name}', '${call.avatar}', '${call.type || 'video'}', '${call.id}')">
              ${call.type === 'video' ? '📹' : '📞'}
            </button>
            <button class="call-delete-btn" title="Delete call log" onclick="window.CallManager.deleteCall('${call.id}')">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  deleteCall(callId) {
    this.callLogs = this.callLogs.filter(c => c.id !== callId);
    this.saveCalls();
    this.renderCallsTab();
  }

  async startCall(name, avatar, type = 'audio', contactId = null) {
    const videoBlockedList = JSON.parse(localStorage.getItem('gitpit_video_blocked_contacts') || '[]');
    const isPerContactVideoBlocked = contactId && videoBlockedList.includes(contactId);

    if (type === 'video' && isPerContactVideoBlocked) {
      alert(`🚫 Video calling is blocked for "${name}". You can still make Voice Calls or unblock video in contact options.`);
      return;
    }

    // Check Unknown Video Blocker Setting
    const blockUnknownVideo = localStorage.getItem('gitpit_block_unknown_video') !== 'false';
    const isSavedContact = window.ChatEngine && window.ChatEngine.chats.some(c => c.id === contactId || c.name === name);

    if (type === 'video' && blockUnknownVideo && !isSavedContact && contactId && contactId.startsWith('chat_user_unknown')) {
      alert('🚫 Video calls with unsaved numbers are restricted in your Privacy Settings.');
      return;
    }

    this.activeCall = {
      name,
      avatar,
      type,
      contactId,
      direction: 'outgoing',
      status: 'ringing'
    };
    this.groupParticipants = [{ name, avatar }];
    this.isCameraOff = false;
    this.isMicMuted = false;
    this.isSpeakerMuted = false;
    this.isSilent = false;

    const modal = document.getElementById('call-overlay-modal');
    if (modal) modal.classList.add('active');

    document.getElementById('call-caller-name').textContent = name;
    document.getElementById('call-big-avatar').src = avatar;
    document.getElementById('call-status-badge').textContent = 'Ringing... 🔔';

    const videoContainer = document.getElementById('call-video-container');
    const avatarContainer = document.getElementById('call-avatar-container');
    const flipBtn = document.getElementById('btn-call-flip-camera');
    const groupGrid = document.getElementById('group-call-grid');
    if (groupGrid) groupGrid.classList.remove('active');

    if (type === 'video') {
      videoContainer.style.display = 'block';
      avatarContainer.style.display = 'none';
      if (flipBtn) flipBtn.style.display = 'flex';
      
      const remoteImg = document.getElementById('remote-caller-video-avatar');
      if (remoteImg) remoteImg.src = avatar;

      await this.initLocalVideo();
      this.startRemoteVideoSimulation();
    } else {
      videoContainer.style.display = 'none';
      avatarContainer.style.display = 'flex';
      if (flipBtn) flipBtn.style.display = 'none';
    }

    this.playRingtone();

    setTimeout(() => {
      if (this.activeCall && this.activeCall.status === 'ringing') {
        this.stopRingtone();
        this.activeCall.status = 'connected';
        document.getElementById('call-status-badge').textContent = '00:00';
        this.startCallDurationTimer();
      }
    }, 3000);
  }

  async initLocalVideo() {
    const localVideo = document.getElementById('local-video-feed');
    const localFallback = document.getElementById('local-video-fallback');
    const cameraOffOverlay = document.getElementById('camera-off-overlay');

    if (cameraOffOverlay) cameraOffOverlay.classList.remove('active');

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        if (this.localStream) {
          this.localStream.getTracks().forEach(t => t.stop());
        }

        const constraints = {
          video: {
            facingMode: this.currentFacingMode,
            width: { min: 1280, ideal: 1920 },
            height: { min: 720, ideal: 1080 },
            frameRate: { ideal: 30, max: 60 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        };

        try {
          this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (mediaErr) {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: this.currentFacingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: true
          });
        }

        if (this.localStream && localVideo) {
          localVideo.srcObject = this.localStream;
          localVideo.style.display = 'block';
          if (localFallback) localFallback.style.display = 'none';
          localVideo.onloadedmetadata = () => {
            localVideo.play().catch(e => console.warn(e));
          };
          return;
        }
      }
    } catch (err) {
      console.warn('Real camera stream not available, activating fallback:', err);
    }

    if (localVideo) localVideo.style.display = 'none';
    if (localFallback) {
      localFallback.style.display = 'flex';
      const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
      const avatarImg = document.getElementById('local-fallback-avatar');
      if (avatarImg && currentUser) avatarImg.src = currentUser.avatar;
    }
  }

  toggleCamera() {
    this.isCameraOff = !this.isCameraOff;
    const btn = document.getElementById('btn-call-camera');
    const cameraOffOverlay = document.getElementById('camera-off-overlay');

    if (btn) btn.classList.toggle('active-off', this.isCameraOff);
    if (cameraOffOverlay) cameraOffOverlay.classList.toggle('active', this.isCameraOff);

    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = !this.isCameraOff;
      });
    }
  }

  toggleMicMute() {
    this.isMicMuted = !this.isMicMuted;
    const btn = document.getElementById('btn-call-mute');
    if (btn) {
      btn.classList.toggle('active-off', this.isMicMuted);
      btn.title = this.isMicMuted ? 'Unmute Mic (Outgoing)' : 'Mute Mic (Outgoing)';
    }

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMicMuted;
      });
    }

    const badge = document.getElementById('call-status-badge');
    if (badge && this.activeCall && this.activeCall.status === 'connected') {
      if (this.isMicMuted) badge.textContent += ' • 🎤 Muted';
    }
  }

  toggleSpeakerMute() {
    this.isSpeakerMuted = !this.isSpeakerMuted;
    const btn = document.getElementById('btn-call-speaker-mute');
    if (btn) {
      btn.classList.toggle('active-off', this.isSpeakerMuted);
      btn.textContent = this.isSpeakerMuted ? '🔇' : '🔊';
      btn.title = this.isSpeakerMuted ? 'Unmute Speaker (Hear Caller)' : 'Mute Speaker (Deafen)';
    }

    if (this.isSpeakerMuted) {
      this.stopRingtone();
    }

    const badge = document.getElementById('call-status-badge');
    if (badge && this.activeCall && this.activeCall.status === 'connected') {
      if (this.isSpeakerMuted) badge.textContent += ' • 🔇 Deafened';
    }
  }

  toggleSilent() {
    this.isSilent = !this.isSilent;
    const btn = document.getElementById('btn-call-silent');
    if (btn) btn.classList.toggle('active-off', this.isSilent);

    if (this.isSilent) {
      this.stopRingtone();
    } else if (this.activeCall && this.activeCall.status === 'ringing') {
      this.playRingtone();
    }
  }

  async flipCamera() {
    this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
    await this.initLocalVideo();
  }

  openAddParticipantModal() {
    const modal = document.getElementById('add-participant-modal');
    const list = document.getElementById('add-participant-list');
    if (!modal || !list) return;

    const chats = window.ChatEngine ? window.ChatEngine.chats : [];
    list.innerHTML = chats.map(chat => `
      <div class="share-contact-item" onclick="window.CallManager.addParticipantToActiveCall('${chat.name}', '${chat.avatar}')">
        <img class="avatar-img" style="width: 40px; height: 40px;" src="${chat.avatar}" alt="${chat.name}">
        <div>
          <div style="font-weight: 600; color: var(--text-primary);">${chat.name}</div>
          <div style="font-size: 11.5px; color: var(--brand-green);">Available for group call</div>
        </div>
      </div>
    `).join('');

    modal.classList.add('active');
  }

  addParticipantToActiveCall(name, avatar) {
    if (!this.groupParticipants.some(p => p.name === name)) {
      this.groupParticipants.push({ name, avatar });
    }

    const modal = document.getElementById('add-participant-modal');
    if (modal) modal.classList.remove('active');

    // Update Header
    document.getElementById('call-caller-name').textContent = `Group Call (${this.groupParticipants.length} people)`;

    // Render Group Grid
    const groupGrid = document.getElementById('group-call-grid');
    const remoteBox = document.querySelector('.remote-caller-box');
    if (groupGrid) {
      groupGrid.classList.add('active');
      if (remoteBox) remoteBox.style.display = 'none';

      groupGrid.innerHTML = this.groupParticipants.map(p => `
        <div class="group-call-member-cell">
          <img class="group-member-avatar" src="${p.avatar}" alt="${p.name}">
          <span class="group-member-name">${p.name}</span>
          <span style="font-size: 10px; color: #22c55e; margin-top: 2px;">● Connected</span>
        </div>
      `).join('');
    }

    alert(`🎉 Added ${name} to the group call!`);
  }

  startRemoteVideoSimulation() {
    const canvas = document.getElementById('remote-video-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let step = 0;

    const animate = () => {
      if (!this.activeCall || this.activeCall.type !== 'video') return;
      step += 0.03;
      
      const width = canvas.width = canvas.offsetWidth;
      const height = canvas.height = canvas.offsetHeight;

      const grad = ctx.createLinearGradient(0, 0, width, height);
      const r = Math.sin(step) * 20 + 20;
      const g = Math.cos(step) * 30 + 40;
      const b = 80;
      grad.addColorStop(0, `rgb(${r}, ${g}, ${b})`);
      grad.addColorStop(1, '#0b141a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(0, 168, 132, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < width; x += 10) {
        const y = height / 2 + Math.sin(x * 0.02 + step) * 25;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      this.animationFrameId = requestAnimationFrame(animate);
    };

    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = requestAnimationFrame(animate);
  }

  startCallDurationTimer() {
    this.callSeconds = 0;
    clearInterval(this.callDurationTimer);
    this.callDurationTimer = setInterval(() => {
      this.callSeconds++;
      const mins = Math.floor(this.callSeconds / 60);
      const secs = this.callSeconds % 60;
      const formatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
      const badge = document.getElementById('call-status-badge');
      if (badge) badge.textContent = formatted;
    }, 1000);
  }

  async toggleScreenShare() {
    if (this.isScreenSharing) {
      this.stopScreenShare();
    } else {
      await this.startScreenShare();
    }
  }

  async startScreenShare() {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false
        });

        const localVideo = document.getElementById('local-video-feed');
        const localFallback = document.getElementById('local-video-fallback');
        const screenshareBtn = document.getElementById('btn-call-screenshare');

        if (this.screenStream && localVideo) {
          localVideo.srcObject = this.screenStream;
          localVideo.style.display = 'block';
          if (localFallback) localFallback.style.display = 'none';
          this.isScreenSharing = true;

          if (screenshareBtn) {
            screenshareBtn.style.background = '#10b981';
            screenshareBtn.style.color = '#ffffff';
            screenshareBtn.title = 'Stop Screen Sharing';
          }

          const badge = document.getElementById('call-status-badge');
          if (badge) badge.textContent += ' • 🖥️ Sharing Screen';

          // When user clicks "Stop sharing" on the browser native banner
          this.screenStream.getVideoTracks()[0].onended = () => {
            this.stopScreenShare();
          };
          return;
        }
      } else {
        alert('Screen sharing is not supported by your browser.');
      }
    } catch (err) {
      console.warn('Screen sharing cancelled or error:', err);
      this.stopScreenShare();
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;

    const screenshareBtn = document.getElementById('btn-call-screenshare');
    if (screenshareBtn) {
      screenshareBtn.style.background = '';
      screenshareBtn.style.color = '';
      screenshareBtn.title = 'Share My Screen';
    }

    if (this.activeCall && this.activeCall.type === 'video') {
      this.initLocalVideo();
    }
  }

  startCallWithScreenShare() {
    const activeChat = window.ChatEngine ? window.ChatEngine.getActiveChat() : null;
    const name = activeChat ? activeChat.name : 'Group Meeting';
    const avatar = activeChat ? activeChat.avatar : 'assets/logo-icon.svg';
    const contactId = activeChat ? activeChat.id : null;

    this.startCall(name, avatar, 'video', contactId);
    setTimeout(() => {
      this.startScreenShare();
    }, 1200);
  }

  endCall() {
    this.stopRingtone();
    this.stopScreenShare();
    clearInterval(this.callDurationTimer);
    cancelAnimationFrame(this.animationFrameId);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.activeCall) {
      const durationStr = this.callSeconds > 0
        ? `${Math.floor(this.callSeconds / 60)}m ${this.callSeconds % 60}s`
        : 'Missed';

      this.callLogs.unshift({
        id: 'call_' + Date.now(),
        name: this.activeCall.name,
        avatar: this.activeCall.avatar,
        type: this.activeCall.type,
        direction: this.activeCall.direction,
        time: 'Just now',
        duration: durationStr
      });
      this.saveCalls();
      this.renderCallsTab();
    }

    this.activeCall = null;
    this.groupParticipants = [];
    const modal = document.getElementById('call-overlay-modal');
    if (modal) modal.classList.remove('active');
  }

  playRingtone() {
    if (this.isSilent) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playPulse = () => {
        if (!this.activeCall || this.activeCall.status !== 'ringing' || this.isSilent) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.9);
      };

      playPulse();
      this.ringtoneInterval = setInterval(playPulse, 2000);
    } catch (e) {}
  }

  stopRingtone() {
    clearInterval(this.ringtoneInterval);
  }

  saveCalls() {
    localStorage.setItem('chatterpatter_calls', JSON.stringify(this.callLogs));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.CallManager = new CallManager();
});
