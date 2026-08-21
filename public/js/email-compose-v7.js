'use strict';

(function installGitPitEmailComposeV7(){
  function ensureModal(){
    let modal=document.getElementById('gitpit-email-compose-modal-v7');
    if(modal) return modal;
    modal=document.createElement('div');
    modal.id='gitpit-email-compose-modal-v7';
    modal.className='modal-overlay';
    modal.style.cssText='display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.58);align-items:center;justify-content:center;padding:16px';
    modal.innerHTML=`<div style="width:min(560px,100%);max-height:90vh;overflow:auto;background:var(--bg-card,#111827);color:var(--text-primary,#fff);border:1px solid var(--border-color,#374151);border-radius:14px;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.35)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h3 style="margin:0">✉️ Compose GitPit Email / Memo</h3><button id="gp-email-close-v7" style="border:0;background:transparent;color:inherit;font-size:22px;cursor:pointer">✕</button></div>
      <label style="display:block;font-size:12px;margin:8px 0 4px">To</label><input id="gp-email-to-v7" type="text" placeholder="Name, GitPit user or email" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid var(--border-color,#475569);background:var(--bg-input,#0f172a);color:inherit">
      <label style="display:block;font-size:12px;margin:10px 0 4px">Subject</label><input id="gp-email-subject-v7" type="text" placeholder="Subject" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid var(--border-color,#475569);background:var(--bg-input,#0f172a);color:inherit">
      <label style="display:block;font-size:12px;margin:10px 0 4px">Message</label><textarea id="gp-email-body-v7" rows="8" placeholder="Write your message..." style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid var(--border-color,#475569);background:var(--bg-input,#0f172a);color:inherit;resize:vertical"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button id="gp-email-cancel-v7" style="padding:9px 14px;border-radius:8px;border:1px solid var(--border-color,#475569);background:transparent;color:inherit">Cancel</button><button id="gp-email-send-v7" style="padding:9px 16px;border-radius:8px;border:0;background:var(--brand-green,#00a884);color:white;font-weight:700">Send</button></div>
    </div>`;
    document.body.appendChild(modal);
    const close=()=>{modal.style.display='none';};
    modal.querySelector('#gp-email-close-v7').onclick=close;
    modal.querySelector('#gp-email-cancel-v7').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal) close();});
    modal.querySelector('#gp-email-send-v7').onclick=()=>{
      const to=modal.querySelector('#gp-email-to-v7').value.trim();
      const subject=modal.querySelector('#gp-email-subject-v7').value.trim();
      const body=modal.querySelector('#gp-email-body-v7').value.trim();
      if(!to||!subject||!body){alert('Please fill To, Subject and Message.');return;}
      const me=(window.AuthManager&&window.AuthManager.currentUser)||{};
      const memo={id:'memo_'+Date.now(),to,subject,body,sender:me.name||'Me',senderId:me.id||'me',senderAvatar:me.avatar||'assets/logo-icon.svg',time:new Date().toLocaleString(),priority:'normal',createdAt:Date.now(),direction:'sent'};
      const app=window.ChatterApp;
      if(app){
        app.emailMemos=Array.isArray(app.emailMemos)?app.emailMemos:[];
        app.emailMemos.unshift(memo);
        localStorage.setItem('chatterpatter_memos',JSON.stringify(app.emailMemos));
        try{if(typeof app.renderEmailTab==='function') app.renderEmailTab();}catch(_){ }
      }
      window.dispatchEvent(new CustomEvent('gitpit-email-composed',{detail:memo}));
      close();
      modal.querySelector('#gp-email-to-v7').value='';modal.querySelector('#gp-email-subject-v7').value='';modal.querySelector('#gp-email-body-v7').value='';
      alert('✅ GitPit Email / Memo saved to Sent.');
    };
    return modal;
  }

  function openCompose(){
    const modal=ensureModal();
    modal.style.display='flex';
    setTimeout(()=>modal.querySelector('#gp-email-to-v7')?.focus(),50);
  }
  window.openGitPitEmailCompose=openCompose;

  function bindButtons(){
    const all=[...document.querySelectorAll('button,a,[role="button"]')];
    all.forEach(el=>{
      const t=(el.textContent||'').replace(/\s+/g,' ').trim();
      const id=(el.id||'').toLowerCase();
      if(!(/compose/i.test(t)||/compose.*email|email.*compose|memo.*compose/.test(id))) return;
      if(!(/email|memo|compose/i.test(t+' '+id))) return;
      if(el.dataset.gpEmailV7) return;
      el.dataset.gpEmailV7='1';
      el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openCompose();},true);
    });
  }

  const obs=new MutationObserver(bindButtons);obs.observe(document.documentElement,{childList:true,subtree:true});
  bindButtons();
  document.addEventListener('DOMContentLoaded',bindButtons);
})();
