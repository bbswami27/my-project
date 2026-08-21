'use strict';

// GitPit v1.1.1 consolidated fixes batch B.
// Covers device phonebook/New Chat, realtime receiver delivery, status visibility and screen-share timing.
(function installV111RealtimeContactFixes(){
  if(window.__gitpitV111RealtimeContactFixes)return;
  window.__gitpitV111RealtimeContactFixes=true;

  const API=()=>window.API_BASE||'https://chitchat-chatterpatter.onrender.com';
  const token=()=>window.AuthManager?.authToken||localStorage.getItem('gitpit_auth_token')||localStorage.getItem('chatterpatter_token')||'';
  const me=()=>window.AuthManager?.currentUser||null;
  const d10=v=>String(v||'').replace(/\D/g,'').slice(-10);
  const norm=v=>{const d=d10(v);return d.length===10?`+91${d}`:'';};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe=(k,f=[])=>{try{return JSON.parse(localStorage.getItem(k)||'')||f;}catch(_){return f;}};

  function registeredUsers(){
    const map=new Map();
    const src=[...(window.ChatEngine?.registeredUsers||[]),...safe('gitpit_registered_directory',[]),...safe('gitpit_synced_contacts',[])];
    src.forEach(u=>{if(!u)return;const id=String(u.id||'');const p=d10(u.phone||u.originalPhone);if(id)map.set(id,u);if(p)map.set(p,u);});
    return [...new Map([...map.values()].filter(u=>u?.id).map(u=>[u.id,u])).values()].filter(u=>u.id!==me()?.id);
  }

  function findRegistered(phone,id){
    return registeredUsers().find(u=>String(u.id)===String(id||'')||(d10(phone)&&d10(u.phone)===d10(phone)))||null;
  }

  // ---------------- New Chat / Phonebook ----------------
  async function readNativeOrdered(){
    const p=window.Capacitor?.Plugins?.Contacts;
    if(!p)return [];
    try{if(p.requestPermissions)await p.requestPermissions();}catch(_){}
    try{
      let r;try{r=await p.getContacts({projection:{name:true,phones:true}});}catch(_){r=await p.getContacts();}
      return Array.isArray(r?.contacts)?r.contacts:[];
    }catch(e){console.warn('[V111 CONTACT] native read failed',e);return [];}
  }
  function cName(c){return c?.displayName||c?.name?.display||[c?.name?.given,c?.name?.middle,c?.name?.family].filter(Boolean).join(' ')||c?.givenName||c?.fullName||'Contact';}
  function cPhones(c){const a=[];[c?.phoneNumbers,c?.phones,c?.tel].forEach(x=>Array.isArray(x)&&x.forEach(v=>a.push(typeof v==='string'?v:(v?.number||v?.value||v?.phoneNumber||''))));if(c?.phone)a.push(c.phone);if(c?.phoneNumber)a.push(c.phoneNumber);return [...new Set(a.map(norm).filter(Boolean))];}
  async function syncNativeOrdered(){
    const raw=await readNativeOrdered();
    const ordered=[];
    raw.forEach((c,index)=>cPhones(c).forEach(phone=>ordered.push({order:index,name:cName(c),savedName:cName(c),phone,isSavedContact:true})));
    if(ordered.length){
      try{
        const r=await fetch(`${API()}/api/contacts/sync`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':token()?`Bearer ${token()}`:''},body:JSON.stringify({contacts:ordered.map(x=>({name:x.name,phone:x.phone}))})});
        const d=await r.json();const regs=d.matchedUsers||d.registered||[];
        ordered.forEach(x=>{const u=regs.find(r=>d10(r.phone)===d10(x.phone));if(u)Object.assign(x,u,{name:x.savedName,isRegistered:true,is_registered:true,registeredUserId:u.id});else Object.assign(x,{isRegistered:false,is_registered:false});});
        localStorage.setItem('gitpit_registered_directory',JSON.stringify(ordered.filter(x=>x.isRegistered)));
        localStorage.setItem('gitpit_synced_contacts',JSON.stringify(ordered.filter(x=>x.isRegistered)));
        localStorage.setItem('gitpit_device_contacts_ordered',JSON.stringify(ordered));
        if(window.ChatEngine)window.ChatEngine.registeredUsers=ordered.filter(x=>x.isRegistered);
      }catch(e){console.warn('[V111 CONTACT] sync failed',e);localStorage.setItem('gitpit_device_contacts_ordered',JSON.stringify(ordered));}
    }
    return ordered;
  }

  function ensureChat(u){
    const ce=window.ChatEngine;if(!ce||!u)return null;ce.chats=ce.chats||[];
    const id=u.registeredUserId||u.id;let c=ce.chats.find(x=>x.id===id||d10(x.phone)===d10(u.phone));
    if(!c){c={id,name:u.savedName||u.name||u.phone,phone:u.phone||'',avatar:u.avatar||'assets/logo-icon.svg',bio:u.bio||'GitPit Member',online:!!u.online,isRegistered:true,is_registered:true,isGroup:false,isAi:false,unreadCount:0,messages:[]};ce.chats.unshift(c);try{ce.saveChats?.();}catch(_){}}
    return c;
  }

  async function openNewChatDirectory(){
    await syncNativeOrdered();
    document.querySelectorAll('.gitpit-v111-newchat').forEach(n=>n.remove());
    const wrap=document.createElement('div');wrap.className='gitpit-v111-newchat';wrap.style.cssText='position:fixed;inset:0;z-index:65000;background:var(--bg-app,#111b21);color:var(--text-primary,#fff);display:flex;flex-direction:column';
    wrap.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid rgba(127,127,127,.25)"><button data-back style="font-size:26px">‹</button><b style="flex:1">New Chat</b><button data-new-contact>New Contact</button></div><div style="display:flex;gap:6px;padding:10px"><button data-tab="registered">GitPit Registered</button><button data-tab="phonebook">Phonebook</button></div><div style="padding:0 10px 10px"><input data-search placeholder="Search contacts" style="width:100%;padding:10px;border-radius:8px"></div><div data-list style="overflow:auto;flex:1"></div>`;
    document.body.appendChild(wrap);
    let tab='registered';
    const render=()=>{
      const q=(wrap.querySelector('[data-search]').value||'').toLowerCase();
      const ordered=safe('gitpit_device_contacts_ordered',[]);
      let rows=tab==='registered'?ordered.filter(x=>x.isRegistered):ordered;
      rows=rows.filter(x=>!q||String(x.savedName||x.name||'').toLowerCase().includes(q)||String(x.phone||'').includes(q));
      const list=wrap.querySelector('[data-list]');list.innerHTML='';
      if(!rows.length)list.innerHTML='<div style="padding:24px;text-align:center;opacity:.7">No contacts found. Check Contacts permission and refresh.</div>';
      rows.forEach(x=>{const b=document.createElement('button');b.type='button';b.style.cssText='width:100%;display:flex;gap:12px;align-items:center;padding:12px;border:0;border-bottom:1px solid rgba(127,127,127,.15);background:transparent;color:inherit;text-align:left';b.innerHTML=`<span style="width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#2a3942">${esc((x.savedName||x.name||'?').charAt(0).toUpperCase())}</span><span style="flex:1"><b>${esc(x.savedName||x.name||x.phone)}</b><small style="display:block;opacity:.7">${esc(x.phone||'')} ${x.isRegistered?'• Registered':'• Not on GitPit'}</small></span>${x.isRegistered?'✓':''}`;b.onclick=()=>{if(!x.isRegistered){alert('This contact is not registered on GitPit.');return;}const c=ensureChat(x);wrap.remove();if(c)window.ChatEngine?.openChat?.(c.id);};list.appendChild(b);});
    };
    wrap.querySelector('[data-back]').onclick=()=>wrap.remove();
    wrap.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
    wrap.querySelector('[data-search]').oninput=render;
    wrap.querySelector('[data-new-contact]').onclick=async()=>{
      const p=window.Capacitor?.Plugins?.Contacts;
      if(p?.createContact){try{await p.createContact({contact:{name:{given:'New Contact'}}});setTimeout(async()=>{await syncNativeOrdered();render();},500);}catch(e){alert('Unable to open New Contact. Please allow Contacts permission.');}}
      else alert('New Contact is not available on this device. Please add the contact in the phone app, then reopen GitPit.');
    };
    render();
  }

  document.addEventListener('click',e=>{
    const t=e.target?.closest?.('button,a,[role="button"],.new-chat-btn,#btn-new-chat');if(!t)return;
    const text=(t.textContent||t.title||t.getAttribute('aria-label')||'').trim();
    if(/new\s*chat/i.test(text)||/pencil/i.test(text)||t.id==='btn-new-chat'||t.classList.contains('new-chat-btn')){e.preventDefault();e.stopImmediatePropagation();openNewChatDirectory();}
  },true);

  // ---------------- Realtime messaging receiver ----------------
  const seen=new Set();
  function belongsToMe(msg){const m=me();if(!m||!msg)return false;const myp=d10(m.phone);return msg.recipientId===m.id||msg.senderId===m.id||(myp&&(d10(msg.recipientPhone)===myp||d10(msg.senderPhone)===myp));}
  function mergeIncoming(msg){
    if(!msg||!msg.id||seen.has(msg.id)||!belongsToMe(msg))return;seen.add(msg.id);if(seen.size>2000)seen.clear();
    const m=me();if(msg.senderId===m?.id)return;
    const ce=window.ChatEngine;if(!ce)return;
    const reg=findRegistered(msg.senderPhone,msg.senderId)||{id:msg.senderId,name:msg.senderName||msg.senderPhone||'GitPit User',phone:msg.senderPhone||'',avatar:msg.senderAvatar||'assets/logo-icon.svg',isRegistered:true};
    const chat=ensureChat(reg);if(!chat)return;chat.messages=chat.messages||[];
    if(!chat.messages.some(x=>x.id===msg.id)){chat.messages.push(msg);chat.messages.sort((a,b)=>(a.createdAt||a.timestamp||0)-(b.createdAt||b.timestamp||0));if(ce.activeChatId!==chat.id)chat.unreadCount=(chat.unreadCount||0)+1;try{ce.saveChats?.();ce.renderChatList?.();if(ce.activeChatId===chat.id){ce.renderMessages?.();ce.scrollToBottom?.();}}catch(_){}}
  }
  function bindSocket(){
    const s=window.ChatterApp?.socket;if(!s||s.__v111ReceiverBound)return false;s.__v111ReceiverBound=true;
    const join=()=>{const u=me();if(u?.id)s.emit('user_join',{id:u.id,name:u.name,phone:u.phone,avatar:u.avatar,email:u.email});};
    if(s.connected)join();s.on('connect',join);
    ['receive_message','chat_message'].forEach(ev=>s.on(ev,mergeIncoming));
    s.on('new_status_update',st=>mergeStatus(st));
    return true;
  }

  // ---------------- Status self + registered visibility ----------------
  function toStory(s){if(!s)return null;const uid=s.userId||s.authorId||s.senderId||'unknown';return{id:`story_${uid}`,authorId:uid,authorName:s.author||s.authorName||'GitPit User',authorAvatar:s.avatar||s.authorAvatar||'assets/logo-icon.svg',time:s.time||'Recent',timestamp:Number(s.timestamp||s.createdAt||Date.now()),viewed:false,items:[{serverId:s.id,type:s.type||(s.mediaUrl?'image':'text'),mediaUrl:s.mediaUrl||s.url||'',text:s.text||s.caption||'',caption:s.caption||s.text||'',bgColor:s.bgColor||'#0284c7'}]};}
  function mergeStatus(s){const sm=window.StoriesManager;if(!sm)return;const incoming=toStory(s);if(!incoming)return;sm.stories=Array.isArray(sm.stories)?sm.stories:[];let st=sm.stories.find(x=>x.authorId===incoming.authorId);if(!st){sm.stories.unshift(incoming);}else{const it=incoming.items[0];if(!(st.items||[]).some(x=>x.serverId===it.serverId))st.items=[...(st.items||[]),it];st.timestamp=incoming.timestamp;st.time=incoming.time;}try{sm.saveStories?.();sm.renderStatusTab?.();}catch(_){}}
  async function refreshStatus(){if(!token())return;try{const r=await fetch(`${API()}/api/status`,{headers:{Authorization:`Bearer ${token()}`}});const d=await r.json();const a=Array.isArray(d)?d:(d.statuses||[]);a.forEach(mergeStatus);}catch(e){console.warn('[V111 STATUS] refresh failed',e);}}
  document.addEventListener('click',e=>{const t=e.target?.closest?.('[data-tab="status"],button,a');const text=(t?.textContent||t?.title||'').toLowerCase();if(t&&(t.dataset?.tab==='status'||text.includes('status')))setTimeout(refreshStatus,100);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){bindSocket();refreshStatus();}});window.addEventListener('online',()=>{bindSocket();refreshStatus();});

  // ---------------- Screen share: start only after peer accepts ----------------
  function patchScreenShare(){
    const app=window.ChatterApp,cm=window.CallManager;if(!app||!cm||cm.__v111ScreenShare)return false;cm.__v111ScreenShare=true;
    app.startScreenSharing=()=>{
      const regs=registeredUsers();if(!regs.length){alert('No registered GitPit contacts found.');return;}
      const name=prompt('Enter registered GitPit contact name or phone for screen sharing:','');if(!name)return;
      const q=name.toLowerCase();const u=regs.find(x=>String(x.name||'').toLowerCase().includes(q)||String(x.phone||'').includes(name));if(!u){alert('Please select a registered GitPit contact.');return;}
      window.__gitpitPendingScreenShare={id:u.id,name:u.name,phone:u.phone};
      cm.startCall(u.name||u.phone,u.avatar||'assets/logo-icon.svg','video',u.id);
    };
    const orig=typeof cm.handleCallAccepted==='function'?cm.handleCallAccepted.bind(cm):null;
    if(orig){cm.handleCallAccepted=async function(data){const r=await orig(data);const p=window.__gitpitPendingScreenShare;if(p&&this.activeCall){setTimeout(async()=>{try{if(!this.isScreenSharing)await this.toggleScreenShare();}catch(e){console.warn('[V111 SCREEN] share start failed',e);}window.__gitpitPendingScreenShare=null;},900);}return r;};}
    return true;
  }

  let tries=0;const timer=setInterval(()=>{tries++;const a=bindSocket(),b=patchScreenShare();if((a&&b)||tries>40)clearInterval(timer);},250);
  setTimeout(()=>{syncNativeOrdered();refreshStatus();},700);
  window.GitPitV111Realtime={syncNativeOrdered,openNewChatDirectory,mergeIncoming,refreshStatus};
})();
