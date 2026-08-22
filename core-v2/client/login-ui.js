'use strict';

(function(){
  class CoreV2LoginUI{
    constructor(authService){this.auth=authService;this.root=null;this.onSuccess=null;}
    mount(onSuccess){
      this.onSuccess=onSuccess;this.root?.remove();
      const el=document.createElement('section');el.id='gp2-login';el.style.cssText='position:fixed;inset:0;z-index:100000;background:#f5f7fb;display:flex;align-items:center;justify-content:center;padding:18px';
      el.innerHTML=`<div style="width:min(420px,100%);background:#fff;border-radius:22px;padding:24px;box-shadow:0 12px 40px rgba(0,0,0,.12)">
        <h1 style="margin:0 0 6px">GitPit</h1><p style="margin:0 0 20px;color:#555">Login with your mobile number</p>
        <label style="display:block;margin-bottom:12px">Mobile Number<input data-phone inputmode="numeric" maxlength="10" placeholder="10-digit mobile number" style="width:100%;box-sizing:border-box;padding:12px;margin-top:6px;border:1px solid #ccc;border-radius:12px"></label>
        <label data-otp-wrap hidden style="display:block;margin-bottom:12px">OTP<input data-otp inputmode="numeric" maxlength="6" placeholder="6-digit OTP" style="width:100%;box-sizing:border-box;padding:12px;margin-top:6px;border:1px solid #ccc;border-radius:12px"></label>
        <div data-msg style="min-height:20px;margin:8px 0;color:#b00020"></div>
        <button data-send type="button" style="width:100%;padding:12px;border:0;border-radius:12px">Send OTP</button>
        <button data-verify type="button" hidden style="width:100%;padding:12px;border:0;border-radius:12px;margin-top:8px">Verify & Login</button>
      </div>`;
      document.body.appendChild(el);this.root=el;
      const phone=el.querySelector('[data-phone]'),otp=el.querySelector('[data-otp]'),msg=el.querySelector('[data-msg]'),send=el.querySelector('[data-send]'),verify=el.querySelector('[data-verify]');
      const setBusy=(b)=>{send.disabled=b;verify.disabled=b;};
      send.onclick=async()=>{const p=String(phone.value||'').replace(/\D/g,'');if(p.length!==10){msg.textContent='Enter a valid 10-digit mobile number.';return;}setBusy(true);msg.textContent='';try{await this.auth.requestOtp(p);el.querySelector('[data-otp-wrap]').hidden=false;verify.hidden=false;send.textContent='Resend OTP';otp.focus();msg.style.color='#287b2f';msg.textContent='OTP sent.';}catch(e){msg.style.color='#b00020';msg.textContent=e.message||'OTP could not be sent';}finally{setBusy(false);}};
      verify.onclick=async()=>{const p=String(phone.value||'').replace(/\D/g,''),code=String(otp.value||'').trim();if(p.length!==10||!/^\d{6}$/.test(code)){msg.style.color='#b00020';msg.textContent='Enter mobile number and 6-digit OTP.';return;}setBusy(true);msg.textContent='';try{const d=await this.auth.verifyOtp(p,code);this.close();this.onSuccess?.(d.user);}catch(e){msg.style.color='#b00020';msg.textContent=e.message||'Login failed';}finally{setBusy(false);}};
      otp.onkeydown=e=>{if(e.key==='Enter')verify.click();};
      return el;
    }
    close(){this.root?.remove();this.root=null;}
  }
  window.CoreV2LoginUI=CoreV2LoginUI;
})();
