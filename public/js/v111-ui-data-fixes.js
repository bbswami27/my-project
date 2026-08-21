'use strict';

// GitPit v1.1.1 consolidated fixes batch A.
// Event-driven only: no MutationObserver and no permanent UI polling.
(function installV111UiDataFixes(){
  if(window.__gitpitV111UiDataFixes)return;
  window.__gitpitV111UiDataFixes=true;

  const d10=v=>String(v||'').replace(/\D/g,'').slice(-10);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeJson=(k,f=[])=>{try{return JSON.parse(localStorage.getItem(k)||'')||f;}catch(_){return f;}};

  function registeredMap(){
    const map=new Map();
    const sources=[
      ...(Array.isArray(window.ChatEngine?.registeredUsers)?window.ChatEngine.registeredUsers:[]),
      ...safeJson('gitpit_registered_directory',[]),
      ...safeJson('gitpit_synced_contacts',[])
    ];
    sources.forEach(u=>{
      if(!u)return;
      if(u.id)map.set(String(u.id),u);
      const p=d10(u.phone||u.originalPhone);if(p)map.set(p,u);
    });
    return map;
  }

  function isRegisteredNode(node){
    const map=registeredMap();
    const id=node?.dataset?.id||node?.dataset?.userId||node?.dataset?.contactId||node?.querySelector?.('input')?.dataset?.id||'';
    const phone=node?.dataset?.phone||node?.querySelector?.('[data-phone]')?.dataset?.phone||node?.textContent||'';
    return (id&&map.has(String(id))) || (d10(phone)&&map.has(d10(phone)));
  }

  // 1 + 10: never let Android/browser back leave the GitPit SPA from an open chat/modal.
  function closeTopLayer(){
    const custom=[...document.querySelectorAll('.gp-v20-modal,.gitpit-native-directory-modal,.modal.active,.modal-overlay.active,.popup.active,.sheet.active')].filter(n=>getComputedStyle(n).display!=='none');
    const top=custom[custom.length-1];
    if(top){
      const close=top.querySelector('[data-close],.modal-close,.close-modal,.modal-close-btn,[id*="close"],.gp-back-btn');
      if(close&&close!==document.activeElement){try{close.click();return true;}catch(_){}}
      if(top.classList.contains('active'))top.classList.remove('active'); else top.remove();
      return true;
    }
    const ce=window.ChatEngine;
    if(ce?.activeChatId){
      ce.activeChatId=null;
      try{ce.renderChatList?.();}catch(_){}
      const sidebar=document.getElementById('sidebar-container')||document.querySelector('.sidebar');
      const active=document.getElementById('chat-active-view')||document.querySelector('.chat-active-view');
      const empty=document.getElementById('chat-empty-state')||document.querySelector('.chat-empty-state');
      if(sidebar)sidebar.style.display='flex';
      if(active)active.style.display='none';
      if(empty)empty.style.display='flex';
      return true;
    }
    if(window.ChatterApp?.currentTab&&window.ChatterApp.currentTab!=='chats'){
      window.ChatterApp.switchTab?.('chats');return true;
    }
    return false;
  }

  function installBackGuard(){
    try{
      if(!history.state?.gitpitGuard){history.replaceState({...(history.state||{}),gitpitGuard:true},'',location.href);history.pushState({gitpitGuard:true},'',location.href);}
      window.addEventListener('popstate',()=>{if(closeTopLayer()){history.pushState({gitpitGuard:true},'',location.href);}});
    }catch(_){}
    try{
      const App=window.Capacitor?.Plugins?.App;
      if(App&&!window.__gitpitV111Back){window.__gitpitV111Back=true;App.addListener('backButton',()=>{if(!closeTopLayer())window.ChatterApp?.switchTab?.('chats');});}
    }catch(_){}
  }

  function addBackButtons(){
    document.querySelectorAll('.modal.active,.modal-overlay.active,.popup.active,.sheet.active').forEach(root=>{
      const header=root.querySelector('.modal-header,header,.settings-header,.sheet-header');
      if(!header||header.querySelector('.gp-v111-back'))return;
      const b=document.createElement('button');b.type='button';b.className='gp-v111-back';b.textContent='‹';b.title='Back';
      b.style.cssText='border:0;background:transparent;color:inherit;font-size:28px;padding:2px 8px;cursor:pointer;';
      b.onclick=e=>{e.preventDefault();e.stopPropagation();closeTopLayer();};header.insertBefore(b,header.firstChild);
    });
  }

  // 2: meeting invitee picker must contain registered GitPit contacts only.
  function filterMeetingInvitees(){
    const modal=document.getElementById('schedule-meeting-modal')||document.querySelector('[data-modal="schedule-meeting"]');
    if(!modal)return;
    modal.querySelectorAll('.meeting-invitee-checkbox').forEach(cb=>{
      const row=cb.closest('label,.contact-row,.invitee-row,li,div');
      const id=cb.dataset.id||cb.value||'';
      const phone=d10(row?.textContent||'');
      const map=registeredMap();
      const ok=(id&&map.has(String(id)))||(phone&&map.has(phone));
      if(row)row.style.display=ok?'':'none';
      if(!ok)cb.checked=false;
    });
  }

  // 7: group member picker must list registered users only.
  function filterGroupMembers(){
    const roots=[...document.querySelectorAll('#create-group-modal,#group-members-modal,.create-group-modal,[data-modal*="group"]')].filter(Boolean);
    roots.forEach(root=>{
      root.querySelectorAll('input[type="checkbox"],.member-row,.contact-row').forEach(el=>{
        const row=el.matches('input')?el.closest('label,.member-row,.contact-row,li,div'):el;
        if(!row)return;
        const text=(row.textContent||'').trim();
        if(!text)return;
        const ok=isRegisteredNode(row);
        row.style.display=ok?'':'none';
        const cb=row.querySelector('input[type="checkbox"]');if(cb&&!ok)cb.checked=false;
      });
    });
  }

  // 3: scheduled meeting detail shows every invited name.
  function meetings(){
    const a=safeJson('gitpit_meetings',[]),b=safeJson('chatterpatter_meetings',[]);
    const map=new Map();[...a,...b,...(window.ChatterApp?.meetings||[])].forEach(m=>m?.id&&map.set(m.id,m));return [...map.values()];
  }
  function showMeetingDetail(m){
    if(!m)return;
    const invitees=Array.isArray(m.invitees)?m.invitees:[];
    const names=invitees.map(i=>typeof i==='string'?i:(i.name||i.phone||i.id||'GitPit User'));
    const wrap=document.createElement('div');wrap.className='gp-v20-modal';
    wrap.innerHTML=`<div class="gp-v20-card"><div style="display:flex;align-items:center;gap:8px"><button class="gp-v111-back" data-close>‹</button><h3 style="margin:0;flex:1">${esc(m.title||'Scheduled Meeting')}</h3></div><p><b>Date:</b> ${esc(m.date||'')}</p><p><b>Time:</b> ${esc(m.time||'')}</p><p><b>Duration:</b> ${esc(m.duration||'')}</p><p><b>Invitees (${names.length}):</b></p><div style="display:grid;gap:6px">${names.length?names.map(n=>`<div style="padding:9px;border:1px solid rgba(127,127,127,.25);border-radius:8px">${esc(n)}</div>`).join(''):'<div>No invitees saved.</div>'}</div></div>`;
    document.body.appendChild(wrap);wrap.querySelector('[data-close]').onclick=()=>wrap.remove();
  }
  function meetingFromNode(node){
    const id=node?.dataset?.meetingId||node?.closest?.('[data-meeting-id]')?.dataset?.meetingId||'';
    if(id)return meetings().find(m=>String(m.id)===String(id));
    const title=(node?.closest?.('.meeting-card,.scheduled-meeting,.meeting-item')?.querySelector?.('h3,h4,.meeting-title')?.textContent||'').trim();
    return title?meetings().find(m=>String(m.title||'').trim()===title):null;
  }

  // 4: sent memo/email can be reopened with complete detail.
  function memos(){
    const a=safeJson('gitpit_email_memos',[]),b=Array.isArray(window.ChatterApp?.emailMemos)?window.ChatterApp.emailMemos:[];
    const map=new Map();[...a,...b].forEach(m=>m?.id&&map.set(m.id,m));return [...map.values()];
  }
  function showMemoDetail(m){
    if(!m)return;
    const wrap=document.createElement('div');wrap.className='gp-v20-modal';
    wrap.innerHTML=`<div class="gp-v20-card"><div style="display:flex;align-items:center;gap:8px"><button data-close class="gp-v111-back">‹</button><h3 style="margin:0;flex:1">${esc(m.subject||'GitPit Email / Memo')}</h3></div><p><b>To:</b> ${esc(m.to||m.recipient||'')}</p><p><b>Sent:</b> ${m.createdAt?esc(new Date(m.createdAt).toLocaleString()):''}</p><div style="white-space:pre-wrap;padding:12px;border:1px solid rgba(127,127,127,.25);border-radius:8px">${esc(m.body||m.message||m.text||'')}</div></div>`;
    document.body.appendChild(wrap);wrap.querySelector('[data-close]').onclick=()=>wrap.remove();
  }

  // 6: remove duplicate Anti Fraud Stranger Shield from Privacy & Security.
  function removePrivacyDuplicate(){
    document.querySelectorAll('#privacy-settings-modal,.privacy-settings-modal,[data-modal*="privacy"]').forEach(root=>{
      root.querySelectorAll('button,label,.setting-row,.settings-item,li,div').forEach(el=>{
        const t=(el.textContent||'').trim().toLowerCase();
        if((t==='anti fraud stranger shield'||t==='anti-fraud stranger shield'||t==='anti fraud & stranger field'||t.includes('stranger shield'))&&!el.querySelector('input,textarea,select'))el.style.display='none';
      });
    });
  }

  document.addEventListener('click',e=>{
    const t=e.target?.closest?.('button,a,[role="button"],.meeting-card,.scheduled-meeting,.meeting-item,.email-item,.memo-item,[data-meeting-id],[data-memo-id]');
    if(!t)return;
    const text=(t.textContent||t.title||t.getAttribute('aria-label')||'').trim().toLowerCase();
    setTimeout(()=>{addBackButtons();removePrivacyDuplicate();if(text.includes('meeting')||text.includes('schedule'))filterMeetingInvitees();if(text.includes('group'))filterGroupMembers();},60);

    if(t.matches('.meeting-card,.scheduled-meeting,.meeting-item,[data-meeting-id]')){
      const m=meetingFromNode(t);if(m){e.preventDefault();e.stopPropagation();showMeetingDetail(m);return;}
    }
    if(t.matches('.email-item,.memo-item,[data-memo-id]')){
      const id=t.dataset.memoId||t.closest('[data-memo-id]')?.dataset.memoId||'';
      const m=id?memos().find(x=>String(x.id)===String(id)):null;
      if(m){e.preventDefault();e.stopPropagation();showMemoDetail(m);}
    }
  },true);

  installBackGuard();
  setTimeout(()=>{addBackButtons();removePrivacyDuplicate();filterMeetingInvitees();filterGroupMembers();},500);
  window.GitPitV111UiData={closeTopLayer,filterMeetingInvitees,filterGroupMembers,showMeetingDetail,showMemoDetail};
})();
