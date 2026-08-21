'use strict';

(function installGitPitNativeContactsV16(){
  const API = () => window.API_BASE || 'https://chitchat-chatterpatter.onrender.com';
  const d10 = v => String(v || '').replace(/\D/g,'').slice(-10);
  const norm = v => { const d=d10(v); return d.length===10 ? `+91${d}` : ''; };
  const token = () => window.AuthManager?.authToken || localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token') || '';
  const me = () => window.AuthManager?.currentUser || null;

  function plugin(){
    return window.Capacitor?.Plugins?.Contacts || null;
  }

  async function ensurePermission(interactive=false){
    const p=plugin();
    if(!p){ if(interactive) alert('Native Contacts plugin is not available in this APK.'); return false; }
    try{
      if(typeof p.requestPermissions==='function'){
        const s=await p.requestPermissions();
        const values=[s?.contacts,s?.readContacts,s?.read,s?.granted].filter(v=>v!==undefined);
        if(values.length){
          const ok=values.some(v=>v===true || v==='granted' || v==='limited');
          if(!ok){ if(interactive) alert('Please allow Contacts permission in Android Settings.'); return false; }
        }
        return true;
      }
      if(typeof p.getPermissions==='function'){
        let s=await p.getPermissions();
        if(s?.granted===true) return true;
        s=await p.getPermissions();
        if(s?.granted===true) return true;
        if(interactive) alert('Please allow Contacts permission in Android Settings.');
        return false;
      }
      return true;
    }catch(e){
      console.warn('[CONTACT V16] permission error',e);
      if(interactive) alert('Contacts permission could not be requested. Please allow it from App Settings.');
      return false;
    }
  }

  function extractName(c){
    return c?.displayName || c?.name?.display || [c?.name?.given,c?.name?.middle,c?.name?.family].filter(Boolean).join(' ') || c?.givenName || c?.fullName || 'Contact';
  }
  function extractNumbers(c){
    const arr=[];
    const pools=[c?.phoneNumbers,c?.phones,c?.tel];
    pools.forEach(list=>Array.isArray(list)&&list.forEach(x=>arr.push(typeof x==='string'?x:(x?.number||x?.value||x?.phoneNumber||''))));
    if(c?.phoneNumber) arr.push(c.phoneNumber);
    if(c?.phone) arr.push(c.phone);
    return [...new Set(arr.map(norm).filter(Boolean))];
  }

  async function readContacts(interactive=false){
    if(!(await ensurePermission(interactive))) return [];
    const p=plugin();
    try{
      let r;
      try{ r=await p.getContacts({projection:{name:true,phones:true}}); }
      catch(_){ r=await p.getContacts(); }
      const list=Array.isArray(r?.contacts)?r.contacts:[];
      console.log('[CONTACT V16] native contacts read',list.length);
      return list;
    }catch(e){
      console.error('[CONTACT V16] getContacts failed',e);
      if(interactive) alert('Phone contacts could not be read. Please verify Contacts permission.');
      return [];
    }
  }

  async function matchRegistered(phoneEntries){
    const phones=phoneEntries.map(x=>x.phone).filter(Boolean);
    const out=[];
    for(let i=0;i<phones.length;i+=150){
      try{
        const r=await fetch(`${API()}/api/contacts/sync`,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':token()?`Bearer ${token()}`:''},
          body:JSON.stringify({phoneNumbers:phones.slice(i,i+150)})
        });
        if(!r.ok) continue;
        const data=await r.json();
        const users=data?.matchedUsers||data?.registered||data?.users||[];
        if(Array.isArray(users)) out.push(...users);
      }catch(e){ console.warn('[CONTACT V16] sync chunk failed',e); }
    }
    return out;
  }

  function merge(native,registered){
    const byPhone=new Map();
    native.forEach(c=>{
      const name=extractName(c);
      extractNumbers(c).forEach(phone=>{
        const k=d10(phone); if(!k) return;
        byPhone.set(k,{id:`device_${k}`,name,savedName:name,phone,isRegistered:false,isSavedContact:true,source:'device'});
      });
    });
    registered.forEach(u=>{
      const k=d10(u?.phone); if(!k) return;
      if(me()?.id && u?.id===me().id) return;
      const saved=byPhone.get(k);
      byPhone.set(k,{
        id:u.id||saved?.id||`user_${k}`,
        registeredUserId:u.id||'',
        name:saved?.savedName||saved?.name||u.name||u.phone,
        savedName:saved?.savedName||saved?.name||u.name||u.phone,
        phone:norm(u.phone||saved?.phone),
        avatar:saved?.avatar||u.avatar||'',
        bio:u.bio||'GitPit Member',
        online:!!u.online,
        isRegistered:true,is_registered:true,isSavedContact:!!saved,source:saved?'device':'gitpit'
      });
    });
    const list=[...byPhone.values()].sort((a,b)=>Number(b.isRegistered)-Number(a.isRegistered)||String(a.name).localeCompare(String(b.name)));
    localStorage.setItem('gitpit_device_contacts',JSON.stringify(list.filter(x=>x.isSavedContact)));
    localStorage.setItem('gitpit_registered_directory',JSON.stringify(list.filter(x=>x.isRegistered)));
    localStorage.setItem('gitpit_synced_contacts',JSON.stringify(list.filter(x=>x.isRegistered)));
    const pb={}; list.forEach(x=>{const k=d10(x.phone); if(k) pb[k]=x; if(x.registeredUserId) pb[x.registeredUserId]=x;});
    localStorage.setItem('gitpit_phonebook',JSON.stringify(pb));
    localStorage.setItem('gitpit_last_contact_refresh',String(Date.now()));
    if(window.ChatEngine){
      window.ChatEngine.registeredUsers=list.filter(x=>x.isRegistered);
      try{ window.ChatEngine.renderChatList?.(); }catch(_){ }
    }
    return list;
  }

  function getDirectory(){
    try{
      const dev=JSON.parse(localStorage.getItem('gitpit_device_contacts')||'[]');
      const reg=JSON.parse(localStorage.getItem('gitpit_registered_directory')||'[]');
      const m=new Map();
      dev.forEach(x=>{const k=d10(x.phone);if(k)m.set(k,x);});
      reg.forEach(x=>{const k=d10(x.phone);if(k)m.set(k,{...m.get(k),...x,isRegistered:true});});
      return [...m.values()].sort((a,b)=>Number(b.isRegistered)-Number(a.isRegistered)||String(a.name||'').localeCompare(String(b.name||'')));
    }catch(_){return [];}
  }

  function startChat(x){
    if(!x.isRegistered){ alert(`${x.name||x.phone} is not registered on GitPit.`); return; }
    const ce=window.ChatEngine; if(!ce) return;
    const id=x.registeredUserId||x.id;
    ce.chats=ce.chats||[];
    let chat=ce.chats.find(c=>c.id===id || d10(c.phone)===d10(x.phone));
    if(!chat){ chat={id,name:x.name||x.phone,phone:x.phone,avatar:x.avatar||'assets/logo-icon.svg',bio:x.bio||'GitPit Member',online:!!x.online,isRegistered:true,is_registered:true,isGroup:false,isAi:false,unreadCount:0,messages:[]}; ce.chats.push(chat); try{ce.saveChats?.();}catch(_){} }
    document.querySelectorAll('.gitpit-native-directory-modal').forEach(n=>n.remove());
    ce.openChat?.(chat.id);
  }

  function showDirectory(){
    document.querySelectorAll('.gitpit-native-directory-modal').forEach(n=>n.remove());
    const rows=getDirectory();
    const wrap=document.createElement('div'); wrap.className='gitpit-native-directory-modal';
    wrap.style.cssText='position:fixed;inset:0;z-index:99999;background:var(--bg-app,#111b21);color:var(--text-primary,#fff);display:flex;flex-direction:column;';
    wrap.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:14px;border-bottom:1px solid rgba(127,127,127,.25)"><button id="gp-v16-back" style="font-size:22px">‹</button><strong style="flex:1">New Chat</strong><button id="gp-v16-refresh">Refresh</button></div><div style="padding:10px"><input id="gp-v16-search" placeholder="Search contacts" style="width:100%;padding:10px;border-radius:8px"></div><div id="gp-v16-list" style="overflow:auto;flex:1"></div>`;
    document.body.appendChild(wrap);
    const list=wrap.querySelector('#gp-v16-list');
    const render=(q='')=>{
      const f=rows.filter(x=>!q||String(x.name||'').toLowerCase().includes(q.toLowerCase())||String(x.phone||'').includes(q));
      list.innerHTML=f.length?'':'<div style="padding:24px;text-align:center;opacity:.7">No phone contacts found. Tap Refresh.</div>';
      f.forEach(x=>{ const b=document.createElement('button'); b.style.cssText='width:100%;display:flex;align-items:center;gap:12px;padding:12px;border:0;border-bottom:1px solid rgba(127,127,127,.16);background:transparent;color:inherit;text-align:left'; b.innerHTML=`<span style="width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#2a3942">${(x.name||'?').charAt(0).toUpperCase()}</span><span style="flex:1"><b>${String(x.name||x.phone).replace(/[<>]/g,'')}</b><small style="display:block;opacity:.7">${x.phone||''} ${x.isRegistered?'• Registered':'• Invite'}</small></span>${x.isRegistered?'✓':''}`; b.onclick=()=>startChat(x); list.appendChild(b); });
    };
    render();
    wrap.querySelector('#gp-v16-back').onclick=()=>wrap.remove();
    wrap.querySelector('#gp-v16-search').oninput=e=>render(e.target.value);
    wrap.querySelector('#gp-v16-refresh').onclick=async()=>{ await refresh(true); wrap.remove(); showDirectory(); };
  }

  async function refresh(interactive=false){
    const nativeRaw=await readContacts(interactive);
    const native=[];
    nativeRaw.forEach(c=>extractNumbers(c).forEach(phone=>native.push({name:extractName(c),phone,phoneNumbers:[{number:phone}]})));
    const entries=[]; nativeRaw.forEach(c=>extractNumbers(c).forEach(phone=>entries.push({name:extractName(c),phone})));
    const reg=await matchRegistered(entries);
    const merged=merge(nativeRaw,reg);
    console.log('[CONTACT V16] refreshed',merged.length,'contacts; registered',merged.filter(x=>x.isRegistered).length);
    return merged;
  }

  function hookNewChat(){
    document.addEventListener('click',e=>{
      const t=e.target?.closest?.('button,[role="button"],a,.new-chat-btn,#btn-new-chat');
      if(!t) return;
      const text=(t.textContent||t.title||t.getAttribute('aria-label')||'').trim();
      if(/new\s*chat/i.test(text) || t.id==='btn-new-chat' || t.classList.contains('new-chat-btn')){
        e.preventDefault(); e.stopImmediatePropagation(); showDirectory();
      }
    },true);
  }

  hookNewChat();
  setTimeout(()=>refresh(false),1200);
  window.addEventListener('online',()=>setTimeout(()=>refresh(false),500));
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) setTimeout(()=>refresh(false),700); });
  window.GitPitContactsV16={refresh,showDirectory};
})();
