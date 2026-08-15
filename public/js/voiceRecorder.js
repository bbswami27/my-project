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
  }

  async startRecording(onTick, onComplete) {
    this.audioChunks = [];
    this.secondsRecorded = 0;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64Audio = reader.result;
            if (onComplete) {
              onComplete({
                duration: this.formatTime(this.secondsRecorded),
                audioUrl: base64Audio,
                seconds: this.secondsRecorded
              });
            }
          };
          // Stop stream tracks
          stream.getTracks().forEach(track => track.stop());
        };

        this.mediaRecorder.start();
        this.isRecording = true;
      } else {
        // Fallback for browsers without direct mediaDevices permissions
        this.isRecording = true;
      }

      this.recordTimer = setInterval(() => {
        this.secondsRecorded++;
        if (onTick) onTick(this.formatTime(this.secondsRecorded));
      }, 1000);

      return true;
    } catch (err) {
      console.warn('Microphone permission not granted or unavailable, using simulation:', err);
      // Simulation mode if mic is denied
      this.isRecording = true;
      this.recordTimer = setInterval(() => {
        this.secondsRecorded++;
        if (onTick) onTick(this.formatTime(this.secondsRecorded));
      }, 1000);
      return true;
    }
  }

  stopRecording(sendCallback) {
    if (!this.isRecording) return;
    clearInterval(this.recordTimer);
    this.isRecording = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      // Simulated audio if no hardware mic
      if (sendCallback) {
        sendCallback({
          duration: this.formatTime(this.secondsRecorded || 3),
          audioUrl: 'simulated_audio',
          seconds: this.secondsRecorded || 3
        });
      }
    }
  }

  cancelRecording() {
    clearInterval(this.recordTimer);
    this.isRecording = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.audioChunks = [];
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  playVoiceNote(btnElement, audioUrl, duration) {
    // If playing simulated audio, synthesize tone
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
