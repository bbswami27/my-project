'use strict';

// GitPit v1.1.0 consolidated UI repairs.
// No MutationObserver loops. All patches are one-time wrappers or delegated events.
(function installSafeUiFinalV20(){
  if (window.__gitpitSafeUiV20) return;
  window.__gitpitSafeUiV20 = true;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ---------- Responsive UI ----------
  function installResponsive(){
    if (document.getElementById('gitpit-safe-responsive-v20')) return;
    const s=document.createElement('style'); s.id='gitpit-safe-responsive-v20';
    s.textContent=`
      :root{--gp-vh:1vh;--gp-safe-top:env(safe-area-inset-top,0px);--gp-safe-bottom:env(safe-area-inset-bottom,0px)}
      html,body,#app-container,.app-main{max-width:100%;overflow-x:hidden;box-sizing:border-box}
      img,video,canvas,iframe{max-width:100%}
      input,textarea,select,button{box-sizing:border-box;max-width:100%}
      .auth-overlay{pointer-events:auto!important;z-index:50000!important}
      @media(max-width:900px){
        .app-main{height:calc(var(--gp-vh)*100)!important}
        .sidebar{width:100%!important;max-width:100%!important;min-width:0!important}
        .chat-panel{max-width:100vw!important;min-width:0!important}
        .three-dots-dropdown{right:8px!important;left:auto!important;max-width:calc(100vw - 16px)!important}
        .chat-filters-row{overflow-x:auto!important;white-space:nowrap!important}
        .modal,.modal-content,.settings-modal-content,.profile-modal-content{max-width:96vw!important;max-height:92vh!important;overflow:auto!important}
        .message-bubble{max-width:86vw!important}
      }
      @media(max-width:380px){.brand-logo-img{max-width:120px!important}.chat-filter-chip{font-size:11px!important;padding:5px 8px!important}}
      @media(orientation:landscape) and (max-height:600px){.brand-logo-img{height:36px!important}.chat-header{min-height:48px!important}}
      .gp-chat-star{border:0;background:transparent;color:inherit;font-size:20px;padding:4px 7px;cursor:pointer;flex:0 0 auto}
      .gp-back-btn{border:0;background:transparent;color:inherit;font-size:27px;padding:2px 8px;cursor:pointer;flex:0 0 auto}
      .gp-v20-modal{position:fixed;inset:0;z-index:60000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px}
      .gp-v20-card{width:min(94vw,560px);max-height:90vh;overflow:auto;background:var(--bg-sidebar,#202c33);color:var(--text-primary,#fff);border-radius:14px;padding:18px;box-shadow:0 16px 50px rgba(0,0,0,.35)}
      .gp-v20-card input,.gp-v20-card textarea,.gp-v20-card select{width:100%;padding:10px;margin:6px 0 12px;border-radius:8px;border:1px solid rgba(127,127,127,.35);background:var(--bg-input-field,#111b21);color:inherit}
      .gp-v20-row{display:flex;gap:8px;justify-content:flex-end}.gp-v20-row button{padding:9px 14px;border-radius:8px;border:0;cursor:pointer}
    `;
    document.head.appendChild(s);
    const apply=()=>{ const h=window.visualViewport?.height||window.innerHeight; document.documentElement.style.setProperty('--gp-vh',`${h*.01}px`); };
    apply(); window.addEventListener('resize',apply,{passive:true}); window.addEventListener('orientationchange',()=>setTimeout(apply,100),{passive:true});
    window.visualViewport?.addEventListener('resize',apply,{passive:true});
  }

  // ---------- Universal back ----------
  function goBack(){
    const modal=document.querySelector('.gp-v20-modal'); if(modal){modal.remove();return;}
    const dd=document.getElementById('main-three-dots-dropdown'); if(dd?.classList.contains('active')){dd.classList.remove('active');return;}
    const activeOverlay=[...document.querySelectorAll('.modal.active,.modal-overlay.active,.popup.active,.sheet.active')].pop();
    if(activeOverlay){ const close=activeOverlay.querySelector('.modal-close,.close-modal,[data-close],[id^="btn-close-"]'); if(close) close.click(); else activeOverlay.classList.remove('active'); return; }
    const ce=window.ChatEngine;
    if(ce?.activeChatId){ ce.activeChatId=null; document.getElementById('chat-active-view')?.style.setProperty('display','none'); document.getElementById('chat-empty-state')?.style.setProperty('display','flex'); document.getElementById('sidebar-container')?.style.setProperty('display','flex'); ce.renderChatList?.(); return; }
    if(window.ChatterApp?.currentTab && window.ChatterApp.currentTab!=='chats'){ window.ChatterApp.switchTab?.('chats'); return; }
  }
  function installBack(){
    const ch=document.querySelector('.chat-header');
    if(ch && !ch.querySelector('.gp-back-btn')){ const b=document.createElement('button'); b.className='gp-back-btn'; b.type='button'; b.textContent='‹'; b.title='Back'; b.onclick=goBack; ch.insertBefore(b,ch.firstChild); }
    try{ const App=window.Capacitor?.Plugins?.App; if(App&&!window.__gpBackBound){window.__gpBackBound=true;App.addListener('backButton',goBack);} }catch(_){}
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();goBack();}});
  }

  // ---------- Whole-chat Star ----------
  const starKey='gitpit_starred_chat_ids';
  const getStars=()=>{try{return new Set(JSON.parse(localStorage.getItem(starKey)||'[]'));}catch(_){return new Set();}};
  const saveStars=s=>localStorage.setItem(starKey,JSON.stringify([...s]));
  function decorateStars(){
    const ce=window.ChatEngine; if(!ce) return;
    const stars=getStars();
    const rows=[...document.querySelectorAll('#chat-list-items > *, .chat-list-item, .chat-item')];
    rows.forEach(row=>{
      if(row.querySelector('.gp-chat-star')) return;
      const id=row.dataset?.chatId || row.getAttribute('data-chat-id');
      if(!id) return;
      const b=document.createElement('button'); b.type='button'; b.className='gp-chat-star'; b.title='Star conversation'; b.textContent=stars.has(id)?'★':'☆';
      b.onclick=e=>{e.preventDefault();e.stopPropagation();const s=getStars();s.has(id)?s.delete(id):s.add(id);saveStars(s);b.textContent=s.has(id)?'★':'☆';};
      row.appendChild(b);
    });
  }
  function installStarWrapper(){
    const ce=window.ChatEngine; if(!ce||ce.__gpStarV20) return;
    ce.__gpStarV20=true;
    if(typeof ce.renderChatList==='function'){
      const orig=ce.renderChatList.bind(ce);
      ce.renderChatList=function(...args){const r=orig(...args);setTimeout(decorateStars,0);return r;};
    }
    setTimeout(decorateStars,100);
  }

  // ---------- Chat / Group preference ----------
  const prefKey='gitpit_chat_group_preference';
  function openPreference(){
    const cur=localStorage.getItem(prefKey)||'recent';
    const m=document.createElement('div');m.className='gp-v20-modal';
    m.innerHTML=`<div class="gp-v20-card"><h3>Chat & Group Preference</h3><select id="gp-pref"><option value="recent">Recent activity</option><option value="individual">Individual chats first</option><option value="groups">Groups first</option></select><div class="gp-v20-row"><button data-cancel>Cancel</button><button data-save>Save</button></div></div>`;
    document.body.appendChild(m);m.querySelector('#gp-pref').value=cur;
    m.querySelector('[data-cancel]').onclick=()=>m.remove();
    m.querySelector('[data-save]').onclick=()=>{localStorage.setItem(prefKey,m.querySelector('#gp-pref').value);applyPreference();m.remove();};
  }
  function applyPreference(){
    const ce=window.ChatEngine; if(!ce||!Array.isArray(ce.chats))return;
    const pref=localStorage.getItem(prefKey)||'recent'; if(pref==='recent'){ce.renderChatList?.();return;}
    ce.chats.sort((a,b)=>{const ag=!!a.isGroup,bg=!!b.isGroup;if(ag===bg)return (b.timestamp||b.updatedAt||0)-(a.timestamp||a.updatedAt||0);return pref==='groups'?(ag?-1:1):(ag?1:-1);});
    ce.renderChatList?.();
  }
  function installPreferenceMenu(){
    const panel=document.getElementById('menu-panel-chat'); if(!panel||panel.querySelector('[data-gp-pref]'))return;
    const b=document.createElement('button');b.className='dropdown-item';b.dataset.gpPref='1';b.innerHTML='<span class="dropdown-item-icon">↕️</span><span>Chat & Group Preference</span>';b.onclick=()=>{document.getElementById('main-three-dots-dropdown')?.classList.remove('active');openPreference();};panel.appendChild(b);
  }

  // ---------- Anti Fraud & Stranger Field, first in 3-dot menu ----------
  function installAntiFraudMenu(){
    const root=document.getElementById('menu-panel-root'); if(!root)return;
    let b=root.querySelector('[data-gp-antifraud]');
    if(!b){b=document.createElement('button');b.className='dropdown-item';b.dataset.gpAntifraud='1';b.innerHTML='<span class="dropdown-item-icon">🛡️</span><span>Anti Fraud & Stranger Field</span>';b.onclick=()=>{document.getElementById('main-three-dots-dropdown')?.classList.remove('active');window.AuthManager?.openStrangerShieldModal?.()||window.ChatterApp?.openStrangerShieldModal?.();};root.insertBefore(b,root.firstChild);}
    const old=document.getElementById('menu-opt-stranger-shield'); if(old) old.style.display='none';
    document.querySelectorAll('#privacy-settings-modal button,#privacy-settings-modal label,#privacy-settings-modal .setting-row').forEach(el=>{const t=(el.textContent||'').toLowerCase();if(t.includes('stranger shield')||t.includes('anti-fraud'))el.style.display='none';});
  }

  // ---------- Email compose ----------
  function openEmailCompose(){
    const m=document.createElement('div');m.className='gp-v20-modal';m.innerHTML=`<div class="gp-v20-card"><h3>Compose GitPit Email / Memo</h3><label>To</label><input id="gp-mail-to" placeholder="Name / GitPit contact"><label>Subject</label><input id="gp-mail-sub" placeholder="Subject"><label>Message</label><textarea id="gp-mail-body" rows="8" placeholder="Write message"></textarea><div class="gp-v20-row"><button data-cancel>Cancel</button><button data-send>Send</button></div></div>`;document.body.appendChild(m);
    m.querySelector('[data-cancel]').onclick=()=>m.remove();
    m.querySelector('[data-send]').onclick=()=>{const to=m.querySelector('#gp-mail-to').value.trim(),subject=m.querySelector('#gp-mail-sub').value.trim(),body=m.querySelector('#gp-mail-body').value.trim();if(!to||!body){alert('Please enter recipient and message.');return;}let arr=[];try{arr=JSON.parse(localStorage.getItem('gitpit_email_memos')||'[]');}catch(_){}arr.unshift({id:`memo_${Date.now()}`,to,subject,body,folder:'sent',createdAt:Date.now()});localStorage.setItem('gitpit_email_memos',JSON.stringify(arr));if(window.ChatterApp){window.ChatterApp.emailMemos=arr;window.ChatterApp.renderEmailTab?.();}m.remove();};
  }

  // ---------- Delegated safe actions ----------
  document.addEventListener('click',e=>{
    const t=e.target?.closest?.('button,a,[role="button"]'); if(!t)return;
    const txt=(t.textContent||t.title||t.getAttribute('aria-label')||'').trim();
    if(/compose/i.test(txt) && (document.getElementById('tab-view-email')?.classList.contains('active') || /email|memo/i.test(document.body.textContent||''))){e.preventDefault();e.stopPropagation();openEmailCompose();}
  },false);

  // Retry only a few times while app managers initialize; no permanent polling.
  function init(){installResponsive();installBack();installStarWrapper();installPreferenceMenu();installAntiFraudMenu();applyPreference();}
  let tries=0;const timer=setInterval(()=>{tries++;init();if(tries>=12||(window.ChatEngine&&window.ChatterApp))clearInterval(timer);},300);setTimeout(init,50);
  window.GitPitSafeUiV20={goBack,openPreference,openEmailCompose,decorateStars,applyPreference};
})();
