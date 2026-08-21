'use strict';

(function installGitPitV112FinalRepair(){
  if(window.__gitpitV112FinalRepair)return;
  window.__gitpitV112FinalRepair=true;

  const API=()=>window.API_BASE||'https://chitchat-chatterpatter.onrender.com';
  const token=()=>window.AuthManager?.authToken||localStorage.getItem('gitpit_auth_token')||localStorage.getItem('chatterpatter_token')||'';
  const me=()=>window.AuthManager?.currentUser||null;
  const d10=v=>String(v||'').replace(/\D/g,'').slice(-10);
  const norm=v=>{const d=d10(v);return d.length===10?`+91${d}`:'';};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function authFetch(path,opts={}){
    const t=token();
    const headers={...(opts.headers||{}),...(t?{Authorization:`Bearer ${t}`}:{})};
    const r=await fetch(`${API()}${path}`,{...opts,headers});
    if(r.status===401){
      try{
        const sr=await fetch(`${API()}/api/auth/session`,{headers:t?{Authorization:`Bearer ${t}`}:{}});
        if(!sr.ok)throw new Error('Session expired or invalid');
      }catch(_){throw new Error('Session expired or invalid. Please log in again.');}
    }
    return r;
  }

  function removeByText(root,re){
    if(!root)return;
    [...root.querySelectorAll('button,a,li,.dropdown-item,.setting-row,.settings-item,label,.privacy-option,.form-group,.card')].forEach(el=>{
      const txt=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(re.test(txt))el.remove();
    });
  }

  function removeMeetingAndMail(){
    removeByText(document,/GitPit\s*(Meetings?|Email|Mail|Memo)|Email\s*\/\s*Memos?/i);
    ['tab-view-meetings','tab-view-email','schedule-meeting-modal','meeting-modal','email-compose-modal'].forEach(id=>document.getElementById(id)?.remove());
    document.querySelectorAll('[data-tab="meetings"],[data-tab="email"],[onclick*="meetings"],[onclick*="email"]').forEach(n=>n.remove());
    if(window.ChatterApp){
      const oldSwitch=window.ChatterApp.switchTab?.bind(window.ChatterApp);
      if(oldSwitch&&!window.ChatterApp.__v112NoMeetingMail){
        window.ChatterApp.__v112NoMeetingMail=true;
        window.ChatterApp.switchTab=function(tab,...args){
          if(tab==='meetings'||tab==='email')return oldSwitch('chats',...args);
          return oldSwitch(tab,...args);
        };
      }
    }
  }

  function cleanPrivacy(){
    const root=document.getElementById('privacy-settings-modal')||document.querySelector('.privacy-settings-modal,[data-modal*="privacy"]');
    if(!root)return;
    removeByText(root,/fraud prevention|stranger shield|anti[- ]?fraud|unknown\s*\/\s*unsaved|Mode\s*[123]|File\s*&\s*Document Receiving/i);
    const status=[...root.querySelectorAll('*')].find(n=>/Status Visibility/i.test((n.textContent||'').trim()));
    if(status){
      let anchor=status.closest('.setting-row,.settings-item,.form-group,.privacy-option,label,div')||status;
      let p=anchor.previousElementSibling;
      while(p){const prev=p.previousElementSibling;p.remove();p=prev;}
    }
  }

  async function getRegisteredUsers(){
    try{
      const r=await authFetch('/api/users');
      const d=await r.json();
      const arr=Array.isArray(d)?d:(d.users||[]);
      const mine=me()?.id;
      const out=arr.filter(u=>u&&u.id&&u.id!==mine&&u.phone).map(u=>({...u,isRegistered:true,is_registered:true}));
      localStorage.setItem('gitpit_all_registered_users',JSON.stringify(out));
      return out;
    }catch(e){
      try{return JSON.parse(localStorage.getItem('gitpit_all_registered_users')||'[]');}catch(_){return [];}
    }
  }

  async function readPhonebookOrdered(){
    const p=window.Capacitor?.Plugins?.Contacts;
    if(!p)return [];
    try{await p.requestPermissions?.();}catch(_){}
    try{
      let r;try{r=await p.getContacts({projection:{name:true,phones:true}});}catch(_){r=await p.getContacts();}
      const list=Array.isArray(r?.contacts)?r.contacts:[];
      const out=[];
      list.forEach((c,index)=>{
        const name=c?.displayName||c?.name?.display||[c?.name?.given,c?.name?.family].filter(Boolean).join(' ')||c?.givenName||c?.fullName||'Contact';
        const nums=[];
        [c?.phoneNumbers,c?.phones,c?.tel].forEach(a=>Array.isArray(a)&&a.forEach(x=>nums.push(typeof x==='string'?x:(x?.number||x?.value||x?.phoneNumber||''))));
        if(c?.phone)nums.push(c.phone);if(c?.phoneNumber)nums.push(c.phoneNumber);
        [...new Set(nums.map(norm).filter(Boolean))].forEach(phone=>out.push({order:index,name,savedName:name,phone}));
      });
      return out;
    }catch(e){console.warn('[V112] phonebook read failed',e);return [];}
  }

  async function syncDirectory(){
    const [registered,phonebook]=await Promise.all([getRegisteredUsers(),readPhonebookOrdered()]);
    const byPhone=new Map(registered.map(u=>[d10(u.phone),u]));
    const ordered=phonebook.map(x=>{const u=byPhone.get(d10(x.phone));return u?{...u,...x,name:x.savedName||u.name,isRegistered:true,registeredUserId:u.id}:{...x,isRegistered:false};});
    localStorage.setItem('gitpit_device_contacts_ordered',JSON.stringify(ordered));
    localStorage.setItem('gitpit_registered_directory',JSON.stringify(registered));
    if(window.ChatEngine)window.ChatEngine.registeredUsers=registered;
    return {registered,ordered};
  }

  function ensureChat(u){
    const ce=window.ChatEngine;if(!ce||!u)return null;
    ce.chats=ce.chats||[];
    let chat=ce.chats.find(c=>c.id===u.id||d10(c.phone)===d10(u.phone));
    if(!chat){chat={id:u.id,name:u.savedName||u.name||u.phone,phone:u.phone,avatar:u.avatar||'assets/logo-icon.svg',bio:u.bio||'GitPit Member',online:!!u.online,isRegistered:true,is_registered:true,isGroup:false,isAi:false,unreadCount:0,messages:[]};ce.chats.unshift(chat);ce.saveChats?.();}
    return chat;
  }

  async function openNewChat(){
    const {registered,ordered}=await syncDirectory();
    document.querySelectorAll('.gitpit-v112-newchat').forEach(n=>n.remove());
    const wrap=document.createElement('div');wrap.className='gitpit-v112-newchat';wrap.style.cssText='position:fixed;inset:0;z-index:70000;background:var(--bg-app,#fff);color:var(--text-primary,#111);display:flex;flex-direction:column';
    wrap.innerHTML=`<div style="display:flex;gap:8px;align-items:center;padding:12px;border-bottom:1px solid #ccc"><button data-back>‹</button><b style="flex:1">Start New Chat</b><button data-new>+ Add Contact</button></div><div style="display:flex;gap:8px;padding:10px"><button data-tab="registered">GitPit Registered</button><button data-tab="phonebook">Phonebook</button></div><input data-search placeholder="Search name or number" style="margin:0 10px 10px;padding:10px"><div data-list style="overflow:auto;flex:1"></div>`;
    document.body.appendChild(wrap);
    let tab='registered';
    const render=()=>{
      const q=(wrap.querySelector('[data-search]').value||'').toLowerCase();
      const rows=(tab==='registered'?registered:ordered).filter(x=>!q||String(x.savedName||x.name||'').toLowerCase().includes(q)||String(x.phone||'').includes(q));
      const list=wrap.querySelector('[data-list]');list.innerHTML='';
      rows.forEach(x=>{const b=document.createElement('button');b.type='button';b.style.cssText='width:100%;display:flex;align-items:center;gap:10px;padding:12px;border:0;border-bottom:1px solid #ddd;background:transparent;color:inherit;text-align:left';b.innerHTML=`<span style="flex:1"><b>${esc(x.savedName||x.name||x.phone)}</b><small style="display:block">${esc(x.phone||'')} ${x.isRegistered?'• Registered':'• Not on GitPit'}</small></span>${x.isRegistered?'Chat':''}`;b.onclick=()=>{if(!x.isRegistered){alert('This contact is not registered on GitPit.');return;}const u=registered.find(r=>r.id===x.id||d10(r.phone)===d10(x.phone))||x;const c=ensureChat(u);wrap.remove();c&&window.ChatEngine?.openChat?.(c.id);};list.appendChild(b);});
      if(!rows.length)list.innerHTML='<div style="padding:24px;text-align:center">No contacts found. Check Contacts permission.</div>';
    };
    wrap.querySelector('[data-back]').onclick=()=>wrap.remove();
    wrap.querySelector('[data-search]').oninput=render;
    wrap.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
    wrap.querySelector('[data-new]').onclick=async()=>{const p=window.Capacitor?.Plugins?.Contacts;if(p?.createContact){try{await p.createContact({contact:{name:{given:'New Contact'}}});}catch(_){alert('Please allow Contacts permission.');}}else alert('Please add the contact in your phone Contacts app, then reopen GitPit.');};
    render();
  }

  async function filterGroupRegisteredOnly(){
    const regs=await getRegisteredUsers();
    const ids=new Set(regs.map(u=>String(u.id)));const phones=new Set(regs.map(u=>d10(u.phone)).filter(Boolean));
    document.querySelectorAll('#create-group-modal,#group-members-modal,.create-group-modal,[data-modal*="group"]').forEach(root=>{
      root.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
        const row=cb.closest('label,.member-row,.contact-row,li,div');if(!row)return;
        const id=cb.dataset.id||cb.dataset.userId||cb.value||'';const phone=d10(row.textContent||'');const ok=ids.has(String(id))||(phone&&phones.has(phone));
        if(!ok){cb.checked=false;row.style.display='none';}else row.style.display='';
      });
    });
  }

  function fixAttachmentMenu(){
    const root=document.getElementById('chat-attach-popup')||document.querySelector('.chat-attach-popup,.attachment-popup');if(!root)return;
    removeByText(root,/Ask AI Assistant/i);
    const loc=[...root.querySelectorAll('button,.attachment-option,.attach-option')].find(n=>/Share Location/i.test(n.textContent||''));
    if(loc&&!root.querySelector('[data-v112-current-location]')){
      const current=loc.cloneNode(true);current.dataset.v112CurrentLocation='1';current.innerHTML=current.innerHTML.replace(/Share Location/i,'Current Location');
      current.onclick=e=>{e.preventDefault();e.stopPropagation();window.LocationService?.shareCurrentLocation?.()||window.ChatterApp?.shareLocation?.('current');};
      const live=loc.cloneNode(true);live.dataset.v112LiveLocation='1';live.innerHTML=live.innerHTML.replace(/Share Location/i,'Live Location');
      live.onclick=e=>{e.preventDefault();e.stopPropagation();window.LocationService?.shareLiveLocation?.()||window.ChatterApp?.shareLocation?.('live');};
      loc.replaceWith(current,live);
    }
  }

  function goBackInsideGitPit(){
    const overlay=[...document.querySelectorAll('.gitpit-v112-newchat,.modal.active,.modal-overlay.active,.popup.active,.sheet.active')].pop();
    if(overlay){overlay.classList?.remove('active');if(overlay.classList?.contains('gitpit-v112-newchat'))overlay.remove();return true;}
    const ce=window.ChatEngine;
    if(ce?.activeChatId){ce.activeChatId=null;document.getElementById('sidebar-container')?.classList.remove('mobile-hidden');document.getElementById('chat-main-area')?.classList.remove('mobile-active');document.getElementById('chat-active-view')?.style.setProperty('display','none');document.getElementById('chat-empty-state')?.style.setProperty('display','flex');ce.renderChatList?.();return true;}
    if(window.ChatterApp?.currentTab&&window.ChatterApp.currentTab!=='chats'){window.ChatterApp.switchTab?.('chats');return true;}
    return false;
  }

  function bindSocketDelivery(){
    const s=window.ChatterApp?.socket;if(!s||s.__v112Bound)return false;s.__v112Bound=true;
    const join=()=>{const u=me();if(u?.id)s.emit('user_join',{id:u.id,name:u.name,phone:u.phone,avatar:u.avatar,email:u.email});};
    s.connected&&join();s.on('connect',join);
    const incoming=msg=>{if(!msg||msg.senderId===me()?.id)return;try{window.ChatEngine?.onReceiveMessage?.(msg);}catch(e){console.warn('[V112] incoming message merge failed',e);}};
    ['receive_message','chat_message'].forEach(ev=>s.on(ev,incoming));
    return true;
  }

  function patchScreenShare(){
    const cm=window.CallManager;if(!cm||cm.__v112Screen)return false;cm.__v112Screen=true;
    const original=cm.handleCallAccepted?.bind(cm);
    if(original)cm.handleCallAccepted=async function(data){const out=await original(data);if(window.__gitpitPendingScreenShare){setTimeout(()=>{if(this.peerConnection&&!this.isScreenSharing)this.toggleScreenShare?.();window.__gitpitPendingScreenShare=null;},1200);}return out;};
    return true;
  }

  async function refreshStatuses(){
    try{const r=await authFetch('/api/status');const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);const arr=Array.isArray(d)?d:(d.statuses||[]);arr.forEach(s=>window.GitPitV111Realtime?.mergeStatus?.(s));window.StoriesManager?.renderStatusTab?.();}catch(e){console.warn('[V112] status refresh failed',e.message);}
  }

  document.addEventListener('click',e=>{
    const t=e.target?.closest?.('button,a,[role="button"],.new-chat-btn,#btn-new-chat');if(!t)return;
    const txt=(t.textContent||t.title||t.getAttribute('aria-label')||'').trim();
    if(/new\s*chat|pencil/i.test(txt)||t.id==='btn-new-chat'||t.classList.contains('new-chat-btn')){e.preventDefault();e.stopImmediatePropagation();openNewChat();return;}
    setTimeout(()=>{removeMeetingAndMail();cleanPrivacy();fixAttachmentMenu();if(/group/i.test(txt))filterGroupRegisteredOnly();if(/privacy/i.test(txt))cleanPrivacy();if(/status/i.test(txt))refreshStatuses();},40);
  },true);

  try{const App=window.Capacitor?.Plugins?.App;if(App&&!window.__v112Back){window.__v112Back=true;App.addListener('backButton',()=>{goBackInsideGitPit();});}}catch(_){}
  window.addEventListener('popstate',()=>{if(goBackInsideGitPit())history.pushState({gitpit:true},'',location.href);});
  try{history.replaceState({gitpit:true},'',location.href);history.pushState({gitpit:true},'',location.href);}catch(_){}

  let tries=0;const timer=setInterval(()=>{tries++;removeMeetingAndMail();cleanPrivacy();fixAttachmentMenu();bindSocketDelivery();patchScreenShare();if(tries>=20)clearInterval(timer);},500);
  setTimeout(()=>{syncDirectory();refreshStatuses();filterGroupRegisteredOnly();},900);
  window.GitPitV112={openNewChat,syncDirectory,filterGroupRegisteredOnly,refreshStatuses,goBackInsideGitPit};
})();
