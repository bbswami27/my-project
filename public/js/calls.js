// ChatterPatter - Real WebRTC Audio & Video Calling Manager
// Features: Real peer-to-peer WebRTC streaming, STUN configuration, Socket.IO signaling,
// Camera flip, Mic mute, Speaker mute, Screen share, and clean track lifecycle management.

class CallManager {
  constructor() {
    this.callLogs = [];
    this.activeCall = null;
    this.pendingIncomingCall = null;
    this.peerConnection = null;
    this.localStream = null;
    this.screenStream = null;
    this.isScreenSharing = false;
    this.callDurationTimer = null;
    this.callSeconds = 0;
    this.audioContext = null;
    this.ringtoneOsc1 = null;
    this.ringtoneOsc2 = null;
    this.ringtoneInterval = null;
    
    this.isMicMuted = false;
    this.isSpeakerMuted = false;
    this.isCameraOff = false;
    this.isSilent = false;
    this.currentFacingMode = 'user';
    this.groupParticipants = [];
    this.iceCandidatesQueue = [];

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    };

    this.init();
  }

  init() {
    const saved = localStorage.getItem('chatterpatter_calls') || localStorage.getItem('gitpit_calls');
    if (saved) {
      try {
        this.callLogs = JSON.parse(saved);
      } catch (e) {
        this.callLogs = [...(window.MOCK_DATA?.initialCalls || [])];
      }
    } else {
      this.callLogs = [...(window.MOCK_DATA?.initialCalls || [])];
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

    // Mute Speaker (Incoming Audio)
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

    // Add Participant to Call
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
        const modal = document.getElementById('add-participant-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    // Incoming Call Accept/Decline Handlers
    const btnAcceptVideo = document.getElementById('btn-incoming-accept-video');
    const btnAcceptAudio = document.getElementById('btn-incoming-accept-audio');
    const btnDecline = document.getElementById('btn-incoming-decline');

    if (btnAcceptVideo) {
      btnAcceptVideo.addEventListener('click', () => this.answerIncomingCall('video'));
    }

    if (btnAcceptAudio) {
      btnAcceptAudio.addEventListener('click', () => this.answerIncomingCall('audio'));
    }

    if (btnDecline) {
      btnDecline.addEventListener('click', () => this.declineIncomingCall());
    }
  }

  // ==========================================
  // INCOMING CALL PROMPT & ANSWERING
  // ==========================================
  showIncomingCallPrompt(callerDisplayName, callerAvatar, callType = 'audio', callerId = null, callerSocketId = null, signalData = null, callerPhone = '') {
    // Check Privacy Settings
    const videoPrivacy = localStorage.getItem('gitpit_video_call_privacy') || 'contacts';
    const phonebook = window.AuthManager ? window.AuthManager.getPhonebook() : {};
    const cleanCallerPhone = (callerPhone || callerId || '').replace(/\D/g, '').slice(-10);
    const isSavedInPhonebook = !!(phonebook[callerId] || (cleanCallerPhone && phonebook[cleanCallerPhone]));
    const isSavedContact = (window.ChatEngine && window.ChatEngine.chats.some(c => c.id === callerId || (cleanCallerPhone && c.phone && c.phone.includes(cleanCallerPhone)))) || isSavedInPhonebook;

    if (callType === 'video' && videoPrivacy === 'nobody') {
      console.log('Video call rejected by Privacy: nobody');
      this.sendRejectSignal(callerSocketId, callerId, callerPhone);
      return;
    }

    if (callType === 'video' && videoPrivacy === 'contacts' && !isSavedContact) {
      console.log('Video call rejected by Privacy: contacts only');
      this.sendRejectSignal(callerSocketId, callerId, callerPhone);
      return;
    }

    this.pendingIncomingCall = {
      name: callerDisplayName,
      avatar: callerAvatar || 'assets/logo-icon.svg',
      type: callType,
      contactId: callerId,
      callerPhone: callerPhone,
      callerSocketId: callerSocketId,
      signalData: signalData
    };
    this.iceCandidatesQueue = [];

    // Populate Incoming Dialog UI
    const promptAvatar = document.getElementById('incoming-call-avatar');
    const promptName = document.getElementById('incoming-caller-name');
    const promptDesc = document.getElementById('incoming-call-subtitle');

    if (promptAvatar) promptAvatar.src = callerAvatar || 'assets/logo-icon.svg';
    if (promptName) promptName.textContent = callerDisplayName;
    if (promptDesc) {
      promptDesc.textContent = `Incoming ${callType === 'video' ? '📹 Video' : '📞 Audio'} Call from ${callerDisplayName}`;
    }

    // System Notification
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Incoming ${callType.toUpperCase()} Call`, {
          body: `${callerDisplayName} is calling you on ChatterPatter...`,
          icon: callerAvatar || 'assets/logo-icon.svg'
        });
      }
    } catch (notifErr) {}

    // Vibrate device
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([400, 200, 400, 200, 800]);
      }
    } catch(vibErr) {}

    const promptModal = document.getElementById('incoming-call-prompt-modal');
    if (promptModal) promptModal.classList.add('active');

    this.startRingtone(true);
  }

  async answerIncomingCall(acceptedType = 'audio') {
    if (!this.pendingIncomingCall) return;
    const { name, avatar, contactId, callerSocketId, signalData, callerPhone } = this.pendingIncomingCall;
    this.stopRingtone();

    const promptModal = document.getElementById('incoming-call-prompt-modal');
    if (promptModal) promptModal.classList.remove('active');

    this.activeCall = {
      name,
      avatar: avatar || 'assets/logo-icon.svg',
      type: acceptedType,
      contactId,
      callerPhone,
      callerSocketId,
      direction: 'incoming',
      status: 'connecting'
    };
    this.groupParticipants = [{ name, avatar: avatar || 'assets/logo-icon.svg' }];
    this.isCameraOff = (acceptedType !== 'video');
    this.isMicMuted = false;
    this.isSpeakerMuted = false;
    this.isSilent = false;
    this.callSeconds = 0;

    const modal = document.getElementById('call-overlay-modal');
    if (modal) modal.classList.add('active');

    document.getElementById('call-caller-name').textContent = name;
    document.getElementById('call-big-avatar').src = avatar || 'assets/logo-icon.svg';
    document.getElementById('call-status-badge').textContent = 'Connecting...';

    const videoContainer = document.getElementById('call-video-container');
    const avatarContainer = document.getElementById('call-avatar-container');
    const flipBtn = document.getElementById('btn-call-flip-camera');

    if (acceptedType === 'video') {
      if (videoContainer) videoContainer.style.display = 'block';
      if (avatarContainer) avatarContainer.style.display = 'none';
      if (flipBtn) flipBtn.style.display = 'flex';
      const remoteImg = document.getElementById('remote-caller-video-avatar');
      if (remoteImg) remoteImg.src = avatar || 'assets/logo-icon.svg';
    } else {
      if (videoContainer) videoContainer.style.display = 'none';
      if (avatarContainer) avatarContainer.style.display = 'flex';
      if (flipBtn) flipBtn.style.display = 'none';
    }

    try {
      // 1. Get Local Media Stream
      await this.initLocalStream(acceptedType === 'video');

      // 2. Create WebRTC PeerConnection
      this.createPeerConnection(callerSocketId, contactId, callerPhone);

      // 3. Set Remote Offer Description
      if (signalData) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signalData));
        await this.drainIceCandidatesQueue();
      }

      // 4. Create and Set Local Answer Description
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // 5. Send Answer via Socket.IO
      const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
      this.emitSocketEvent('call-accepted', {
        to: callerSocketId,
        callerId: contactId,
        callerPhone: callerPhone,
        signal: answer,
        recipientId: currentUser ? currentUser.id : 'user_me',
        recipientPhone: currentUser ? currentUser.phone : '',
        recipientName: currentUser ? currentUser.name : 'Recipient',
        recipientAvatar: currentUser ? currentUser.avatar : 'assets/logo-icon.svg',
        callType: acceptedType,
        timestamp: Date.now()
      });

      this.activeCall.status = 'connected';
      document.getElementById('call-status-badge').textContent = '00:00';
      this.startCallDurationTimer();

    } catch (err) {
      console.error('Error answering call with WebRTC:', err);
      alert('Could not establish WebRTC connection. Please check camera/mic permissions.');
      this.endCall();
    }

    this.pendingIncomingCall = null;
  }

  declineIncomingCall() {
    if (!this.pendingIncomingCall) return;
    const { contactId, callerSocketId, callerPhone } = this.pendingIncomingCall;
    this.stopRingtone();

    const promptModal = document.getElementById('incoming-call-prompt-modal');
    if (promptModal) promptModal.classList.remove('active');

    this.sendRejectSignal(callerSocketId, contactId, callerPhone);
    this.pendingIncomingCall = null;
  }

  sendRejectSignal(callerSocketId, contactId, callerPhone) {
    const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
    this.emitSocketEvent('call-rejected', {
      to: callerSocketId,
      callerId: contactId,
      callerPhone: callerPhone,
      recipientId: currentUser ? currentUser.id : 'user_me',
      recipientPhone: currentUser ? currentUser.phone : '',
      timestamp: Date.now()
    });
  }

  // ==========================================
  // OUTGOING CALL INITIATION
  // ==========================================
  async startCall(name, avatar, type = 'audio', contactId = null) {
    if (this.activeCall) {
      alert('Another call is already in progress.');
      return;
    }

    this.activeCall = {
      name,
      avatar: avatar || 'assets/logo-icon.svg',
      type,
      contactId,
      direction: 'outgoing',
      status: 'ringing'
    };
    this.groupParticipants = [{ name, avatar: avatar || 'assets/logo-icon.svg' }];
    this.isCameraOff = (type !== 'video');
    this.isMicMuted = false;
    this.isSpeakerMuted = false;
    this.isSilent = false;
    this.callSeconds = 0;
    this.iceCandidatesQueue = [];

    const modal = document.getElementById('call-overlay-modal');
    if (modal) modal.classList.add('active');

    document.getElementById('call-caller-name').textContent = name;
    document.getElementById('call-big-avatar').src = avatar || 'assets/logo-icon.svg';
    document.getElementById('call-status-badge').textContent = 'Ringing... 🔔';

    const videoContainer = document.getElementById('call-video-container');
    const avatarContainer = document.getElementById('call-avatar-container');
    const flipBtn = document.getElementById('btn-call-flip-camera');

    if (type === 'video') {
      if (videoContainer) videoContainer.style.display = 'block';
      if (avatarContainer) avatarContainer.style.display = 'none';
      if (flipBtn) flipBtn.style.display = 'flex';
      const remoteImg = document.getElementById('remote-caller-video-avatar');
      if (remoteImg) remoteImg.src = avatar || 'assets/logo-icon.svg';
    } else {
      if (videoContainer) videoContainer.style.display = 'none';
      if (avatarContainer) avatarContainer.style.display = 'flex';
      if (flipBtn) flipBtn.style.display = 'none';
    }

    this.playRingtone(false);

    try {
      // 1. Get Local Media Stream
      await this.initLocalStream(type === 'video');

      // 2. Find target phone & info
      const currentUser = window.AuthManager ? window.AuthManager.currentUser : null;
      const targetChat = window.ChatEngine ? window.ChatEngine.chats.find(c => c.id === contactId) : null;
      const recipientPhone = targetChat ? targetChat.phone : '';

      // 3. Create WebRTC PeerConnection
      this.createPeerConnection(null, contactId, recipientPhone);

      // 4. Create and Set Local Offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // 5. Emit call-user / call_user signaling event
      this.emitSocketEvent('call-user', {
        callerId: currentUser ? currentUser.id : 'user_me',
        callerName: currentUser ? currentUser.name : 'User',
        callerAvatar: currentUser ? currentUser.avatar : 'assets/logo-icon.svg',
        callerPhone: currentUser ? currentUser.phone : '',
        userToCall: contactId,
        recipientId: contactId,
        recipientPhone: recipientPhone,
        signalData: offer,
        callType: type,
        timestamp: Date.now()
      });

      // 45-Second No Answer Timeout
      setTimeout(() => {
        if (this.activeCall && this.activeCall.status === 'ringing') {
          const badge = document.getElementById('call-status-badge');
          if (badge) badge.textContent = 'No Answer 📵';
          setTimeout(() => this.endCall(), 2000);
        }
      }, 45000);

    } catch (err) {
      console.error('Error starting WebRTC call:', err);
      alert('Camera/Microphone access error. Please allow permissions.');
      this.endCall();
    }
  }

  // ==========================================
  // WEBRTC PEER CONNECTION & SIGNALING
  // ==========================================
  createPeerConnection(targetSocketId = null, targetUserId = null, targetPhone = '') {
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch (e) {}
    }

    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    // Add local tracks to PeerConnection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // ICE Candidate Handler
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.emitSocketEvent('ice-candidate', {
          candidate: event.candidate,
          to: targetSocketId,
          targetUserId: targetUserId,
          targetPhone: targetPhone
        });
      }
    };

    // Remote Stream Handler
    this.peerConnection.ontrack = (event) => {
      console.log('⚡ WebRTC Remote track received:', event.track.kind);
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      
      const remoteVideo = document.getElementById('remote-video-feed');
      const remoteAudio = document.getElementById('remote-audio-feed');
      const remoteBox = document.getElementById('remote-caller-box');

      if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
        remoteVideo.style.display = 'block';
      }
      if (remoteAudio) {
        remoteAudio.srcObject = remoteStream;
      }
      if (remoteBox) {
        remoteBox.style.display = 'none';
      }
    };

    // Connection State Monitor
    this.peerConnection.onconnectionstatechange = () => {
      console.log('⚡ WebRTC Connection State:', this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === 'connected') {
        if (this.activeCall) {
          this.activeCall.status = 'connected';
          this.stopRingtone();
          const badge = document.getElementById('call-status-badge');
          if (badge && (badge.textContent.includes('Ringing') || badge.textContent.includes('Connecting'))) {
            badge.textContent = '00:00';
            this.startCallDurationTimer();
          }
        }
      } else if (this.peerConnection.connectionState === 'disconnected' || this.peerConnection.connectionState === 'failed') {
        console.warn('WebRTC Disconnected or Failed');
      }
    };
  }

  async handleCallAccepted(data) {
    console.log('⚡ Handling call-accepted signaling answer:', data);
    this.stopRingtone();
    if (!this.activeCall || !this.peerConnection) return;

    try {
      if (data.signal) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
        await this.drainIceCandidatesQueue();
      }
      this.activeCall.status = 'connected';
      const badge = document.getElementById('call-status-badge');
      if (badge) badge.textContent = '00:00';
      this.startCallDurationTimer();
    } catch (err) {
      console.error('Error setting remote description on call-accepted:', err);
    }
  }

  async handleIceCandidate(data) {
    if (!data || !data.candidate) return;
    const candidate = new RTCIceCandidate(data.candidate);

    if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (err) {
        console.warn('Error adding ICE candidate:', err);
      }
    } else {
      this.iceCandidatesQueue.push(candidate);
    }
  }

  async drainIceCandidatesQueue() {
    while (this.iceCandidatesQueue.length > 0) {
      const candidate = this.iceCandidatesQueue.shift();
      try {
        if (this.peerConnection) {
          await this.peerConnection.addIceCandidate(candidate);
        }
      } catch (e) {
        console.warn('Error draining ICE candidate:', e);
      }
    }
  }

  handleCallRejected(data) {
    console.log('🚫 Call was rejected by peer');
    this.stopRingtone();
    if (this.activeCall) {
      const badge = document.getElementById('call-status-badge');
      if (badge) badge.textContent = 'Call Declined 🚫';
      setTimeout(() => this.endCall(true), 1200);
    }
  }

  emitSocketEvent(eventName, payload) {
    if (window.ChatterApp && window.ChatterApp.socket && window.ChatterApp.socket.connected) {
      window.ChatterApp.socket.emit(eventName, payload);
    }
  }

  // ==========================================
  // LOCAL MEDIA CAPTURE & CONTROLS
  // ==========================================
  async initLocalStream(includeVideo = false) {
    this.stopLocalStream();

    const constraints = {
      audio: true,
      video: includeVideo ? {
        facingMode: this.currentFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } : false
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      const localVideo = document.getElementById('local-video-feed');
      const cameraOffOverlay = document.getElementById('camera-off-overlay');

      if (localVideo) {
        localVideo.srcObject = this.localStream;
      }
      if (cameraOffOverlay) {
        cameraOffOverlay.classList.toggle('active', !includeVideo);
      }
      return this.localStream;
    } catch (err) {
      console.warn('getUserMedia error, trying audio-only fallback:', err);
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return this.localStream;
      } catch (audioErr) {
        console.error('Fatal: Cannot access microphone:', audioErr);
        throw audioErr;
      }
    }
  }

  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      this.screenStream = null;
    }
    const localVideo = document.getElementById('local-video-feed');
    if (localVideo) localVideo.srcObject = null;
    const remoteVideo = document.getElementById('remote-video-feed');
    if (remoteVideo) remoteVideo.srcObject = null;
    const remoteAudio = document.getElementById('remote-audio-feed');
    if (remoteAudio) remoteAudio.srcObject = null;
  }

  // Mute / Unmute Microphone
  toggleMicMute() {
    this.isMicMuted = !this.isMicMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMicMuted;
      });
    }
    const btn = document.getElementById('btn-call-mute');
    if (btn) {
      btn.classList.toggle('active-state', this.isMicMuted);
      btn.textContent = this.isMicMuted ? '🔇' : '🎤';
      btn.title = this.isMicMuted ? 'Unmute Microphone' : 'Mute Microphone';
    }
  }

  // Mute / Unmute Speaker
  toggleSpeakerMute() {
    this.isSpeakerMuted = !this.isSpeakerMuted;
    const remoteAudio = document.getElementById('remote-audio-feed');
    if (remoteAudio) {
      remoteAudio.muted = this.isSpeakerMuted;
    }
    const btn = document.getElementById('btn-call-speaker-mute');
    if (btn) {
      btn.classList.toggle('active-state', this.isSpeakerMuted);
      btn.textContent = this.isSpeakerMuted ? '🔈' : '🔊';
      btn.title = this.isSpeakerMuted ? 'Unmute Speaker' : 'Mute Speaker';
    }
  }

  // Toggle Camera On / Off
  async toggleCamera() {
    this.isCameraOff = !this.isCameraOff;
    const cameraOffOverlay = document.getElementById('camera-off-overlay');

    if (this.localStream && this.localStream.getVideoTracks().length > 0) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = !this.isCameraOff;
      });
    } else if (!this.isCameraOff && this.peerConnection) {
      // Add video track dynamically if starting from audio-only
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.currentFacingMode } });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (this.localStream) {
          this.localStream.addTrack(videoTrack);
        }
        const localVideo = document.getElementById('local-video-feed');
        if (localVideo) localVideo.srcObject = this.localStream;
        this.peerConnection.addTrack(videoTrack, this.localStream);
      } catch (e) {
        console.warn('Could not add video track dynamically:', e);
      }
    }

    if (cameraOffOverlay) {
      cameraOffOverlay.classList.toggle('active', this.isCameraOff);
    }
    const btn = document.getElementById('btn-call-camera');
    if (btn) {
      btn.classList.toggle('active-state', this.isCameraOff);
      btn.textContent = this.isCameraOff ? '📷🚫' : '📹';
    }
  }

  // Flip Camera (Front <-> Back)
  async flipCamera() {
    this.currentFacingMode = (this.currentFacingMode === 'user') ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.currentFacingMode }
      });
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(newVideoTrack);
        }
      }

      if (this.localStream) {
        const oldTrack = this.localStream.getVideoTracks()[0];
        if (oldTrack) {
          this.localStream.removeTrack(oldTrack);
          oldTrack.stop();
        }
        this.localStream.addTrack(newVideoTrack);
      }

      const localVideo = document.getElementById('local-video-feed');
      if (localVideo) localVideo.srcObject = this.localStream;
    } catch (e) {
      console.warn('Camera flip error:', e);
    }
  }

  // Screen Sharing
  async toggleScreenShare() {
    if (!this.isScreenSharing) {
      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = this.screenStream.getVideoTracks()[0];
        
        if (this.peerConnection) {
          const senders = this.peerConnection.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          }
        }

        const localVideo = document.getElementById('local-video-feed');
        if (localVideo) localVideo.srcObject = this.screenStream;

        screenTrack.onended = () => this.stopScreenShare();
        this.isScreenSharing = true;

        const btn = document.getElementById('btn-call-screenshare');
        if (btn) btn.classList.add('active-state');
      } catch (err) {
        console.warn('Screen share cancelled or failed:', err);
      }
    } else {
      this.stopScreenShare();
    }
  }

  async stopScreenShare() {
    if (!this.isScreenSharing) return;
    this.isScreenSharing = false;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    // Revert back to local camera track
    if (this.localStream && this.localStream.getVideoTracks().length > 0) {
      const camTrack = this.localStream.getVideoTracks()[0];
      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(camTrack);
        }
      }
      const localVideo = document.getElementById('local-video-feed');
      if (localVideo) localVideo.srcObject = this.localStream;
    }

    const btn = document.getElementById('btn-call-screenshare');
    if (btn) btn.classList.remove('active-state');
  }

  startCallWithScreenShare(name = 'Screen Share', avatar = 'assets/logo-icon.svg', contactId = null) {
    this.startCall(name, avatar, 'video', contactId).then(() => {
      setTimeout(() => this.toggleScreenShare(), 600);
    });
  }

  // ==========================================
  // CALL TERMINATION & LOGS
  // ==========================================
  endCall(isRemote = false) {
    this.stopRingtone();
    this.stopCallDurationTimer();
    this.stopLocalStream();

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }

    if (!isRemote && this.activeCall) {
      this.emitSocketEvent('end-call', {
        callerId: this.activeCall.contactId,
        timestamp: Date.now()
      });
    }

    if (this.activeCall) {
      const durationFormatted = this.formatDuration(this.callSeconds);
      const isMissed = (this.activeCall.status === 'ringing' || this.callSeconds === 0);
      
      const logEntry = {
        id: 'call_' + Date.now(),
        contactId: this.activeCall.contactId,
        name: this.activeCall.name,
        avatar: this.activeCall.avatar || 'assets/logo-icon.svg',
        type: this.activeCall.type,
        direction: this.activeCall.direction,
        status: isMissed ? 'missed' : 'completed',
        duration: isMissed ? 'Missed Call' : durationFormatted,
        time: 'Just now',
        timestamp: Date.now()
      };

      this.callLogs.unshift(logEntry);
      this.saveCalls();
      this.renderCallsTab();
    }

    this.activeCall = null;
    this.pendingIncomingCall = null;
    this.isScreenSharing = false;

    const modal = document.getElementById('call-overlay-modal');
    if (modal) modal.classList.remove('active');

    const promptModal = document.getElementById('incoming-call-prompt-modal');
    if (promptModal) promptModal.classList.remove('active');

    const remoteBox = document.getElementById('remote-caller-box');
    if (remoteBox) remoteBox.style.display = 'flex';
  }

  // ==========================================
  // RINGTONES & AUDIO SYNTHESIS
  // ==========================================
  startRingtone(isIncoming = false) {
    this.playRingtone(isIncoming);
  }

  playRingtone(isIncoming = false) {
    this.stopRingtone();
    if (this.isSilent) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioContext = new AudioContextClass();

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const freq1 = isIncoming ? 480 : 440;
      const freq2 = isIncoming ? 620 : 480;

      const playBurst = () => {
        if (!this.audioContext) return;
        try {
          const osc1 = this.audioContext.createOscillator();
          const osc2 = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();

          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(freq1, this.audioContext.currentTime);
          osc2.frequency.setValueAtTime(freq2, this.audioContext.currentTime);

          gain.gain.setValueAtTime(0.08, this.audioContext.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 1.2);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.audioContext.destination);

          osc1.start();
          osc2.start();
          osc1.stop(this.audioContext.currentTime + 1.2);
          osc2.stop(this.audioContext.currentTime + 1.2);
        } catch (e) {}
      };

      playBurst();
      this.ringtoneInterval = setInterval(playBurst, 2500);
    } catch (err) {
      console.warn('AudioContext ringtone initialization failed:', err);
    }
  }

  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }
  }

  toggleSilent() {
    this.isSilent = !this.isSilent;
    if (this.isSilent) this.stopRingtone();
    const btn = document.getElementById('btn-call-silent');
    if (btn) {
      btn.classList.toggle('active-state', this.isSilent);
      btn.textContent = this.isSilent ? '🔔' : '🔕';
      btn.title = this.isSilent ? 'Unmute Ringtone' : 'Silent Ringtone';
    }
  }

  // ==========================================
  // TIMERS & LOG RENDERING
  // ==========================================
  startCallDurationTimer() {
    this.stopCallDurationTimer();
    this.callSeconds = 0;
    this.callDurationTimer = setInterval(() => {
      this.callSeconds++;
      const formatted = this.formatDuration(this.callSeconds);
      const badge = document.getElementById('call-status-badge');
      if (badge) badge.textContent = formatted;
    }, 1000);
  }

  stopCallDurationTimer() {
    if (this.callDurationTimer) {
      clearInterval(this.callDurationTimer);
      this.callDurationTimer = null;
    }
  }

  formatDuration(sec) {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  saveCalls() {
    localStorage.setItem('gitpit_calls', JSON.stringify(this.callLogs));
  }

  renderCallsTab() {
    const listElem = document.getElementById('calls-list-items');
    if (!listElem) return;

    if (this.callLogs.length === 0) {
      listElem.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 40px; margin-bottom: 8px;">📞</div>
          <p>No recent calls. Start a voice or video call with any contact!</p>
        </div>
      `;
      return;
    }

    listElem.innerHTML = this.callLogs.map(log => {
      const isVideo = log.type === 'video';
      const isMissed = log.status === 'missed';
      const isOutgoing = log.direction === 'outgoing';

      return `
        <div class="call-item-card">
          <img class="avatar-img" src="${log.avatar || 'assets/logo-icon.svg'}" alt="${log.name}">
          <div class="call-item-meta">
            <div class="call-item-name ${isMissed ? 'call-missed' : ''}">${log.name}</div>
            <div class="call-item-time">
              <span style="font-size: 13px;">${isOutgoing ? '↗' : '↙'}</span>
              <span>${log.time || 'Recently'} • ${log.duration || ''}</span>
            </div>
          </div>
          <div class="call-item-actions">
            <button class="call-action-icon-btn" title="Call Back" onclick="window.CallManager.startCall('${log.name.replace(/'/g, "\\'")}', '${log.avatar}', '${log.type}', '${log.contactId || ''}')">
              ${isVideo ? '📹' : '📞'}
            </button>
            <button class="call-action-icon-btn delete-call-btn" title="Delete Log" onclick="window.CallManager.deleteCallLog('${log.id}')">
              ✕
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  deleteCallLog(callId) {
    this.callLogs = this.callLogs.filter(c => c.id !== callId);
    this.saveCalls();
    this.renderCallsTab();
  }

  openAddParticipantModal() {
    const modal = document.getElementById('add-participant-modal');
    const container = document.getElementById('add-participant-list');
    if (!modal || !container) return;

    const chats = window.ChatEngine ? window.ChatEngine.chats : [];
    container.innerHTML = chats.map(c => `
      <div class="share-contact-item" onclick="window.CallManager.inviteParticipantToCall('${c.name.replace(/'/g, "\\'")}', '${c.avatar}')">
        <img class="avatar-img" src="${c.avatar || 'assets/logo-icon.svg'}" style="width: 36px; height: 36px;">
        <span style="font-weight: 600; font-size: 14px; color: var(--text-primary);">${c.name}</span>
      </div>
    `).join('');

    modal.classList.add('active');
  }

  inviteParticipantToCall(name, avatar) {
    const modal = document.getElementById('add-participant-modal');
    if (modal) modal.classList.remove('active');
    alert(`Call invite sent to ${name} 👥`);
  }
}

// Global Singleton Instance
window.CallManager = new CallManager();
