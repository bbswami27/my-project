// GitPit - UPI Payments & QR Code Manager

class PaymentManager {
  constructor() {
    this.currentAmount = '';
    this.currentNote = '';
    this.enteredMpin = '';
    this.scannerStream = null;
    this.balance = 24500.00;
    this.transactions = [];
    this.init();
  }

  init() {
    const savedTxns = localStorage.getItem('chatterpatter_upi_txns');
    if (savedTxns) {
      try {
        this.transactions = JSON.parse(savedTxns);
      } catch (e) {
        this.transactions = [...window.MOCK_DATA.initialUpiTransactions];
      }
    } else {
      this.transactions = [...window.MOCK_DATA.initialUpiTransactions];
    }

    const savedBal = localStorage.getItem('chatterpatter_upi_balance');
    if (savedBal) this.balance = parseFloat(savedBal);

    this.bindEvents();
    this.renderPaymentsTab();
  }

  renderPaymentsTab() {
    const balElem = document.getElementById('wallet-balance-display');
    if (balElem) {
      balElem.textContent = `₹${this.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    }

    const listElem = document.getElementById('upi-txns-container');
    if (!listElem) return;

    listElem.innerHTML = this.transactions.map(t => {
      const isSent = t.type === 'sent';
      const sign = isSent ? '-' : '+';
      const amountClass = isSent ? 'txn-amount-sent' : 'txn-amount-recv';
      const iconClass = isSent ? 'txn-icon-sent' : 'txn-icon-recv';
      const icon = isSent ? '↗' : '↙';

      return `
        <div class="txn-row-item">
          <div class="txn-left">
            <div class="txn-icon-circle ${iconClass}">${icon}</div>
            <div class="txn-meta">
              <h5>${t.title}</h5>
              <p>${t.time} • Ref: ${t.txnId}</p>
            </div>
          </div>
          <div class="${amountClass}">${sign}₹${t.amount.toLocaleString('en-IN')}</div>
        </div>
      `;
    }).join('');
  }

  bindEvents() {
    // Open UPI Payment Modal
    const closePaymentBtn = document.getElementById('btn-close-upi-modal');
    if (closePaymentBtn) {
      closePaymentBtn.addEventListener('click', () => this.closePaymentModal());
    }

    // Proceed to MPIN Screen
    const proceedToPinBtn = document.getElementById('btn-proceed-mpin');
    if (proceedToPinBtn) {
      proceedToPinBtn.addEventListener('click', () => this.openMpinScreen());
    }

    // Close MPIN Modal
    const closeMpinBtn = document.getElementById('btn-close-mpin-modal');
    if (closeMpinBtn) {
      closeMpinBtn.addEventListener('click', () => {
        document.getElementById('upi-mpin-modal').classList.remove('active');
      });
    }

    // MPIN Keypad Buttons
    const mpinKeys = document.querySelectorAll('.mpin-key-btn');
    mpinKeys.forEach(key => {
      key.addEventListener('click', () => {
        const val = key.getAttribute('data-val');
        if (val === 'back') {
          this.enteredMpin = this.enteredMpin.slice(0, -1);
        } else if (val === 'submit') {
          this.verifyAndCompletePayment();
        } else if (this.enteredMpin.length < 4) {
          this.enteredMpin += val;
          if (this.enteredMpin.length === 4) {
            setTimeout(() => this.verifyAndCompletePayment(), 200);
          }
        }
        this.renderMpinDots();
      });
    });

    // QR Modal Triggers
    const closeQrBtn = document.getElementById('btn-close-qr-modal');
    if (closeQrBtn) {
      closeQrBtn.addEventListener('click', () => this.closeQrModal());
    }

    // QR Tabs Switching (Scanner vs My QR)
    const qrTabs = document.querySelectorAll('.qr-tab-btn');
    qrTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        qrTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.getAttribute('data-qr-mode');
        this.switchQrTab(mode);
      });
    });
  }

  openPaymentModal() {
    const activeChat = window.ChatEngine ? window.ChatEngine.getActiveChat() : null;
    if (!activeChat) {
      alert('Please select a contact or chat to send UPI payment!');
      return;
    }

    document.getElementById('upi-recipient-name').textContent = activeChat.name;
    document.getElementById('upi-recipient-avatar').src = activeChat.avatar;
    document.getElementById('upi-recipient-vpa').textContent = `${activeChat.name.toLowerCase().replace(/[^a-z]/g, '')}@chatterupi`;
    
    document.getElementById('upi-amount-input').value = '500';
    document.getElementById('upi-note-input').value = 'GitPit Payment 🚀';

    const modal = document.getElementById('upi-send-modal');
    if (modal) modal.classList.add('active');
  }

  closePaymentModal() {
    const modal = document.getElementById('upi-send-modal');
    if (modal) modal.classList.remove('active');
  }

  openMpinScreen() {
    const amountInput = document.getElementById('upi-amount-input');
    const noteInput = document.getElementById('upi-note-input');
    
    this.currentAmount = amountInput ? amountInput.value.trim() : '0';
    this.currentNote = noteInput ? noteInput.value.trim() : '';

    if (!this.currentAmount || Number(this.currentAmount) <= 0) {
      alert('Please enter a valid amount in ₹');
      return;
    }

    this.closePaymentModal();
    this.enteredMpin = '';
    this.renderMpinDots();

    document.getElementById('mpin-amount-display').textContent = `₹${this.currentAmount}`;
    const mpinModal = document.getElementById('upi-mpin-modal');
    if (mpinModal) mpinModal.classList.add('active');
  }

  renderMpinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`mpin-dot-${i}`);
      if (dot) {
        dot.classList.toggle('filled', i < this.enteredMpin.length);
      }
    }
  }

  verifyAndCompletePayment() {
    if (this.enteredMpin.length < 4) {
      alert('Please enter full 4-digit UPI MPIN');
      return;
    }

    this.confirmPayment();
  }

  confirmPayment() {
    const activeChat = window.ChatEngine ? window.ChatEngine.getActiveChat() : null;
    const recipientName = activeChat ? activeChat.name : 'Priya Patel';
    const amountNum = parseFloat(this.currentAmount) || 500;
    const txnId = 'UPI' + Math.floor(100000000 + Math.random() * 900000000);

    // Deduct balance and record transaction
    this.balance = Math.max(0, this.balance - amountNum);
    localStorage.setItem('chatterpatter_upi_balance', this.balance.toString());

    this.transactions.unshift({
      id: 'txn_' + Date.now(),
      type: 'sent',
      amount: amountNum,
      title: `Sent to ${recipientName}`,
      vpa: `${recipientName.toLowerCase().replace(/\s+/g, '')}@chatterupi`,
      time: 'Just now',
      txnId: txnId,
      status: 'SUCCESS'
    });
    localStorage.setItem('chatterpatter_upi_txns', JSON.stringify(this.transactions));
    this.renderPaymentsTab();

    if (window.ChatEngine) {
      window.ChatEngine.sendMessage({
        type: 'payment',
        amount: this.currentAmount,
        note: this.currentNote || 'GitPit UPI Transfer',
        txnId: txnId,
        text: `⚡ UPI Transfer of ₹${this.currentAmount} to ${recipientName} is Successful!`
      });
    }

    const mpinModal = document.getElementById('upi-mpin-modal');
    if (mpinModal) mpinModal.classList.remove('active');

    this.playSuccessTone();
    alert(`🎉 Payment of ₹${this.currentAmount} to ${recipientName} was Successful!\nTxn Ref ID: ${txnId}`);
  }

  openQrModal() {
    const modal = document.getElementById('qr-scanner-modal');
    if (!modal) return;

    this.renderMyQrCode();
    modal.classList.add('active');
    this.switchQrTab('scan');
  }

  closeQrModal() {
    if (this.scannerStream) {
      this.scannerStream.getTracks().forEach(t => t.stop());
      this.scannerStream = null;
    }
    const modal = document.getElementById('qr-scanner-modal');
    if (modal) modal.classList.remove('active');
  }

  switchQrTab(mode) {
    document.getElementById('qr-scan-panel').style.display = mode === 'scan' ? 'block' : 'none';
    document.getElementById('my-qr-panel').style.display = mode === 'myqr' ? 'block' : 'none';

    if (mode === 'scan') {
      this.startCameraScanner();
    } else {
      if (this.scannerStream) {
        this.scannerStream.getTracks().forEach(t => t.stop());
        this.scannerStream = null;
      }
    }
  }

  async startCameraScanner() {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const videoElem = document.getElementById('qr-camera-feed');
        if (videoElem) {
          videoElem.srcObject = this.scannerStream;
        }
      }
    } catch (err) {
      console.warn('Camera access for QR scanner unavailable or simulated:', err);
    }
  }

  renderMyQrCode() {
    const user = window.AuthManager ? window.AuthManager.currentUser : null;
    const name = user ? user.name : 'GitPit User';
    const upiId = user ? `${user.name.toLowerCase().replace(/[^a-z]/g, '')}@chatterupi` : 'chatterpatter@upi';

    document.getElementById('my-qr-user-name').textContent = name;
    document.getElementById('my-qr-user-upi').textContent = upiId;

    // Generate dynamic SVG QR Code pattern
    const qrContainer = document.getElementById('my-qr-code-svg-container');
    if (qrContainer) {
      qrContainer.innerHTML = `
        <svg class="my-qr-code-svg" viewBox="0 0 200 200">
          <rect width="200" height="200" fill="#ffffff"/>
          <!-- Position Detection Patterns (Corners) -->
          <rect x="15" y="15" width="45" height="45" fill="#0f172a" rx="4"/>
          <rect x="23" y="23" width="29" height="29" fill="#ffffff"/>
          <rect x="29" y="29" width="17" height="17" fill="#0284c7"/>
          
          <rect x="140" y="15" width="45" height="45" fill="#0f172a" rx="4"/>
          <rect x="148" y="23" width="29" height="29" fill="#ffffff"/>
          <rect x="154" y="29" width="17" height="17" fill="#0284c7"/>

          <rect x="15" y="140" width="45" height="45" fill="#0f172a" rx="4"/>
          <rect x="23" y="148" width="29" height="29" fill="#ffffff"/>
          <rect x="29" y="154" width="17" height="17" fill="#0284c7"/>

          <!-- Dynamic QR Data Modules -->
          <g fill="#1e293b">
            <rect x="75" y="20" width="12" height="12"/>
            <rect x="95" y="20" width="12" height="12"/>
            <rect x="115" y="20" width="12" height="12"/>
            <rect x="75" y="45" width="12" height="12"/>
            <rect x="105" y="45" width="20" height="12"/>
            
            <rect x="20" y="75" width="12" height="12"/>
            <rect x="45" y="75" width="20" height="12"/>
            <rect x="75" y="75" width="12" height="12"/>
            <rect x="95" y="75" width="12" height="12"/>
            <rect x="115" y="75" width="20" height="12"/>
            <rect x="145" y="75" width="12" height="12"/>
            <rect x="165" y="75" width="15" height="12"/>

            <rect x="20" y="95" width="18" height="12"/>
            <rect x="50" y="95" width="12" height="12"/>
            <rect x="75" y="95" width="20" height="12"/>
            <rect x="105" y="95" width="12" height="12"/>
            <rect x="135" y="95" width="12" height="12"/>
            <rect x="160" y="95" width="20" height="12"/>

            <rect x="75" y="125" width="12" height="12"/>
            <rect x="95" y="125" width="22" height="12"/>
            <rect x="130" y="125" width="12" height="12"/>
            <rect x="155" y="125" width="25" height="12"/>

            <rect x="75" y="150" width="20" height="12"/>
            <rect x="105" y="150" width="12" height="12"/>
            <rect x="125" y="150" width="25" height="12"/>
            <rect x="160" y="150" width="15" height="12"/>

            <rect x="75" y="170" width="12" height="12"/>
            <rect x="100" y="170" width="15" height="12"/>
            <rect x="125" y="170" width="12" height="12"/>
            <rect x="150" y="170" width="20" height="12"/>
          </g>

          <!-- Center Brand Logo Dot -->
          <circle cx="100" cy="100" r="14" fill="#00a884"/>
          <circle cx="100" cy="100" r="10" fill="#ffffff"/>
          <circle cx="100" cy="100" r="6" fill="#0284c7"/>
        </svg>
      `;
    }
  }

  playSuccessTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.3); // C6
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  }
}

window.PaymentManager = new PaymentManager();
