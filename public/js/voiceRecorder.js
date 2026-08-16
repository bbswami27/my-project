// ChatterPatter - Web Audio Voice Note Recorder & Audio Player

class VoiceRecorderManager {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.recordTimer = null;
    this.secondsRecorded = 0;
    this.audioContext = null;
    this.currentPlayingAudio = null;
    this.stream = null;
    this.onTickCallback = null;
    this.onCompleteCallback = null;
  }

  async startRecording(onTick, onComplete) {
    if (this.isRecording) return true;
    this.audioChunks = [];
    this.secondsRecorded = 0;
    this.onTickCallback = onTick;
    this.onCompleteCallback = onComplete;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        let mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
          if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
          else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
          else mimeType = '';
        }

        const options = mimeType ? { mimeType } : undefined;
        this.mediaRecorder = new MediaRecorder(this.stream, options);

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          const type = mimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64Audio = reader.result;
            const res = {
              duration: this.formatTime(this.secondsRecorded || 1),
              audioUrl: base64Audio,
              seconds: this.secondsRecorded || 1
            };
            if (this.onCompleteCallback) {
              this.onCompleteCallback(res);
            }
          };
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
          }
        };

        this.mediaRecorder.start(100);
        this.isRecording = true;
      } else {
        this.isRecording = true;
      }
    } catch (err) {
      console.warn('Microphone permission not granted or unavailable, using audio generator:', err);
      this.isRecording = true;
    }

    this.recordTimer = setInterval(() => {
      this.secondsRecorded++;
      if (this.onTickCallback) this.onTickCallback(this.formatTime(this.secondsRecorded));
    }, 1000);

    return true;
  }

  stopRecording(sendCallback) {
    if (!this.isRecording) return;
    clearInterval(this.recordTimer);
    this.isRecording = false;

    if (sendCallback) {
      this.onCompleteCallback = sendCallback;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
        return;
      } catch(e) {}
    }

    // Fallback if mediaRecorder was simulated or cancelled
    if (this.onCompleteCallback) {
      this.onCompleteCallback({
        duration: this.formatTime(this.secondsRecorded || 2),
        audioUrl: 'simulated_audio',
        seconds: this.secondsRecorded || 2
      });
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  toggleRecording() {
    if (window.ChatEngine) {
      window.ChatEngine.toggleVoiceRecording();
    }
  }

  cancelRecording() {
    clearInterval(this.recordTimer);
    this.isRecording = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch(e) {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.audioChunks = [];
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  playVoiceNote(btnElement, audioUrl, duration) {
    if (!audioUrl || audioUrl === 'simulated_audio') {
      this.playSyntheticVoiceTone(btnElement);
      return;
    }

    if (this.currentPlayingAudio) {
      this.currentPlayingAudio.pause();
      this.currentPlayingAudio = null;
      btnElement.innerHTML = '▶';
      return;
    }

    try {
      const audio = new Audio(audioUrl);
      this.currentPlayingAudio = audio;
      btnElement.innerHTML = '⏸';

      audio.onended = () => {
        btnElement.innerHTML = '▶';
        this.currentPlayingAudio = null;
      };

      audio.play().catch(e => {
        console.warn('Audio play failed, using synthetic fallback:', e);
        this.playSyntheticVoiceTone(btnElement);
      });
    } catch(err) {
      this.playSyntheticVoiceTone(btnElement);
    }
  }

  playSyntheticVoiceTone(btnElement) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(580, ctx.currentTime + 1.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);

      btnElement.innerHTML = '⏸';
      setTimeout(() => {
        btnElement.innerHTML = '▶';
      }, 1200);
    } catch (e) {
      console.error(e);
    }
  }
}

window.VoiceRecorder = new VoiceRecorderManager();
