// ChatterPatter - Call & Message Reminder Manager

class ReminderManager {
  constructor() {
    this.reminders = [];
    this.checkInterval = null;
    this.selectedItemForReminder = null;
    this.init();
  }

  init() {
    const saved = localStorage.getItem('chatterpatter_reminders');
    if (saved) {
      try {
        this.reminders = JSON.parse(saved);
      } catch (e) {
        this.reminders = [];
      }
    }

    this.bindEvents();
    this.startChecker();
  }

  bindEvents() {
    // Close Reminder Modal
    const closeBtn = document.getElementById('btn-close-reminder-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('reminder-set-modal').classList.remove('active');
      });
    }

    // Dismiss Alert Dialog
    const dismissBtn = document.getElementById('btn-dismiss-reminder-alert');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        document.getElementById('reminder-alert-dialog').classList.remove('active');
      });
    }

    // Preset Reminder Buttons (15m, 1h, Tomorrow, Custom)
    const presetBtns = document.querySelectorAll('.reminder-preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mins = Number(btn.getAttribute('data-mins'));
        this.scheduleReminder(mins);
      });
    });
  }

  openReminderModal(item) {
    this.selectedItemForReminder = item;
    const modal = document.getElementById('reminder-set-modal');
    const textPreview = document.getElementById('reminder-item-preview');
    if (textPreview) {
      textPreview.textContent = item.text || item.title || 'Message / Call Reminder';
    }
    if (modal) modal.classList.add('active');
  }

  scheduleReminder(minutes) {
    if (!this.selectedItemForReminder) return;

    const dueTime = Date.now() + minutes * 60 * 1000;
    const reminder = {
      id: 'rem_' + Date.now(),
      title: this.selectedItemForReminder.text || this.selectedItemForReminder.title || 'Reminder',
      type: this.selectedItemForReminder.type || 'message',
      dueTime: dueTime,
      dueTimeFormatted: new Date(dueTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      chatId: this.selectedItemForReminder.chatId || null,
      contactName: this.selectedItemForReminder.contactName || 'ChatterPatter'
    };

    this.reminders.push(reminder);
    this.saveReminders();

    const modal = document.getElementById('reminder-set-modal');
    if (modal) modal.classList.remove('active');

    alert(`⏰ Reminder set for ${new Date(dueTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}!`);
  }

  startChecker() {
    clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      const now = Date.now();
      const dueIndex = this.reminders.findIndex(r => r.dueTime <= now);
      if (dueIndex !== -1) {
        const dueReminder = this.reminders.splice(dueIndex, 1)[0];
        this.saveReminders();
        this.triggerAlert(dueReminder);
      }
    }, 5000); // Check every 5s
  }

  triggerAlert(reminder) {
    this.playReminderChime();

    const dialog = document.getElementById('reminder-alert-dialog');
    if (dialog) {
      document.getElementById('reminder-alert-text').textContent = reminder.title;
      document.getElementById('reminder-alert-time').textContent = `Scheduled for ${reminder.dueTimeFormatted}`;
      dialog.classList.add('active');
    }
  }

  playReminderChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, High C
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.15 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.15);
        osc.stop(ctx.currentTime + idx * 0.15 + 0.3);
      });
    } catch (e) {}
  }

  saveReminders() {
    localStorage.setItem('chatterpatter_reminders', JSON.stringify(this.reminders));
  }
}

window.ReminderManager = new ReminderManager();
